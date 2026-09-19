import { describe, expect, it } from "vitest";
import {
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  WEEKLY_VARIETY_COMPLEXITY_POLICY,
  RankedWeeklyStrategyRequestSchema,
  RankedWeeklyStrategySchema,
} from "./ranked-weekly-strategy";
import { MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK } from "./cooking-preferences";

describe("ranked weekly strategy contracts", () => {
  it("versions the V1 meal-prep prompt, leftover policy, and fixed 4-meal bands", () => {
    expect(RANKED_WEEKLY_STRATEGY_PROMPT_VERSION).toBe("weekly-strategy-ranked-v1.5.0");
    expect(MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK).toBe(1);
    // V1: every variety level uses exactly 4 unique core meals.
    expect(WEEKLY_VARIETY_COMPLEXITY_POLICY.simple).toMatchObject({
      minPreferredUniqueCandidates: 4,
      maxPreferredUniqueCandidates: 4,
      maxHardUniqueCandidates: 4,
    });
    expect(WEEKLY_VARIETY_COMPLEXITY_POLICY.balanced).toMatchObject({
      minPreferredUniqueCandidates: 4,
      maxPreferredUniqueCandidates: 4,
      maxHardUniqueCandidates: 4,
    });
    expect(WEEKLY_VARIETY_COMPLEXITY_POLICY.high).toMatchObject({
      minPreferredUniqueCandidates: 4,
      maxPreferredUniqueCandidates: 4,
      maxHardUniqueCandidates: 4,
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
