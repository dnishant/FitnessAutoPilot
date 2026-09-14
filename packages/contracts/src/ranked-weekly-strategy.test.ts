import { describe, expect, it } from "vitest";
import {
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  RankedWeeklyStrategyRequestSchema,
  RankedWeeklyStrategySchema,
} from "./ranked-weekly-strategy";
import { MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK } from "./cooking-preferences";

describe("ranked weekly strategy contracts", () => {
  it("versions the PLAN-007 prompt and leftover policy", () => {
    expect(RANKED_WEEKLY_STRATEGY_PROMPT_VERSION).toBe("weekly-strategy-ranked-v1");
    expect(MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK).toBe(1);
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
