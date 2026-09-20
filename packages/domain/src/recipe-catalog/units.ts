import type { RecipeQuantityUnit } from "@fitness-autopilot/contracts";

/** Mass conversion factors to grams — never invent volume↔mass density. */
const MASS_TO_G: Partial<Record<RecipeQuantityUnit, number>> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

const VOLUME_TO_TSP: Partial<Record<RecipeQuantityUnit, number>> = {
  tsp: 1,
  tbsp: 3,
  cup: 48,
  ml: 48 / 240,
};

export type RecipeUnitFamily = "mass" | "volume" | "count";

export function recipeUnitFamily(unit: RecipeQuantityUnit): RecipeUnitFamily {
  if (MASS_TO_G[unit] != null) return "mass";
  if (VOLUME_TO_TSP[unit] != null) return "volume";
  return "count";
}

/**
 * Normalize quantity into a comparable base within the same family.
 * Returns null when units are incompatible (no density conversion).
 */
export function normalizeRecipeQuantity(
  quantity: number,
  unit: RecipeQuantityUnit,
  targetUnit: RecipeQuantityUnit,
): number | null {
  if (unit === targetUnit) return quantity;
  const fromFamily = recipeUnitFamily(unit);
  const toFamily = recipeUnitFamily(targetUnit);
  if (fromFamily !== toFamily) return null;
  if (fromFamily === "count") {
    return unit === targetUnit ? quantity : null;
  }
  if (fromFamily === "mass") {
    const from = MASS_TO_G[unit];
    const to = MASS_TO_G[targetUnit];
    if (from == null || to == null) return null;
    return (quantity * from) / to;
  }
  const from = VOLUME_TO_TSP[unit];
  const to = VOLUME_TO_TSP[targetUnit];
  if (from == null || to == null) return null;
  return (quantity * from) / to;
}

export function quantitiesEqualWithinTolerance(
  a: number,
  b: number,
  tolerance = 1e-6,
): boolean {
  return Math.abs(a - b) <= tolerance;
}
