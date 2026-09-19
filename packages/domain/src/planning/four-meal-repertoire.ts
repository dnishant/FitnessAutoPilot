import type {
  CoreMeal,
  CoreMealRepertoire,
  DayOfWeek,
  IngredientFootprint,
  MealConcept,
  RankedCulinaryCandidate,
  RankedWeeklyDay,
  RankedWeeklyMealSlot,
  RankedWeeklyStrategy,
  VarietyLevel,
  WeeklyCookingStyle,
} from "@fitness-autopilot/contracts";
import {
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  V1_CORE_MEAL_COUNT,
  V1_COVERED_DAYS,
  V1_FLEXIBLE_DAY_DEFAULT,
  V1_MEAL_PREP_POLICY_VERSION,
  V1_PLANNED_LUNCH_DINNER_SLOTS,
  getV1VarietyDiversityPolicy,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import {
  flattenFootprintConcepts,
  scoreCandidateIngredientEconomy,
  synthesizeFootprintFromMealSignals,
  type MealFootprintEntry,
} from "./ingredient-economy";

export type FourMealRepertoireErrorCode =
  | "INSUFFICIENT_CANDIDATES"
  | "NO_VALID_REPERTOIRE"
  | "ASSIGNMENT_FAILED";

export type FourMealRepertoireError = {
  code: FourMealRepertoireErrorCode;
  message: string;
};

export type RepertoireCandidate = {
  ranked: RankedCulinaryCandidate;
  footprint: IngredientFootprint;
  concept?: MealConcept;
  /** Soft protein suitability 0–1 from fitnessAdaptability + primaryProtein presence. */
  proteinSuitability: number;
  prepFit: number;
};

export type ScoredRepertoireSet = {
  candidates: RepertoireCandidate[];
  score: number;
  breakdown: {
    individualQuality: number;
    proteinSuitability: number;
    ingredientEconomy: number;
    culinaryDiversity: number;
    prepCompatibility: number;
    repetitionPenalty: number;
  };
};

const MAX_POOL_FOR_COMBINATIONS = 12;

/**
 * Build planning candidates with footprints for repertoire selection.
 */
export function buildRepertoireCandidates(input: {
  lunchPool: readonly RankedCulinaryCandidate[];
  dinnerPool: readonly RankedCulinaryCandidate[];
  conceptsByCandidateId?: Record<string, MealConcept>;
  cookingStyle?: WeeklyCookingStyle;
  excludedCandidateIds?: ReadonlySet<string>;
}): RepertoireCandidate[] {
  const byId = new Map<string, RankedCulinaryCandidate>();
  for (const ranked of [...input.lunchPool, ...input.dinnerPool]) {
    const id = ranked.candidate.candidateId;
    if (input.excludedCandidateIds?.has(id)) continue;
    const existing = byId.get(id);
    if (!existing || ranked.rank < existing.rank) {
      byId.set(id, ranked);
    }
  }

  const cookingStyle = input.cookingStyle ?? "ready_lunch_fresh_dinner";
  const out: RepertoireCandidate[] = [];
  for (const ranked of byId.values()) {
    const concept = input.conceptsByCandidateId?.[ranked.candidate.candidateId];
    const footprint =
      concept?.ingredientFootprint ??
      synthesizeFootprintFromMealSignals({
        primaryProtein: ranked.candidate.primaryProtein,
        componentNames: concept
          ? [concept.main.name, ...concept.components.map((c) => c.name)]
          : undefined,
        cuisineFamily: ranked.candidate.cuisineFamily,
        dishName: ranked.candidate.name,
      });
    out.push({
      ranked,
      footprint,
      concept,
      proteinSuitability: proteinSuitabilityScore(ranked),
      prepFit: prepFitScore(ranked, cookingStyle),
    });
  }

  // Prefer higher-ranked / higher-scoring candidates in the combination pool.
  out.sort((a, b) => {
    const scoreDiff = b.ranked.score - a.ranked.score;
    if (scoreDiff !== 0) return scoreDiff;
    return a.ranked.rank - b.ranked.rank;
  });
  return out.slice(0, MAX_POOL_FOR_COMBINATIONS);
}

function proteinSuitabilityScore(ranked: RankedCulinaryCandidate): number {
  const hasAnchor = Boolean(ranked.candidate.primaryProtein?.trim());
  const fitness = ranked.candidate.fitnessAdaptability;
  let base = hasAnchor ? 0.55 : 0.15;
  if (fitness === "easy") base += 0.35;
  else if (fitness === "moderate") base += 0.2;
  else if (fitness === "hard") base += 0.05;
  base += Math.min(0.15, (ranked.scoreBreakdown.fitnessAdaptability ?? 0) * 0.15);
  return clamp01(base);
}

function prepFitScore(
  ranked: RankedCulinaryCandidate,
  cookingStyle: WeeklyCookingStyle,
): number {
  const adapt = ranked.candidate.mealPrepAdaptability;
  let score = 0.5;
  if (adapt === "fully_prepped") score = 0.95;
  else if (adapt === "component_prepped") score = 0.8;
  else if (adapt === "quick_fresh_finish") score = 0.45;
  else if (adapt === "fresh_only") score = 0.2;

  if (cookingStyle === "mostly_ready") {
    if (adapt === "fresh_only" || adapt === "quick_fresh_finish") score *= 0.35;
  } else if (cookingStyle === "ready_lunch_fresh_dinner") {
    if (adapt === "fresh_only") score *= 0.55;
  }
  const finish = ranked.candidate.estimatedFinishMinutesAfterPrep;
  if (finish != null && finish > 25) score *= 0.7;
  return clamp01(score);
}

/**
 * Combinatorial four-meal repertoire optimizer.
 * Does NOT take top-4 independently — scores the SET.
 */
export function selectFourMealRepertoire(input: {
  lunchPool: readonly RankedCulinaryCandidate[];
  dinnerPool: readonly RankedCulinaryCandidate[];
  conceptsByCandidateId?: Record<string, MealConcept>;
  varietyLevel?: VarietyLevel;
  cookingStyle?: WeeklyCookingStyle;
  excludedCandidateIds?: ReadonlySet<string>;
}): Result<ScoredRepertoireSet, FourMealRepertoireError> {
  const pool = buildRepertoireCandidates(input);
  if (pool.length < V1_CORE_MEAL_COUNT) {
    return err({
      code: "INSUFFICIENT_CANDIDATES",
      message: `Need at least ${V1_CORE_MEAL_COUNT} distinct candidates for V1 repertoire; got ${pool.length}.`,
    });
  }

  const varietyLevel = input.varietyLevel ?? "balanced";
  const diversityPolicy = getV1VarietyDiversityPolicy(varietyLevel);
  let best: ScoredRepertoireSet | null = null;

  for (const combo of combinations(pool, V1_CORE_MEAL_COUNT)) {
    const scored = scoreRepertoireSet(combo, diversityPolicy);
    if (!best || scored.score > best.score) {
      best = scored;
    }
  }

  if (!best) {
    return err({
      code: "NO_VALID_REPERTOIRE",
      message: "No valid four-meal repertoire could be scored from the candidate pool.",
    });
  }
  return ok(best);
}

function scoreRepertoireSet(
  candidates: RepertoireCandidate[],
  diversityPolicy: ReturnType<typeof getV1VarietyDiversityPolicy>,
): ScoredRepertoireSet {
  const individualQuality =
    candidates.reduce((sum, c) => sum + c.ranked.score, 0) / (candidates.length * 100);

  const proteinSuitability =
    candidates.reduce((sum, c) => sum + c.proteinSuitability, 0) / candidates.length;

  const prepCompatibility =
    candidates.reduce((sum, c) => sum + c.prepFit, 0) / candidates.length;

  // Ingredient economy across the set (average leave-one-out economy).
  const footprints: MealFootprintEntry[] = candidates.map((c) => ({
    candidateId: c.ranked.candidate.candidateId,
    name: c.ranked.candidate.name,
    footprint: c.footprint,
  }));
  let economySum = 0;
  for (let i = 0; i < footprints.length; i += 1) {
    const selected = footprints.filter((_, j) => j !== i);
    const economy = scoreCandidateIngredientEconomy({
      candidate: footprints[i]!,
      selected,
    });
    economySum += economy.netEconomyScore;
  }
  // Normalize roughly into 0–1 (economy scores are typically -10..+5).
  const ingredientEconomy = clamp01((economySum / footprints.length + 4) / 8);

  const culinaryDiversity = culinaryDiversityScore(candidates, diversityPolicy);

  // Penalize near-identical meals (same cuisine + protein + dish format).
  const repetitionPenalty = culinaryRepetitionPenalty(candidates);

  const score =
    0.22 * individualQuality +
    0.18 * proteinSuitability +
    diversityPolicy.overlapWeight * 0.28 * ingredientEconomy +
    diversityPolicy.diversityWeight * 0.22 * culinaryDiversity +
    0.1 * prepCompatibility -
    0.25 * repetitionPenalty;

  return {
    candidates,
    score,
    breakdown: {
      individualQuality,
      proteinSuitability,
      ingredientEconomy,
      culinaryDiversity,
      prepCompatibility,
      repetitionPenalty,
    },
  };
}

function culinaryDiversityScore(
  candidates: RepertoireCandidate[],
  policy: ReturnType<typeof getV1VarietyDiversityPolicy>,
): number {
  const cuisines = new Set(
    candidates.map((c) => normalizeKey(c.ranked.candidate.cuisineFamily)),
  );
  const proteins = new Set(
    candidates
      .map((c) => normalizeKey(c.ranked.candidate.primaryProtein ?? ""))
      .filter(Boolean),
  );
  const forms = new Set(
    candidates.map((c) => normalizeKey(c.ranked.candidate.dishFormat)),
  );
  const flavors = new Set(
    candidates.flatMap((c) => c.ranked.candidate.flavorFamilies.map(normalizeKey)),
  );

  let score = 0;
  score += Math.min(1, cuisines.size / Math.max(1, policy.preferredMinDistinctCuisines)) * 0.35;
  score += Math.min(1, proteins.size / Math.max(1, policy.preferredMinDistinctProteins)) * 0.3;
  score += Math.min(1, forms.size / Math.max(1, policy.preferredMinDistinctMealForms)) * 0.25;
  score += Math.min(1, flavors.size / 6) * 0.1;
  return clamp01(score);
}

function culinaryRepetitionPenalty(candidates: RepertoireCandidate[]): number {
  let penalty = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i]!.ranked.candidate;
      const b = candidates[j]!.ranked.candidate;
      const sameCuisine = normalizeKey(a.cuisineFamily) === normalizeKey(b.cuisineFamily);
      const sameProtein =
        a.primaryProtein &&
        b.primaryProtein &&
        normalizeKey(a.primaryProtein) === normalizeKey(b.primaryProtein);
      const sameForm = normalizeKey(a.dishFormat) === normalizeKey(b.dishFormat);
      if (sameCuisine && sameProtein && sameForm) penalty += 0.45;
      else if (sameCuisine && sameProtein) penalty += 0.25;
      else if (sameCuisine && sameForm) penalty += 0.15;
    }
  }
  return clamp01(penalty);
}

