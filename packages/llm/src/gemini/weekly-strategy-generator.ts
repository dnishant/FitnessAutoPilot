import type {
  RankedWeeklyStrategy,
  RankedWeeklyStrategyRequest,
  WeeklyMealStrategy,
  WeeklyStrategyRequest,
} from "@fitness-autopilot/contracts";
import {
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  WEEKLY_STRATEGY_PROMPT_VERSION,
  assertSufficientRankedCandidates,
  buildRankedWeeklyStrategyPrompt,
  buildRankedWeeklyStrategyRetryPrompt,
  buildWeeklyStrategyPrompt,
  evaluateWeeklyComplexity,
  parseRankedWeeklyStrategyRequest,
  parseWeeklyStrategyRequest,
  rankedWeeklyStrategyError,
  validateRankedWeeklyStrategy,
  validateWeeklyMealStrategy,
  weeklyStrategyError,
  type RankedWeeklyStrategyError,
  type RankedWeeklyStrategyGenerator,
  type WeeklyStrategyError,
  type WeeklyStrategyGenerator,
} from "@fitness-autopilot/domain";
import type { GeminiContentClient } from "./client";
import { geminiRankedWeeklyStrategyResponseJsonSchema } from "./ranked-weekly-strategy-schema";
import { geminiWeeklyStrategyResponseJsonSchema } from "./weekly-strategy-schema";

export type WeeklyStrategyLogEvent = {
  provider: "gemini";
  model: string;
  promptVersion: string;
  requestId: string;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  varietyLevel?: string;
  cookingStyle?: string;
  complexityRetryOccurred?: boolean;
  uniqueCandidateCount?: number;
};

export type GeminiWeeklyStrategyGeneratorOptions = {
  model: string;
  client: GeminiContentClient;
  requestIdFactory?: () => string;
  now?: () => number;
  onLog?: (event: WeeklyStrategyLogEvent) => void;
};

function createRequestId(): string {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Matches contracts / Gemini schema max for sharedIngredientIntents items. */
export const SHARED_INGREDIENT_INTENT_MAX_LENGTH = 160;

/**
 * Strip any model-invented nutrition fields from weekly strategy payloads.
 */
export function stripWeeklyStrategyNutrition(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const banned = [
    "calories",
    "caloriesKcal",
    "targetCalories",
    "proteinG",
    "proteinGrams",
    "carbsG",
    "carbohydrateG",
    "fatG",
    "macros",
    "nutrition",
    "nutritionTotals",
    "estimatedCalories",
    "estimatedProteinGrams",
  ];
  const record = { ...(value as Record<string, unknown>) };
  for (const key of banned) {
    delete record[key];
  }
  // Never trust model-provided uniqueConceptCount.
  delete record.uniqueConceptCount;

  if (Array.isArray(record.days)) {
    record.days = record.days.map((day) => {
      if (day === null || typeof day !== "object" || Array.isArray(day)) {
        return day;
      }
      const nextDay = { ...(day as Record<string, unknown>) };
      for (const slot of ["breakfast", "lunch", "snack", "dinner"] as const) {
        const concept = nextDay[slot];
        if (concept === null || typeof concept !== "object" || Array.isArray(concept)) {
          continue;
        }
        const nextConcept = { ...(concept as Record<string, unknown>) };
        for (const key of banned) {
          delete nextConcept[key];
        }
        nextDay[slot] = nextConcept;
      }
      return nextDay;
    });
  }
  return record;
}

/**
 * Gemini structured output sometimes ignores maxLength on string arrays.
 * Truncate sharedIngredientIntents (and drop empties) before domain validation.
 */
export function coerceWeeklyStrategyPayload(value: unknown): unknown {
  const stripped = stripWeeklyStrategyNutrition(value);
  if (stripped === null || typeof stripped !== "object" || Array.isArray(stripped)) {
    return stripped;
  }
  const record = { ...(stripped as Record<string, unknown>) };
  if (Array.isArray(record.sharedIngredientIntents)) {
    record.sharedIngredientIntents = record.sharedIngredientIntents
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) =>
        item.length > SHARED_INGREDIENT_INTENT_MAX_LENGTH
          ? item.slice(0, SHARED_INGREDIENT_INTENT_MAX_LENGTH).trimEnd()
          : item,
      )
      .slice(0, 40);
  }
  return record;
}

