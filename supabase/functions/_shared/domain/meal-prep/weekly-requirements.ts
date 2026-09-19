import type {
  CoreMeal,
  CoreMealRepertoire,
  DayOfWeek,
  PersonalizedWeeklyNutritionPlan,
  ResolvedRecipe,
  WeeklyCookingRequirement,
} from "../../contracts/index.ts";
import { MEAL_PREP_POLICY } from "./policy.ts";

const DAY_ORDER: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export function dayIndex(day: DayOfWeek): number {
  return DAY_ORDER.indexOf(day);
}

export function daysBetween(from: DayOfWeek, to: DayOfWeek): number {
  const a = dayIndex(from);
  const b = dayIndex(to);
  if (a < 0 || b < 0) return 0;
  // Prep on Sunday (index 6) before Monday (0): days until Monday = 1
  if (from === "sunday") {
    return b === 6 ? 0 : b + 1;
  }
  return Math.max(0, b - a);
}

export function previousDay(day: DayOfWeek): DayOfWeek {
  const i = dayIndex(day);
  if (i <= 0) return "sunday";
  return DAY_ORDER[i - 1]!;
}

function mainPersonalServings(meal: {
  personalizedPlan?: {
    portions: Array<{
      role?: string;
      personalServings?: number;
      internalScale?: number;
      amount: number;
      unit: string;
    }>;
  };
}): number | undefined {
  const plan = meal.personalizedPlan;
  if (!plan) return undefined;
  const main =
    plan.portions.find((p) => p.role === "main") ??
    plan.portions.find(
      (p) =>
        p.personalServings != null ||
        p.unit.toLowerCase() === "servings" ||
        p.unit.toLowerCase() === "serving",
    );
  if (!main) return undefined;
  return (
    main.personalServings ??
    main.internalScale ??
    (main.unit.toLowerCase().startsWith("serving") ? main.amount : undefined)
  );
}

/**
 * Derive weekly cooking requirements from finalized personalized servings.
 * Aggregates by core meal identity — never by display name.
 */
export function deriveWeeklyCookingRequirements(input: {
  personalizedWeeklyPlan: PersonalizedWeeklyNutritionPlan;
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  coreRepertoire?: CoreMealRepertoire;
}): {
  requirements: WeeklyCookingRequirement[];
  issues: Array<{ code: "MISSING_PREP_PROFILE" | "UNSUPPORTED_BATCH_SCALING"; message: string; coreMealId?: string; recipeId?: string; preservable: boolean }>;
} {
  const issues: Array<{
    code: "MISSING_PREP_PROFILE" | "UNSUPPORTED_BATCH_SCALING";
    message: string;
    coreMealId?: string;
    recipeId?: string;
    preservable: boolean;
  }> = [];

  const coreByCandidate = new Map<string, CoreMeal>();
  for (const core of input.coreRepertoire?.coreMeals ?? []) {
    coreByCandidate.set(core.candidateId, core);
  }

  type Acc = {
    coreMealId: string;
    candidateId: string;
    recipeId: string;
    name: string;
    instances: WeeklyCookingRequirement["instanceServings"];
    prepIntent?: WeeklyCookingRequirement["prepIntent"];
  };

  const byCore = new Map<string, Acc>();

  for (const day of input.personalizedWeeklyPlan.days) {
    for (const meal of day.meals) {
      if (meal.status === "blocked" || !meal.personalizedPlan) continue;
      const servings = mainPersonalServings(meal);
      if (servings == null || !(servings > 0)) continue;

      const recipe = input.recipesByCandidateId[meal.candidateId];
      if (!recipe) {
        issues.push({
          code: "MISSING_PREP_PROFILE",
          message: `No resolved recipe for candidate ${meal.candidateId}.`,
          preservable: false,
        });
        continue;
      }

      const core = coreByCandidate.get(meal.candidateId);
      const coreMealId = core?.coreMealId ?? meal.candidateId;
      const existing = byCore.get(coreMealId);
      const instance = {
        mealInstanceId: meal.mealInstanceId,
        day: meal.day,
        mealType: meal.mealType,
        personalServings: servings,
      };
      if (existing) {
        existing.instances.push(instance);
      } else {
        byCore.set(coreMealId, {
          coreMealId,
          candidateId: meal.candidateId,
          recipeId: recipe.recipeId,
          name: core?.name ?? meal.mealName,
          instances: [instance],
          prepIntent: core?.prepIntent,
        });
      }
    }
  }

  const requirements: WeeklyCookingRequirement[] = [];
  for (const acc of byCore.values()) {
    const recipe = input.recipesByCandidateId[acc.candidateId];
    if (!recipe || !(recipe.baseServings > 0)) {
      issues.push({
        code: "UNSUPPORTED_BATCH_SCALING",
        message: `Recipe for ${acc.name} lacks trustworthy baseServings.`,
        coreMealId: acc.coreMealId,
        recipeId: acc.recipeId,
        preservable: false,
      });
      continue;
    }

    const requiredOutputServings = acc.instances.reduce((s, i) => s + i.personalServings, 0);
    const planned = choosePracticalCookOutput(requiredOutputServings, recipe.baseServings);

    requirements.push({
      coreMealId: acc.coreMealId,
      candidateId: acc.candidateId,
      recipeId: recipe.recipeId,
      name: acc.name,
      mealInstanceIds: acc.instances.map((i) => i.mealInstanceId),
      weeklyInstanceCount: acc.instances.length,
      requiredOutputServings,
      referenceYieldServings: recipe.baseServings,
      plannedCookOutputServings: planned.plannedCookOutputServings,
      expectedExcessServings: planned.expectedExcessServings,
      prepIntent: acc.prepIntent,
      instanceServings: acc.instances,
    });
  }

  return { requirements, issues };
}

/**
 * Choose a practical cook batch without silently inventing large leftovers.
 * Prefer cooking exact required output; only round up slightly toward reference
 * yield when the overshoot is within policy caps.
 */
export function choosePracticalCookOutput(
  requiredOutputServings: number,
  referenceYieldServings: number,
): {
  plannedCookOutputServings: number;
  expectedExcessServings: number;
} {
  if (!(requiredOutputServings > 0)) {
    return { plannedCookOutputServings: referenceYieldServings, expectedExcessServings: 0 };
  }

  // Exact requirement is always valid.
  let planned = requiredOutputServings;

  // If required is very close to a small multiple of reference yield, prefer that batch
  // only when excess stays within caps.
  const batches = Math.max(1, Math.ceil(requiredOutputServings / referenceYieldServings - 1e-9));
  const batchOutput = batches * referenceYieldServings;
  const excess = batchOutput - requiredOutputServings;
  const maxExcess = Math.min(
    MEAL_PREP_POLICY.maxPracticalBatchOvershootServings,
    requiredOutputServings * MEAL_PREP_POLICY.maxPracticalBatchOvershootFraction,
  );
  if (excess > 0 && excess <= maxExcess + 1e-9) {
    planned = batchOutput;
  }

  return {
    plannedCookOutputServings: planned,
    expectedExcessServings: Math.max(0, planned - requiredOutputServings),
  };
}

export function scaleFactorForRequirement(req: WeeklyCookingRequirement): number {
  return req.plannedCookOutputServings / req.referenceYieldServings;
}
