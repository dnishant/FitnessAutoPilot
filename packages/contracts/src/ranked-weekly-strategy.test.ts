import { describe, expect, it } from "vitest";
import {
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  WEEKLY_VARIETY_COMPLEXITY_POLICY,
  RankedWeeklyStrategyRequestSchema,
  RankedWeeklyStrategySchema,
} from "./ranked-weekly-strategy";
import { MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK } from "./cooking-preferences";

describe("ranked weekly strategy contracts", () => {
  it("versions the PLAN-007.1 prompt, leftover policy, and complexity bands", () => {
    expect(RANKED_WEEKLY_STRATEGY_PROMPT_VERSION).toBe("weekly-strategy-ranked-v1.2.0");
    expect(MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK).toBe(1);
    expect(WEEKLY_VARIETY_COMPLEXITY_POLICY.simple).toMatchObject({
      minPreferredUniqueCandidates: 5,
      maxPreferredUniqueCandidates: 7,
      maxHardUniqueCandidates: 8,
    });
    expect(WEEKLY_VARIETY_COMPLEXITY_POLICY.balanced).toMatchObject({
      minPreferredUniqueCandidates: 7,
      maxPreferredUniqueCandidates: 9,
      maxHardUniqueCandidates: 10,
    });
    expect(WEEKLY_VARIETY_COMPLEXITY_POLICY.high).toMatchObject({
      minPreferredUniqueCandidates: 9,
      maxPreferredUniqueCandidates: 12,
      maxHardUniqueCandidates: 13,
    });
  });

  it("accepts a ranked weekly strategy request with lunch and dinner pools", () => {
    const parsed = RankedWeeklyStrategyRequestSchema.safeParse({
      nutrition: {
        targetCaloriesPerDay: 2200,
        targetProteinGramsPerDay: 160,
      },
      foodPreferences: {
        varietyLevel: "balanced",
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
      },
      cookingPreferences: {
        prepFrequency: "once_weekly",
        maxPrepSessionMinutes: 90,
        cookingStyle: "ready_lunch_fresh_dinner",
        maxFinishMinutes: 10,
        useDinnerPrepForNextLunch: true,
      },
      lunchCandidates: [],
      dinnerCandidates: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("requires candidateId and planningReason on hydrated slots", () => {
    const invalid = RankedWeeklyStrategySchema.safeParse({
      strategySummary: {
        varietyApproach: "varied",
        prepApproach: "prep",
        ingredientReuseApproach: "likely reuse",
      },
      days: [],
      uniqueCandidateIds: [],
      metadata: {
        provider: "gemini",
        model: "test",
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
      },
    });
    expect(invalid.success).toBe(false);
  });
});
