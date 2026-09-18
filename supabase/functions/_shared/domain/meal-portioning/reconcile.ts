import type {
  DailyNutritionBudget,
  IngredientNutrition,
  MealNutritionIntent,
  PersonalizedMealNutrition,
  PersonalizedMealPlan,
  PersonalizedMealPortion,
  PortionVariable,
} from "../../contracts/index.ts";
import { solveMealPortions } from "./solver.ts";
import { buildPortionVariables } from "./build-variables.ts";
import { getMealPortionPolicy } from "./policy.ts";
import {
  roundMealNutritionForAuthority,
  sumIngredientNutrition,
  toPersonalizedMealNutrition,
} from "./nutrition.ts";
import type { SolveMealPortionsRequest } from "../../contracts/index.ts";

export type MealSolveBundle = {
  mealInstanceId: string;
  mealType: "lunch" | "dinner";
  request: SolveMealPortionsRequest;
  plan: PersonalizedMealPlan;
  variables: PortionVariable[];
};

function plannedPlusReserved(
  lunch: PersonalizedMealNutrition | undefined,
  dinner: PersonalizedMealNutrition | undefined,
  reserved: DailyNutritionBudget["reservedNutrition"],
): PersonalizedMealNutrition {
  const parts: IngredientNutrition[] = [];
  if (lunch) {
    parts.push({
      caloriesKcal: lunch.caloriesKcal,
      proteinGrams: lunch.proteinGrams,
      carbohydrateGrams: lunch.carbsGrams,
      fatGrams: lunch.fatGrams,
      fiberGrams: lunch.fiberGrams,
    });
  }
  if (dinner) {
    parts.push({
      caloriesKcal: dinner.caloriesKcal,
      proteinGrams: dinner.proteinGrams,
      carbohydrateGrams: dinner.carbsGrams,
      fatGrams: dinner.fatGrams,
      fiberGrams: dinner.fiberGrams,
    });
  }
  parts.push({
    caloriesKcal: reserved.caloriesKcal,
    proteinGrams: reserved.proteinGrams,
    carbohydrateGrams: reserved.carbsGrams ?? 0,
    fatGrams: reserved.fatGrams ?? 0,
    fiberGrams: reserved.fiberGrams,
  });
  return toPersonalizedMealNutrition(sumIngredientNutrition(parts));
}

function calorieError(
  projected: PersonalizedMealNutrition,
  target: DailyNutritionBudget["target"],
): number {
  return Math.abs(projected.caloriesKcal - target.caloriesKcal);
}

function adjustIntent(
  base: MealNutritionIntent,
  calorieDelta: number,
  proteinDelta: number,
): MealNutritionIntent {
  const next: MealNutritionIntent = {
    ...base,
    targetCaloriesKcal: Math.max(150, base.targetCaloriesKcal + calorieDelta),
  };
  if (base.targetProteinGrams != null) {
    next.targetProteinGrams = Math.max(10, base.targetProteinGrams + proteinDelta);
  }
  return next;
}

/**
 * After initial meal solves, evaluate the day and optionally re-solve lunch/dinner
 * with adjusted intents to improve daily alignment — without changing meal identity.
 */