export class GeminiWeeklyStrategyGenerator
  implements WeeklyStrategyGenerator, RankedWeeklyStrategyGenerator
{
  readonly provider = "gemini" as const;
  private readonly model: string;
  private readonly client: GeminiContentClient;
  private readonly requestIdFactory: () => string;
  private readonly now: () => number;
  private readonly onLog?: (event: WeeklyStrategyLogEvent) => void;

  constructor(options: GeminiWeeklyStrategyGeneratorOptions) {
    this.model = options.model;
    this.client = options.client;
    this.requestIdFactory = options.requestIdFactory ?? createRequestId;
    this.now = options.now ?? (() => Date.now());
    this.onLog = options.onLog;
  }

  async generateWeeklyStrategy(
    request: WeeklyStrategyRequest,
  ): Promise<WeeklyMealStrategy> {
    const started = this.now();
    const requestId = this.requestIdFactory();
    const parsed = parseWeeklyStrategyRequest(request);
    if (!parsed.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: parsed.error.code,
        varietyLevel:
          typeof (request as { foodPreferences?: { varietyLevel?: unknown } })
            .foodPreferences?.varietyLevel === "string"
            ? (request as { foodPreferences: { varietyLevel: string } }).foodPreferences
                .varietyLevel
            : undefined,
      });
      throw parsed.error;
    }

    const prompt = buildWeeklyStrategyPrompt(parsed.value);

    let rawText: string;
    let usageMetadata: WeeklyStrategyLogEvent["usageMetadata"];
    try {
      const result = await this.client.generateContent({
        model: this.model,
        contents: prompt.userPrompt,
        systemInstruction: prompt.systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: geminiWeeklyStrategyResponseJsonSchema(),
      });
      rawText = result.text;
      usageMetadata = result.usageMetadata;
    } catch (error) {
      const mapped = mapProviderError(error);
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: mapped.code,
        varietyLevel: parsed.value.foodPreferences.varietyLevel,
        cookingStyle: parsed.value.cookingPreferences.cookingStyle,
      });
      throw mapped;
    }

    let jsonValue: unknown;
    try {
      jsonValue = JSON.parse(rawText);
    } catch (error) {
      const mapped = weeklyStrategyError(
        "LLM_INVALID_STRUCTURED_OUTPUT",
        "Gemini returned non-JSON structured output.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: mapped.code,
        usageMetadata,
        varietyLevel: parsed.value.foodPreferences.varietyLevel,
        cookingStyle: parsed.value.cookingPreferences.cookingStyle,
      });
      throw mapped;
    }

    const sanitized = coerceWeeklyStrategyPayload(jsonValue);
    const validated = validateWeeklyMealStrategy(sanitized, parsed.value);
    if (!validated.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: validated.error.code,
        usageMetadata,
        varietyLevel: parsed.value.foodPreferences.varietyLevel,
        cookingStyle: parsed.value.cookingPreferences.cookingStyle,
      });
      throw validated.error;
    }

    this.log({
      provider: "gemini",
      model: this.model,
      promptVersion: WEEKLY_STRATEGY_PROMPT_VERSION,
      requestId,
      durationMs: this.now() - started,
      success: true,
      usageMetadata,
      varietyLevel: parsed.value.foodPreferences.varietyLevel,
      cookingStyle: parsed.value.cookingPreferences.cookingStyle,
    });

    return validated.value;
  }

  async generateRankedWeeklyStrategy(
    request: RankedWeeklyStrategyRequest,
  ): Promise<RankedWeeklyStrategy> {
    const started = this.now();
    const requestId = this.requestIdFactory();
    const parsed = parseRankedWeeklyStrategyRequest(request);
    if (!parsed.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: parsed.error.code,
      });
      throw parsed.error;
    }

    const sufficient = assertSufficientRankedCandidates(parsed.value);
    if (!sufficient.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: sufficient.error.code,
        varietyLevel: parsed.value.foodPreferences.varietyLevel,
        cookingStyle: parsed.value.cookingPreferences.cookingStyle,
      });
      throw sufficient.error;
    }

    const baseMetadata = {
      provider: "gemini" as const,
      model: this.model,
      promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
    };

    const firstPrompt = buildRankedWeeklyStrategyPrompt(parsed.value);
    const firstAttempt = await this.invokeRankedGeminiCall({
      requestId,
      started,
      request: parsed.value,
      prompt: firstPrompt,
    });

    const firstValidated = validateRankedWeeklyStrategy(
      firstAttempt.sanitized,
      parsed.value,
      baseMetadata,
    );
    if (!firstValidated.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: firstValidated.error.code,
        usageMetadata: firstAttempt.usageMetadata,
        varietyLevel: parsed.value.foodPreferences.varietyLevel,
        cookingStyle: parsed.value.cookingPreferences.cookingStyle,
        complexityRetryOccurred: false,
      });
      throw firstValidated.error;
    }

    const firstComplexity = evaluateWeeklyComplexity(firstValidated.value, parsed.value);
    if (firstComplexity.status !== "excessive") {
      const strategy: RankedWeeklyStrategy = {
        ...firstValidated.value,
        metadata: {
          ...baseMetadata,
          complexityRetry: {
            occurred: false,
            finalAttemptUniqueCandidates: firstComplexity.uniqueCandidateCount,
          },
        },
      };
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: true,
        usageMetadata: firstAttempt.usageMetadata,
        varietyLevel: parsed.value.foodPreferences.varietyLevel,
        cookingStyle: parsed.value.cookingPreferences.cookingStyle,
        complexityRetryOccurred: false,
        uniqueCandidateCount: firstComplexity.uniqueCandidateCount,
      });
      return strategy;
    }

    const retryPrompt = buildRankedWeeklyStrategyRetryPrompt(parsed.value, firstComplexity);

    const retryAttempt = await this.invokeRankedGeminiCall({
      requestId,
      started,
      request: parsed.value,
      prompt: retryPrompt,
    });

    const retryValidated = validateRankedWeeklyStrategy(
      retryAttempt.sanitized,
      parsed.value,
      baseMetadata,
    );
    if (!retryValidated.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: retryValidated.error.code,
        usageMetadata: retryAttempt.usageMetadata,
        varietyLevel: parsed.value.foodPreferences.varietyLevel,
        cookingStyle: parsed.value.cookingPreferences.cookingStyle,
        complexityRetryOccurred: true,
        uniqueCandidateCount: firstComplexity.uniqueCandidateCount,
      });
      throw retryValidated.error;
    }

    const retryComplexity = evaluateWeeklyComplexity(retryValidated.value, parsed.value);
    if (retryComplexity.status === "excessive") {
      const mapped = rankedWeeklyStrategyError(
        "EXCESSIVE_WEEKLY_COMPLEXITY",
        `Weekly plan still used ${retryComplexity.uniqueCandidateCount} unique candidates after a corrective retry (hard max ${retryComplexity.policy.maxHardUniqueCandidates} for ${retryComplexity.varietyLevel}).`,
        {
          firstAttemptUniqueCandidates: firstComplexity.uniqueCandidateCount,
          finalAttemptUniqueCandidates: retryComplexity.uniqueCandidateCount,
          hardMaxUniqueCandidates: retryComplexity.policy.maxHardUniqueCandidates,
          preferredMaxUniqueCandidates: retryComplexity.policy.maxPreferredUniqueCandidates,
          varietyLevel: retryComplexity.varietyLevel,
        },
      );
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: mapped.code,
        usageMetadata: retryAttempt.usageMetadata,
        varietyLevel: parsed.value.foodPreferences.varietyLevel,
        cookingStyle: parsed.value.cookingPreferences.cookingStyle,
        complexityRetryOccurred: true,
        uniqueCandidateCount: retryComplexity.uniqueCandidateCount,
      });
      throw mapped;
    }

    const strategy: RankedWeeklyStrategy = {
      ...retryValidated.value,
      metadata: {
        ...baseMetadata,
        complexityRetry: {
          occurred: true,
          firstAttemptUniqueCandidates: firstComplexity.uniqueCandidateCount,
          finalAttemptUniqueCandidates: retryComplexity.uniqueCandidateCount,
        },
      },
    };
    this.log({
      provider: "gemini",
      model: this.model,
      promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
      requestId,
      durationMs: this.now() - started,
      success: true,
      usageMetadata: retryAttempt.usageMetadata,
      varietyLevel: parsed.value.foodPreferences.varietyLevel,
      cookingStyle: parsed.value.cookingPreferences.cookingStyle,
      complexityRetryOccurred: true,
      uniqueCandidateCount: retryComplexity.uniqueCandidateCount,
    });
    return strategy;
  }

  private async invokeRankedGeminiCall(input: {
    requestId: string;
    started: number;
    request: RankedWeeklyStrategyRequest;
    prompt: { systemInstruction: string; userPrompt: string };
  }): Promise<{
    sanitized: unknown;
    usageMetadata: WeeklyStrategyLogEvent["usageMetadata"];
  }> {
    let rawText: string;
    let usageMetadata: WeeklyStrategyLogEvent["usageMetadata"];
    try {
      const result = await this.client.generateContent({
        model: this.model,
        contents: input.prompt.userPrompt,
        systemInstruction: input.prompt.systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: geminiRankedWeeklyStrategyResponseJsonSchema(),
      });
      rawText = result.text;
      usageMetadata = result.usageMetadata;
    } catch (error) {
      const mapped = mapRankedProviderError(error);
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId: input.requestId,
        durationMs: this.now() - input.started,
        success: false,
        errorCode: mapped.code,
        varietyLevel: input.request.foodPreferences.varietyLevel,
        cookingStyle: input.request.cookingPreferences.cookingStyle,
      });
      throw mapped;
    }

    try {
      const jsonValue = JSON.parse(rawText);
      return {
        sanitized: coerceWeeklyStrategyPayload(jsonValue),
        usageMetadata,
      };
    } catch (error) {
      const mapped = rankedWeeklyStrategyError(
        "LLM_INVALID_STRUCTURED_OUTPUT",
        "Gemini returned non-JSON structured output.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId: input.requestId,
        durationMs: this.now() - input.started,
        success: false,
        errorCode: mapped.code,
        usageMetadata,
        varietyLevel: input.request.foodPreferences.varietyLevel,
        cookingStyle: input.request.cookingPreferences.cookingStyle,
      });
      throw mapped;
    }
  }

  private log(event: WeeklyStrategyLogEvent): void {
    this.onLog?.(event);
  }
}

function mapRankedProviderError(error: unknown): RankedWeeklyStrategyError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as RankedWeeklyStrategyError).code === "string" &&
    "message" in error
  ) {
    return error as RankedWeeklyStrategyError;
  }
  const message = error instanceof Error ? error.message : "Gemini provider request failed.";
  return rankedWeeklyStrategyError("LLM_PROVIDER_ERROR", message);
}

function mapProviderError(error: unknown): WeeklyStrategyError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as WeeklyStrategyError).code === "string" &&
    "message" in error
  ) {
    return error as WeeklyStrategyError;
  }
  const message = error instanceof Error ? error.message : "Gemini provider request failed.";
  return weeklyStrategyError("LLM_PROVIDER_ERROR", message);
}
