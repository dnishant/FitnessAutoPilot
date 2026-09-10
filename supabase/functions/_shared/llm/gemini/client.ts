export type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

export type GeminiGenerateContentParams = {
  model: string;
  contents: string;
  systemInstruction: string;
  responseMimeType: "application/json";
  responseJsonSchema: Record<string, unknown>;
};

export type GeminiGenerateContentResult = {
  text: string;
  usageMetadata?: GeminiUsageMetadata;
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
