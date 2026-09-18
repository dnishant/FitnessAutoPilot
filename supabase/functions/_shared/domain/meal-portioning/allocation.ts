import type {
  DailyNutritionBudget,
  MealNutritionIntent,
  NutritionAllocationPolicy,
  NutritionBudget,
  NutritionTarget,
} from "../../contracts/index.ts";
import { NUTRITION_ALLOCATION_POLICY_VERSION } from "../../contracts/index.ts";

/**
 * nutrition-allocation-policy-v1
 *
 * Culinary intelligence currently plans lunch + dinner only.
 * Do NOT assign 100% of the daily target to those two meals.
 *
 * Assumptions (MVP, replaceable when breakfast/snack planning exists):
 * - Profile/preferences do not yet encode breakfast/snack structure.
 * - Reserve 35% of daily calories/macros for breakfast + snacks / unplanned meals.
 * - Of the remaining 65% planned budget: lunch 54% (~35% of daily), dinner 46% (~30% of daily).
 * - Intents are starting budgets — daily reconciliation may adjust within culinary bounds.
 */

export const NUTRITION_ALLOCATION_POLICY_V1: NutritionAllocationPolicy = {
  version: NUTRITION_ALLOCATION_POLICY_VERSION,
  reservedBreakfastSnackShare: 0.35,
  lunchShareOfPlanned: 0.54,
  dinnerShareOfPlanned: 0.46,
  assumptions: [
    "Lunch and dinner are the only meals currently planned by culinary intelligence.",
    "35% of daily nutrition is reserved for breakfast, snacks, and unplanned eating.",
    "No authoritative breakfast/snack preference structure exists on the profile yet.",
    "Meal intents are starting budgets, not immutable per-meal laws.",
  ],
};

export function getNutritionAllocationPolicy(
  version: string = NUTRITION_ALLOCATION_POLICY_VERSION,
): NutritionAllocationPolicy {
  if (version !== NUTRITION_ALLOCATION_POLICY_VERSION) {
    throw new Error(`Unknown nutrition allocation policy version: ${version}`);
  }
  return NUTRITION_ALLOCATION_POLICY_V1;
}

function scaleBudget(target: NutritionBudget, share: number): NutritionBudget {
  const out: NutritionBudget = {
    caloriesKcal: Math.round(target.caloriesKcal * share),
    proteinGrams: Math.round(target.proteinGrams * share),
  };
  if (target.carbsGrams != null) out.carbsGrams = Math.round(target.carbsGrams * share);
  if (target.fatGrams != null) out.fatGrams = Math.round(target.fatGrams * share);
  if (target.fiberGrams != null) out.fiberGrams = Math.round(target.fiberGrams * share);
  return out;
}

export function nutritionBudgetFromTarget(target: NutritionTarget): NutritionBudget {
  const budget: NutritionBudget = {
    caloriesKcal: target.targetCalories,
    proteinGrams: target.proteinG,
    carbsGrams: target.carbohydrateG,
    fatGrams: target.fatG ?? target.fatMinG,
  };
  if (target.fiberG != null) budget.fiberGrams = target.fiberG;
  return budget;
}

function intentFromBudget(
  budget: NutritionBudget,
  mealType: "lunch" | "dinner",
  policyVersion: typeof NUTRITION_ALLOCATION_POLICY_VERSION,
): MealNutritionIntent {
  const intent: MealNutritionIntent = {
    targetCaloriesKcal: Math.max(1, budget.caloriesKcal),
    targetProteinGrams: budget.proteinGrams,
    label: `${mealType} intent from ${policyVersion}`,
  };
  if (budget.carbsGrams != null) intent.targetCarbsGrams = budget.carbsGrams;
  if (budget.fatGrams != null) intent.targetFatGrams = budget.fatGrams;
  if (budget.fiberGrams != null) intent.targetFiberGrams = budget.fiberGrams;
  return intent;
}

/**
 * Allocate daily nutrition into reserved breakfast/snack capacity + lunch/dinner intents.
 */
export function allocateDailyNutritionBudget(
  dailyTarget: NutritionBudget | NutritionTarget,
  policy: NutritionAllocationPolicy = NUTRITION_ALLOCATION_POLICY_V1,
): DailyNutritionBudget {
  const target: NutritionBudget =
    "targetCalories" in dailyTarget
      ? nutritionBudgetFromTarget(dailyTarget)
      : dailyTarget;

  const plannedShare = 1 - policy.reservedBreakfastSnackShare;
  if (
    Math.abs(policy.lunchShareOfPlanned + policy.dinnerShareOfPlanned - 1) > 0.001
  ) {
    throw new Error("lunchShareOfPlanned + dinnerShareOfPlanned must equal 1");
  }

  const reservedNutrition = scaleBudget(target, policy.reservedBreakfastSnackShare);
  const planned = scaleBudget(target, plannedShare);
  const lunchBudget = scaleBudget(planned, policy.lunchShareOfPlanned);
  const dinnerBudget = scaleBudget(planned, policy.dinnerShareOfPlanned);

  return {
    target,
    reservedNutrition,
    lunchIntent: intentFromBudget(lunchBudget, "lunch", policy.version),
    dinnerIntent: intentFromBudget(dinnerBudget, "dinner", policy.version),
    allocationPolicyVersion: policy.version,
  };
}
