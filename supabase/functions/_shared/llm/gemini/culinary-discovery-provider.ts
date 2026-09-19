import type {
  CulinaryDiscoveryCandidate,
  CulinaryDiscoveryGroundingMetadata,
  CulinaryDiscoveryRequest,
  CulinaryDiscoveryResult,
} from "../../contracts/index.ts";
import {
  CULINARY_DISCOVERY_PROMPT_VERSION,
  LEGACY_FITNESS_ADAPTABILITY_MAP,
  assertDiscoveryWasGrounded,
  buildCulinaryDiscoveryPrompt,
  buildDiscoveryMetadata,
  culinaryDiscoveryError,
  normalizeDiscoveryCandidates,
  parseCulinaryDiscoveryRequest,
  validateCulinaryDiscoveryCandidate,
  type CulinaryDiscoveryError,
  type CulinaryDiscoveryProvider,
} from "../../domain/index.ts";
import type { GeminiContentClient, GeminiSafeGroundingMetadata } from "./client.ts";

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
  /**
   * Gemini intermittently skips googleSearch (~1/3). CLI retries a few times.
   * Hosted Edge Functions must stay at 1: extra attempts re-parse huge grounded
   * payloads and trip WORKER_RESOURCE_LIMIT (~2s CPU / 256MB).
   */
  maxGroundingAttempts?: number;
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
 * Gemini 3.x currently drops Google Search grounding metadata when
 * `responseMimeType` / `responseJsonSchema` are set, and often skips search
 * entirely when asked for "JSON only". Discovery therefore requests
 * search-first notes + a trailing fenced JSON block, then extracts JSON here.
 */
export function extractJsonObjectFromModelText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const fences = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let i = fences.length - 1; i >= 0; i -= 1) {
    const body = fences[i]?.[1]?.trim();
    if (!body) continue;
    try {
      JSON.parse(body);
      return body;
    } catch {
      // try an earlier fence
    }
  }

  const marker = '{"candidates"';
  const markerIndex = trimmed.lastIndexOf(marker);
  if (markerIndex >= 0) {
    const slice = trimmed.slice(markerIndex);
    try {
      JSON.parse(slice);
      return slice;
    } catch {
      // fall through to brace scan
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter((item) => item.length > 0);
  }
  if (typeof value === "string") {
    const parts = value
      .split(/[,;/|]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    return parts.length > 0 ? parts : undefined;
  }
  return undefined;
}

function coerceHttpUrl(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let url = value.trim();
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  // Gemini often omits the scheme on otherwise usable recipe URLs.
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(url) || url.toLowerCase().startsWith("www.")) {
    return `https://${url}`;
  }
  return url;
}

function slugCandidateId(name: unknown, indexHint: number): string {
  const base =
    typeof name === "string"
      ? name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48)
      : "";
  return base.length > 0 ? `c_${base}` : `c_${indexHint + 1}`;
}

const MEAL_PREP_ALIASES: Record<string, string> = {
  fully_prepped: "fully_prepped",
  "fully prepped": "fully_prepped",
  fullyprepped: "fully_prepped",
  "fully-prepped": "fully_prepped",
  component_prepped: "component_prepped",
  "component prepped": "component_prepped",
  componentprepped: "component_prepped",
  "component-prepped": "component_prepped",
  quick_fresh_finish: "quick_fresh_finish",
  "quick fresh finish": "quick_fresh_finish",
  "quick-fresh-finish": "quick_fresh_finish",
  fresh_only: "fresh_only",
  "fresh only": "fresh_only",
  "fresh-only": "fresh_only",
  fresh: "fresh_only",
};

const FITNESS_ALIASES: Record<string, string> = {
  ...LEGACY_FITNESS_ADAPTABILITY_MAP,
  easy: "easy",
  moderate: "moderate",
  hard: "hard",
  medium: "moderate",
  difficult: "hard",
  excellent: "easy",
  good: "moderate",
};

const CONFIDENCE_ALIASES: Record<string, string> = {
  high: "high",
  medium: "medium",
  low: "low",
  med: "medium",
};

/**
 * Normalize model payload candidates: fill defaults for optional arrays,
 * map optional author → null-compatible shape for domain schema, and
 * coerce common Gemini shape drift (string lists, bare URLs, enum aliases).
 */
