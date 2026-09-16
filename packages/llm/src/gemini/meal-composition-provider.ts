import type {
  MealCompositionProposal,
  MealCompositionRequest,
} from "@fitness-autopilot/contracts";
import { MEAL_COMPOSITION_PROMPT_VERSION } from "@fitness-autopilot/contracts";
import {
  buildMealCompositionPrompt,
  stripCompositionNutrition,
  type MealCompositionProvider,
} from "@fitness-autopilot/domain";
import type { GeminiContentClient } from "./client";
import { extractJsonObjectFromModelText } from "./culinary-discovery-provider";
import {
  coerceMealCompositionPayload,
  geminiMealCompositionResponseJsonSchema,
} from "./meal-composition-schema";
import { classifyGeminiProviderError, withGeminiRetries } from "./retry";

export type MealCompositionLogEvent = {
  provider: "gemini";
  model: string;
  promptVersion: typeof MEAL_COMPOSITION_PROMPT_VERSION;
  requestId: string;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  candidateId?: string;
  candidateName?: string;
  addedCount?: number;
};

export type GeminiMealCompositionProviderOptions = {
  model: string;
  client: GeminiContentClient;
  requestIdFactory?: () => string;
  now?: () => number;
  onLog?: (event: MealCompositionLogEvent) => void;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

function createRequestId(): string {
  return `mc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeLogMessage(message: string): string {
  return message
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted-api-key]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

export class GeminiMealCompositionProvider implements MealCompositionProvider {
  private readonly model: string;
  private readonly client: GeminiContentClient;
  private readonly requestIdFactory: () => string;
  private readonly now: () => number;
  private readonly onLog?: (event: MealCompositionLogEvent) => void;
  private readonly maxAttempts: number;
  private readonly sleep?: (ms: number) => Promise<void>;

  constructor(options: GeminiMealCompositionProviderOptions) {
    this.model = options.model;
    this.client = options.client;
    this.requestIdFactory = options.requestIdFactory ?? createRequestId;
    this.now = options.now ?? (() => Date.now());
    this.onLog = options.onLog;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.sleep = options.sleep;
  }

  async compose(request: MealCompositionRequest): Promise<MealCompositionProposal> {
    const requestId = this.requestIdFactory();
    const started = this.now();
    const prompt = buildMealCompositionPrompt(request);
    const candidateId =
      request.candidate?.candidateId ??
      request.ranked?.candidate.candidateId ??
      request.recipe?.candidateId;
    const candidateName =
      request.candidate?.name ?? request.ranked?.candidate.name ?? request.recipe?.name;

    try {
      const result = await withGeminiRetries(
        async () =>
          this.client.generateContent({
            model: this.model,
            contents: prompt.userPrompt,
            systemInstruction: prompt.systemInstruction,
            responseMimeType: "application/json",
            responseJsonSchema: geminiMealCompositionResponseJsonSchema(),
          }),
        {
          maxAttempts: this.maxAttempts,
          sleep: this.sleep,
          shouldRetry: (error) => classifyGeminiProviderError(error).isRateLimited,
        },
      );

      const text = result.text ?? "";
      const extracted = extractJsonObjectFromModelText(text);
      if (!extracted) {
        throw new Error("Gemini meal composition returned non-JSON output.");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(extracted);
      } catch {
        throw new Error("Gemini meal composition returned invalid JSON.");
      }
      const coerced = coerceMealCompositionPayload(stripCompositionNutrition(parsed));
      const proposal = coerced as MealCompositionProposal;

      this.onLog?.({
        provider: "gemini",
        model: this.model,
        promptVersion: MEAL_COMPOSITION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: true,
        candidateId,
        candidateName,
        addedCount: Array.isArray(proposal.addedComponents)
          ? proposal.addedComponents.length
          : undefined,
      });

      return proposal;
    } catch (error) {
      this.onLog?.({
        provider: "gemini",
        model: this.model,
        promptVersion: MEAL_COMPOSITION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorMessage: sanitizeLogMessage(
          error instanceof Error ? error.message : "Meal composition failed.",
        ),
        candidateId,
        candidateName,
      });
      throw error;
    }
  }
}