/**
 * Assign four core meals across 12 lunch/dinner slots (6 covered days).
 * Avoids same meal lunch+dinner on the same day by default.
 * Spreads repeats; prefers shorter fridge-life meals earlier when metadata exists.
 */
export function assignFourMealsToWeek(input: {
  repertoire: ScoredRepertoireSet;
  flexibleDay?: DayOfWeek;
  coveredDays?: readonly DayOfWeek[];
}): Result<RankedWeeklyStrategy, FourMealRepertoireError> {
  const coveredDays = [...(input.coveredDays ?? V1_COVERED_DAYS)];
  const flexibleDay = input.flexibleDay ?? V1_FLEXIBLE_DAY_DEFAULT;
  if (coveredDays.length !== 6) {
    return err({
      code: "ASSIGNMENT_FAILED",
      message: `Expected 6 covered days; got ${coveredDays.length}.`,
    });
  }

  const meals = [...input.repertoire.candidates];
  // Shorter fridge life → earlier average position.
  meals.sort((a, b) => {
    const aLife = inferFridgeLifeDays(a);
    const bLife = inferFridgeLifeDays(b);
    return aLife - bLife;
  });

  // Target instance counts ~3 each, allowing 2–4 distribution.
  const counts = distributeInstanceCounts(meals.length, V1_PLANNED_LUNCH_DINNER_SLOTS);
  const sequence = buildAssignmentSequence(meals, counts, coveredDays);
  if (!sequence) {
    return err({
      code: "ASSIGNMENT_FAILED",
      message: "Could not assign four core meals to 12 slots without same-day lunch+dinner collision.",
    });
  }

  const days: RankedWeeklyDay[] = coveredDays.map((day) => {
    const lunchCand = sequence.find((s) => s.day === day && s.mealType === "lunch")!;
    const dinnerCand = sequence.find((s) => s.day === day && s.mealType === "dinner")!;
    return {
      day,
      lunch: toSlot(day, "lunch", lunchCand.candidate),
      dinner: toSlot(day, "dinner", dinnerCand.candidate),
    };
  });

  const uniqueCandidateIds = meals.map((m) => m.ranked.candidate.candidateId);
  const coreRepertoire = buildCoreRepertoire({
    meals,
    days,
    coveredDays,
    flexibleDay,
  });

  const strategy: RankedWeeklyStrategy = {
    days,
    uniqueCandidateIds,
    flexibleDay,
    coreRepertoire,
    strategySummary: {
      varietyApproach: `V1 four-meal repertoire with intentional repeats across ${V1_PLANNED_LUNCH_DINNER_SLOTS} lunch/dinner portions.`,
      prepApproach:
        "Four prep-compatible core meals covering six days; seventh day intentionally flexible.",
      ingredientReuseApproach:
        "Repertoire selected for shared useful ingredients without collapsing culinary variety.",
    },
    metadata: {
      provider: "deterministic",
      model: "four-meal-repertoire-v1",
      promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
    },
  };

  return ok(strategy);
}

