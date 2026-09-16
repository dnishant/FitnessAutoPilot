import type { FoodResolutionCandidate, ResolvedRecipeIngredient } from "../../contracts/index.ts";
import { FOOD_DISAMBIGUATION_PROMPT_VERSION } from "../../contracts/index.ts";
import type { SemanticFoodDisambiguator } from "../../domain/index.ts";
import type { LlmServerConfig } from "../config.ts";
import type { GeminiContentClient } from "./client.ts";
import { createGoogleGenAiContentClient } from "./google-client.ts";
import { withGeminiRetries } from "./retry.ts";
import { extractJsonObjectFromModelText } from "./culinary-discovery-provider.ts";

export type FoodDisambiguationLogEvent = {
  requestId: string;
  promptVersion: string;
  candidateCount: number;
  selectedExternalId?: string;
  errorMessage?: string;
};

export type GeminiFoodDisambiguatorOptions = {
  config: LlmServerConfig;
  contentClient?: GeminiContentClient;
  onLog?: (event: FoodDisambiguationLogEvent) => void;
  maxAttempts?: number;
};

/**
 * Optional semantic disambiguation: may ONLY select among provided candidates.
 * Must never invent foods or nutrient values.
 */
export class GeminiFoodDisambiguator implements SemanticFoodDisambiguator {
  private readonly config: LlmServerConfig;
  private readonly contentClient: GeminiContentClient;
  private readonly onLog?: (event: FoodDisambiguationLogEvent) => void;
  private readonly maxAttempts: number;

  constructor(options: GeminiFoodDisambiguatorOptions) {
    this.config = options.config;
    this.contentClient =
      options.contentClient ?? createGoogleGenAiContentClient(options.config.gemini.apiKey);
    this.onLog = options.onLog;
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  async chooseCandidate(input: {
    ingredient: ResolvedRecipeIngredient;
    searchQuery: string;
    measurementState: string;
    candidates: FoodResolutionCandidate[];
  }): Promise<{ externalId: string; reason: string } | null> {
    if (input.candidates.length === 0) return null;
    const allowed = new Set(input.candidates.map((c) => c.externalId));
    const requestId = `fd_${crypto.randomUUID()}`;

    const systemInstruction = [
      "You disambiguate culinary recipe ingredients against USDA FoodData Central candidates.",
      "Choose exactly one candidate externalId from the provided list.",
      "Prefer generic/reference foods over branded products for generic ingredients.",
      "Respect raw vs cooked / dry vs prepared measurement state.",
      "Never invent nutrient values, foods, or IDs not in the candidate list.",
      `Prompt version: ${FOOD_DISAMBIGUATION_PROMPT_VERSION}`,
      'Respond with JSON only: {"externalId":"...","reason":"..."}',
    ].join("\n");

    const userPrompt = JSON.stringify(
      {
        ingredient: {
          name: input.ingredient.name,
          preparation: input.ingredient.preparation ?? null,
          role: input.ingredient.role,
          measurementState: input.measurementState,
          searchQuery: input.searchQuery,
        },
        candidates: input.candidates.map((c) => ({
          externalId: c.externalId,
          description: c.description,
          dataType: c.dataType ?? null,
          brandName: c.brandName ?? null,
          score: c.score,
        })),
      },
      null,
      2,
    );

    try {
      const result = await withGeminiRetries(
        async () =>
          this.contentClient.generateContent({
            model: this.config.gemini.model,
            systemInstruction,
            contents: userPrompt,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "minimal" },
          }),
        { maxAttempts: this.maxAttempts },
      );

      const text = result.text ?? "";
      let parsed: { externalId?: unknown; reason?: unknown } | null = null;
      try {
        parsed = JSON.parse(extractJsonObjectFromModelText(text)) as {
          externalId?: unknown;
          reason?: unknown;
        };
      } catch {
        parsed = null;
      }
      const externalId =
        parsed && typeof parsed.externalId === "string" ? parsed.externalId.trim() : "";
      const reason =
        parsed && typeof parsed.reason === "string"
          ? parsed.reason.trim().slice(0, 400)
          : "Semantic disambiguation selection.";

      if (!externalId || !allowed.has(externalId)) {
        this.onLog?.({
          requestId,
          promptVersion: FOOD_DISAMBIGUATION_PROMPT_VERSION,
          candidateCount: input.candidates.length,
          errorMessage: "Model selected an ID outside the candidate list (ignored).",
        });
        return null;
      }

      this.onLog?.({
        requestId,
        promptVersion: FOOD_DISAMBIGUATION_PROMPT_VERSION,
        candidateCount: input.candidates.length,
        selectedExternalId: externalId,
      });
      return { externalId, reason };
    } catch (error) {
      this.onLog?.({
        requestId,
        promptVersion: FOOD_DISAMBIGUATION_PROMPT_VERSION,
        candidateCount: input.candidates.length,
        errorMessage: error instanceof Error ? error.message : "Disambiguation failed.",
      });
      return null;
    }
  }
}
