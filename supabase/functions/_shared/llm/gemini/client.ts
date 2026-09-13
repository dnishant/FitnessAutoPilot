export type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

/** Narrow Google Search tool shape used by @google/genai (`googleSearch`, not legacy retrieval). */
export type GeminiGoogleSearchTool = {
  googleSearch: Record<string, never>;
};

export type GeminiSafeGroundingChunk = {
  web?: {
    uri?: string;
    title?: string;
    domain?: string;
  };
};

export type GeminiSafeGroundingSupport = {
  groundingChunkIndices?: number[];
  confidenceScores?: number[];
  segment?: {
    startIndex?: number;
    endIndex?: number;
    text?: string;
  };
};

/**
 * Safe subset of Gemini groundingMetadata for diagnostics / provenance.
 * Omits searchEntryPoint HTML/CSS (Terms widget) to avoid shipping raw HTML to clients.
 */
export type GeminiSafeGroundingMetadata = {
  webSearchQueries?: string[];
  groundingChunks?: GeminiSafeGroundingChunk[];
  groundingSupports?: GeminiSafeGroundingSupport[];
  hasSearchEntryPoint?: boolean;
  imageSearchQueries?: string[];
};

export type GeminiGenerateContentParams = {
  model: string;
  contents: string;
  systemInstruction: string;
  /**
   * Optional structured-output controls.
   * NOTE: On Gemini 3.x, combining `responseJsonSchema` with `googleSearch`
   * currently suppresses grounding metadata. Culinary discovery omits these
   * and validates JSON with Zod after a grounded search call.
   */
  responseMimeType?: "application/json";
  responseJsonSchema?: Record<string, unknown>;
  /** Optional built-in tools (e.g. Google Search grounding). */
  tools?: GeminiGoogleSearchTool[];
};

export type GeminiGenerateContentResult = {
  text: string;
  usageMetadata?: GeminiUsageMetadata;
  groundingMetadata?: GeminiSafeGroundingMetadata;
};

/**
 * Narrow client surface so tests can mock Gemini without the SDK,
 * and domain/application code never imports @google/genai.
 */
export interface GeminiContentClient {
  generateContent(
    params: GeminiGenerateContentParams,
  ): Promise<GeminiGenerateContentResult>;
}
