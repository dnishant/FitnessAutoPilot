import { describe, expect, it } from "vitest";
import type { ConsumerWeeklyPlan } from "@fitness-autopilot/contracts";
import { generateMealPrepForWeeklyPlan } from "./generate-meal-prep";

describe("generateMealPrepForWeeklyPlan", () => {
  it("rejects non-ready plans", () => {
    const plan = {
      weekStart: "2026-09-14",
      weekEnd: "2026-09-20",
      status: "idle",
    } as ConsumerWeeklyPlan;
    const result = generateMealPrepForWeeklyPlan({ weeklyPlan: plan });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISSING_WEEKLY_PLAN");
  });

  it("rejects ready plans without finalized personalization", () => {
    const plan = {
      weekStart: "2026-09-14",
      weekEnd: "2026-09-20",
      status: "ready",
      recipesByCandidateId: { a: {} as never },
    } as ConsumerWeeklyPlan;
    const result = generateMealPrepForWeeklyPlan({ weeklyPlan: plan });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISSING_PERSONALIZED_PLAN");
  });
});
