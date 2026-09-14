import { describe, expect, it, vi } from "vitest";
import {
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  calculateRankedWeeklyStrategyQualityStats,
  sampleRankedWeekPayload,
  sampleRankedWeekPayloadWithUniqueCount,
  sampleRankedWeeklyStrategyRequest,
} from "@fitness-autopilot/domain";
import {
  DEFAULT_GEMINI_MODEL,
  GeminiWeeklyStrategyGenerator,
  geminiRankedWeeklyStrategyResponseJsonSchema,
  type GeminiContentClient,
} from "../index";

function mockClient(impl: GeminiContentClient["generateContent"]): GeminiContentClient {
  return { generateContent: impl };
}

describe("Gemini ranked weekly strategy generator (PLAN-007 / PLAN-007.1)", () => {
  it("creates a 7-day lunch+dinner week from one Gemini call", async () => {
    const spy = vi.fn(async () => ({ text: JSON.stringify(sampleRankedWeekPayload()) }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: "gemini-test-flash",
      client: mockClient(spy),
    });
    const strategy = await generator.generateRankedWeeklyStrategy(
      sampleRankedWeeklyStrategyRequest(),
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(strategy.days).toHaveLength(7);
    expect(strategy.metadata.promptVersion).toBe(RANKED_WEEKLY_STRATEGY_PROMPT_VERSION);
    expect(strategy.metadata.complexityRetry?.occurred).toBe(false);
    expect(strategy.days[0]?.lunch.candidateId).toBe("andhra-green-chilli-chicken");
    expect(strategy.days[0]?.lunch.name).toBe("Andhra Green Chilli Chicken");
  });

  it("does not call Gemini when the lunch pool is empty", async () => {
    const spy = vi.fn(async () => ({ text: JSON.stringify(sampleRankedWeekPayload()) }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(spy),
    });
    await expect(
      generator.generateRankedWeeklyStrategy(
        sampleRankedWeeklyStrategyRequest({ lunchCandidates: [] }),
      ),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CANDIDATES" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not call Gemini when the dinner pool is empty", async () => {
    const spy = vi.fn(async () => ({ text: JSON.stringify(sampleRankedWeekPayload()) }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(spy),
    });
    await expect(
      generator.generateRankedWeeklyStrategy(
        sampleRankedWeeklyStrategyRequest({ dinnerCandidates: [] }),
      ),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CANDIDATES" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("includes candidate IDs, PLAN-001/002 context, and variety in the prompt", async () => {
    let userPrompt = "";
    let systemInstruction = "";
    const client = mockClient(async (params) => {
      userPrompt = params.contents;
      systemInstruction = params.systemInstruction;
      return { text: JSON.stringify(sampleRankedWeekPayload()) };
    });
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    await generator.generateRankedWeeklyStrategy(sampleRankedWeeklyStrategyRequest());
    expect(userPrompt).toContain("andhra-green-chilli-chicken");
    expect(userPrompt).toContain("kerala-meen-pollichathu");
    expect(userPrompt).toContain("varietyLevel: balanced");
    expect(userPrompt).toContain("cookingStyle: ready_lunch_fresh_dinner");
    expect(userPrompt).toContain("maxFinishMinutes: 10");
    expect(systemInstruction).toContain("Do NOT invent");
    expect(systemInstruction).toContain(RANKED_WEEKLY_STRATEGY_PROMPT_VERSION);
    expect(systemInstruction).toContain("Variety is a constraint to prevent boredom");
    expect(systemInstruction).toContain(
      "Do NOT output calories, protein, carbs, fat, portion grams, or serving sizes",
    );
  });

  it("maps Gemini API errors to typed LLM_PROVIDER_ERROR", async () => {
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(async () => {
        throw new Error("429 quota exceeded");
      }),
    });
    await expect(
      generator.generateRankedWeeklyStrategy(sampleRankedWeeklyStrategyRequest()),
    ).rejects.toMatchObject({
      code: "LLM_PROVIDER_ERROR",
      message: "429 quota exceeded",
    });
  });

  it("fails safely on malformed Gemini JSON", async () => {
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(async () => ({ text: "not-json{" })),
    });
    await expect(
      generator.generateRankedWeeklyStrategy(sampleRankedWeeklyStrategyRequest()),
    ).rejects.toMatchObject({
      code: "LLM_INVALID_STRUCTURED_OUTPUT",
    });
  });

  it("returns typed validation failure for a hallucinated candidate", async () => {
    const payload = sampleRankedWeekPayload();
    payload.days[0]!.lunch.candidateId = "invented-dish";
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(async () => ({ text: JSON.stringify(payload) })),
    });
    await expect(
      generator.generateRankedWeeklyStrategy(sampleRankedWeeklyStrategyRequest()),
    ).rejects.toMatchObject({
      code: "INVALID_CANDIDATE_REFERENCE",
    });
  });

  it("calculates quality stats after generation without trusting Gemini nutrition", async () => {
    const payload = {
      ...sampleRankedWeekPayload(),
      calories: 9999,
      days: sampleRankedWeekPayload().days,
    };
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(async () => ({ text: JSON.stringify(payload) })),
    });
    const request = sampleRankedWeeklyStrategyRequest();
    const strategy = await generator.generateRankedWeeklyStrategy(request);
    const stats = calculateRankedWeeklyStrategyQualityStats(strategy, request);
    expect(stats.totalMealSlots).toBe(14);
    expect(stats.complexityStatus).toBe("within_preferred_range");
    expect(JSON.stringify(strategy)).not.toMatch(/"calories":9999/);
    expect(strategy.days[0]?.lunch).not.toHaveProperty("caloriesKcal");
  });

  it("uses a ranked JSON schema without nutrition fields", () => {
    const schema = JSON.stringify(geminiRankedWeeklyStrategyResponseJsonSchema());
    expect(schema).not.toMatch(/calories|proteinG|carbsG|fatG|portion/i);
    expect(schema).toContain("candidateId");
    expect(schema).toContain("lunchPreparationStrategy");
    expect(schema).not.toContain("$ref");
    expect(schema).not.toContain("minItems");
    expect(schema).not.toContain("maxItems");
  });

  it("does not retry when the first plan is within preferred complexity", async () => {
    const spy = vi.fn(async () => ({ text: JSON.stringify(sampleRankedWeekPayload()) }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(spy),
    });
    const strategy = await generator.generateRankedWeeklyStrategy(
      sampleRankedWeeklyStrategyRequest(),
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(strategy.metadata.complexityRetry?.occurred).toBe(false);
  });

  it("does not retry when the first plan is above preferred but not excessive", async () => {
    const spy = vi.fn(async () => ({
      text: JSON.stringify(sampleRankedWeekPayloadWithUniqueCount(10)),
    }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(spy),
    });
    const strategy = await generator.generateRankedWeeklyStrategy(
      sampleRankedWeeklyStrategyRequest(),
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(strategy.metadata.complexityRetry?.occurred).toBe(false);
    expect(strategy.uniqueCandidateIds).toHaveLength(10);
  });

  it("retries exactly once when the first plan is excessive and accepts a corrected week", async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify(sampleRankedWeekPayloadWithUniqueCount(13)),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify(sampleRankedWeekPayload()),
      });
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(spy),
    });
    const strategy = await generator.generateRankedWeeklyStrategy(
      sampleRankedWeeklyStrategyRequest(),
    );
    expect(spy).toHaveBeenCalledTimes(2);
    const retryPrompt = spy.mock.calls[1]?.[0]?.contents as string;
    expect(retryPrompt).toContain("CORRECTIVE RETRY FEEDBACK");
    expect(retryPrompt).toContain("13 unique candidates");
    expect(retryPrompt).toContain("absolutely no more than 10");
    expect(strategy.metadata.complexityRetry).toEqual({
      occurred: true,
      firstAttemptUniqueCandidates: 13,
      finalAttemptUniqueCandidates: 8,
    });
    expect(strategy.uniqueCandidateIds).toHaveLength(8);
  });

  it("returns EXCESSIVE_WEEKLY_COMPLEXITY after an unsuccessful corrective retry", async () => {
    const spy = vi.fn(async () => ({
      text: JSON.stringify(sampleRankedWeekPayloadWithUniqueCount(12)),
    }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(spy),
    });
    await expect(
      generator.generateRankedWeeklyStrategy(sampleRankedWeeklyStrategyRequest()),
    ).rejects.toMatchObject({
      code: "EXCESSIVE_WEEKLY_COMPLEXITY",
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("preserves candidate integrity validation across complexity retry", async () => {
    const badRetry = sampleRankedWeekPayload();
    badRetry.days[0]!.lunch.candidateId = "invented-on-retry";
    const spy = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify(sampleRankedWeekPayloadWithUniqueCount(11)),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify(badRetry),
      });
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(spy),
    });
    await expect(
      generator.generateRankedWeeklyStrategy(sampleRankedWeeklyStrategyRequest()),
    ).rejects.toMatchObject({
      code: "INVALID_CANDIDATE_REFERENCE",
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
