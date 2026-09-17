import type {
  ComponentScalingPolicy,
  MealComponentRole,
  MealPortionPolicy,
} from "@fitness-autopilot/contracts";
import { MEAL_PORTION_POLICY_VERSION } from "@fitness-autopilot/contracts";

/**
 * Versioned culinary scaling + nutrition objective for PLAN-010.
 * Do not scatter magic bounds across solver functions.
 */

const ROLE_POLICIES: ComponentScalingPolicy[] = [
  {
    role: "main",
    flexibility: "moderate",
    nutritionalPriority: "high",
    deviationPenalty: 2.4,
    preferredScale: 1,
    minScale: 0.7,
    maxScale: 1.35,
    preferredGrams: 170,
    minGrams: 120,
    maxGrams: 230,
  },
  {
    role: "carbohydrate",
    flexibility: "wide",
    nutritionalPriority: "high",
    deviationPenalty: 0.9,
    preferredScale: 1,
    minScale: 0.45,
    maxScale: 1.75,
    preferredGrams: 180,
    minGrams: 80,
    maxGrams: 320,
  },
  {
    role: "vegetable",
    flexibility: "moderate",
    nutritionalPriority: "medium",
    deviationPenalty: 1.4,
    preferredScale: 1,
    minScale: 0.65,
    maxScale: 1.45,
    preferredGrams: 120,
    minGrams: 70,
    maxGrams: 200,
  },
  {
    role: "fruit",
    flexibility: "moderate",
    nutritionalPriority: "medium",
    deviationPenalty: 1.3,
    preferredScale: 1,
    minScale: 0.6,
    maxScale: 1.4,
    preferredGrams: 100,
    minGrams: 60,
    maxGrams: 160,
  },
  {
    role: "legume",
    flexibility: "moderate",
    nutritionalPriority: "high",
    deviationPenalty: 1.5,
    preferredScale: 1,
    minScale: 0.6,
    maxScale: 1.5,
    preferredGrams: 140,
    minGrams: 80,
    maxGrams: 220,
  },
  {
    role: "sauce_condiment",
    flexibility: "tight",
    nutritionalPriority: "low",
    deviationPenalty: 3.5,
    preferredScale: 1,
    minScale: 0.75,
    maxScale: 1.25,
    preferredGrams: 40,
    minGrams: 25,
    maxGrams: 55,
  },
  {
    role: "fat",
    flexibility: "tight",
    nutritionalPriority: "medium",
    deviationPenalty: 3.2,
    preferredScale: 1,
    minScale: 0.7,
    maxScale: 1.2,
    preferredGrams: 12,
    minGrams: 8,
    maxGrams: 18,
  },
  {
    role: "garnish",
    flexibility: "fixed",
    nutritionalPriority: "low",
    deviationPenalty: 5,
    preferredScale: 1,
    minScale: 1,
    maxScale: 1,
    preferredGrams: 8,
    minGrams: 8,
    maxGrams: 8,
  },
];

/** Default discrete count bounds (tortillas, eggs, etc.). */
export const DEFAULT_COUNT_BOUNDS = {
  preferredCount: 2,
  minCount: 1,
  maxCount: 4,
  quantityStep: 1,
} as const;

export const MEAL_PORTION_POLICY_V1: MealPortionPolicy = {
  version: MEAL_PORTION_POLICY_VERSION,
  rolePolicies: ROLE_POLICIES,
  objectiveWeights: {
    calories: 4.0,
    protein: 3.2,
    carbs: 1.1,
    fat: 1.0,
    fiber: 0.8,
    culinary: 2.6,
  },
  solvedCalorieToleranceFraction: 0.08,
  solvedProteinUndershootFraction: 0.12,
  hardCalorieOvershootFraction: 0.55,
};

export function getRoleScalingPolicy(
  role: MealComponentRole,
  policy: MealPortionPolicy = MEAL_PORTION_POLICY_V1,
): ComponentScalingPolicy {
  const found = policy.rolePolicies.find((p) => p.role === role);
  if (!found) {
    // Conservative fallback — treat unknown roles as garnish-like.
    return {
      role,
      flexibility: "tight",
      nutritionalPriority: "low",
      deviationPenalty: 4,
      preferredScale: 1,
      minScale: 0.9,
      maxScale: 1.1,
      preferredGrams: 40,
      minGrams: 30,
      maxGrams: 50,
    };
  }
  return found;
}

export function getMealPortionPolicy(
  version: string = MEAL_PORTION_POLICY_VERSION,
): MealPortionPolicy {
  if (version !== MEAL_PORTION_POLICY_VERSION) {
    throw new Error(`Unknown meal portion policy version: ${version}`);
  }
  return MEAL_PORTION_POLICY_V1;
}
