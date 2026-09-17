import type {
  MealNutritionIntent,
  PersonalizedMealPlan,
  SolveMealPortionsRequest,
} from "@fitness-autopilot/contracts";
import { solveMealPortions } from "./solver";

/**
 * Solve unique meal instances for a generated week with intent-aware deduplication.
 *
 * Same culinary identity + same intent → reuse solved result.
 * Same culinary identity + different intent → solve separately.
 * Do not assume same recipe name alone = same portion.
 */
export function solveWeeklyMealPortions(input: {
  requests: readonly SolveMealPortionsRequest[];
}): {
  plans: PersonalizedMealPlan[];
  plansByMealId: Record<string, PersonalizedMealPlan>;
  cacheHits: number;
  solves: number;
} {
  const cache = new Map<string, PersonalizedMealPlan>();
  const plans: PersonalizedMealPlan[] = [];
  const plansByMealId: Record<string, PersonalizedMealPlan> = {};
  let cacheHits = 0;
  let solves = 0;

  for (const request of input.requests) {
    const culinaryKey =
      request.sourceCompleteMealId ??
      request.components.map((c) => `${c.componentId}:${c.kind}:${c.role}`).join("|");
    const key = portionCacheKey(
      culinaryKey,
      request.nutritionIntent,
      request.components.map((c) => c.componentId),
    );
    const cached = cache.get(key);
    if (cached) {
      cacheHits += 1;
      const reused: PersonalizedMealPlan = {
        ...cached,
        mealId: request.mealId,
        mealName: request.mealName ?? cached.mealName,
        generatedAt: request.generatedAt ?? cached.generatedAt,
      };
      plans.push(reused);
      plansByMealId[request.mealId] = reused;
      continue;
    }
    const plan = solveMealPortions(request);
    solves += 1;
    cache.set(key, plan);
    plans.push(plan);
    plansByMealId[request.mealId] = plan;
  }

  return { plans, plansByMealId, cacheHits, solves };
}

export function portionCacheKey(
  mealIdentity: string,
  intent: MealNutritionIntent,
  componentIds: readonly string[],
): string {
  return JSON.stringify({
    mealIdentity,
    calories: intent.targetCaloriesKcal,
    protein: intent.targetProteinGrams ?? null,
    carbs: intent.targetCarbsGrams ?? null,
    fat: intent.targetFatGrams ?? null,
    fiber: intent.targetFiberGrams ?? null,
    priorities: intent.priorities ?? null,
    components: componentIds,
  });
}

/**
 * Developer/test meal intent derived from daily targets using fixed share fractions.
 * Clearly labeled — NOT production PLAN-011 allocation policy.
 */
export function developerTestMealIntentFromDaily(input: {
  dailyCalories: number;
  dailyProteinGrams: number;
  dailyCarbsGrams?: number;
  dailyFatGrams?: number;
  dailyFiberGrams?: number;
  mealType: "lunch" | "dinner";
}): MealNutritionIntent {
  const share = input.mealType === "lunch" ? 0.35 : 0.3;
  const intent: MealNutritionIntent = {
    targetCaloriesKcal: Math.round(input.dailyCalories * share),
    targetProteinGrams: Math.round(input.dailyProteinGrams * share),
    isDeveloperTestIntent: true,
    label: `Developer test ${input.mealType} share (${share * 100}% of daily) — not PLAN-011`,
  };
  if (input.dailyCarbsGrams != null) {
    intent.targetCarbsGrams = Math.round(input.dailyCarbsGrams * share);
  }
  if (input.dailyFatGrams != null) {
    intent.targetFatGrams = Math.round(input.dailyFatGrams * share);
  }
  if (input.dailyFiberGrams != null) {
    intent.targetFiberGrams = Math.round(input.dailyFiberGrams * share);
  }
  return intent;
}
