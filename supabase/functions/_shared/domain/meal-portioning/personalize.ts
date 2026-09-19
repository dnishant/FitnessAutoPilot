import type {
  CompleteMeal,
  DayOfWeek,
  IngredientNutrition,
  MealNutritionIntent,
  NutritionBudget,
  NutritionTarget,
  PersonalizedDailyNutritionPlan,
  PersonalizedMealPlan,
  PersonalizedWeeklyMealInstance,
  PersonalizedWeeklyNutritionPlan,
  PortionSolverBlockReason,
  RankedWeeklyStrategy,
  RecipeNutritionResult,
  ResolvedRecipe,
  SolveMealPortionsRequest,
} from "../../contracts/index.ts";
import {
  MEAL_PORTION_POLICY_VERSION,
  NUTRITION_ALLOCATION_POLICY_VERSION,
  WEEKLY_PERSONALIZATION_VERSION,
} from "../../contracts/index.ts";
import {
  allocateDailyNutritionBudget,
  getNutritionAllocationPolicy,
  nutritionBudgetFromTarget,
} from "./allocation.ts";
import { buildCoefficientsFromCompleteMeal } from "./coefficients.ts";
import {
  buildVariablesForRequest,
  reconcileDailyMealPortions,
  type MealSolveBundle,
} from "./reconcile.ts";
import { blockedPlan, solveMealPortions } from "./solver.ts";
import { portionCacheKey } from "./weekly.ts";

export type PersonalizeWeeklyNutritionPlanInput = {
  generatedPlanId: string;
  weekStart: string;
  weekEnd: string;
  strategy: RankedWeeklyStrategy;
  /** Complete meals keyed by candidateId (selected week only). */
  completeMealsByCandidateId: Record<string, CompleteMeal>;
  recipesByCandidateId?: Record<string, ResolvedRecipe>;
  nutritionByCandidateId?: Record<string, RecipeNutritionResult>;
  componentNutritionByKey?: Record<
    string,
    { nutrition: IngredientNutrition; referenceYieldGrams?: number; baseServings?: number }
  >;
  dailyTarget: NutritionTarget | NutritionBudget;
  nutritionTargetId?: string;
  nutritionTargetAlgorithmVersion?: string;
  generatedAt?: string;
  /**
   * PLAN-011 declarative repair hints — scales lunch/dinner intents before solving.
   * PLAN-010 still owns portion mutation; PLAN-011 only supplies diagnosed deltas.
   */
  repairDayOverrides?: Partial<
    Record<
      DayOfWeek,
      {
        /** Multiplier applied to lunch+dinner calorie intents (e.g. 1.12 to close a 12% gap). */
        mealCalorieScale?: number;
        /** Multiplier applied to lunch+dinner protein intents. */
        mealProteinScale?: number;
      }
    >
  >;
};

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function mealInstanceId(
  generatedPlanId: string,
  day: DayOfWeek,
  mealType: "lunch" | "dinner",
): string {
  return `${generatedPlanId}:${day}:${mealType}`;
}

function makeBlockedBundle(input: {
  mealInstanceId: string;
  mealType: "lunch" | "dinner";
  mealName: string;
  completeMealId?: string;
  intent: MealNutritionIntent;
  reason: PortionSolverBlockReason;
  message: string;
  generatedAt: string;
}): MealSolveBundle {
  const request: SolveMealPortionsRequest = {
    mealId: input.mealInstanceId,
    mealName: input.mealName,
    sourceCompleteMealId: input.completeMealId,
    components: [
      {
        kind: "fixed",
        componentId: "unavailable",
        displayName: input.mealName,
        role: "main",
        amount: 1,
        unit: "serving",
        nutrition: {
          caloriesKcal: 0,
          proteinGrams: 0,
          carbohydrateGrams: 0,
          fatGrams: 0,
        },
      },
    ],
    nutritionIntent: input.intent,
    generatedAt: input.generatedAt,
  };
  return {
    mealInstanceId: input.mealInstanceId,
    mealType: input.mealType,
    request,
    variables: [],
    plan: blockedPlan(request, input.reason, input.message),
  };
}

