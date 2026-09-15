import { describe, expect, it, vi } from "vitest";
import { CHICKEN_TIKKA } from "@fitness-autopilot/domain";
import { makeResolvedRecipeFixture } from "@fitness-autopilot/domain";
import type { GeminiContentClient } from "./client";
import { GeminiRecipeResolver } from "./recipe-resolver";
import { classifyGeminiProviderError, computeBackoffDelayMs, withGeminiRetries } from "./retry";

function fixturePayload() {
  const fixture = makeResolvedRecipeFixture(CHICKEN_TIKKA);
  const { candidateId: _c, source: _s, resolutionMetadata: _m, ...payload } = fixture;
  return payload;
}

describe("Gemini retry helpers", () => {
  it("classifies 429 / rate limit errors", () => {
    expect(classifyGeminiProviderError(new Error("429 quota exceeded")).isRateLimited).toBe(true);
    expect(classifyGeminiProviderError(new Error("rate limit hit")).isRateLimited).toBe(true);
    expect(classifyGeminiProviderError(new Error("Gemini HTTP 503: high demand")).isRateLimited).toBe(
      true,
    );
    expect(classifyGeminiProviderError(new Error("network down")).isRateLimited).toBe(false);
  });

  it("honors Retry-After and exponential backoff with jitter", async () => {
    expect(
      computeBackoffDelayMs({
        attempt: 1,
        baseDelayMs: 100,
        maxDelayMs: 5000,
        retryAfterMs: 1200,
        random: () => 0,
      }),
    ).toBe(1200);

    let calls = 0;
    const sleep = vi.fn(async () => undefined);
    await expect(
      withGeminiRetries(
        async () => {
          calls += 1;
          if (calls < 3) {
            throw new Error("429 Too Many Requests; retry-after: 1");
          }
          return "ok";
        },
        { maxAttempts: 3, sleep, random: () => 0, baseDelayMs: 100, maxDelayMs: 5000 },
      ),
    ).resolves.toBe("ok");
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("throws RATE_LIMITED after exhausting retries", async () => {
    const client: GeminiContentClient = {
      async generateContent() {
        throw new Error("429 quota exceeded");
      },
    };
    const resolver = new GeminiRecipeResolver({
      model: "gemini-test",
      client,
      maxAttempts: 2,
      sleep: async () => undefined,
      enableSearchGrounding: false,
    });
    await expect(resolver.resolve({ candidate: CHICKEN_TIKKA })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});

describe("GeminiRecipeResolver", () => {
  it("resolves a source-backed candidate with Search grounding path", async () => {
    const payload = fixturePayload();
    const client: GeminiContentClient = {
      async generateContent(params) {
        expect(params.tools).toEqual([{ googleSearch: {} }]);
        expect(params.responseJsonSchema).toBeUndefined();
        return {
          text: `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``,
          usageMetadata: { totalTokenCount: 10 },
          groundingMetadata: { webSearchQueries: ["chicken tikka serious eats"] },
        };
      },
    };
    const resolver = new GeminiRecipeResolver({
      model: "gemini-test",
      client,
      enableSearchGrounding: true,
    });
    const recipe = await resolver.resolve({ candidate: CHICKEN_TIKKA });
    expect(recipe.candidateId).toBe("tikka-chicken");
    expect(recipe.source.name).toBe("Serious Eats");
    expect(recipe.resolutionMetadata.promptVersion).toBe("recipe-resolution-v1");
    expect(recipe.resolutionMetadata.searchGrounded).toBe(true);
    expect(recipe).not.toHaveProperty("calories");
  });

  it("forces candidateId even if the model invents another id", async () => {
    const payload = { ...fixturePayload(), recipeId: "x", name: "Chicken Tikka" };
    const client: GeminiContentClient = {
      async generateContent() {
        return {
          text: JSON.stringify({ ...payload, candidateId: "hijacked-id" }),
        };
      },
    };
    const resolver = new GeminiRecipeResolver({
      model: "gemini-test",
      client,
      enableSearchGrounding: false,
    });
    const recipe = await resolver.resolve({ candidate: CHICKEN_TIKKA });
    expect(recipe.candidateId).toBe("tikka-chicken");
  });

  it("rejects invalid structured output", async () => {
    const client: GeminiContentClient = {
      async generateContent() {
        return { text: "not-json" };
      },
    };
    const resolver = new GeminiRecipeResolver({
      model: "gemini-test",
      client,
      enableSearchGrounding: false,
    });
    await expect(resolver.resolve({ candidate: CHICKEN_TIKKA })).rejects.toMatchObject({
      code: "LLM_INVALID_STRUCTURED_OUTPUT",
    });
  });
});
