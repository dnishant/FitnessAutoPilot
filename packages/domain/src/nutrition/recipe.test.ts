import { describe, expect, it } from "vitest";
import {
  chickenTikkaBowl,
  chickenTikkaIngredients,
  foods,
  foodsById,
} from "@fitness-autopilot/test-fixtures";
import { calculateFoodNutrition } from "./food.js";
import { calculateRecipeNutrition } from "../recipes/nutrition.js";

describe("food and recipe nutrition", () => {
  it("calculates food nutrition deterministically", () => {
    const food = foods[0]!;
    const a = calculateFoodNutrition(food, 150);
    const b = calculateFoodNutrition(food, 150);
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.value.caloriesKcal).toBeGreaterThan(0);
      expect(a.value.proteinG).toBeGreaterThan(0);
      expect(a.value.proteinG).toBeGreaterThanOrEqual(0);
    }
  });

  it("rejects zero or negative quantities", () => {
    expect(calculateFoodNutrition(foods[0]!, 0).ok).toBe(false);
    expect(calculateFoodNutrition(foods[0]!, -10).ok).toBe(false);
  });

  it("recipe totals equal sum of ingredient nutrition", () => {
    const result = calculateRecipeNutrition(
      chickenTikkaBowl,
      chickenTikkaIngredients,
      foodsById,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const summed = result.value.lines.reduce(
      (acc, line) => ({
        caloriesKcal: acc.caloriesKcal + line.nutrition.caloriesKcal,
        proteinG: acc.proteinG + line.nutrition.proteinG,
        carbsG: acc.carbsG + line.nutrition.carbsG,
        fatG: acc.fatG + line.nutrition.fatG,
      }),
      { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
    // totals use rounding helpers; allow 1 kcal / 0.2g drift from raw sum vs rounded sum
    expect(Math.abs(result.value.totals.caloriesKcal - summed.caloriesKcal)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.value.totals.proteinG - summed.proteinG)).toBeLessThanOrEqual(0.2);
  });

  it("scaling an ingredient changes totals", () => {
    const base = calculateRecipeNutrition(
      chickenTikkaBowl,
      chickenTikkaIngredients,
      foodsById,
    );
    const proteinId = chickenTikkaIngredients[0]!.id;
    const scaledQty = new Map([[proteinId, 300]]);
    // fill other quantities
    for (const ing of chickenTikkaIngredients.slice(1)) {
      scaledQty.set(ing.id, ing.baseQuantityG);
    }
    const scaled = calculateRecipeNutrition(
      chickenTikkaBowl,
      chickenTikkaIngredients,
      foodsById,
      scaledQty,
    );
    expect(base.ok && scaled.ok).toBe(true);
    if (base.ok && scaled.ok) {
      expect(scaled.value.totals.proteinG).toBeGreaterThan(base.value.totals.proteinG);
      expect(scaled.value.totals.caloriesKcal).toBeGreaterThan(base.value.totals.caloriesKcal);
    }
  });

  it("fails on unknown food references", () => {
    const badIngredients = [
      {
        ...chickenTikkaIngredients[0]!,
        foodId: "99999999-9999-9999-9999-999999999999",
      },
    ];
    const result = calculateRecipeNutrition(chickenTikkaBowl, badIngredients, foodsById);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_food");
    }
  });
});
