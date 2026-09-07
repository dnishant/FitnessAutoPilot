import { describe, expect, it } from "vitest";
import {
  chickenTikkaBowl,
  chickenTikkaIngredients,
  foodsById,
} from "@fitness-autopilot/test-fixtures";
import { portionRecipe } from "./portioning";

describe("portionRecipe", () => {
  it("scales protein and returns deterministic result", () => {
    const input = {
      recipe: chickenTikkaBowl,
      ingredients: chickenTikkaIngredients,
      foodsById,
      mealCalorieTarget: 650,
      mealProteinTarget: 45,
    };
    const a = portionRecipe(input);
    const b = portionRecipe(input);
    expect(a.ok).toBe(true);
    expect(a).toEqual(b);
    if (a.ok) {
      const proteinLine = a.value.lines.find((l) => l.role === "protein");
      const carbLine = a.value.lines.find((l) => l.role === "carbohydrate");
      expect(proteinLine).toBeDefined();
      expect(carbLine).toBeDefined();
      // Base protein already near target; carbohydrate should scale toward calories.
      expect(carbLine!.quantityG).not.toBe(chickenTikkaIngredients[1]!.baseQuantityG);
      expect(a.value.nutrition.caloriesKcal).toBeGreaterThan(500);
    }
  });

  it("respects ingredient bounds / unreachable targets", () => {
    const impossible = portionRecipe({
      recipe: chickenTikkaBowl,
      ingredients: chickenTikkaIngredients,
      foodsById,
      mealCalorieTarget: 650,
      mealProteinTarget: 200,
    });
    expect(impossible.ok).toBe(false);
    if (!impossible.ok) {
      expect([
        "protein_target_unreachable",
        "calorie_target_unreachable",
        "ingredient_bound_violation",
      ]).toContain(impossible.error.code);
    }
  });

  it("fails dietary restriction when allergen present", () => {
    const result = portionRecipe({
      recipe: chickenTikkaBowl,
      ingredients: chickenTikkaIngredients,
      foodsById,
      mealCalorieTarget: 650,
      mealProteinTarget: 45,
      prohibitedFoodNameSubstrings: ["chicken"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("dietary_restriction_violation");
    }
  });

  it("adjusts carbohydrate toward calorie target", () => {
    const result = portionRecipe({
      recipe: chickenTikkaBowl,
      ingredients: chickenTikkaIngredients,
      foodsById,
      mealCalorieTarget: 700,
      mealProteinTarget: 40,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const carb = result.value.lines.find((l) => l.role === "carbohydrate");
      expect(carb).toBeDefined();
      expect(carb!.quantityG).toBeGreaterThan(0);
    }
  });
});
