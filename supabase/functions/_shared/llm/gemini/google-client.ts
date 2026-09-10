import { GoogleGenAI } from "@google/genai";
import type {
  GeminiContentClient,
  GeminiGenerateContentParams,
  GeminiGenerateContentResult,
} from "./client";

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
        },
      });
      const text = response.text;
      if (typeof text !== "string" || text.trim() === "") {
        throw new Error("Gemini returned an empty structured response.");
      }
      return {
        text,
        usageMetadata: response.usageMetadata
          ? {
              promptTokenCount: response.usageMetadata.promptTokenCount,
              candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
              totalTokenCount: response.usageMetadata.totalTokenCount,
            }
          : undefined,
      };
    },
  };
}
