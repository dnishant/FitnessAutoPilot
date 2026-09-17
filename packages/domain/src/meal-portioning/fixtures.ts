import type {
  ComponentNutritionCoefficient,
  MealNutritionIntent,
  SolveMealPortionsRequest,
} from "@fitness-autopilot/contracts";
import { NUTRITION_CALCULATION_POLICY_VERSION } from "@fitness-autopilot/contracts";

/**
 * Realistic PLAN-010 fixtures with trusted nutrition coefficients.
 * No live USDA / Gemini calls — nutrition is pre-resolved fixture data.
 */

export const DEVELOPER_TEST_INTENT_600: MealNutritionIntent = {
  targetCaloriesKcal: 600,
  targetProteinGrams: 50,
  targetCarbsGrams: 60,
  targetFatGrams: 18,
  targetFiberGrams: 8,
  isDeveloperTestIntent: true,
  label: "Developer test intent (not production daily allocation)",
};

export const DEVELOPER_TEST_INTENT_CALORIES_PROTEIN_ONLY: MealNutritionIntent = {
  targetCaloriesKcal: 620,
  targetProteinGrams: 48,
  isDeveloperTestIntent: true,
  label: "Developer test intent — calories + protein only",
};

/** Per-reference-serving nutrition for Chicken Tikka (scale 1.0 ≈ 170 g plated). */
const TIKKA_MAIN: ComponentNutritionCoefficient = {
  kind: "recipe_scale",
  componentId: "main",
  displayName: "Chicken Tikka",
  role: "main",
  baseNutrition: {
    caloriesKcal: 265,
    proteinGrams: 38,
    carbohydrateGrams: 3.5,
    fatGrams: 10.5,
    fiberGrams: 0.2,
  },
  referenceYieldGrams: 170,
  baseServings: 1,
  requiresReferenceYield: true,
};

const BASMATI_RICE: ComponentNutritionCoefficient = {
  kind: "food_grams",
  componentId: "rice",
  displayName: "Basmati Rice",
  role: "carbohydrate",
  nutritionPer100g: {
    caloriesKcal: 130,
    proteinGrams: 2.7,
    carbohydrateGrams: 28.2,
    fatGrams: 0.3,
    fiberGrams: 0.4,
  },
  preferredGrams: 180,
};

/** Kachumber compound — scales as one culinary unit (ingredient ratios fixed upstream). */
const KACHUMBER: ComponentNutritionCoefficient = {
  kind: "recipe_scale",
  componentId: "kachumber",
  displayName: "Kachumber",
  role: "vegetable",
  baseNutrition: {
    caloriesKcal: 28,
    proteinGrams: 1.2,
    carbohydrateGrams: 5.5,
    fatGrams: 0.3,
    fiberGrams: 1.8,
  },
  referenceYieldGrams: 120,
  baseServings: 1,
  requiresReferenceYield: true,
};

const MINT_CHUTNEY: ComponentNutritionCoefficient = {
  kind: "recipe_scale",
  componentId: "chutney",
  displayName: "Mint Yogurt Chutney",
  role: "sauce_condiment",
  baseNutrition: {
    caloriesKcal: 45,
    proteinGrams: 2.8,
    carbohydrateGrams: 3.2,
    fatGrams: 2.4,
    fiberGrams: 0.4,
  },
  referenceYieldGrams: 40,
  baseServings: 1,
  requiresReferenceYield: true,
};

export function chickenTikkaCompleteMealRequest(
  intent: MealNutritionIntent = DEVELOPER_TEST_INTENT_600,
): SolveMealPortionsRequest {
  return {
    mealId: "meal-tikka-complete",
    mealName: "Chicken Tikka Complete Meal",
    sourceCompleteMealId: "complete-tikka",
    components: [TIKKA_MAIN, BASMATI_RICE, KACHUMBER, MINT_CHUTNEY],
    nutritionIntent: intent,
    nutritionSourceVersion: NUTRITION_CALCULATION_POLICY_VERSION,
    generatedAt: "2026-09-17T12:00:00.000Z",
  };
}

const JERK_MAIN: ComponentNutritionCoefficient = {
  kind: "recipe_scale",
  componentId: "main",
  displayName: "Jerk Chicken",
  role: "main",
  baseNutrition: {
    caloriesKcal: 290,
    proteinGrams: 40,
    carbohydrateGrams: 4,
    fatGrams: 12,
    fiberGrams: 0.5,
  },
  referenceYieldGrams: 180,
  baseServings: 1,
};

/** Jamaican Rice & Peas — compound carb, scales as one recipe. */
const RICE_AND_PEAS: ComponentNutritionCoefficient = {
  kind: "recipe_scale",
  componentId: "rice-peas",
  displayName: "Jamaican Rice & Peas",
  role: "carbohydrate",
  baseNutrition: {
    caloriesKcal: 220,
    proteinGrams: 6.5,
    carbohydrateGrams: 38,
    fatGrams: 4.5,
    fiberGrams: 3.2,
  },
  referenceYieldGrams: 180,
  baseServings: 1,
};

const STEAMED_CABBAGE: ComponentNutritionCoefficient = {
  kind: "food_grams",
  componentId: "cabbage",
  displayName: "Steamed Cabbage",
  role: "vegetable",
  nutritionPer100g: {
    caloriesKcal: 23,
    proteinGrams: 1.3,
    carbohydrateGrams: 5.2,
    fatGrams: 0.1,
    fiberGrams: 2.2,
  },
  preferredGrams: 130,
};