export function coerceDiscoveryCandidatePayload(raw: unknown, indexHint = 0): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const record = { ...(raw as Record<string, unknown>) };

  if (typeof record.source === "string") {
    record.source = { name: "Source", url: coerceHttpUrl(record.source), author: null };
  } else if (
    record.source !== null &&
    typeof record.source === "object" &&
    !Array.isArray(record.source)
  ) {
    const source = { ...(record.source as Record<string, unknown>) };
    if (source.author === undefined) {
      source.author = null;
    }
    if (typeof source.name !== "string" || source.name.trim().length === 0) {
      source.name =
        typeof source.url === "string" && source.url.trim().length > 0
          ? "Culinary source"
          : "Source";
    }
    source.url = coerceHttpUrl(source.url);
    record.source = source;
  }

  const flavorFamilies = asStringArray(record.flavorFamilies);
  if (flavorFamilies) record.flavorFamilies = flavorFamilies;
  const cookingTechniques = asStringArray(record.cookingTechniques);
  if (cookingTechniques) record.cookingTechniques = cookingTechniques;
  record.textureTags = asStringArray(record.textureTags) ?? [];
  record.experienceTags = asStringArray(record.experienceTags) ?? [];

  if (record.regionalStyle === undefined) {
    record.regionalStyle = null;
  }
  if (record.primaryProtein === undefined) {
    record.primaryProtein = null;
  }
  if (record.estimatedFinishMinutesAfterPrep === undefined) {
    record.estimatedFinishMinutesAfterPrep = null;
  } else if (
    typeof record.estimatedFinishMinutesAfterPrep === "string" &&
    record.estimatedFinishMinutesAfterPrep.trim() !== ""
  ) {
    const minutes = Number(record.estimatedFinishMinutesAfterPrep);
    record.estimatedFinishMinutesAfterPrep = Number.isFinite(minutes)
      ? Math.round(minutes)
      : null;
  }

  if (typeof record.candidateId !== "string" || record.candidateId.trim().length === 0) {
    record.candidateId = slugCandidateId(record.name, indexHint);
  }

  if (typeof record.discoveryConfidence === "number") {
    const score = record.discoveryConfidence;
    record.discoveryConfidence =
      score >= 0.8 ? "high" : score >= 0.5 ? "medium" : "low";
  } else if (typeof record.discoveryConfidence === "string") {
    const mapped = CONFIDENCE_ALIASES[record.discoveryConfidence.trim().toLowerCase()];
    if (mapped) record.discoveryConfidence = mapped;
  }

  if (typeof record.fitnessAdaptability === "string") {
    const mapped = FITNESS_ALIASES[record.fitnessAdaptability.trim().toLowerCase()];
    if (mapped) record.fitnessAdaptability = mapped;
  }

  if (typeof record.mealPrepAdaptability === "string") {
    const mapped = MEAL_PREP_ALIASES[record.mealPrepAdaptability.trim().toLowerCase()];
    if (mapped) record.mealPrepAdaptability = mapped;
  }

  return record;
}

function summarizeCandidateValidationFailures(
  candidatesRaw: unknown[],
): Array<{ index: number; message: string }> {
  const samples: Array<{ index: number; message: string }> = [];
  for (let i = 0; i < candidatesRaw.length && samples.length < 3; i += 1) {
    const validated = validateCulinaryDiscoveryCandidate(
      coerceDiscoveryCandidatePayload(candidatesRaw[i], i),
    );
    if (!validated.ok) {
      samples.push({ index: i, message: validated.error.message });
    }
  }
  return samples;
}

export class GeminiGroundedCulinaryDiscoveryProvider implements CulinaryDiscoveryProvider {
  readonly provider = "gemini" as const;
  private readonly model: string;
  private readonly client: GeminiContentClient;
  private readonly requestIdFactory: () => string;
  private readonly now: () => number;
  private readonly onLog?: (event: CulinaryDiscoveryLogEvent) => void;
  private readonly maxGroundingAttempts: number;

