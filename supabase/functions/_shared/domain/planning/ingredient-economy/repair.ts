import type {
  CoreMeal,
  CoreMealRepertoire,
  DayOfWeek,
  GroceryComplexityMetrics,
  IngredientFootprint,
  MealConcept,
  RankedCulinaryCandidate,
  RankedWeeklyStrategy,
  ResolvedRecipe,
  VarietyLevel,
} from "../../../contracts/index.ts";
import {
  V1_CORE_MEAL_COUNT,
  V1_COVERED_DAYS,
  V1_FLEXIBLE_DAY_DEFAULT,
  V1_MEAL_PREP_POLICY_VERSION,
  V1_PLANNED_LUNCH_DINNER_SLOTS,
} from "../../../contracts/index.ts";
import { collectRankedMealSlots } from "../ranked-weekly-strategy.ts";
import {
  collectExactIngredientUses,
  evaluateExactGroceryComplexity,
  rankMealsByIngredientBurden,
  scoreCandidateIngredientEconomy,
  type MealFootprintEntry,
} from "./complexity.ts";
import { synthesizeFootprintFromMealSignals } from "./concepts.ts";

export const MAX_GROCERY_COMPLEXITY_REPAIR_ROUNDS = 4;

export type GroceryComplexityRepairResult =
  | {
      ok: true;
      strategy: RankedWeeklyStrategy;
      metrics: GroceryComplexityMetrics;
      repaired: boolean;
      replacements: Array<{
        failedCandidateId: string;
        replacementCandidateId: string;
        burdenScore: number;
      }>;
    }
  | {
      ok: false;
      code: "GROCERY_COMPLEXITY_REPAIR_EXHAUSTED";
      message: string;
      strategy: RankedWeeklyStrategy;
      metrics: GroceryComplexityMetrics;
      replacements: Array<{
        failedCandidateId: string;
        replacementCandidateId: string;
        burdenScore: number;
      }>;
    };

export function footprintForCandidate(input: {
  candidateId: string;
  name: string;
  concept?: MealConcept;
  ranked?: RankedCulinaryCandidate;
}): MealFootprintEntry {
  const concept = input.concept;
  const footprint: IngredientFootprint =
    concept?.ingredientFootprint ??
    synthesizeFootprintFromMealSignals({
      primaryProtein: input.ranked?.candidate.primaryProtein,
      componentNames: concept
        ? [concept.main.name, ...concept.components.map((c) => c.name)]
        : undefined,
      cuisineFamily: input.ranked?.candidate.cuisineFamily,
      dishName: input.name,
    });
  return {
    candidateId: input.candidateId,
    name: input.name,
    footprint,
  };
}

/**
 * Build exact complexity metrics from resolved main recipes (+ optional side names).
 */
export function metricsFromResolvedRecipes(input: {
  strategy: RankedWeeklyStrategy;
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  varietyLevel: VarietyLevel;
}): GroceryComplexityMetrics {
  const rows: Array<{ candidateId: string; ingredientName: string }> = [];
  for (const candidateId of input.strategy.uniqueCandidateIds) {
    const recipe = input.recipesByCandidateId[candidateId];
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      rows.push({ candidateId, ingredientName: ing.name });
    }
  }
  return evaluateExactGroceryComplexity({
    ingredientUses: collectExactIngredientUses(rows),
    uniqueMealConcepts: input.strategy.uniqueCandidateIds.length,
    varietyLevel: input.varietyLevel,
  });
}

/**
 * Bounded repertoire repair when exact grocery complexity is excessive.
 * Replaces highest-burden selected meals with lower-burden ranked alternatives.
 */
