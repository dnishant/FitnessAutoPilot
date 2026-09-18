import type { IngredientNutrition } from "../../contracts/index.ts";

/**
 * discrete-staple-estimate-v1
 *
 * Role/name-pattern driven estimates for countable staples when PLAN-009 has not
 * yet resolved a canonical food. Explicitly versioned approximations — not USDA.
 * Prefer real foodResolution whenever available.
 */

export const DISCRETE_STAPLE_ESTIMATE_VERSION = "discrete-staple-estimate-v1" as const;

export type DiscreteStapleKind = "tortilla" | "egg" | "pita" | "wrap" | "bun" | "slice" | "piece";

export type DiscreteStapleEstimate = {
  kind: DiscreteStapleKind;
  unitLabel: string;
  nutritionPerUnit: IngredientNutrition;
  /** Typical cooked/ready mass for one unit — diagnostic only. */
  approximateGramsPerUnit: number;
  version: typeof DISCRETE_STAPLE_ESTIMATE_VERSION;
};

/** Corn tortilla, ready-to-eat ~30g — approximate generic values. */
const TORTILLA: DiscreteStapleEstimate = {
  kind: "tortilla",
  unitLabel: "tortilla",
  approximateGramsPerUnit: 30,
  version: DISCRETE_STAPLE_ESTIMATE_VERSION,
  nutritionPerUnit: {
    caloriesKcal: 65,
    proteinGrams: 1.6,
    carbohydrateGrams: 13.5,
    fatGrams: 0.9,
    fiberGrams: 1.8,
  },
};

const EGG: DiscreteStapleEstimate = {
  kind: "egg",
  unitLabel: "egg",
  approximateGramsPerUnit: 50,
  version: DISCRETE_STAPLE_ESTIMATE_VERSION,
  nutritionPerUnit: {
    caloriesKcal: 72,
    proteinGrams: 6.3,
    carbohydrateGrams: 0.4,
    fatGrams: 4.8,
    fiberGrams: 0,
  },
};

const PITA: DiscreteStapleEstimate = {
  kind: "pita",
  unitLabel: "pita",
  approximateGramsPerUnit: 60,
  version: DISCRETE_STAPLE_ESTIMATE_VERSION,
  nutritionPerUnit: {
    caloriesKcal: 165,
    proteinGrams: 5.5,
    carbohydrateGrams: 33,
    fatGrams: 0.7,
    fiberGrams: 1.3,
  },
};

const WRAP: DiscreteStapleEstimate = {
  kind: "wrap",
  unitLabel: "wrap",
  approximateGramsPerUnit: 55,
  version: DISCRETE_STAPLE_ESTIMATE_VERSION,
  nutritionPerUnit: {
    caloriesKcal: 150,
    proteinGrams: 4,
    carbohydrateGrams: 25,
    fatGrams: 3.5,
    fiberGrams: 1.5,
  },
};

const BUN: DiscreteStapleEstimate = {
  kind: "bun",
  unitLabel: "bun",
  approximateGramsPerUnit: 50,
  version: DISCRETE_STAPLE_ESTIMATE_VERSION,
  nutritionPerUnit: {
    caloriesKcal: 140,
    proteinGrams: 4.5,
    carbohydrateGrams: 26,
    fatGrams: 2,
    fiberGrams: 1,
  },
};

const SLICE: DiscreteStapleEstimate = {
  kind: "slice",
  unitLabel: "slice",
  approximateGramsPerUnit: 28,
  version: DISCRETE_STAPLE_ESTIMATE_VERSION,
  nutritionPerUnit: {
    caloriesKcal: 75,
    proteinGrams: 2.5,
    carbohydrateGrams: 14,
    fatGrams: 1,
    fiberGrams: 0.8,
  },
};

const PIECE: DiscreteStapleEstimate = {
  kind: "piece",
  unitLabel: "piece",
  approximateGramsPerUnit: 30,
  version: DISCRETE_STAPLE_ESTIMATE_VERSION,
  nutritionPerUnit: {
    caloriesKcal: 50,
    proteinGrams: 1,
    carbohydrateGrams: 10,
    fatGrams: 0.5,
    fiberGrams: 0.5,
  },
};

export function matchDiscreteStapleEstimate(name: string): DiscreteStapleEstimate | null {
  const n = name.toLowerCase();
  if (/\b(tortilla|tortillas)\b/.test(n)) return TORTILLA;
  if (/\b(egg|eggs)\b/.test(n)) return EGG;
  if (/\b(pita|pitas)\b/.test(n)) return PITA;
  if (/\b(wrap|wraps)\b/.test(n)) return WRAP;
  if (/\b(bun|buns)\b/.test(n)) return BUN;
  if (/\b(slice|slices)\b/.test(n)) return SLICE;
  if (/\b(piece|pieces)\b/.test(n)) return PIECE;
  return null;
}

export function isDiscreteUnitLabel(unit: string | undefined): boolean {
  if (!unit) return false;
  return /^(tortilla|egg|pita|wrap|bun|slice|piece|count)$/i.test(unit.trim());
}
