import type {
  GroceryComplexityBand,
  GroceryComplexityLimits,
  GroceryComplexityMetrics,
  IngredientBurdenClass,
  IngredientConcept,
  IngredientFootprint,
  VarietyLevel,
} from "@fitness-autopilot/contracts";
import {
  GROCERY_COMPLEXITY_POLICY,
  GROCERY_COMPLEXITY_POLICY_VERSION,
  getGroceryComplexityLimits,
} from "@fitness-autopilot/contracts";
import {
  flattenFootprintConcepts,
  toIngredientConcept,
} from "./concepts";

export type MealFootprintEntry = {
  candidateId: string;
  name: string;
  footprint: IngredientFootprint;
};

/**
 * Predictive (Stage A) scoring of adding a candidate to an already-selected set.
 * Soft objective — never absolute prohibition.
 */
export function scoreCandidateIngredientEconomy(input: {
  candidate: MealFootprintEntry;
  selected: readonly MealFootprintEntry[];
}): {
  reuseReward: number;
  specialtyPenalty: number;
  freshWastePenalty: number;
  netEconomyScore: number;
  sharedConceptKeys: string[];
  newSpecialtyKeys: string[];
  newHighWasteKeys: string[];
} {
  const selectedConcepts = collectWeekConcepts(input.selected);
  const candidateConcepts = flattenFootprintConcepts(input.candidate.footprint);
  const selectedKeys = new Set(selectedConcepts.map((c) => c.conceptKey));
  const selectedFamilies = new Set(
    selectedConcepts.map((c) => c.familyKey).filter((x): x is string => Boolean(x)),
  );

  const weights = GROCERY_COMPLEXITY_POLICY.weights;
  let reuseReward = 0;
  let specialtyPenalty = 0;
  let freshWastePenalty = 0;
  const sharedConceptKeys: string[] = [];
  const newSpecialtyKeys: string[] = [];
  const newHighWasteKeys: string[] = [];

  for (const concept of candidateConcepts) {
    const shared =
      selectedKeys.has(concept.conceptKey) ||
      (concept.familyKey != null && selectedFamilies.has(concept.familyKey));
    if (shared) {
      sharedConceptKeys.push(concept.conceptKey);
      reuseReward += weights.reuseRewardPerSharedConcept;
      continue;
    }
    if (concept.burdenClass === "specialty") {
      newSpecialtyKeys.push(concept.conceptKey);
      specialtyPenalty += weights.specialty * weights.oneOffSpecialtyMultiplier;
    } else if (concept.burdenClass === "high_waste_risk") {
      newHighWasteKeys.push(concept.conceptKey);
      freshWastePenalty += weights.highWasteRisk * weights.oneOffFreshMultiplier;
    } else if (concept.burdenClass === "common_fresh") {
      freshWastePenalty += weights.commonFresh;
    } else if (concept.burdenClass === "common_staple") {
      // Staples barely matter.
      specialtyPenalty += weights.commonStaple;
    } else {
      specialtyPenalty += weights.reusableWeekly;
    }
  }

  const netEconomyScore = reuseReward - specialtyPenalty - freshWastePenalty;
  return {
    reuseReward,
    specialtyPenalty,
    freshWastePenalty,
    netEconomyScore,
    sharedConceptKeys: [...new Set(sharedConceptKeys)],
    newSpecialtyKeys,
    newHighWasteKeys,
  };
}

function collectWeekConcepts(
  selected: readonly MealFootprintEntry[],
): IngredientConcept[] {
  const all: IngredientConcept[] = [];
  for (const meal of selected) {
    all.push(...flattenFootprintConcepts(meal.footprint));
  }
  const seen = new Set<string>();
  return all.filter((c) => {
    if (seen.has(c.conceptKey)) return false;
    seen.add(c.conceptKey);
    return true;
  });
}

export type ExactIngredientUse = {
  conceptKey: string;
  label: string;
  burdenClass: IngredientBurdenClass;
  /** Distinct recipe/candidate ids that use this ingredient (not meal instances). */
  usedByCandidateIds: string[];
};