  constructor(options: GeminiGroundedCulinaryDiscoveryProviderOptions) {
    this.model = options.model;
    this.client = options.client;
    this.requestIdFactory = options.requestIdFactory ?? createRequestId;
    this.now = options.now ?? (() => Date.now());
    this.onLog = options.onLog;
    this.maxGroundingAttempts = Math.max(1, options.maxGroundingAttempts ?? 2);
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

    // Gemini intermittently skips googleSearch (~1/3) or returns malformed candidate
    // JSON. Retries stay capped (Edge CPU); each attempt may recover grounding or schema.
    const maxGroundingAttempts = this.maxGroundingAttempts;
    let usageMetadata: CulinaryDiscoveryLogEvent["usageMetadata"];
    let groundingMetadata: CulinaryDiscoveryGroundingMetadata | undefined;
    let validatedCandidates: CulinaryDiscoveryCandidate[] = [];
    let lastFailure: CulinaryDiscoveryError | null = null;
    let lastFailureKind: "ungrounded" | "invalid_json" | "schema" | null = null;

    for (let attempt = 1; attempt <= maxGroundingAttempts; attempt += 1) {
      const mealTypeNudge =
        attempt === 1 &&
        (parsed.value.mealType === "snack" || parsed.value.mealType === "breakfast")
          ? [
              "",
              `MEAL-TYPE REMINDER: This request is for ${parsed.value.mealType}.`,
              "You MUST still invoke the googleSearch tool before writing any candidates.",
              parsed.value.mealType === "snack"
                ? "Explore snack / street-food / small-plate / tea-time directions — do not invent snacks from memory or shrink dinner recipes."
                : "Explore real breakfast formats for the requested cuisines — do not invent from memory.",
            ].join("\n")
          : "";
      let retryNudge = mealTypeNudge;
      if (attempt > 1) {
        if (lastFailureKind === "schema" || lastFailureKind === "invalid_json") {
          retryNudge = [
            "",
            "CRITICAL RETRY: Your previous reply was grounded but the final ```json candidates failed schema checks.",
            "You MUST invoke the googleSearch tool again, then emit a valid ```json object:",
            '{"candidates":[{candidateId,name,source:{name,url,author?},cuisineFamily,dishFormat,',
            "flavorFamilies[],cookingTechniques[],whyItIsInteresting,fitnessAdaptability,",
            "fitnessAdaptabilityReason,mealPrepAdaptability,noveltyReason,discoveryConfidence},...]}",
            "Rules: source.url must be a full https:// article URL (not a homepage).",
            "fitnessAdaptability must be easy|moderate|hard.",
            "mealPrepAdaptability must be fully_prepped|component_prepped|quick_fresh_finish|fresh_only.",
            "discoveryConfidence must be high|medium|low. flavorFamilies and cookingTechniques must be non-empty arrays.",
          ].join("\n");
        } else {
          retryNudge = [
            "",
            "CRITICAL RETRY: Your previous reply skipped Google Search grounding.",
            "You MUST invoke the googleSearch tool before writing any candidates.",
            "Do not answer from memory. Do not emit the JSON block until after Search runs.",
            parsed.value.mealType === "snack"
              ? "Search for snack / street-food / chaat / small-plate / tea-time ideas for the requested cuisines — not dinner mains."
              : "Issue about 4–8 broad exploratory culinary searches first (not one remembered dish name per query),",
            "then grounded notes, then the final ```json block.",
          ].join("\n");
        }
      }

      let rawText = "";
      try {
        // Intentionally omit responseMimeType / responseJsonSchema: on Gemini 3.x
        // those suppress googleSearch grounding metadata (DISCOVERY_NOT_GROUNDED).
        // thinkingLevel minimal reduces "search during thinking, omit metadata" misses.
        const result = await this.client.generateContent({
          model: this.model,
          contents: `${prompt.userPrompt}${retryNudge}`,
          systemInstruction: prompt.systemInstruction,
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: "minimal" },
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
        lastFailure = grounded.error;
        lastFailureKind = "ungrounded";
        continue;
      }

      let jsonValue: unknown;
      try {
        jsonValue = JSON.parse(extractJsonObjectFromModelText(rawText));
      } catch (error) {
        lastFailure = culinaryDiscoveryError(
          "LLM_INVALID_STRUCTURED_OUTPUT",
          "Gemini returned non-JSON structured output.",
          { cause: error instanceof Error ? error.message : String(error) },
        );
        lastFailureKind = "invalid_json";
        continue;
      }

      const candidatesRaw =
        jsonValue !== null &&
        typeof jsonValue === "object" &&
        !Array.isArray(jsonValue) &&
        Array.isArray((jsonValue as { candidates?: unknown }).candidates)
          ? ((jsonValue as { candidates: unknown[] }).candidates)
          : null;

      if (!candidatesRaw) {
        lastFailure = culinaryDiscoveryError(
          "LLM_INVALID_STRUCTURED_OUTPUT",
          "Gemini structured output missing candidates array.",
        );
        lastFailureKind = "invalid_json";
        continue;
      }

      validatedCandidates = [];
      for (let i = 0; i < candidatesRaw.length; i += 1) {
        const coerced = coerceDiscoveryCandidatePayload(candidatesRaw[i], i);
        const validated = validateCulinaryDiscoveryCandidate(coerced);
        if (!validated.ok) {
          // Skip malformed individuals; normalize step may still succeed with others.
          continue;
        }
        validatedCandidates.push(validated.value);
      }

      if (validatedCandidates.length === 0) {
        const samples = summarizeCandidateValidationFailures(candidatesRaw);
        lastFailure = culinaryDiscoveryError(
          "DISCOVERY_SCHEMA_VALIDATION_FAILED",
          candidatesRaw.length === 0
            ? "Gemini returned an empty candidates array."
            : "No candidates passed schema validation.",
          {
            candidateCount: candidatesRaw.length,
            samples,
          },
        );
        lastFailureKind = "schema";
        continue;
      }

      lastFailure = null;
      lastFailureKind = null;
      break;
    }

    if (validatedCandidates.length === 0) {
      const mapped =
        lastFailure ??
        culinaryDiscoveryError(
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
      maxCandidateCount: parsed.value.targetCandidateCount,
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
      candidates: normalized.value.candidates,
      groundingMetadata,
      requestId,
      durationMs,
      usageMetadata,
      rejectedForWeakProvenanceCount: normalized.value.stats.rejectedForWeakProvenanceCount,
      genericHomepageSourceCount: normalized.value.stats.genericHomepageSourceCount,
    });

    const result: CulinaryDiscoveryResult = {
      candidates: normalized.value.candidates,
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
      returnedCandidateCount: normalized.value.candidates.length,
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
