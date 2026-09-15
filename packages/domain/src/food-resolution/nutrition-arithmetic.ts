import type { IngredientNutrition, NutrientsPer100g } from "@fitness-autopilot/contracts";

/**
 * Pure deterministic nutrition arithmetic (PLAN-009).
 * Uses floating-point precision internally; round only for display.
 * Provider energy is authoritative — do not replace with 4-4-9 derived kcal.
 */

export function calculateNutritionForGrams(
  nutrientsPer100g: NutrientsPer100g,
  grams: number,
): IngredientNutrition {
  if (!Number.isFinite(grams) || grams <= 0) {
    throw new Error("grams must be a finite number greater than 0");
  }
  const factor = grams / 100;
  const nutrition: IngredientNutrition = {
    caloriesKcal: nutrientsPer100g.caloriesKcal * factor,
    proteinGrams: nutrientsPer100g.proteinGrams * factor,
    carbohydrateGrams: nutrientsPer100g.carbohydrateGrams * factor,
    fatGrams: nutrientsPer100g.fatGrams * factor,
  };
  if (
    nutrientsPer100g.fiberGrams !== undefined &&
    nutrientsPer100g.fiberGrams !== null &&
    Number.isFinite(nutrientsPer100g.fiberGrams)
  ) {
    nutrition.fiberGrams = nutrientsPer100g.fiberGrams * factor;
  }
  return nutrition;
}

export function sumIngredientNutrition(
  parts: readonly IngredientNutrition[],
): IngredientNutrition {
  let caloriesKcal = 0;
  let proteinGrams = 0;
  let carbohydrateGrams = 0;
  let fatGrams = 0;
  let fiberGrams = 0;
  let hasFiber = false;
  for (const part of parts) {
    caloriesKcal += part.caloriesKcal;
    proteinGrams += part.proteinGrams;
    carbohydrateGrams += part.carbohydrateGrams;
    fatGrams += part.fatGrams;
    if (part.fiberGrams !== undefined) {
      fiberGrams += part.fiberGrams;
      hasFiber = true;
    }
  }
  const total: IngredientNutrition = {
    caloriesKcal,
    proteinGrams,
    carbohydrateGrams,
    fatGrams,
  };
  if (hasFiber) total.fiberGrams = fiberGrams;
  return total;
}

export function scaleNutrition(
  nutrition: IngredientNutrition,
  divisor: number,
): IngredientNutrition {
  if (!Number.isFinite(divisor) || divisor <= 0) {
    throw new Error("divisor must be a finite number greater than 0");
  }
  const scaled: IngredientNutrition = {
    caloriesKcal: nutrition.caloriesKcal / divisor,
    proteinGrams: nutrition.proteinGrams / divisor,
    carbohydrateGrams: nutrition.carbohydrateGrams / divisor,
    fatGrams: nutrition.fatGrams / divisor,
  };
  if (nutrition.fiberGrams !== undefined) {
    scaled.fiberGrams = nutrition.fiberGrams / divisor;
  }
  return scaled;
}

/** Display helpers — not used for authoritative persistence. */
export function roundNutritionForDisplay(nutrition: IngredientNutrition): IngredientNutrition {
  const rounded: IngredientNutrition = {
    caloriesKcal: Math.round(nutrition.caloriesKcal),
    proteinGrams: Math.round(nutrition.proteinGrams * 10) / 10,
    carbohydrateGrams: Math.round(nutrition.carbohydrateGrams * 10) / 10,
    fatGrams: Math.round(nutrition.fatGrams * 10) / 10,
  };
  if (nutrition.fiberGrams !== undefined) {
    rounded.fiberGrams = Math.round(nutrition.fiberGrams * 10) / 10;
  }
  return rounded;
}