export function repairStrategyForGroceryComplexity(input: {
  strategy: RankedWeeklyStrategy;
  metrics: GroceryComplexityMetrics;
  lunchPool: readonly RankedCulinaryCandidate[];
  dinnerPool: readonly RankedCulinaryCandidate[];
  conceptsByCandidateId?: Record<string, MealConcept>;
  /** Candidate IDs that must not be re-selected (failed executability, prior repairs). */
  excludedCandidateIds?: ReadonlySet<string>;
}): GroceryComplexityRepairResult {
  if (input.metrics.band !== "excessive") {
    return {
      ok: true,
      strategy: input.strategy,
      metrics: input.metrics,
      repaired: false,
      replacements: [],
    };
  }

  const meals: MealFootprintEntry[] = input.strategy.uniqueCandidateIds.map((id) => {
    const slot = collectRankedMealSlots(input.strategy.days).find((s) => s.candidateId === id);
    const ranked =
      input.lunchPool.find((c) => c.candidate.candidateId === id) ??
      input.dinnerPool.find((c) => c.candidate.candidateId === id);
    return footprintForCandidate({
      candidateId: id,
      name: slot?.name ?? ranked?.candidate.name ?? id,
      concept: input.conceptsByCandidateId?.[id],
      ranked,
    });
  });

  const rankedBurden = rankMealsByIngredientBurden({ meals });
  const usedIds = new Set(input.strategy.uniqueCandidateIds);
  const excluded = new Set(input.excludedCandidateIds ?? []);
  const replacements: Array<{
    failedCandidateId: string;
    replacementCandidateId: string;
    burdenScore: number;
  }> = [];

  let days = input.strategy.days.map((day) => ({
    ...day,
    lunch: { ...day.lunch },
    dinner: { ...day.dinner },
  }));

  // Replace up to 2 highest-burden meals per repair call.
  for (const target of rankedBurden.slice(0, 2)) {
    const mealTypes = new Set<"lunch" | "dinner">();
    for (const slot of collectRankedMealSlots(days)) {
      if (slot.candidateId === target.candidateId) mealTypes.add(slot.mealType);
    }
    if (mealTypes.size === 0) continue;

    let replaced = false;
    for (const mealType of mealTypes) {
      const pool = mealType === "lunch" ? input.lunchPool : input.dinnerPool;
      const currentMeals = meals.filter((m) => m.candidateId !== target.candidateId);
      const replacement = pickLowerBurdenReplacement({
        pool,
        usedIds,
        excluded,
        conceptsByCandidateId: input.conceptsByCandidateId,
        currentMeals,
        minImprovement: 0.5,
      });
      if (!replacement) continue;

      days = days.map((day) => {
        const slot = day[mealType];
        if (slot.candidateId !== target.candidateId) return day;
        return {
          ...day,
          [mealType]: {
            ...slot,
            candidateId: replacement.candidate.candidateId,
            name:
              input.conceptsByCandidateId?.[replacement.candidate.candidateId]?.name ??
              replacement.candidate.name,
            planningReason: `Replaced high grocery-burden meal ${target.candidateId} to improve weekly ingredient economy.`,
          },
        };
      });
      usedIds.delete(target.candidateId);
      usedIds.add(replacement.candidate.candidateId);
      replacements.push({
        failedCandidateId: target.candidateId,
        replacementCandidateId: replacement.candidate.candidateId,
        burdenScore: target.burdenScore,
      });
      replaced = true;
      break;
    }
    if (!replaced) continue;
  }

  let uniqueCandidateIds = [
    ...new Set(collectRankedMealSlots(days).map((s) => s.candidateId)),
  ];

  // V1 invariant: exactly 4 unique core meals. If a repair somehow expands the
  // set, keep the first 4 by appearance order (slots already assigned).
  if (uniqueCandidateIds.length > V1_CORE_MEAL_COUNT) {
    uniqueCandidateIds = uniqueCandidateIds.slice(0, V1_CORE_MEAL_COUNT);
  }

  const flexibleDay =
    input.strategy.flexibleDay ??
    input.strategy.coreRepertoire?.flexibleDay ??
    V1_FLEXIBLE_DAY_DEFAULT;

  const coreRepertoire =
    input.strategy.coreRepertoire != null || uniqueCandidateIds.length === V1_CORE_MEAL_COUNT
      ? rebuildCoreRepertoireAfterRepair({
          days,
          uniqueCandidateIds,
          lunchPool: input.lunchPool,
          dinnerPool: input.dinnerPool,
          conceptsByCandidateId: input.conceptsByCandidateId,
          previous: input.strategy.coreRepertoire,
          flexibleDay,
        })
      : input.strategy.coreRepertoire;

  const strategy: RankedWeeklyStrategy = {
    ...input.strategy,
    days,
    uniqueCandidateIds,
    flexibleDay,
    ...(coreRepertoire ? { coreRepertoire } : {}),
  };

  if (replacements.length === 0) {
    return {
      ok: false,
      code: "GROCERY_COMPLEXITY_REPAIR_EXHAUSTED",
      message:
        "Weekly grocery complexity is excessive and no lower-burden ranked replacements were available.",
      strategy: input.strategy,
      metrics: input.metrics,
      replacements: [],
    };
  }

  return {
    ok: true,
    strategy,
    metrics: input.metrics,
    repaired: true,
    replacements,
  };
}

