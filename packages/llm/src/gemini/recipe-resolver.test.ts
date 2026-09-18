import { describe, expect, it, vi } from "vitest";
import { CHICKEN_TIKKA } from "@fitness-autopilot/domain";
import { makeResolvedRecipeFixture } from "@fitness-autopilot/domain";
import type { GeminiContentClient } from "./client";
import {
  GeminiRecipeResolver,
  coerceRecipePrepMode,
  coerceResolvedRecipePayload,
} from "./recipe-resolver";
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

describe("coerceRecipePrepMode", () => {
  it("maps Gemini aliases onto canonical PrepIntent values", () => {
    expect(coerceRecipePrepMode("fully_cooked_meal_prep")).toBe("fully_prepped");
    expect(coerceRecipePrepMode("meal_prep")).toBe("fully_prepped");
    expect(coerceRecipePrepMode("component_prep")).toBe("component_prepped");
    expect(coerceRecipePrepMode("quick_finish")).toBe("quick_fresh_finish");
    expect(coerceRecipePrepMode("fresh_only")).toBe("fresh");
    expect(coerceRecipePrepMode("totally_invented")).toBe("fresh");
  });

  it("coerces unsupported prep mode aliases inside payloads", () => {
    const coerced = coerceResolvedRecipePayload({
      ...fixturePayload(),
      supportedPrepModes: [
        {
          mode: "fully_cooked_meal_prep",
          advanceTasks: ["Cook chicken"],
          finishTasks: ["Reheat"],
          finishTimeMinutes: 8,
        },
      ],
    }) as { supportedPrepModes: Array<{ mode: string }> };
    expect(coerced.supportedPrepModes[0]?.mode).toBe("fully_prepped");
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
    expect(recipe.resolutionMetadata.promptVersion).toBe("recipe-resolution-v2");
    expect(recipe.resolutionMetadata.searchGrounded).toBe(true);
    expect(recipe.nutrition?.source).toBe("llm_estimate");
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

  it("coerces invalid prep-mode aliases without a second Gemini call", async () => {
    const payload = {
      ...fixturePayload(),
      supportedPrepModes: [
        {
          mode: "fully_cooked_meal_prep",
          advanceTasks: ["Marinate and grill"],
          finishTasks: ["Reheat gently"],
          finishTimeMinutes: 10,
        },
      ],
    };
    let calls = 0;
    const client: GeminiContentClient = {
      async generateContent() {
        calls += 1;
        return { text: JSON.stringify(payload) };
      },
    };
    const resolver = new GeminiRecipeResolver({
      model: "gemini-test",
      client,
      enableSearchGrounding: false,
    });
    const recipe = await resolver.resolve({ candidate: CHICKEN_TIKKA });
    expect(calls).toBe(1);
    expect(recipe.supportedPrepModes[0]?.mode).toBe("fully_prepped");
  });

  it("retries once when structured output fails schema validation", async () => {
    const good = fixturePayload();
    const bad = { ...good, baseServings: 0 };
    let calls = 0;
    const client: GeminiContentClient = {
      async generateContent() {
        calls += 1;
        return { text: JSON.stringify(calls === 1 ? bad : good) };
      },
    };
    const resolver = new GeminiRecipeResolver({
      model: "gemini-test",
      client,
      enableSearchGrounding: false,
    });
    const recipe = await resolver.resolve({ candidate: CHICKEN_TIKKA });
    expect(calls).toBe(2);
    expect(recipe.baseServings).toBeGreaterThan(0);
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
