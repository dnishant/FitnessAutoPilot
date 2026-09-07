import { describe, expect, it } from "vitest";
import { catalog, foodsById, makeProfile } from "@fitness-autopilot/test-fixtures";
import { calculateNutritionTarget } from "../nutrition/target";
import { planOneDay, PlannerPolicy } from "./planner";

const asOf = new Date("2026-09-07T00:00:00.000Z");

describe("planOneDay", () => {
  it("produces a valid day within tolerances", () => {
    const profile = makeProfile();
    const target = calculateNutritionTarget(
      profile,
      { id: "55555555-5555-5555-5555-555555555555", goalType: "fat_loss" },
      { asOf },
    );
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

    expect(plan.value.meals.length).toBeGreaterThanOrEqual(3);
    const mealTypes = plan.value.meals.map((m) => m.mealType);
    expect(mealTypes).toContain("breakfast");
    expect(mealTypes).toContain("lunch");
    expect(mealTypes).toContain("dinner");

    expect(
      Math.abs(plan.value.plannedCalories - target.value.targetCalories) /
        target.value.targetCalories,
    ).toBeLessThanOrEqual(PlannerPolicy.dailyCalorieToleranceFraction);
    expect(plan.value.plannedProteinG).toBeGreaterThanOrEqual(
      target.value.proteinG * (1 - PlannerPolicy.dailyProteinUndershootFraction),
    );
  });

  it("excludes allergies and disliked foods", () => {
    const profile = makeProfile({
      allergies: ["dairy"],
      dislikedFoods: ["chicken"],
      dietaryPreference: "vegetarian",
      preferredFoods: ["paneer", "dal"],
      cuisinePreferences: ["indian"],
    });
    const target = calculateNutritionTarget(
      profile,
      { id: "55555555-5555-5555-5555-555555555555", goalType: "general_fitness" },
      { asOf },
    );
    expect(target.ok).toBe(true);
    if (!target.ok) return;

    const plan = planOneDay({
      profile,
      nutritionTarget: target.value,
      catalog,
      foodsById,
    });

    // dairy allergy removes yogurt/whey/paneer; chicken disliked — may fail or succeed with dal-only
    if (plan.ok) {
      for (const meal of plan.value.meals) {
        for (const line of meal.portioned.lines) {
          expect(line.foodName.toLowerCase()).not.toContain("chicken");
          const food = foodsById.get(line.foodId);
          expect(food?.allergenTags.map((t) => t.toLowerCase())).not.toContain("dairy");
        }
      }
    } else {
      expect(["no_eligible_recipe", "portioning_failed", "daily_tolerance_violation"]).toContain(
        plan.error.code,
      );
    }
  });

  it("returns explicit failure for empty catalog", () => {
    const profile = makeProfile();
    const target = calculateNutritionTarget(
      profile,
      { id: "55555555-5555-5555-5555-555555555555", goalType: "fat_loss" },
      { asOf },
    );
    expect(target.ok).toBe(true);
    if (!target.ok) return;
    const plan = planOneDay({
      profile,
      nutritionTarget: target.value,
      catalog: [],
      foodsById,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error.code).toBe("empty_catalog");
    }
  });

  it("only assigns recipes supporting the meal type", () => {
    const profile = makeProfile();
    const target = calculateNutritionTarget(
      profile,
      { id: "55555555-5555-5555-5555-555555555555", goalType: "recomposition" },
      { asOf },
    );
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
    for (const meal of plan.value.meals) {
      expect(meal.portioned.recipe.mealTypes).toContain(meal.mealType);
    }
  });
});
