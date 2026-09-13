import { describe, expect, it } from "vitest";
import {
  geminiResultFromGenerateContentJson,
  stripGeminiSearchEntryPointJson,
} from "./google-client";

describe("Gemini generateContent JSON helpers", () => {
  it("strips searchEntryPoint HTML widgets before parse", () => {
    const html = `<style>.gs{color:red}</style><div>${"x".repeat(2000)}</div>`;
    const raw = JSON.stringify({
      candidates: [
        {
            content: { parts: [{ text: "Grounded notes" }] },
          groundingMetadata: {
            webSearchQueries: ["regional South Indian chicken"],
            searchEntryPoint: { renderedContent: html },
            groundingChunks: [{ web: { uri: "https://example.com/chicken", title: "example.com" } }],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    });
    const stripped = stripGeminiSearchEntryPointJson(raw);
    expect(stripped).not.toContain("renderedContent");
    expect(stripped).not.toContain(html.slice(0, 40));
    expect(stripped).toContain("regional South Indian chicken");
    JSON.parse(stripped);
  });

  it("maps REST generateContent JSON without keeping search HTML", () => {
    const raw = JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: "notes\n```json\n{\"candidates\":[{\"name\":\"X\"}]}\n```" }],
          },
          groundingMetadata: {
            webSearchQueries: ["goan seafood recipes spicy tangy"],
            searchEntryPoint: { renderedContent: `<html>${"widget".repeat(500)}</html>` },
            groundingChunks: [
              { web: { uri: "https://example.com/recheado", title: "example.com" } },
            ],
          },
        },
      ],
      usageMetadata: { totalTokenCount: 99 },
    });
    const result = geminiResultFromGenerateContentJson(raw);
    expect(result.text).toContain("```json");
    expect(result.usageMetadata?.totalTokenCount).toBe(99);
    expect(result.groundingMetadata?.webSearchQueries).toEqual([
      "goan seafood recipes spicy tangy",
    ]);
    expect(result.groundingMetadata?.groundingChunks?.[0]?.web?.uri).toBe(
      "https://example.com/recheado",
    );
    expect(JSON.stringify(result)).not.toContain("widget");
  });
});