/**
 * End-to-end: select four meals + assign 12 slots.
 */
export function buildV1WeeklyStrategy(input: {
  lunchPool: readonly RankedCulinaryCandidate[];
  dinnerPool: readonly RankedCulinaryCandidate[];
  conceptsByCandidateId?: Record<string, MealConcept>;
  varietyLevel?: VarietyLevel;
  cookingStyle?: WeeklyCookingStyle;
  excludedCandidateIds?: ReadonlySet<string>;
  flexibleDay?: DayOfWeek;
}): Result<
  { strategy: RankedWeeklyStrategy; repertoireScore: ScoredRepertoireSet },
  FourMealRepertoireError
> {
  const selected = selectFourMealRepertoire(input);
  if (!selected.ok) return selected;
  const assigned = assignFourMealsToWeek({
    repertoire: selected.value,
    flexibleDay: input.flexibleDay,
  });
  if (!assigned.ok) return assigned;
  return ok({ strategy: assigned.value, repertoireScore: selected.value });
}

function distributeInstanceCounts(mealCount: number, totalSlots: number): number[] {
  const base = Math.floor(totalSlots / mealCount);
  const remainder = totalSlots % mealCount;
  const counts = Array.from({ length: mealCount }, () => base);
  // Prefer giving extras to earlier (shorter fridge life) meals.
  for (let i = 0; i < remainder; i += 1) {
    counts[i] = (counts[i] ?? 0) + 1;
  }
  return counts;
}

