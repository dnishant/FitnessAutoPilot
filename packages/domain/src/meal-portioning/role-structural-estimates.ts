import type { IngredientNutrition, MealComponentRole } from "@fitness-autopilot/contracts";

/**
 * role-structural-estimate-v1
 *
 * Last-resort, meal-name-agnostic nutrition for required companions when USDA and
 * discrete staple estimates are unavailable. Explicitly versioned approximations —
 * not USDA and not LLM macros. Prefer real foodResolution whenever available.
 */

export const ROLE_STRUCTURAL_ESTIMATE_VERSION = "role-structural-estimate-v1" as const;

const ROLE_PER_100G: Record<
  MealComponentRole,
  {
    caloriesKcal: number;
    proteinGrams: number;
    carbohydrateGrams: number;
    fatGrams: number;
    fiberGrams: number;
  }
> = {
  main: {
    caloriesKcal: 165,
    proteinGrams: 25,
    carbohydrateGrams: 2,
    fatGrams: 7,
    fiberGrams: 0.2,
  },
  carbohydrate: {
    caloriesKcal: 130,
    proteinGrams: 2.7,
    carbohydrateGrams: 28,
    fatGrams: 0.3,
    fiberGrams: 0.4,
  },
  vegetable: {
    caloriesKcal: 30,
    proteinGrams: 1.2,
    carbohydrateGrams: 5.5,
    fatGrams: 0.3,
    fiberGrams: 1.8,
  },
  fruit: {
    caloriesKcal: 50,
    proteinGrams: 0.6,
    carbohydrateGrams: 12,
    fatGrams: 0.2,
    fiberGrams: 1.5,
  },
  legume: {
    caloriesKcal: 120,
    proteinGrams: 8,
    carbohydrateGrams: 20,
    fatGrams: 0.5,
    fiberGrams: 6,
  },
  sauce_condiment: {
    caloriesKcal: 120,
    proteinGrams: 1,
    carbohydrateGrams: 4,
    fatGrams: 11,
    fiberGrams: 0.2,
  },
  fat: {
    caloriesKcal: 180,
    proteinGrams: 0.2,
    carbohydrateGrams: 0,
    fatGrams: 20,
    fiberGrams: 0,
  },
  garnish: {
    caloriesKcal: 20,
    proteinGrams: 0.5,
    carbohydrateGrams: 2,
    fatGrams: 0.5,
    fiberGrams: 0.5,
  },
};

/** Typical culinary reference mass for one plate contribution by role. */
export function defaultRoleYieldGrams(role: MealComponentRole): number {
  switch (role) {
    case "main":
      return 170;
    case "carbohydrate":
      return 180;
    case "sauce_condiment":
      return 40;
    case "fat":
      return 15;
    case "garnish":
      return 8;
    default:
      return 120;
  }
}

export function roleStructuralNutritionPer100g(role: MealComponentRole) {
  return ROLE_PER_100G[role];
}

export function roleStructuralNutritionForGrams(
  role: MealComponentRole,
  grams: number,
): IngredientNutrition {
  const per100 = roleStructuralNutritionPer100g(role);
  const factor = grams / 100;
  return {
    caloriesKcal: per100.caloriesKcal * factor,
    proteinGrams: per100.proteinGrams * factor,
    carbohydrateGrams: per100.carbohydrateGrams * factor,
    fatGrams: per100.fatGrams * factor,
    fiberGrams: per100.fiberGrams * factor,
  };
}

export function roleStructuralEstimateForComponent(input: {
  role: MealComponentRole;
  referenceYieldGrams?: number;
}): {
  nutrition: IngredientNutrition;
  referenceYieldGrams: number;
  baseServings: number;
  version: typeof ROLE_STRUCTURAL_ESTIMATE_VERSION;
} {
  const referenceYieldGrams = input.referenceYieldGrams ?? defaultRoleYieldGrams(input.role);
  return {
    nutrition: roleStructuralNutritionForGrams(input.role, referenceYieldGrams),
    referenceYieldGrams,
    baseServings: 1,
    version: ROLE_STRUCTURAL_ESTIMATE_VERSION,
  };
}