function solveBundle(input: {
  mealInstanceId: string;
  mealType: "lunch" | "dinner";
  mealName: string;
  completeMeal: CompleteMeal;
  intent: MealNutritionIntent;
  nutritionByCandidateId?: Record<string, RecipeNutritionResult>;
  recipesByCandidateId?: Record<string, ResolvedRecipe>;
  componentNutritionByKey?: PersonalizeWeeklyNutritionPlanInput["componentNutritionByKey"];
  generatedAt: string;
  cache: Map<string, MealSolveBundle>;
}): MealSolveBundle {
  const coefficients = buildCoefficientsFromCompleteMeal({
    meal: input.completeMeal,
    nutritionByCandidateId: input.nutritionByCandidateId,
    recipesByCandidateId: input.recipesByCandidateId,
    componentNutritionByKey: input.componentNutritionByKey,
  });

  if (!coefficients.ok) {
    const reason: PortionSolverBlockReason =
      coefficients.error.code === "missing_reference_yield"
        ? "missing_reference_yield"
        : coefficients.error.code === "missing_canonical_nutrition"
          ? "missing_canonical_nutrition"
          : "unquantifiable_component";
    return makeBlockedBundle({
      mealInstanceId: input.mealInstanceId,
      mealType: input.mealType,
      mealName: input.mealName,
      completeMealId: input.completeMeal.mealId,
      intent: input.intent,
      reason,
      message: coefficients.error.message,
      generatedAt: input.generatedAt,
    });
  }

  const request: SolveMealPortionsRequest = {
    mealId: input.mealInstanceId,
    mealName: input.mealName,
    sourceCompleteMealId: input.completeMeal.mealId,
    components: coefficients.components,
    nutritionIntent: input.intent,
    nutritionSourceVersion: "nutrition-calculation-v1",
    generatedAt: input.generatedAt,
  };

  const culinaryKey =
    input.completeMeal.mealId ||
    coefficients.components.map((c) => `${c.componentId}:${c.kind}:${c.role}`).join("|");
  const cacheKey = portionCacheKey(
    culinaryKey,
    input.intent,
    coefficients.components.map((c) => c.componentId),
  );
  const cached = input.cache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      mealInstanceId: input.mealInstanceId,
      mealType: input.mealType,
      plan: {
        ...cached.plan,
        mealId: input.mealInstanceId,
        mealName: input.mealName,
        generatedAt: input.generatedAt,
      },
      request: { ...cached.request, mealId: input.mealInstanceId, mealName: input.mealName },
    };
  }

  const plan = solveMealPortions(request);
  const bundle: MealSolveBundle = {
    mealInstanceId: input.mealInstanceId,
    mealType: input.mealType,
    request,
    plan,
    variables: buildVariablesForRequest(request),
  };
  input.cache.set(cacheKey, bundle);
  return bundle;
}

function instanceFromBundle(
  day: DayOfWeek,
  candidateId: string,
  completeMealId: string | undefined,
  bundle: MealSolveBundle,
): PersonalizedWeeklyMealInstance {
  return {
    mealInstanceId: bundle.mealInstanceId,
    day,
    mealType: bundle.mealType,
    candidateId,
    completeMealId,
    mealName: bundle.request.mealName ?? bundle.plan.mealName ?? candidateId,
    nutritionIntent: bundle.request.nutritionIntent,
    personalizedPlan: bundle.plan.status === "blocked" ? undefined : bundle.plan,
    status: bundle.plan.status,
    blockReason: bundle.plan.diagnostics.blockReason,
    message: bundle.plan.diagnostics.message,
  };
}

/**
 * Plan-level PLAN-010 orchestration:
 * allocate → portion each selected meal instance → reconcile each day → validate week.
 */