function buildAssignmentSequence(
  meals: RepertoireCandidate[],
  counts: number[],
  coveredDays: readonly DayOfWeek[],
): Array<{ day: DayOfWeek; mealType: "lunch" | "dinner"; candidate: RepertoireCandidate }> | null {
  const remaining = [...counts];
  const sequence: Array<{
    day: DayOfWeek;
    mealType: "lunch" | "dinner";
    candidate: RepertoireCandidate;
  }> = [];

  // Round-robin preference order rotated to spread repeats.
  const order = meals.map((_, i) => i);

  for (const day of coveredDays) {
    const lunchIndex = pickNextIndex(order, remaining, null);
    if (lunchIndex == null) return null;
    remaining[lunchIndex]! -= 1;
    sequence.push({ day, mealType: "lunch", candidate: meals[lunchIndex]! });

    const dinnerIndex = pickNextIndex(order, remaining, lunchIndex);
    if (dinnerIndex == null) return null;
    remaining[dinnerIndex]! -= 1;
    sequence.push({ day, mealType: "dinner", candidate: meals[dinnerIndex]! });

    // Rotate preference so we don't always pick meal 0 first.
    order.push(order.shift()!);
  }

  if (remaining.some((r) => r !== 0)) {
    // Fallback: greedily fill any leftover imbalance by swapping within days.
    return repairAssignmentCounts(meals, counts, coveredDays);
  }
  return sequence;
}