export function jamaicanJerkCompleteMealRequest(
  intent: MealNutritionIntent = DEVELOPER_TEST_INTENT_600,
): SolveMealPortionsRequest {
  return {
    mealId: "meal-jerk-complete",
    mealName: "Jamaican Jerk Chicken Complete Meal",
    sourceCompleteMealId: "complete-jerk",
    components: [JERK_MAIN, RICE_AND_PEAS, STEAMED_CABBAGE],
    nutritionIntent: intent,
    nutritionSourceVersion: NUTRITION_CALCULATION_POLICY_VERSION,
    generatedAt: "2026-09-17T12:00:00.000Z",
  };
}

const THAI_CURRY: ComponentNutritionCoefficient = {
  kind: "recipe_scale",
  componentId: "main",
  displayName: "Thai Green Curry with Shrimp",
  role: "main",
  baseNutrition: {
    caloriesKcal: 340,
    proteinGrams: 32,
    carbohydrateGrams: 14,
    fatGrams: 18,
    fiberGrams: 3.5,
  },
  referenceYieldGrams: 320,
  baseServings: 1,
};

const JASMINE_RICE: ComponentNutritionCoefficient = {
  kind: "food_grams",
  componentId: "rice",
  displayName: "Jasmine Rice",
  role: "carbohydrate",
  nutritionPer100g: {
    caloriesKcal: 130,
    proteinGrams: 2.4,
    carbohydrateGrams: 28.5,
    fatGrams: 0.2,
    fiberGrams: 0.3,
  },
  preferredGrams: 170,
};

export function thaiGreenCurryCompleteMealRequest(
  intent: MealNutritionIntent = DEVELOPER_TEST_INTENT_600,
): SolveMealPortionsRequest {
  return {
    mealId: "meal-thai-curry",
    mealName: "Thai Green Curry Complete Meal",
    sourceCompleteMealId: "complete-thai",
    components: [THAI_CURRY, JASMINE_RICE],
    nutritionIntent: intent,
    nutritionSourceVersion: NUTRITION_CALCULATION_POLICY_VERSION,
    generatedAt: "2026-09-17T12:00:00.000Z",
  };
}

const SHRIMP_TACO_MAIN: ComponentNutritionCoefficient = {
  kind: "recipe_scale",
  componentId: "main",
  displayName: "Shrimp Tacos",
  role: "main",
  baseNutrition: {
    caloriesKcal: 160,
    proteinGrams: 24,
    carbohydrateGrams: 2,
    fatGrams: 5.5,
    fiberGrams: 0.2,
  },
  referenceYieldGrams: 120,
  baseServings: 1,
};

const CORN_TORTILLAS: ComponentNutritionCoefficient = {
  kind: "count",
  componentId: "tortillas",
  displayName: "Corn Tortillas",
  role: "carbohydrate",
  nutritionPerUnit: {
    caloriesKcal: 50,
    proteinGrams: 1.2,
    carbohydrateGrams: 10.5,
    fatGrams: 0.6,
    fiberGrams: 1.4,
  },
  preferredCount: 2,
  minCount: 1,
  maxCount: 4,
  quantityStep: 1,
  unitLabel: "piece",
};

const CABBAGE_SLAW: ComponentNutritionCoefficient = {
  kind: "recipe_scale",
  componentId: "slaw",
  displayName: "Cabbage Slaw",
  role: "vegetable",
  baseNutrition: {
    caloriesKcal: 35,
    proteinGrams: 1.1,
    carbohydrateGrams: 6,
    fatGrams: 0.8,
    fiberGrams: 2.1,
  },
  referenceYieldGrams: 100,
  baseServings: 1,
};

const SALSA: ComponentNutritionCoefficient = {
  kind: "recipe_scale",
  componentId: "salsa",
  displayName: "Salsa",
  role: "sauce_condiment",
  baseNutrition: {
    caloriesKcal: 18,
    proteinGrams: 0.7,
    carbohydrateGrams: 3.8,
    fatGrams: 0.1,
    fiberGrams: 1.0,
  },
  referenceYieldGrams: 40,
  baseServings: 1,
};

export function shrimpTacosCompleteMealRequest(
  intent: MealNutritionIntent = DEVELOPER_TEST_INTENT_600,
): SolveMealPortionsRequest {
  return {
    mealId: "meal-shrimp-tacos",
    mealName: "Shrimp Tacos Complete Meal",
    sourceCompleteMealId: "complete-tacos",
    components: [SHRIMP_TACO_MAIN, CORN_TORTILLAS, CABBAGE_SLAW, SALSA],
    nutritionIntent: intent,
    nutritionSourceVersion: NUTRITION_CALCULATION_POLICY_VERSION,
    generatedAt: "2026-09-17T12:00:00.000Z",
  };
}

/** Lookup trusted fixture requests by culinary candidate id for consumer-plan wiring. */
export function plan010FixtureRequestForCandidate(
  candidateId: string,
  intent: MealNutritionIntent,
): SolveMealPortionsRequest | null {
  switch (candidateId) {
    case "tikka-chicken":
      return { ...chickenTikkaCompleteMealRequest(intent), mealId: `meal-${candidateId}` };
    case "jamaican-jerk-chicken":
      return { ...jamaicanJerkCompleteMealRequest(intent), mealId: `meal-${candidateId}` };
    case "thai-green-curry":
      return { ...thaiGreenCurryCompleteMealRequest(intent), mealId: `meal-${candidateId}` };
    case "chile-lime-shrimp-tacos":
    case "tacos-intrinsic":
      return { ...shrimpTacosCompleteMealRequest(intent), mealId: `meal-${candidateId}` };
    default:
      return null;
  }
}

export const PLAN010_FIXTURE_CANDIDATE_IDS = [
  "tikka-chicken",
  "jamaican-jerk-chicken",
  "thai-green-curry",
  "chile-lime-shrimp-tacos",
] as const;