export function reconcileDailyMealPortions(input: {
  budget: DailyNutritionBudget;
  lunch: MealSolveBundle | null;
  dinner: MealSolveBundle | null;
}): {
  lunch: MealSolveBundle | null;
  dinner: MealSolveBundle | null;
  projectedDailyNutrition: PersonalizedMealNutrition;
  plannedNutrition: PersonalizedMealNutrition;
  status: PersonalizedMealPlan["status"];
  rebalanced: boolean;
} {
  const policy = getMealPortionPolicy();
  let lunch = input.lunch;
  let dinner = input.dinner;
  let rebalanced = false;

  const evaluate = () => {
    const planned = plannedPlusReserved(
      lunch?.plan.status !== "blocked" ? lunch?.plan.nutrition : undefined,
      dinner?.plan.status !== "blocked" ? dinner?.plan.nutrition : undefined,
      {
        caloriesKcal: 0,
        proteinGrams: 0,
        carbsGrams: 0,
        fatGrams: 0,
        fiberGrams: 0,
      },
    );
    const projected = plannedPlusReserved(
      lunch?.plan.status !== "blocked" ? lunch?.plan.nutrition : undefined,
      dinner?.plan.status !== "blocked" ? dinner?.plan.nutrition : undefined,
      input.budget.reservedNutrition,
    );
    return { planned, projected };
  };

  let { planned, projected } = evaluate();
  const initialError = calorieError(projected, input.budget.target);
  const tolerance = input.budget.target.caloriesKcal * policy.solvedCalorieToleranceFraction;

  if (
    initialError > tolerance &&
    lunch?.plan.status !== "blocked" &&
    dinner?.plan.status !== "blocked" &&
    lunch &&
    dinner
  ) {
    const calorieGap = input.budget.target.caloriesKcal - projected.caloriesKcal;
    const proteinGap =
      input.budget.target.proteinGrams -
      (projected.proteinGrams ?? 0);
    // Split adjustment across lunch/dinner; carbs are the flexible lever via intents.
    const lunchDelta = Math.round(calorieGap * 0.45);
    const dinnerDelta = Math.round(calorieGap * 0.55);
    const lunchProteinDelta = Math.round(proteinGap * 0.5);
    const dinnerProteinDelta = Math.round(proteinGap * 0.5);

    const lunchIntent = adjustIntent(lunch.request.nutritionIntent, lunchDelta, lunchProteinDelta);
    const dinnerIntent = adjustIntent(
      dinner.request.nutritionIntent,
      dinnerDelta,
      dinnerProteinDelta,
    );

    const lunchRetry = solveMealPortions({
      ...lunch.request,
      nutritionIntent: lunchIntent,
    });
    const dinnerRetry = solveMealPortions({
      ...dinner.request,
      nutritionIntent: dinnerIntent,
    });

    if (lunchRetry.status !== "blocked" && dinnerRetry.status !== "blocked") {
      const candidateLunch: MealSolveBundle = {
        ...lunch,
        request: { ...lunch.request, nutritionIntent: lunchIntent },
        plan: lunchRetry,
      };
      const candidateDinner: MealSolveBundle = {
        ...dinner,
        request: { ...dinner.request, nutritionIntent: dinnerIntent },
        plan: dinnerRetry,
      };
      const candidateProjected = plannedPlusReserved(
        candidateLunch.plan.nutrition,
        candidateDinner.plan.nutrition,
        input.budget.reservedNutrition,
      );
      if (calorieError(candidateProjected, input.budget.target) < initialError) {
        lunch = candidateLunch;
        dinner = candidateDinner;
        rebalanced = true;
        ({ planned, projected } = evaluate());
      }
    }
  }

  const mealStatuses = [lunch?.plan.status, dinner?.plan.status].filter(Boolean);
  let status: PersonalizedMealPlan["status"] = "solved";
  if (mealStatuses.includes("blocked")) status = "blocked";
  else if (mealStatuses.includes("best_feasible")) status = "best_feasible";
  else {
    const finalError = calorieError(projected, input.budget.target);
    if (finalError > tolerance) status = "best_feasible";
  }

  return {
    lunch,
    dinner,
    projectedDailyNutrition: roundMealNutritionForAuthority(
      {
        caloriesKcal: projected.caloriesKcal,
        proteinGrams: projected.proteinGrams,
        carbohydrateGrams: projected.carbsGrams,
        fatGrams: projected.fatGrams,
        fiberGrams: projected.fiberGrams,
      },
    ),
    plannedNutrition: roundMealNutritionForAuthority({
      caloriesKcal: planned.caloriesKcal,
      proteinGrams: planned.proteinGrams,
      carbohydrateGrams: planned.carbsGrams,
      fatGrams: planned.fatGrams,
      fiberGrams: planned.fiberGrams,
    }),
    status,
    rebalanced,
  };
}

export function buildVariablesForRequest(
  request: SolveMealPortionsRequest,
): PortionVariable[] {
  const built = buildPortionVariables(request.components, getMealPortionPolicy());
  return built.ok ? built.variables : [];
}

export function portionsPreserveIdentity(
  before: readonly PersonalizedMealPortion[],
  after: readonly PersonalizedMealPortion[],
): boolean {
  if (before.length !== after.length) return false;
  const beforeIds = new Set(before.map((p) => p.componentId));
  return after.every((p) => beforeIds.has(p.componentId));
}