/**
 * Exact (Stage B) complexity from resolved grocery-facing ingredient uses.
 */
export function evaluateExactGroceryComplexity(input: {
  ingredientUses: readonly ExactIngredientUse[];
  uniqueMealConcepts: number;
  varietyLevel: VarietyLevel;
}): GroceryComplexityMetrics {
  const limits = getGroceryComplexityLimits(input.varietyLevel);
  const weights = GROCERY_COMPLEXITY_POLICY.weights;

  let uniquePantryStaples = 0;
  let uniqueFreshPerishables = 0;
  let uniqueSpecialtyIngredients = 0;
  let oneOffIngredients = 0;
  let oneOffFreshPerishables = 0;
  let oneOffSpecialtyIngredients = 0;
  let weighted = 0;
  let reusableMealMentions = 0;
  let reusableIngredientCount = 0;

  for (const use of input.ingredientUses) {
    const recipeCount = new Set(use.usedByCandidateIds).size;
    const oneOff = recipeCount <= 1;
    if (oneOff) oneOffIngredients += 1;

    switch (use.burdenClass) {
      case "common_staple":
        uniquePantryStaples += 1;
        weighted += weights.commonStaple;
        break;
      case "common_fresh":
        uniqueFreshPerishables += 1;
        weighted += oneOff
          ? weights.commonFresh * weights.oneOffFreshMultiplier
          : weights.commonFresh;
        if (oneOff) oneOffFreshPerishables += 1;
        break;
      case "high_waste_risk":
        uniqueFreshPerishables += 1;
        weighted += oneOff
          ? weights.highWasteRisk * weights.oneOffFreshMultiplier
          : weights.highWasteRisk;
        if (oneOff) oneOffFreshPerishables += 1;
        break;
      case "specialty":
        uniqueSpecialtyIngredients += 1;
        weighted += oneOff
          ? weights.specialty * weights.oneOffSpecialtyMultiplier
          : weights.specialty;
        if (oneOff) oneOffSpecialtyIngredients += 1;
        break;
      default:
        weighted += oneOff ? weights.reusableWeekly * 1.4 : weights.reusableWeekly;
        break;
    }

    if (use.burdenClass !== "common_staple") {
      reusableIngredientCount += 1;
      reusableMealMentions += recipeCount;
    }
  }

  const uniqueCanonical = input.ingredientUses.length;
  const sharedCount = input.ingredientUses.filter(
    (u) => new Set(u.usedByCandidateIds).size > 1,
  ).length;
  const ingredientReuseRatio =
    uniqueCanonical === 0 ? 1 : sharedCount / Math.max(1, uniqueCanonical - uniquePantryStaples);
  const averageMealsPerReusableIngredient =
    reusableIngredientCount === 0 ? 0 : reusableMealMentions / reusableIngredientCount;

  const band = classifyComplexityBand(
    {
      uniqueCanonicalIngredients: uniqueCanonical,
      uniqueFreshPerishables,
      uniqueSpecialtyIngredients,
      oneOffFreshPerishables,
      oneOffSpecialtyIngredients,
      weightedComplexity: weighted,
      ingredientReuseRatio,
    },
    limits,
  );

  return {
    policyVersion: GROCERY_COMPLEXITY_POLICY_VERSION,
    uniqueCanonicalIngredients: uniqueCanonical,
    uniquePantryStaples,
    uniqueFreshPerishables,
    uniqueSpecialtyIngredients,
    oneOffIngredients,
    oneOffFreshPerishables,
    oneOffSpecialtyIngredients,
    ingredientReuseRatio: clamp01(ingredientReuseRatio),
    averageMealsPerReusableIngredient,
    weightedComplexity: round2(weighted),
    band,
    uniqueMealConcepts: input.uniqueMealConcepts,
    varietyLevel: input.varietyLevel,
  };
}

