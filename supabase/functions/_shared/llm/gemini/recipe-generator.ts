import type { RecipeCandidate, RecipeGenerationRequest } from "../../contracts/index.ts";
import {
  RECIPE_GENERATION_PROMPT_VERSION,
  buildRecipeGenerationPrompt,
  parseRecipeGenerationRequest,
  recipeGenerationError,
  stripNonAuthoritativeNutrition,
  validateRecipeCandidate,
  type RecipeGenerationError,
  type RecipeGenerator,
} from "../../domain/index.ts";
import type { GeminiContentClient } from "./client";
import { geminiRecipeResponseJsonSchema } from "./schema";

export type RecipeGenerationLogEvent = {
  provider: "gemini";
  model: string;
  promptVersion: typeof RECIPE_GENERATION_PROMPT_VERSION;
  requestId: string;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  mealType?: string;
  varietyLevel?: string;
};

export type GeminiRecipeGeneratorOptions = {
  model: string;
  client: GeminiContentClient;
  requestIdFactory?: () => string;
  now?: () => number;
  onLog?: (event: RecipeGenerationLogEvent) => void;
};

function createRequestId(): string {
  return `rg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class GeminiRecipeGenerator implements RecipeGenerator {
  readonly provider = "gemini" as const;
  private readonly model: string;
  private readonly client: GeminiContentClient;
  private readonly requestIdFactory: () => string;
  private readonly now: () => number;
  private readonly onLog?: (event: RecipeGenerationLogEvent) => void;

  constructor(options: GeminiRecipeGeneratorOptions) {
    this.model = options.model;
    this.client = options.client;
    this.requestIdFactory = options.requestIdFactory ?? createRequestId;
    this.now = options.now ?? (() => Date.now());
    this.onLog = options.onLog;
  }

  async generateRecipe(request: RecipeGenerationRequest): Promise<RecipeCandidate> {
    const started = this.now();
    const requestId = this.requestIdFactory();
    const parsed = parseRecipeGenerationRequest(request);
    if (!parsed.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RECIPE_GENERATION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: parsed.error.code,
        mealType: typeof request.mealType === "string" ? request.mealType : undefined,
        varietyLevel:
          typeof request.varietyLevel === "string" ? request.varietyLevel : undefined,
      });
      throw parsed.error;
    }

    const prompt = buildRecipeGenerationPrompt(parsed.value);

    let rawText: string;
    let usageMetadata: RecipeGenerationLogEvent["usageMetadata"];
    try {
      const result = await this.client.generateContent({
        model: this.model,
        contents: prompt.userPrompt,
        systemInstruction: prompt.systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: geminiRecipeResponseJsonSchema(),
      });
      rawText = result.text;
      usageMetadata = result.usageMetadata;
    } catch (error) {
      const mapped = mapProviderError(error);
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RECIPE_GENERATION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: mapped.code,
        mealType: parsed.value.mealType,
        varietyLevel: parsed.value.varietyLevel,
      });
      throw mapped;
    }

    let jsonValue: unknown;
    try {
      jsonValue = JSON.parse(rawText);
    } catch (error) {
      const mapped = recipeGenerationError(
        "LLM_INVALID_STRUCTURED_OUTPUT",
        "Gemini returned non-JSON structured output.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RECIPE_GENERATION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: mapped.code,
        usageMetadata,
        mealType: parsed.value.mealType,
        varietyLevel: parsed.value.varietyLevel,
      });
      throw mapped;
    }

    const sanitized = stripNonAuthoritativeNutrition(jsonValue);
    if (
      sanitized !== null &&
      typeof sanitized === "object" &&
      !Array.isArray(sanitized) &&
      "source" in sanitized
    ) {
      delete (sanitized as Record<string, unknown>).source;
    }

    const withProvenance = {
      ...(sanitized as Record<string, unknown>),
      source: {
        type: "ai_original",
        provider: "gemini",
        model: this.model,
      },
    };

    const validated = validateRecipeCandidate(withProvenance);
    if (!validated.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RECIPE_GENERATION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: validated.error.code,
        usageMetadata,
        mealType: parsed.value.mealType,
        varietyLevel: parsed.value.varietyLevel,
      });
      throw validated.error;
    }

    this.log({
      provider: "gemini",
      model: this.model,
      promptVersion: RECIPE_GENERATION_PROMPT_VERSION,
      requestId,
      durationMs: this.now() - started,
      success: true,
      usageMetadata,
      mealType: parsed.value.mealType,
      varietyLevel: parsed.value.varietyLevel,
    });

    return validated.value;
  }

  private log(event: RecipeGenerationLogEvent): void {
    this.onLog?.(event);
  }
}

function mapProviderError(error: unknown): RecipeGenerationError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as RecipeGenerationError).code === "string" &&
    "message" in error
  ) {
    return error as RecipeGenerationError;
  }
  const message = error instanceof Error ? error.message : "Gemini provider request failed.";
  return recipeGenerationError("LLM_PROVIDER_ERROR", message);
}