function pickNextIndex(
  order: number[],
  remaining: number[],
  exclude: number | null,
): number | null {
  for (const idx of order) {
    if (exclude != null && idx === exclude) continue;
    if ((remaining[idx] ?? 0) > 0) return idx;
  }
  // If only the excluded meal has remaining, allow collision as last resort.
  if (exclude != null && (remaining[exclude] ?? 0) > 0) return exclude;
  return null;
}

function repairAssignmentCounts(
  meals: RepertoireCandidate[],
  counts: number[],
  coveredDays: readonly DayOfWeek[],
): Array<{ day: DayOfWeek; mealType: "lunch" | "dinner"; candidate: RepertoireCandidate }> | null {
  // Simple pattern: A B / C D / A B / C D / A C / B D
  const ids = [0, 1, 2, 3] as const;
  const pattern: Array<[number, number]> = [
    [ids[0], ids[1]],
    [ids[2], ids[3]],
    [ids[0], ids[1]],
    [ids[2], ids[3]],
    [ids[0], ids[2]],
    [ids[1], ids[3]],
  ];
  if (meals.length !== 4 || coveredDays.length !== 6) return null;
  const used = [0, 0, 0, 0];
  const sequence: Array<{
    day: DayOfWeek;
    mealType: "lunch" | "dinner";
    candidate: RepertoireCandidate;
  }> = [];
  for (let d = 0; d < coveredDays.length; d += 1) {
    const [l, r] = pattern[d]!;
    used[l]! += 1;
    used[r]! += 1;
    sequence.push({ day: coveredDays[d]!, mealType: "lunch", candidate: meals[l]! });
    sequence.push({ day: coveredDays[d]!, mealType: "dinner", candidate: meals[r]! });
  }
  // Pattern yields 3 each — ignore requested counts when falling back.
  void counts;
  return sequence;
}

