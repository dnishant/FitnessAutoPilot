import { GoogleGenAI } from "@google/genai";
import type {
  GeminiContentClient,
  GeminiGenerateContentParams,
  GeminiGenerateContentResult,
  GeminiSafeGroundingMetadata,
} from "./client";

function skipJsonValue(source: string, start: number): number {
  let i = start;
  while (i < source.length && /\s/.test(source[i] ?? "")) {
    i += 1;
  }
  if (i >= source.length) {
    return -1;
  }
  const first = source[i];
  if (first === '"') {
    i += 1;
    let escape = false;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        return i + 1;
      }
    }
    return -1;
  }
  if (first !== "{" && first !== "[") {
    while (i < source.length && !/[,\]}\s]/.test(source[i] ?? "")) {
      i += 1;
    }
    return i;
  }

  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (; i < source.length; i += 1) {
    const ch = source[i] ?? "";
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }
    if (ch === "}" || ch === "]") {
      const open = stack.pop();
      if ((ch === "}" && open !== "{") || (ch === "]" && open !== "[")) {
        return -1;
      }
      if (stack.length === 0) {
        return i + 1;
      }
    }
  }
  return -1;
}

/**
 * Drop Gemini Search grounding HTML/CSS widgets before JSON.parse.
 * `searchEntryPoint.renderedContent` is large enough to trip Edge Function
 * CPU/memory limits (~2s CPU / 256MB) even though we never forward it.
 */
export function stripGeminiSearchEntryPointJson(raw: string): string {
  const key = '"searchEntryPoint"';
  let output = raw;
  let guard = 0;
  while (guard < 8) {
    guard += 1;
    const idx = output.indexOf(key);
    if (idx < 0) {
      return output;
    }
    let colon = idx + key.length;
    while (colon < output.length && /\s/.test(output[colon] ?? "")) {
      colon += 1;
    }
    if (output[colon] !== ":") {
      return output;
    }
    const valueStart = colon + 1;
    const valueEnd = skipJsonValue(output, valueStart);
    if (valueEnd < 0) {
      return output;
    }
    let start = idx;
    let cursor = idx - 1;
    while (cursor >= 0 && /\s/.test(output[cursor] ?? "")) {
      cursor -= 1;
    }
    if (output[cursor] === ",") {
      start = cursor;
    }
    let end = valueEnd;
    if (start === idx) {
      let trailing = valueEnd;
      while (trailing < output.length && /\s/.test(output[trailing] ?? "")) {
        trailing += 1;
      }
      if (output[trailing] === ",") {
        end = trailing + 1;
      }
    }
    output = output.slice(0, start) + output.slice(end);
  }
  return output;
}

function textFromGeminiResponse(parsed: unknown): string {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "";
  }
  const candidates = (parsed as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }
  const first = candidates[0];
  if (first === null || typeof first !== "object") {
    return "";
  }
  const content = (first as { content?: { parts?: unknown } }).content;
  const parts = content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part) => {
      if (part === null || typeof part !== "object") {
        return "";
      }
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

function mapGroundingMetadata(raw: unknown): GeminiSafeGroundingMetadata | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const meta = raw as Record<string, unknown>;
  const webSearchQueries = Array.isArray(meta.webSearchQueries)
    ? meta.webSearchQueries.filter((q): q is string => typeof q === "string" && q.trim() !== "")
    : undefined;
  const imageSearchQueries = Array.isArray(meta.imageSearchQueries)
    ? meta.imageSearchQueries.filter((q): q is string => typeof q === "string" && q.trim() !== "")
    : undefined;

  const groundingChunks = Array.isArray(meta.groundingChunks)
    ? meta.groundingChunks
        .map((chunk) => {
          if (chunk === null || typeof chunk !== "object") return null;
          const web = (chunk as { web?: unknown }).web;
          if (web === null || typeof web !== "object") {
            return {};
          }
          const webRec = web as Record<string, unknown>;
          return {
            web: {
              uri: typeof webRec.uri === "string" ? webRec.uri : undefined,
              title: typeof webRec.title === "string" ? webRec.title : undefined,
              domain: typeof webRec.domain === "string" ? webRec.domain : undefined,
            },
          };
        })
        .filter((chunk): chunk is NonNullable<typeof chunk> => chunk !== null)
    : undefined;

  const groundingSupports = Array.isArray(meta.groundingSupports)
    ? meta.groundingSupports
        .map((support) => {
          if (support === null || typeof support !== "object") return null;
          const s = support as Record<string, unknown>;
          const segment =
            s.segment !== null && typeof s.segment === "object"
              ? (s.segment as Record<string, unknown>)
              : undefined;
          return {
            groundingChunkIndices: Array.isArray(s.groundingChunkIndices)
              ? s.groundingChunkIndices.filter((n): n is number => typeof n === "number")
              : undefined,
            confidenceScores: Array.isArray(s.confidenceScores)
              ? s.confidenceScores.filter((n): n is number => typeof n === "number")
              : undefined,
            segment: segment
              ? {
                  startIndex:
                    typeof segment.startIndex === "number" ? segment.startIndex : undefined,
                  endIndex: typeof segment.endIndex === "number" ? segment.endIndex : undefined,
                  text:
                    typeof segment.text === "string" ? segment.text.slice(0, 2000) : undefined,
                }
              : undefined,
          };
        })
        .filter((support): support is NonNullable<typeof support> => support !== null)
    : undefined;

  const hasSearchEntryPoint = meta.searchEntryPoint !== undefined && meta.searchEntryPoint !== null;

  if (
    !webSearchQueries?.length &&
    !groundingChunks?.length &&
    !groundingSupports?.length &&
    !hasSearchEntryPoint &&
    !imageSearchQueries?.length
  ) {
    return undefined;
  }

  return {
    webSearchQueries,
    groundingChunks,
    groundingSupports,
    hasSearchEntryPoint: hasSearchEntryPoint || undefined,
    imageSearchQueries,
  };
}

