import type {
  CulinaryDiscoveryCandidate,
  CulinaryDiscoveryGroundingMetadata,
  CulinaryDiscoveryRequest,
  CulinaryDiscoveryResult,
} from "@fitness-autopilot/contracts";
import {
  CULINARY_DISCOVERY_PROMPT_VERSION,
  assertDiscoveryWasGrounded,
  buildCulinaryDiscoveryPrompt,
  buildDiscoveryMetadata,
  culinaryDiscoveryError,
  normalizeDiscoveryCandidates,
  parseCulinaryDiscoveryRequest,
  validateCulinaryDiscoveryCandidate,
  type CulinaryDiscoveryError,
  type CulinaryDiscoveryProvider,
} from "@fitness-autopilot/domain";
import type { GeminiContentClient, GeminiSafeGroundingMetadata } from "./client";
import { geminiCulinaryDiscoveryResponseJsonSchema } from "./culinary-discovery-schema";

export type CulinaryDiscoveryLogEvent = {
  provider: "gemini";
  model: string;
  promptVersion: typeof CULINARY_DISCOVERY_PROMPT_VERSION;
  requestId: string;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  mealType?: string;
  requestedCandidateCount?: number;
  returnedCandidateCount?: number;
  searchQueryCount?: number;
  googleSearchEnabled?: boolean;
};

function sanitizeLogMessage(message: string): string {
  return message
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted-api-key]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

export type GeminiGroundedCulinaryDiscoveryProviderOptions = {
  model: string;
  client: GeminiContentClient;
  requestIdFactory?: () => string;
  now?: () => number;
  onLog?: (event: CulinaryDiscoveryLogEvent) => void;
};

