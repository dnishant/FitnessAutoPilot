import { describe, expect, it, vi } from "vitest";
import { GeminiFoodDisambiguator } from "./food-disambiguator";
import type { GeminiContentClient } from "./client";
import type { LlmServerConfig } from "../config";

const config: LlmServerConfig = {
  provider: "gemini",
  gemini: { apiKey: "test", model: "gemini-3.6-flash" },
};

describe("GeminiFoodDisambiguator", () => {
  it("rejects selections outside the candidate list", async () => {
    const client: GeminiContentClient = {
      async generateContent() {
        return {
          text: JSON.stringify({ externalId: "invented", reason: "nope" }),
        };
      },
    };
    const disambiguator = new GeminiFoodDisambiguator({
      config,
      contentClient: client,
    });
    const result = await disambiguator.chooseCandidate({
      ingredient: {
        ingredientId: "y",
        name: "Greek yogurt",
        quantity: 120,
        unit: "g",
        role: "sauce",
        scalingBehavior: "fixed",
      },
      searchQuery: "Greek yogurt",
      measurementState: "unknown",
      candidates: [
        {
          externalId: "1",
          description: "Yogurt A",
          score: 40,
          matchReason: "test",
        },
        {
          externalId: "2",
          description: "Yogurt B",
          score: 39,
          matchReason: "test",
        },
      ],
    });
    expect(result).toBeNull();
  });

  it("returns a valid candidate selection", async () => {
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify({ externalId: "2", reason: "whole milk match" }),
    }));
    const disambiguator = new GeminiFoodDisambiguator({
      config,
      contentClient: { generateContent },
    });
    const result = await disambiguator.chooseCandidate({
      ingredient: {
        ingredientId: "y",
        name: "plain whole-milk Greek yogurt",
        quantity: 120,
        unit: "g",
        role: "sauce",
        scalingBehavior: "fixed",
      },
      searchQuery: "plain whole-milk Greek yogurt",
      measurementState: "as_purchased",
      candidates: [
        {
          externalId: "1",
          description: "nonfat",
          score: 40,
          matchReason: "test",
        },
        {
          externalId: "2",
          description: "whole milk",
          score: 41,
          matchReason: "test",
        },
      ],
    });
    expect(result).toEqual({ externalId: "2", reason: "whole milk match" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