function classifyComplexityBand(
  metrics: {
    uniqueCanonicalIngredients: number;
    uniqueFreshPerishables: number;
    uniqueSpecialtyIngredients: number;
    oneOffFreshPerishables: number;
    oneOffSpecialtyIngredients: number;
    weightedComplexity: number;
    ingredientReuseRatio: number;
  },
  limits: GroceryComplexityLimits,
): GroceryComplexityBand {
  const excessive =
    metrics.uniqueCanonicalIngredients > limits.maxUniqueCanonicalIngredients ||
    metrics.uniqueFreshPerishables > limits.maxUniqueFreshPerishables ||
    metrics.uniqueSpecialtyIngredients > limits.maxUniqueSpecialtyIngredients ||
    metrics.oneOffFreshPerishables > limits.maxOneOffFreshPerishables ||
    metrics.oneOffSpecialtyIngredients > limits.maxOneOffSpecialtyIngredients ||
    metrics.weightedComplexity > limits.maxWeightedComplexity;

  if (excessive) return "excessive";

  const elevated =
    metrics.uniqueCanonicalIngredients >
      Math.floor(limits.maxUniqueCanonicalIngredients * 0.85) ||
    metrics.oneOffSpecialtyIngredients >= limits.maxOneOffSpecialtyIngredients ||
    metrics.ingredientReuseRatio < limits.minIngredientReuseRatio;

  return elevated ? "elevated" : "within_limit";
}

/**
 * Rank selected meals by how much unique burden they introduce to the week.
 * Higher = better replacement target.
 */
export function rankMealsByIngredientBurden(input: {
  meals: readonly MealFootprintEntry[];
}): Array<{ candidateId: string; name: string; burdenScore: number }> {
  return input.meals
    .map((meal) => {
      const others = input.meals.filter((m) => m.candidateId !== meal.candidateId);
      const score = scoreCandidateIngredientEconomy({
        candidate: meal,
        selected: others,
      });
      // High specialty/waste with low reuse → high burden.
      const burdenScore =
        score.specialtyPenalty + score.freshWastePenalty - score.reuseReward;
      return {
        candidateId: meal.candidateId,
        name: meal.name,
        burdenScore,
      };
    })
    .sort((a, b) => b.burdenScore - a.burdenScore);
}

/**
 * Convert raw recipe ingredient names (+ owning candidate) into ExactIngredientUse.
 */
export function collectExactIngredientUses(
  rows: readonly { candidateId: string; ingredientName: string }[],
): ExactIngredientUse[] {
  const map = new Map<string, ExactIngredientUse>();
  for (const row of rows) {
    const concept = toIngredientConcept(row.ingredientName);
    const existing = map.get(concept.conceptKey);
    if (!existing) {
      map.set(concept.conceptKey, {
        conceptKey: concept.conceptKey,
        label: concept.label,
        burdenClass: concept.burdenClass,
        usedByCandidateIds: [row.candidateId],
      });
      continue;
    }
    if (!existing.usedByCandidateIds.includes(row.candidateId)) {
      existing.usedByCandidateIds.push(row.candidateId);
    }
  }
  return [...map.values()];
}

/**
 * Absolute hard ceiling after bounded repair. Soft-band limits still classify
 * weeks as elevated/excessive for diagnostics and repair targeting, but Generate
 * My Plan only hard-fails when a week remains truly pathological (legacy ~80–100
 * unique / specialty-heavy baskets). Normal 4-meal resolved weeks proceed.
 */
export const GROCERY_COMPLEXITY_HARD_CEILING = {
  maxUniqueCanonicalIngredients: 90,
  maxWeightedComplexity: 100,
  maxUniqueSpecialtyIngredients: 16,
} as const;

export function isPathologicalGroceryComplexity(
  metrics: Pick<
    GroceryComplexityMetrics,
    | "uniqueCanonicalIngredients"
    | "weightedComplexity"
    | "uniqueSpecialtyIngredients"
  >,
): boolean {
  return (
    metrics.uniqueCanonicalIngredients >
      GROCERY_COMPLEXITY_HARD_CEILING.maxUniqueCanonicalIngredients ||
    metrics.weightedComplexity > GROCERY_COMPLEXITY_HARD_CEILING.maxWeightedComplexity ||
    metrics.uniqueSpecialtyIngredients >
      GROCERY_COMPLEXITY_HARD_CEILING.maxUniqueSpecialtyIngredients
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