export function geminiResultFromGenerateContentJson(
  rawText: string,
): GeminiGenerateContentResult {
  const stripped = stripGeminiSearchEntryPointJson(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped) as unknown;
  } catch (error) {
    throw new Error(
      `Gemini returned non-JSON generateContent output: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const text = textFromGeminiResponse(parsed);
  if (text.trim() === "") {
    throw new Error("Gemini returned an empty structured response.");
  }
  const firstCandidate =
    parsed !== null &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { candidates?: unknown }).candidates)
      ? (parsed as { candidates: unknown[] }).candidates[0]
      : undefined;
  const rawGrounding =
    firstCandidate !== null &&
    typeof firstCandidate === "object"
      ? (firstCandidate as { groundingMetadata?: unknown }).groundingMetadata
      : undefined;
  const usage =
    parsed !== null && typeof parsed === "object"
      ? (parsed as { usageMetadata?: Record<string, unknown> }).usageMetadata
      : undefined;
  return {
    text,
    usageMetadata: usage
      ? {
          promptTokenCount:
            typeof usage.promptTokenCount === "number" ? usage.promptTokenCount : undefined,
          candidatesTokenCount:
            typeof usage.candidatesTokenCount === "number"
              ? usage.candidatesTokenCount
              : undefined,
          totalTokenCount:
            typeof usage.totalTokenCount === "number" ? usage.totalTokenCount : undefined,
        }
      : undefined,
    groundingMetadata: mapGroundingMetadata(rawGrounding),
  };
}

async function generateContentViaRest(
  apiKey: string,
  params: GeminiGenerateContentParams,
): Promise<GeminiGenerateContentResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.model,
  )}:generateContent`;
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: params.systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: params.contents }] }],
  };
  if (params.tools?.length) {
    body.tools = params.tools;
  }
  const generationConfig: Record<string, unknown> = {};
  if (params.responseMimeType) {
    generationConfig.responseMimeType = params.responseMimeType;
  }
  if (params.responseJsonSchema) {
    generationConfig.responseJsonSchema = params.responseJsonSchema;
  }
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Gemini HTTP ${response.status}: ${rawText.replace(apiKey, "[redacted]").slice(0, 300)}`,
    );
  }
  return geminiResultFromGenerateContentJson(rawText);
}

export function createGoogleGenAiContentClient(apiKey: string): GeminiContentClient {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generateContent(
      params: GeminiGenerateContentParams,
    ): Promise<GeminiGenerateContentResult> {
      // Search-grounded responses include a large HTML search widget. Parsing it
      // via the SDK routinely exceeds Supabase Edge CPU/memory (WORKER_RESOURCE_LIMIT).
      if (params.tools?.some((tool) => "googleSearch" in tool)) {
        return generateContentViaRest(apiKey, params);
      }
      const response = await ai.models.generateContent({
        model: params.model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          ...(params.responseMimeType
            ? { responseMimeType: params.responseMimeType }
            : {}),
          ...(params.responseJsonSchema
            ? { responseJsonSchema: params.responseJsonSchema }
            : {}),
          ...(params.tools ? { tools: params.tools } : {}),
        },
      });
      const text = response.text;
      if (typeof text !== "string" || text.trim() === "") {
        throw new Error("Gemini returned an empty structured response.");
      }
      const rawGrounding = response.candidates?.[0]?.groundingMetadata;
      return {
        text,
        usageMetadata: response.usageMetadata
          ? {
              promptTokenCount: response.usageMetadata.promptTokenCount,
              candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
              totalTokenCount: response.usageMetadata.totalTokenCount,
            }
          : undefined,
        groundingMetadata: mapGroundingMetadata(rawGrounding),
      };
    },
  };
}

/** Exported for unit tests — maps SDK grounding into the safe diagnostic shape. */
export { mapGroundingMetadata as mapGeminiGroundingMetadataForTests };
