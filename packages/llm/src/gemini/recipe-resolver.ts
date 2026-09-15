import type { RecipeResolutionRequest, ResolvedRecipe } from "@fitness-autopilot/contracts";
import { RECIPE_RESOLUTION_PROMPT_VERSION } from "@fitness-autopilot/contracts";
import {
  buildRecipeResolutionPrompt,
  parseRecipeResolutionRequest,
  recipeResolutionError,
  stripResolvedRecipeNutrition,
  validateResolvedRecipe,
  type RecipeResolutionError,
  type RecipeResolver,
} from "@fitness-autopilot/domain";
import type { GeminiContentClient } from "./client";
import { extractJsonObjectFromModelText } from "./culinary-discovery-provider";
import { geminiResolvedRecipeResponseJsonSchema } from "./recipe-resolution-schema";
import { classifyGeminiProviderError, withGeminiRetries } from "./retry";

export type RecipeResolutionLogEvent = {
  provider: "gemini";
  model: string;
  promptVersion: typeof RECIPE_RESOLUTION_PROMPT_VERSION;
  requestId: string;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  candidateId?: string;
  candidateName?: string;
  searchGrounded?: boolean;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

export type GeminiRecipeResolverOptions = {
  model: string;
  client: GeminiContentClient;
  requestIdFactory?: () => string;
  now?: () => number;
  onLog?: (event: RecipeResolutionLogEvent) => void;
  /** Use Google Search grounding for source-backed candidates (default true). */
  enableSearchGrounding?: boolean;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

function createRequestId(): string {
  return `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeLogMessage(message: string): string {
  return message
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted-api-key]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

function coerceResolvedRecipePayload(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = { ...(value as Record<string, unknown>) };
  if (Array.isArray(record.ingredients)) {
    record.ingredients = record.ingredients.map((item, index) => {
      if (item === null || typeof item !== "object") return item;
      const ingredient = { ...(item as Record<string, unknown>) };
      if (typeof ingredient.ingredientId !== "string" || ingredient.ingredientId.trim() === "") {
        ingredient.ingredientId = `ingredient_${index + 1}`;
      }
      if (ingredient.preparation === undefined) {
        ingredient.preparation = null;
      }
      return ingredient;
    });
  }
  if (Array.isArray(record.instructions)) {
    record.instructions = record.instructions.map((item, index) => {
      if (typeof item === "string") {
        return { stepNumber: index + 1, text: item };
      }
      if (item === null || typeof item !== "object") return item;
      const step = { ...(item as Record<string, unknown>) };
      if (typeof step.stepNumber !== "number") {
        step.stepNumber = index + 1;
      }
      return step;
    });
  }
  if (Array.isArray(record.supportedPrepModes)) {
    record.supportedPrepModes = record.supportedPrepModes.map((item) => {
      if (item === null || typeof item !== "object") return item;
      const mode = { ...(item as Record<string, unknown>) };
      if (!Array.isArray(mode.advanceTasks)) mode.advanceTasks = [];
      if (!Array.isArray(mode.finishTasks)) mode.finishTasks = ["Finish and serve"];
      return mode;
    });
  }
  if (record.flavorProfile && typeof record.flavorProfile === "object") {
    const profile = { ...(record.flavorProfile as Record<string, unknown>) };
    if (!Array.isArray(profile.textureProfile)) profile.textureProfile = [];
    record.flavorProfile = profile;
  }
  if (record.experienceProfile && typeof record.experienceProfile === "object") {
    const profile = { ...(record.experienceProfile as Record<string, unknown>) };
    if (!Array.isArray(profile.textureTags)) profile.textureTags = [];
    record.experienceProfile = profile;
  }
  return record;
}

export class GeminiRecipeResolver implements RecipeResolver {
  readonly provider = "gemini" as const;
  private readonly model: string;
  private readonly client: GeminiContentClient;
  private readonly requestIdFactory: () => string;
  private readonly now: () => number;
  private readonly onLog?: (event: RecipeResolutionLogEvent) => void;
  private readonly enableSearchGrounding: boolean;
  private readonly maxAttempts: number;
  private readonly sleep?: (ms: number) => Promise<void>;

  constructor(options: GeminiRecipeResolverOptions) {
    this.model = options.model;
    this.client = options.client;
    this.requestIdFactory = options.requestIdFactory ?? createRequestId;
    this.now = options.now ?? (() => Date.now());
    this.onLog = options.onLog;
    this.enableSearchGrounding = options.enableSearchGrounding ?? true;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.sleep = options.sleep;
  }

  async resolve(request: RecipeResolutionRequest): Promise<ResolvedRecipe> {
    const started = this.now();
    const requestId = this.requestIdFactory();
    const parsed = parseRecipeResolutionRequest(request);
    if (!parsed.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: parsed.error.code,
        errorMessage: sanitizeLogMessage(parsed.error.message),
      });
      throw parsed.error;
    }

    const prompt = buildRecipeResolutionPrompt(parsed.value);
    const useSearch =
      this.enableSearchGrounding &&
      typeof parsed.value.candidate.source.url === "string" &&
      parsed.value.candidate.source.url.trim() !== "";

    let rawText: string;
    let usageMetadata: RecipeResolutionLogEvent["usageMetadata"];
    let searchGrounded = false;

    try {
      const result = await withGeminiRetries(
        async () => {
          if (useSearch) {
            // Structured-output schema suppresses Search grounding on Gemini 3.x.
            // Follow culinary-discovery pattern: Search + Zod after parse.
            return this.client.generateContent({
              model: this.model,
              contents: [
                prompt.userPrompt,
                "",
                "After using Google Search to verify this dish's culinary identity,",
                "return a single JSON object (optionally in a ```json fence) with the structured recipe.",
              ].join("\n"),
              systemInstruction: prompt.systemInstruction,
              tools: [{ googleSearch: {} }],
              thinkingConfig: { thinkingLevel: "minimal" },
            });
          }
          return this.client.generateContent({
            model: this.model,
            contents: prompt.userPrompt,
            systemInstruction: prompt.systemInstruction,
            responseMimeType: "application/json",
            responseJsonSchema: geminiResolvedRecipeResponseJsonSchema(),
          });
        },
        {
          maxAttempts: this.maxAttempts,
          sleep: this.sleep,
          shouldRetry: (error) => classifyGeminiProviderError(error).isRateLimited,
        },
      );
      rawText = result.text;
      usageMetadata = result.usageMetadata;
      searchGrounded = Boolean(result.groundingMetadata?.webSearchQueries?.length) || useSearch;
    } catch (error) {
      const mapped = mapProviderError(error);
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: mapped.code,
        errorMessage: sanitizeLogMessage(mapped.message),
        candidateId: parsed.value.candidate.candidateId,
        candidateName: parsed.value.candidate.name,
        searchGrounded: useSearch,
      });
      throw mapped;
    }

    let jsonValue: unknown;
    try {
      const jsonText = useSearch ? extractJsonObjectFromModelText(rawText) : rawText;
      jsonValue = JSON.parse(jsonText);
    } catch (error) {
      const mapped = recipeResolutionError(
        "LLM_INVALID_STRUCTURED_OUTPUT",
        "Gemini returned non-JSON structured output for recipe resolution.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: mapped.code,
        errorMessage: sanitizeLogMessage(mapped.message),
        usageMetadata,
        candidateId: parsed.value.candidate.candidateId,
        candidateName: parsed.value.candidate.name,
        searchGrounded,
      });
      throw mapped;
    }

    const coerced = coerceResolvedRecipePayload(stripResolvedRecipeNutrition(jsonValue));
    const stamped = {
      ...(coerced as Record<string, unknown>),
      candidateId: parsed.value.candidate.candidateId,
      source: {
        name: parsed.value.candidate.source.name,
        url: parsed.value.candidate.source.url,
        author: parsed.value.candidate.source.author ?? null,
      },
      resolutionMetadata: {
        provider: "gemini",
        model: this.model,
        promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        searchGrounded,
      },
    };

    const validated = validateResolvedRecipe(stamped, parsed.value);
    if (!validated.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: validated.error.code,
        errorMessage: sanitizeLogMessage(validated.error.message),
        usageMetadata,
        candidateId: parsed.value.candidate.candidateId,
        candidateName: parsed.value.candidate.name,
        searchGrounded,
      });
      throw validated.error;
    }

    this.log({
      provider: "gemini",
      model: this.model,
      promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
      requestId,
      durationMs: this.now() - started,
      success: true,
      usageMetadata,
      candidateId: parsed.value.candidate.candidateId,
      candidateName: parsed.value.candidate.name,
      searchGrounded,
    });

    return validated.value;
  }

  private log(event: RecipeResolutionLogEvent): void {
    this.onLog?.(event);
  }
}

function mapProviderError(error: unknown): RecipeResolutionError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as RecipeResolutionError).code === "string" &&
    "message" in error
  ) {
    return error as RecipeResolutionError;
  }
  const message = error instanceof Error ? error.message : "Gemini provider request failed.";
  if (classifyGeminiProviderError(error).isRateLimited) {
    return recipeResolutionError("RATE_LIMITED", message);
  }
  return recipeResolutionError("LLM_PROVIDER_ERROR", message);
}