function rebuildCoreRepertoireAfterRepair(input: {
  days: RankedWeeklyStrategy["days"];
  uniqueCandidateIds: string[];
  lunchPool: readonly RankedCulinaryCandidate[];
  dinnerPool: readonly RankedCulinaryCandidate[];
  conceptsByCandidateId?: Record<string, MealConcept>;
  previous?: CoreMealRepertoire;
  flexibleDay: DayOfWeek;
}): CoreMealRepertoire {
  const coveredDays =
    input.previous?.coveredDays ??
    (input.days.map((d) => d.day).length === 6
      ? input.days.map((d) => d.day)
      : [...V1_COVERED_DAYS]);

  const coreMeals: CoreMeal[] = input.uniqueCandidateIds.map((candidateId) => {
    const prev = input.previous?.coreMeals.find((m) => m.candidateId === candidateId);
    const ranked =
      input.lunchPool.find((c) => c.candidate.candidateId === candidateId) ??
      input.dinnerPool.find((c) => c.candidate.candidateId === candidateId);
    const concept = input.conceptsByCandidateId?.[candidateId];
    const slots: CoreMeal["mealInstanceSlots"] = [];
    for (const day of input.days) {
      if (day.lunch.candidateId === candidateId) {
        slots.push({ day: day.day, mealType: "lunch" });
      }
      if (day.dinner.candidateId === candidateId) {
        slots.push({ day: day.day, mealType: "dinner" });
      }
    }
    const name =
      concept?.name ??
      ranked?.candidate.name ??
      prev?.name ??
      collectRankedMealSlots(input.days).find((s) => s.candidateId === candidateId)?.name ??
      candidateId;
    return {
      coreMealId: prev?.coreMealId ?? candidateId,
      candidateId,
      name,
      cuisineFamily: ranked?.candidate.cuisineFamily ?? prev?.cuisineFamily,
      mealForm: ranked?.candidate.dishFormat ?? prev?.mealForm,
      proteinAnchor: ranked?.candidate.primaryProtein ?? prev?.proteinAnchor,
      flavorTags: ranked?.candidate.flavorFamilies.slice(0, 8) ?? prev?.flavorTags,
      prepIntent: prev?.prepIntent,
      fridgeLifeDays: prev?.fridgeLifeDays,
      freezerFriendly: prev?.freezerFriendly,
      reheatingQuality: prev?.reheatingQuality,
      mealInstanceSlots: slots,
      weeklyInstanceCount: slots.length > 0 ? slots.length : 1,
    };
  });

  return {
    policyVersion: V1_MEAL_PREP_POLICY_VERSION,
    coreMeals,
    coveredDays: [...coveredDays],
    flexibleDay: input.flexibleDay,
    plannedLunchDinnerSlots: V1_PLANNED_LUNCH_DINNER_SLOTS,
  };
}

function pickLowerBurdenReplacement(input: {
  pool: readonly RankedCulinaryCandidate[];
  usedIds: Set<string>;
  excluded: Set<string>;
  conceptsByCandidateId?: Record<string, MealConcept>;
  currentMeals: MealFootprintEntry[];
  minImprovement: number;
}): RankedCulinaryCandidate | null {
  let best: { ranked: RankedCulinaryCandidate; score: number } | null = null;

  for (const ranked of input.pool) {
    const id = ranked.candidate.candidateId;
    if (input.usedIds.has(id) || input.excluded.has(id)) continue;
    if (input.conceptsByCandidateId && !input.conceptsByCandidateId[id]) continue;
    const entry = footprintForCandidate({
      candidateId: id,
      name: ranked.candidate.name,
      concept: input.conceptsByCandidateId?.[id],
      ranked,
    });
    const economy = scoreCandidateIngredientEconomy({
      candidate: entry,
      selected: input.currentMeals,
    });
    if (!best || economy.netEconomyScore > best.score) {
      best = { ranked, score: economy.netEconomyScore };
    }
  }

  if (!best || best.score < input.minImprovement) return null;
  return best.ranked;
}
