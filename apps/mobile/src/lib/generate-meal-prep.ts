import type {
  ConsumerWeeklyPlan,
  CookingPreferences,
  MealPrepIssue,
  MealPrepPlan,
} from "@fitness-autopilot/contracts";
import { buildMealPrepPlan } from "@fitness-autopilot/domain";

export type GenerateMealPrepForPlanResult =
  | { ok: true; mealPrepPlan: MealPrepPlan; issues: MealPrepIssue[] }
  | {
      ok: false;
      code: MealPrepIssue["code"] | "MISSING_WEEKLY_PLAN" | "MISSING_RECIPES" | "MISSING_PERSONALIZED_PLAN";
      message: string;
      issues: MealPrepIssue[];
      mealPrepPlan?: MealPrepPlan;
    };

/**
 * Build a PLAN-013 meal-prep plan from an already-finalized consumer weekly plan.
 * Does not mutate nutrition or grocery demand.
 */
export function generateMealPrepForWeeklyPlan(input: {
  weeklyPlan: ConsumerWeeklyPlan;
  cookingPreferences?: CookingPreferences | null;
  generatedAt?: string;
}): GenerateMealPrepForPlanResult {
  const plan = input.weeklyPlan;
  if (plan.status !== "ready") {
    return {
      ok: false,
      code: "MISSING_WEEKLY_PLAN",
      message: "Generate your week before building a meal prep plan.",
      issues: [],
    };
  }
  if (!plan.personalizedWeeklyPlan?.finalization) {
    return {
      ok: false,
      code: "MISSING_PERSONALIZED_PLAN",
      message: "This week is missing a finalized nutrition prescription.",
      issues: [],
    };
  }
  if (!plan.recipesByCandidateId || Object.keys(plan.recipesByCandidateId).length === 0) {
    return {
      ok: false,
      code: "MISSING_RECIPES",
      message: "This week is missing resolved recipes needed for meal prep.",
      issues: [],
    };
  }

  const result = buildMealPrepPlan({
    personalizedWeeklyPlan: plan.personalizedWeeklyPlan,
    recipesByCandidateId: plan.recipesByCandidateId,
    coreRepertoire: plan.coreRepertoire,
    groceryList: plan.groceryList,
    cookingPreferences: input.cookingPreferences,
    prepSessionDay: plan.flexibleDay ?? plan.coreRepertoire?.flexibleDay ?? "sunday",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      issues: result.issues,
      mealPrepPlan: result.mealPrepPlan,
    };
  }

  return {
    ok: true,
    mealPrepPlan: result.mealPrepPlan,
    issues: result.issues,
  };
}
