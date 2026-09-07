import type { Food, NutritionMacros } from "@fitness-autopilot/contracts";
import { ok, err, type Result } from "@fitness-autopilot/validation";
import { roundKcal, roundMacroG } from "../common/rounding";

export type FoodNutritionError = {
  code: "invalid_quantity" | "invalid_food";
  message: string;
};

export function calculateFoodNutrition(
  food: Food,
  grams: number,
): Result<NutritionMacros, FoodNutritionError> {
  if (!Number.isFinite(grams) || grams <= 0) {
    return err({
      code: "invalid_quantity",
      message: "Ingredient grams must be a finite number greater than 0.",
    });
  }
  if (
    !Number.isFinite(food.caloriesPer100g) ||
    !Number.isFinite(food.proteinGPer100g) ||
    !Number.isFinite(food.carbsGPer100g) ||
    !Number.isFinite(food.fatGPer100g) ||
    food.caloriesPer100g < 0 ||
    food.proteinGPer100g < 0 ||
    food.carbsGPer100g < 0 ||
    food.fatGPer100g < 0
  ) {
    return err({ code: "invalid_food", message: `Food ${food.id} has invalid macros.` });
  }

  const factor = grams / 100;
  return ok({
    caloriesKcal: roundKcal(food.caloriesPer100g * factor),
    proteinG: roundMacroG(food.proteinGPer100g * factor),
    carbsG: roundMacroG(food.carbsGPer100g * factor),
    fatG: roundMacroG(food.fatGPer100g * factor),
  });
}

export function sumNutrition(parts: readonly NutritionMacros[]): NutritionMacros {
  let caloriesKcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  for (const part of parts) {
    caloriesKcal += part.caloriesKcal;
    proteinG += part.proteinG;
    carbsG += part.carbsG;
    fatG += part.fatG;
  }
  return {
    caloriesKcal: roundKcal(caloriesKcal),
    proteinG: roundMacroG(proteinG),
    carbsG: roundMacroG(carbsG),
    fatG: roundMacroG(fatG),
  };
}
