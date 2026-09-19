import type {
  PersonalizedWeeklyMealInstance,
  PersonalizedWeeklyNutritionPlan,
} from "@fitness-autopilot/contracts";

/**
 * Soft PLAN-010 objective: repeated instances of the same core meal prefer
 * the same practical main personalServings when differences are tiny noise.
 *
 * Does NOT mutate meal nutrition or day aggregates — those remain the
 * authoritative PLAN-010/011 truth. Only snaps the personalServings /
 * internalScale labels when values are already within a tight band so
 * meal-prep UX can show one practical weekly portion.
 */

const DEFAULT_SERVING_SNAP_TOLERANCE = 0.06; // 6% of personalServings

export function preferConsistentPortionsAcrossRepeats(
  plan: PersonalizedWeeklyNutritionPlan,
  options?: {
    servingSnapTolerance?: number;
  },
): PersonalizedWeeklyNutritionPlan {
  const servingTol = options?.servingSnapTolerance ?? DEFAULT_SERVING_SNAP_TOLERANCE;

  const byCandidate = new Map<string, number[]>();
  for (const day of plan.days) {
    for (const meal of day.meals) {
      if (meal.status === "blocked") continue;
      const servings = mainPersonalServings(meal);
      if (servings == null) continue;
      const list = byCandidate.get(meal.candidateId) ?? [];
      list.push(servings);
      byCandidate.set(meal.candidateId, list);
    }
  }

  const targetServings = new Map<string, number>();
  for (const [candidateId, values] of byCandidate) {
    if (values.length < 2) continue;
    const median = medianOf(values);
    const spread = Math.max(...values) - Math.min(...values);
    // Only label-snap when differences are tiny noise.
    if (spread / median > servingTol) continue;
    targetServings.set(candidateId, roundServing(median));
  }

  if (targetServings.size === 0) return plan;

  const days = plan.days.map((day) => ({
    ...day,
    meals: day.meals.map((meal) => {
      const target = targetServings.get(meal.candidateId);
      if (target == null || meal.status === "blocked" || !meal.personalizedPlan) {
        return meal;
      }
      return withMainServingLabel(meal, target);
    }),
  }));

  return { ...plan, days };
}

function mainPersonalServings(meal: PersonalizedWeeklyMealInstance): number | undefined {
  const plan = meal.personalizedPlan;
  if (!plan) return undefined;
  const main = plan.portions.find((p) => p.role === "main") ?? plan.portions[0];
  return main?.personalServings ?? main?.internalScale;
}

function withMainServingLabel(
  meal: PersonalizedWeeklyMealInstance,
  targetServings: number,
): PersonalizedWeeklyMealInstance {
  const plan = meal.personalizedPlan;
  if (!plan) return meal;
  const portions = plan.portions.map((p, index) => {
    const isMain =
      p.role === "main" || (index === 0 && !plan.portions.some((x) => x.role === "main"));
    if (!isMain) return p;
    return {
      ...p,
      personalServings: targetServings,
      internalScale: targetServings,
    };
  });
  return {
    ...meal,
    personalizedPlan: {
      ...plan,
      portions,
    },
  };
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function roundServing(value: number): number {
  return Math.round(value * 20) / 20;
}