export function personalizeWeeklyNutritionPlan(
  input: PersonalizeWeeklyNutritionPlanInput,
): PersonalizedWeeklyNutritionPlan {
  const started = nowMs();
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const allocationPolicy = getNutritionAllocationPolicy();
  const dailyTarget =
    "targetCalories" in input.dailyTarget
      ? nutritionBudgetFromTarget(input.dailyTarget)
      : input.dailyTarget;
  const budget = allocateDailyNutritionBudget(dailyTarget, allocationPolicy);
  const cache = new Map<string, MealSolveBundle>();

  const days: PersonalizedDailyNutritionPlan[] = [];
  let solvedMealCount = 0;
  let bestFeasibleMealCount = 0;
  let blockedMealCount = 0;
  let mealInstanceCount = 0;
  let solveTimeTotal = 0;
  let solveCount = 0;

  for (const dayPlan of input.strategy.days) {
    const day = dayPlan.day;
    const repair = input.repairDayOverrides?.[day];
    const scaleCalories = repair?.mealCalorieScale ?? 1;
    const scaleProtein = repair?.mealProteinScale ?? 1;
    const applyRepair = scaleCalories !== 1 || scaleProtein !== 1;
    const lunchIntent: MealNutritionIntent = applyRepair
      ? {
          ...budget.lunchIntent,
          targetCaloriesKcal: Math.max(
            150,
            Math.round(budget.lunchIntent.targetCaloriesKcal * scaleCalories),
          ),
          targetProteinGrams:
            budget.lunchIntent.targetProteinGrams != null
              ? Math.max(
                  10,
                  Math.round(budget.lunchIntent.targetProteinGrams * scaleProtein),
                )
              : undefined,
        }
      : budget.lunchIntent;
    const dinnerIntent: MealNutritionIntent = applyRepair
      ? {
          ...budget.dinnerIntent,
          targetCaloriesKcal: Math.max(
            150,
            Math.round(budget.dinnerIntent.targetCaloriesKcal * scaleCalories),
          ),
          targetProteinGrams:
            budget.dinnerIntent.targetProteinGrams != null
              ? Math.max(
                  10,
                  Math.round(budget.dinnerIntent.targetProteinGrams * scaleProtein),
                )
              : undefined,
        }
      : budget.dinnerIntent;
    const slots: Array<{
      slot: typeof dayPlan.lunch;
      mealType: "lunch" | "dinner";
      intent: MealNutritionIntent;
    }> = [
      { slot: dayPlan.lunch, mealType: "lunch", intent: lunchIntent },
      { slot: dayPlan.dinner, mealType: "dinner", intent: dinnerIntent },
    ];

    const bundles: { lunch: MealSolveBundle | null; dinner: MealSolveBundle | null } = {
      lunch: null,
      dinner: null,
    };

    for (const { slot, mealType, intent } of slots) {
      mealInstanceCount += 1;
      const completeMeal = input.completeMealsByCandidateId[slot.candidateId];
      const instanceId = mealInstanceId(input.generatedPlanId, day, mealType);
      if (!completeMeal) {
        bundles[mealType] = makeBlockedBundle({
          mealInstanceId: instanceId,
          mealType,
          mealName: slot.name,
          intent,
          reason: "unquantifiable_component",
          message: `No CompleteMeal for candidate ${slot.candidateId} in generated plan ${input.generatedPlanId}.`,
          generatedAt,
        });
        continue;
      }

      const solveStarted = nowMs();
      bundles[mealType] = solveBundle({
        mealInstanceId: instanceId,
        mealType,
        mealName: slot.name,
        completeMeal,
        intent,
        nutritionByCandidateId: input.nutritionByCandidateId,
        recipesByCandidateId: input.recipesByCandidateId,
        componentNutritionByKey: input.componentNutritionByKey,
        generatedAt,
        cache,
      });
      solveTimeTotal += nowMs() - solveStarted;
      solveCount += 1;
    }

    const reconciled = reconcileDailyMealPortions({
      budget,
      lunch: bundles.lunch,
      dinner: bundles.dinner,
    });

    const mealInstances: PersonalizedWeeklyMealInstance[] = [];
    for (const mealType of ["lunch", "dinner"] as const) {
      const bundle = reconciled[mealType];
      const slot = mealType === "lunch" ? dayPlan.lunch : dayPlan.dinner;
      if (!bundle) continue;
      const completeMeal = input.completeMealsByCandidateId[slot.candidateId];
      const instance = instanceFromBundle(
        day,
        slot.candidateId,
        completeMeal?.mealId,
        bundle,
      );
      mealInstances.push(instance);
      if (instance.status === "solved") solvedMealCount += 1;
      else if (instance.status === "best_feasible") bestFeasibleMealCount += 1;
      else blockedMealCount += 1;
    }

    days.push({
      day,
      budget,
      meals: mealInstances,
      plannedNutrition: reconciled.plannedNutrition,
      reservedNutrition: budget.reservedNutrition,
      projectedDailyNutrition: reconciled.projectedDailyNutrition,
      status: reconciled.status,
      message: reconciled.rebalanced
        ? "Daily portions rebalanced within culinary bounds."
        : undefined,
    });
  }

  const expectedSlots = input.strategy.days.length * 2;
  let weekStatus: PersonalizedMealPlan["status"] = "solved";
  if (mealInstanceCount !== expectedSlots || blockedMealCount === mealInstanceCount) {
    weekStatus = "blocked";
  } else if (blockedMealCount > 0 || bestFeasibleMealCount > 0) {
    weekStatus = "best_feasible";
  }
  if (blockedMealCount === 0 && bestFeasibleMealCount === 0) weekStatus = "solved";

  const allowed = new Set(input.strategy.uniqueCandidateIds);
  for (const day of days) {
    for (const meal of day.meals) {
      if (!allowed.has(meal.candidateId)) {
        weekStatus = "blocked";
        meal.status = "blocked";
        meal.message = "Meal candidate is not part of the generated weekly strategy.";
        meal.personalizedPlan = undefined;
      }
    }
  }

  return {
    generatedPlanId: input.generatedPlanId,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    dailyTarget,
    allocationPolicyVersion: NUTRITION_ALLOCATION_POLICY_VERSION,
    portionPolicyVersion: MEAL_PORTION_POLICY_VERSION,
    personalizationVersion: WEEKLY_PERSONALIZATION_VERSION,
    nutritionTargetId: input.nutritionTargetId,
    nutritionTargetAlgorithmVersion: input.nutritionTargetAlgorithmVersion,
    days,
    status: weekStatus,
    mealInstanceCount,
    solvedMealCount,
    bestFeasibleMealCount,
    blockedMealCount,
    averageMealSolveTimeMs: solveCount > 0 ? solveTimeTotal / solveCount : undefined,
    totalPersonalizationTimeMs: nowMs() - started,
    generatedAt,
  };
}