function buildCoreRepertoire(input: {
  meals: RepertoireCandidate[];
  days: RankedWeeklyDay[];
  coveredDays: readonly DayOfWeek[];
  flexibleDay: DayOfWeek;
}): CoreMealRepertoire {
  const coreMeals: CoreMeal[] = input.meals.map((meal) => {
    const candidateId = meal.ranked.candidate.candidateId;
    const slots: CoreMeal["mealInstanceSlots"] = [];
    for (const day of input.days) {
      if (day.lunch.candidateId === candidateId) {
        slots.push({ day: day.day, mealType: "lunch" });
      }
      if (day.dinner.candidateId === candidateId) {
        slots.push({ day: day.day, mealType: "dinner" });
      }
    }
    return {
      coreMealId: candidateId,
      candidateId,
      name: meal.concept?.name ?? meal.ranked.candidate.name,
      cuisineFamily: meal.ranked.candidate.cuisineFamily,
      mealForm: meal.ranked.candidate.dishFormat,
      proteinAnchor: meal.ranked.candidate.primaryProtein ?? undefined,
      flavorTags: meal.ranked.candidate.flavorFamilies.slice(0, 8),
      prepIntent: defaultPrepIntent(meal),
      fridgeLifeDays: inferFridgeLifeDays(meal),
      freezerFriendly: meal.ranked.candidate.mealPrepAdaptability === "fully_prepped",
      reheatingQuality:
        meal.ranked.candidate.mealPrepAdaptability === "fully_prepped"
          ? "excellent"
          : meal.ranked.candidate.mealPrepAdaptability === "component_prepped"
            ? "good"
            : "fair",
      mealInstanceSlots: slots,
      weeklyInstanceCount: slots.length,
    };
  });

  return {
    policyVersion: V1_MEAL_PREP_POLICY_VERSION,
    coreMeals,
    coveredDays: [...input.coveredDays],
    flexibleDay: input.flexibleDay,
    plannedLunchDinnerSlots: V1_PLANNED_LUNCH_DINNER_SLOTS,
  };
}

function toSlot(
  day: DayOfWeek,
  mealType: "lunch" | "dinner",
  candidate: RepertoireCandidate,
): RankedWeeklyMealSlot {
  return {
    day,
    mealType,
    candidateId: candidate.ranked.candidate.candidateId,
    name: candidate.concept?.name ?? candidate.ranked.candidate.name,
    prepIntent: defaultPrepIntent(candidate),
    lunchPreparationStrategy:
      mealType === "lunch" ? "independent_meal_prep" : undefined,
    planningReason: `V1 core meal assigned to ${day} ${mealType} from four-meal repertoire.`,
  };
}

function defaultPrepIntent(
  candidate: RepertoireCandidate,
): RankedWeeklyMealSlot["prepIntent"] {
  const adapt = candidate.ranked.candidate.mealPrepAdaptability;
  if (adapt === "fully_prepped") return "fully_prepped";
  if (adapt === "component_prepped") return "component_prepped";
  if (adapt === "quick_fresh_finish") return "quick_fresh_finish";
  return "fresh";
}

function inferFridgeLifeDays(candidate: RepertoireCandidate): number {
  const adapt = candidate.ranked.candidate.mealPrepAdaptability;
  if (adapt === "fully_prepped") return 4;
  if (adapt === "component_prepped") return 3;
  if (adapt === "quick_fresh_finish") return 2;
  return 1;
}

function combinations<T>(items: T[], k: number): T[][] {
  const result: T[][] = [];
  const n = items.length;
  const indices = Array.from({ length: k }, (_, i) => i);
  const push = () => result.push(indices.map((i) => items[i]!));
  push();
  while (true) {
    let i = k - 1;
    while (i >= 0 && indices[i] === i + n - k) i -= 1;
    if (i < 0) break;
    indices[i]! += 1;
    for (let j = i + 1; j < k; j += 1) {
      indices[j] = indices[j - 1]! + 1;
    }
    push();
  }
  return result;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Shared concept keys across a footprint set (diagnostics / variety acceptance). */
export function sharedIngredientKeys(footprints: IngredientFootprint[]): string[] {
  if (footprints.length === 0) return [];
  const sets = footprints.map(
    (f) => new Set(flattenFootprintConcepts(f).map((c) => c.conceptKey)),
  );
  const first = [...sets[0]!];
  return first.filter((key) => sets.every((s) => s.has(key)));
}
