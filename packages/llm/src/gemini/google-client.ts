import { GoogleGenAI } from "@google/genai";
import type {
  GeminiContentClient,
  GeminiGenerateContentParams,
  GeminiGenerateContentResult,
  GeminiSafeGroundingMetadata,
} from "./client";

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

export function createGoogleGenAiContentClient(apiKey: string): GeminiContentClient {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generateContent(
      params: GeminiGenerateContentParams,
    ): Promise<GeminiGenerateContentResult> {
      const response = await ai.models.generateContent({
        model: params.model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: params.responseMimeType,
          responseJsonSchema: params.responseJsonSchema,
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