function createRequestId(): string {
  return `cd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function toCulinaryDiscoveryGroundingMetadata(
  grounding: GeminiSafeGroundingMetadata | undefined,
): CulinaryDiscoveryGroundingMetadata | undefined {
  if (!grounding) return undefined;
  return {
    webSearchQueries: grounding.webSearchQueries,
    groundingChunks: grounding.groundingChunks,
    groundingSupports: grounding.groundingSupports,
    hasSearchEntryPoint: grounding.hasSearchEntryPoint,
    imageSearchQueries: grounding.imageSearchQueries,
  };
}

/**
 * Normalize model payload candidates: fill defaults for optional arrays,
 * map optional author → null-compatible shape for domain schema.
 */
export function coerceDiscoveryCandidatePayload(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const record = { ...(raw as Record<string, unknown>) };
  if (!Array.isArray(record.textureTags)) {
    record.textureTags = [];
  }
  if (!Array.isArray(record.experienceTags)) {
    record.experienceTags = [];
  }
  if (record.source !== null && typeof record.source === "object" && !Array.isArray(record.source)) {
    const source = { ...(record.source as Record<string, unknown>) };
    if (source.author === undefined) {
      source.author = null;
    }
    record.source = source;
  }
  if (record.regionalStyle === undefined) {
    record.regionalStyle = null;
  }
  if (record.primaryProtein === undefined) {
    record.primaryProtein = null;
  }
  if (record.estimatedFinishMinutesAfterPrep === undefined) {
    record.estimatedFinishMinutesAfterPrep = null;
  }
  return record;
}

export class GeminiGroundedCulinaryDiscoveryProvider implements CulinaryDiscoveryProvider {
  readonly provider = "gemini" as const;
  private readonly model: string;
  private readonly client: GeminiContentClient;
  private readonly requestIdFactory: () => string;
  private readonly now: () => number;
  private readonly onLog?: (event: CulinaryDiscoveryLogEvent) => void;

  constructor(options: GeminiGroundedCulinaryDiscoveryProviderOptions) {
    this.model = options.model;
    this.client = options.client;
    this.requestIdFactory = options.requestIdFactory ?? createRequestId;
    this.now = options.now ?? (() => Date.now());
    this.onLog = options.onLog;
  }

  async discover(request: CulinaryDiscoveryRequest): Promise<CulinaryDiscoveryResult> {
    const started = this.now();
    const requestId = this.requestIdFactory();
    const parsed = parseCulinaryDiscoveryRequest(request);
    if (!parsed.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: parsed.error.code,
        errorMessage: sanitizeLogMessage(parsed.error.message),
        mealType: typeof request.mealType === "string" ? request.mealType : undefined,
        googleSearchEnabled: true,
      });
      throw parsed.error;
    }

    const prompt = buildCulinaryDiscoveryPrompt(parsed.value);

    let rawText: string;
    let usageMetadata: CulinaryDiscoveryLogEvent["usageMetadata"];
    let groundingMetadata: CulinaryDiscoveryGroundingMetadata | undefined;
    try {
      const result = await this.client.generateContent({
        model: this.model,
        contents: prompt.userPrompt,
        systemInstruction: prompt.systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: geminiCulinaryDiscoveryResponseJsonSchema(),
        tools: [{ googleSearch: {} }],
      });
      rawText = result.text;
      usageMetadata = result.usageMetadata;
      groundingMetadata = toCulinaryDiscoveryGroundingMetadata(result.groundingMetadata);
    } catch (error) {
      const mapped = mapProviderError(error);
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: mapped.code,
        errorMessage: sanitizeLogMessage(mapped.message),
        mealType: parsed.value.mealType,
        requestedCandidateCount: parsed.value.targetCandidateCount,
        googleSearchEnabled: true,
      });
      throw mapped;
    }

    const grounded = assertDiscoveryWasGrounded(groundingMetadata);
    if (!grounded.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: grounded.error.code,
        errorMessage: sanitizeLogMessage(grounded.error.message),
        usageMetadata,
        mealType: parsed.value.mealType,
        requestedCandidateCount: parsed.value.targetCandidateCount,
        searchQueryCount: groundingMetadata?.webSearchQueries?.length ?? 0,
        googleSearchEnabled: true,
      });
      throw grounded.error;
    }

    let jsonValue: unknown;
    try {
      jsonValue = JSON.parse(rawText);
    } catch (error) {
      const mapped = culinaryDiscoveryError(
        "LLM_INVALID_STRUCTURED_OUTPUT",
        "Gemini returned non-JSON structured output.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: mapped.code,
        errorMessage: sanitizeLogMessage(mapped.message),
        usageMetadata,
        mealType: parsed.value.mealType,
        requestedCandidateCount: parsed.value.targetCandidateCount,
        searchQueryCount: groundingMetadata?.webSearchQueries?.length ?? 0,
        googleSearchEnabled: true,
      });
      throw mapped;
    }

    const candidatesRaw =
      jsonValue !== null &&
      typeof jsonValue === "object" &&
      !Array.isArray(jsonValue) &&
      Array.isArray((jsonValue as { candidates?: unknown }).candidates)
        ? ((jsonValue as { candidates: unknown[] }).candidates)
        : null;

    if (!candidatesRaw) {
      const mapped = culinaryDiscoveryError(
        "LLM_INVALID_STRUCTURED_OUTPUT",
        "Gemini structured output missing candidates array.",
      );
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: mapped.code,
        errorMessage: sanitizeLogMessage(mapped.message),
        usageMetadata,
        mealType: parsed.value.mealType,
        requestedCandidateCount: parsed.value.targetCandidateCount,
        searchQueryCount: groundingMetadata?.webSearchQueries?.length ?? 0,
        googleSearchEnabled: true,
      });
      throw mapped;
    }

    const validatedCandidates: CulinaryDiscoveryCandidate[] = [];
    for (const raw of candidatesRaw) {
      const coerced = coerceDiscoveryCandidatePayload(raw);
      const validated = validateCulinaryDiscoveryCandidate(coerced);
      if (!validated.ok) {
        // Skip malformed individuals; normalize step may still succeed with others.
        continue;
      }
      validatedCandidates.push(validated.value);
    }

    if (validatedCandidates.length === 0) {
      const mapped = culinaryDiscoveryError(
        "DISCOVERY_SCHEMA_VALIDATION_FAILED",
        "No candidates passed schema validation.",
      );
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: mapped.code,
        errorMessage: sanitizeLogMessage(mapped.message),
        usageMetadata,
        mealType: parsed.value.mealType,
        requestedCandidateCount: parsed.value.targetCandidateCount,
        searchQueryCount: groundingMetadata?.webSearchQueries?.length ?? 0,
        googleSearchEnabled: true,
      });
      throw mapped;
    }

    const normalized = normalizeDiscoveryCandidates(validatedCandidates, {
      request: parsed.value,
      groundingMetadata,
    });
    if (!normalized.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: normalized.error.code,
        errorMessage: sanitizeLogMessage(normalized.error.message),
        usageMetadata,
        mealType: parsed.value.mealType,
        requestedCandidateCount: parsed.value.targetCandidateCount,
        searchQueryCount: groundingMetadata?.webSearchQueries?.length ?? 0,
        googleSearchEnabled: true,
      });
      throw normalized.error;
    }

    const durationMs = this.now() - started;
    const discoveryMetadata = buildDiscoveryMetadata({
      model: this.model,
      request: parsed.value,
      candidates: normalized.value,
      groundingMetadata,
      requestId,
      durationMs,
      usageMetadata,
    });

    const result: CulinaryDiscoveryResult = {
      candidates: normalized.value,
      discoveryMetadata,
      groundingMetadata,
    };

    this.log({
      provider: "gemini",
      model: this.model,
      promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
      requestId,
      durationMs,
      success: true,
      usageMetadata,
      mealType: parsed.value.mealType,
      requestedCandidateCount: parsed.value.targetCandidateCount,
      returnedCandidateCount: normalized.value.length,
      searchQueryCount: groundingMetadata?.webSearchQueries?.length ?? 0,
      googleSearchEnabled: true,
    });

    return result;
  }

  private log(event: CulinaryDiscoveryLogEvent): void {
    this.onLog?.(event);
  }
}

function mapProviderError(error: unknown): CulinaryDiscoveryError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as CulinaryDiscoveryError).code === "string" &&
    "message" in error
  ) {
    return error as CulinaryDiscoveryError;
  }
  const message = error instanceof Error ? error.message : "Gemini provider request failed.";
  return culinaryDiscoveryError("LLM_PROVIDER_ERROR", message);
}
