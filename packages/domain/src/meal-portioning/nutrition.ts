import type {
  IngredientNutrition,
  NutrientsPer100g,
  PersonalizedMealNutrition,
} from "@fitness-autopilot/contracts";
import {
  calculateNutritionForGrams,
  sumIngredientNutrition,
} from "../food-resolution/nutrition-arithmetic";
import { roundGrams, roundKcal, roundMacroG } from "../common/rounding";

export { calculateNutritionForGrams, sumIngredientNutrition };

export function multiplyNutrition(
  nutrition: IngredientNutrition,
  factor: number,
): IngredientNutrition {
  if (!Number.isFinite(factor) || factor < 0) {
    throw new Error("nutrition scale factor must be a finite non-negative number");
  }
  const out: IngredientNutrition = {
    caloriesKcal: nutrition.caloriesKcal * factor,
    proteinGrams: nutrition.proteinGrams * factor,
    carbohydrateGrams: nutrition.carbohydrateGrams * factor,
    fatGrams: nutrition.fatGrams * factor,
  };
  if (nutrition.fiberGrams !== undefined) {
    out.fiberGrams = nutrition.fiberGrams * factor;
  }
  return out;
}

/** Scale base nutrition by a recipe scale factor (linear). */
export function nutritionForRecipeScale(
  baseNutrition: IngredientNutrition,
  scale: number,
): IngredientNutrition {
  return multiplyNutrition(baseNutrition, scale);
}

export function nutritionForFoodGrams(
  nutritionPer100g: NutrientsPer100g,
  grams: number,
): IngredientNutrition {
  return calculateNutritionForGrams(nutritionPer100g, grams);
}

export function nutritionForCount(
  nutritionPerUnit: IngredientNutrition,
  count: number,
): IngredientNutrition {
  return multiplyNutrition(nutritionPerUnit, count);
}

/**
 * Required macros for safe solving: calories + protein must be present and finite.
 * Missing fiber/carbs/fat is distinguishable — do not coerce to zero for completeness checks.
 */
export function hasRequiredMacros(nutrition: IngredientNutrition | NutrientsPer100g): boolean {
  return (
    Number.isFinite(nutrition.caloriesKcal) &&
    Number.isFinite(nutrition.proteinGrams) &&
    nutrition.caloriesKcal >= 0 &&
    nutrition.proteinGrams >= 0
  );
}

/** True when fiber is explicitly known (including explicit 0). */
export function hasKnownFiber(
  nutrition: IngredientNutrition | NutrientsPer100g,
): boolean {
  if (!("fiberGrams" in nutrition)) return false;
  const fiber = nutrition.fiberGrams;
  return fiber !== undefined && fiber !== null && Number.isFinite(fiber);
}

export function toPersonalizedMealNutrition(
  nutrition: IngredientNutrition,
): PersonalizedMealNutrition {
  const out: PersonalizedMealNutrition = {
    caloriesKcal: nutrition.caloriesKcal,
    proteinGrams: nutrition.proteinGrams,
    carbsGrams: nutrition.carbohydrateGrams,
    fatGrams: nutrition.fatGrams,
  };
  if (nutrition.fiberGrams !== undefined) {
    out.fiberGrams = nutrition.fiberGrams;
  }
  return out;
}

/** Display / persistence rounding after practical quantity rounding. */
export function roundMealNutritionForAuthority(
  nutrition: IngredientNutrition,
): PersonalizedMealNutrition {
  const out: PersonalizedMealNutrition = {
    caloriesKcal: roundKcal(nutrition.caloriesKcal),
    proteinGrams: roundMacroG(nutrition.proteinGrams),
    carbsGrams: roundMacroG(nutrition.carbohydrateGrams),
    fatGrams: roundMacroG(nutrition.fatGrams),
  };
  if (nutrition.fiberGrams !== undefined) {
    out.fiberGrams = roundMacroG(nutrition.fiberGrams);
  }
  return out;
}

export function roundPortionNutrition(nutrition: IngredientNutrition): IngredientNutrition {
  const out: IngredientNutrition = {
    caloriesKcal: roundKcal(nutrition.caloriesKcal),
    proteinGrams: roundMacroG(nutrition.proteinGrams),
    carbohydrateGrams: roundMacroG(nutrition.carbohydrateGrams),
    fatGrams: roundMacroG(nutrition.fatGrams),
  };
  if (nutrition.fiberGrams !== undefined) {
    out.fiberGrams = roundMacroG(nutrition.fiberGrams);
  }
  return out;
}

export function roundPracticalGrams(value: number): number {
  return Math.max(1, roundGrams(value));
}

export function roundPracticalCount(value: number, step: number): number {
  const safeStep = step > 0 ? step : 1;
  const rounded = Math.round(value / safeStep) * safeStep;
  return Math.max(safeStep, rounded);
}
