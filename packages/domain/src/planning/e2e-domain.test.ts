import { describe, expect, it } from "vitest";
import { catalog, foodsById, makeProfile } from "@fitness-autopilot/test-fixtures";
import { calculateNutritionTarget, planOneDay } from "../index";

describe("end-to-end domain path", () => {
  it("profile → target → one-day plan", () => {
    const profile = makeProfile();
    const target = calculateNutritionTarget(profile, {
      id: "55555555-5555-5555-5555-555555555555",
      goalType: "fat_loss",
    });
    expect(target.ok).toBe(true);
    if (!target.ok) return;
    const plan = planOneDay({
      profile,
      nutritionTarget: target.value,
      catalog,
      foodsById,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.meals.every((m) => m.portioned.lines.length > 0)).toBe(true);
  });
});
