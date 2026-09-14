import type {
  CulinaryDiscoveryCandidate,
  DayOfWeek,
  LunchPreparationStrategy,
  RankedCulinaryCandidate,
  RankedWeeklyAdjacentPair,
  RankedWeeklyDay,
  RankedWeeklyMealSlot,
  RankedWeeklyStrategy,
  RankedWeeklyStrategyQualityStats,
  RankedWeeklyStrategyRequest,
} from "@fitness-autopilot/contracts";
import {
  DayOfWeekSchema,
  LunchPreparationStrategySchema,
  MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK,
  MIN_RANKED_CANDIDATES_PER_MEAL_TYPE,
  PrepIntentSchema,
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  RankedWeeklyStrategyRequestSchema,
  WEEK_DAYS,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import {
  SIMILARITY_PENALTY_THRESHOLD,
  computeCandidateSimilarity,
} from "../recipes/candidate-ranking";

export {
  MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK,
  MIN_RANKED_CANDIDATES_PER_MEAL_TYPE,
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
};

/** Adjacent meals at or above PLAN-006's similarity-penalty threshold are "high similarity". */
export const ADJACENT_HIGH_SIMILARITY_THRESHOLD = SIMILARITY_PENALTY_THRESHOLD;

export type RankedWeeklyStrategyErrorCode =
  | "LLM_CONFIGURATION_ERROR"
  | "LLM_PROVIDER_ERROR"
  | "LLM_INVALID_STRUCTURED_OUTPUT"
  | "WEEKLY_STRATEGY_VALIDATION_FAILED"
  | "INVALID_WEEKLY_STRATEGY_REQUEST"
  | "INSUFFICIENT_CANDIDATES"
  | "INVALID_CANDIDATE_REFERENCE"
  | "INVALID_WEEK_STRUCTURE";

export type RankedWeeklyStrategyError = {
  code: RankedWeeklyStrategyErrorCode;
  message: string;
  details?: unknown;
};

/**
 * Provider-independent PLAN-007 weekly strategist.
 * One call produces seven lunches + seven dinners from ranked candidate IDs.
 * Must not invent dishes or call RecipeGenerator.
 */
export interface RankedWeeklyStrategyGenerator {
  generateRankedWeeklyStrategy(
    request: RankedWeeklyStrategyRequest,
  ): Promise<RankedWeeklyStrategy>;
}

export type RankedWeeklyStrategyPrompt = {
  version: typeof RANKED_WEEKLY_STRATEGY_PROMPT_VERSION;
  systemInstruction: string;
  userPrompt: string;
};

export type RankedWeeklyPlannerCandidate = {
  candidateId: string;
  name: string;
  rank: number;
  score: number;
  cuisineFamily: string;
  regionalStyle: string | null;
  primaryProtein: string | null;
  dishFormat: string;
  flavorFamilies: string[];
  cookingTechniques: string[];
  textureTags: string[];
  experienceTags: string[];
  mealPrepAdaptability: CulinaryDiscoveryCandidate["mealPrepAdaptability"];
  estimatedFinishMinutesAfterPrep: number | null;
  sourceName: string;
  fitnessAdaptability: CulinaryDiscoveryCandidate["fitnessAdaptability"];
};

type RankedWeeklyModelSlot = {
  candidateId: string;
  prepIntent: RankedWeeklyMealSlot["prepIntent"];
  lunchPreparationStrategy?: LunchPreparationStrategy;
  planningReason: string;
};

export type RankedWeeklyModelDay = {
  day: DayOfWeek;
  lunch: RankedWeeklyModelSlot;
  dinner: RankedWeeklyModelSlot;
};

export type RankedWeeklyModelPayload = {
  strategySummary: RankedWeeklyStrategy["strategySummary"];
  days: RankedWeeklyModelDay[];
};

const VARIETY_GUIDANCE: Record<
  RankedWeeklyStrategyRequest["foodPreferences"]["varietyLevel"],
  string
> = {
  simple: [
    "Favor more intentional repetition and fewer distinct cooking experiences.",
    "Prefer easier prep and strong likely ingredient/prep reuse.",
    "Still avoid absurd back-to-back identical meals unless the pool is tiny.",
  ].join(" "),
  balanced: [
    "Favor noticeable culinary variety with strategic repeats.",
    "Keep weekday prep complexity reasonable.",
    "Adjacent meals should generally feel like different flavor experiences.",
  ].join(" "),
  high: [
    "Favor more unique culinary experiences and less repetition.",
    "Spread cuisine, flavor, technique, and dish format more widely.",
    "Still respect cooking-style and finish-time constraints.",
  ].join(" "),
};

const COOKING_STYLE_GUIDANCE: Record<
  RankedWeeklyStrategyRequest["cookingPreferences"]["cookingStyle"],
  string
> = {
  mostly_ready:
    "Favor prepIntent=fully_prepped frequently. Fresh / quick_fresh_finish should generally be avoided.",
  ready_lunch_fresh_dinner: [
    "Lunch should generally be fully_prepped, component_prepped, or otherwise ready when needed.",
    "Dinner should generally be component_prepped or quick_fresh_finish, staying within maxFinishMinutes.",
    "This is a preference, not an absolute hard mapping.",
  ].join(" "),
  fresh_focused:
    "Favor prepIntent=component_prepped, quick_fresh_finish, or fresh more frequently. Respect maxFinishMinutes.",
};

export function rankedWeeklyStrategyError(
  code: RankedWeeklyStrategyErrorCode,
  message: string,
  details?: unknown,
): RankedWeeklyStrategyError {
  return details === undefined ? { code, message } : { code, message, details };
}

export function looksLikeRankedWeeklyStrategyRequest(input: unknown): boolean {
  return Boolean(
    input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      "lunchCandidates" in input &&
      "dinnerCandidates" in input,
  );
}

export function parseRankedWeeklyStrategyRequest(
  input: unknown,
): Result<RankedWeeklyStrategyRequest, RankedWeeklyStrategyError> {
  const parsed = RankedWeeklyStrategyRequestSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_WEEKLY_STRATEGY_REQUEST",
      message: parsed.error.issues[0]?.message ?? "Invalid ranked weekly strategy request.",
      details: parsed.error.flatten(),
    });
  }
  return ok(parsed.data);
}

export function compactRankedCandidateForPrompt(
  ranked: RankedCulinaryCandidate,
): RankedWeeklyPlannerCandidate {
  const { candidate } = ranked;
  return {
    candidateId: candidate.candidateId,
    name: candidate.name,
    rank: ranked.rank,
    score: ranked.score,
    cuisineFamily: candidate.cuisineFamily,
    regionalStyle: candidate.regionalStyle ?? null,
    primaryProtein: candidate.primaryProtein ?? null,
    dishFormat: candidate.dishFormat,
    flavorFamilies: [...candidate.flavorFamilies],
    cookingTechniques: [...candidate.cookingTechniques],
    textureTags: [...candidate.textureTags],
    experienceTags: [...candidate.experienceTags],
    mealPrepAdaptability: candidate.mealPrepAdaptability,
    estimatedFinishMinutesAfterPrep: candidate.estimatedFinishMinutesAfterPrep ?? null,
    sourceName: candidate.source.name,
    fitnessAdaptability: candidate.fitnessAdaptability,
  };
}

export function indexRankedCandidates(
  ranked: readonly RankedCulinaryCandidate[],
): Map<string, RankedCulinaryCandidate> {
  const index = new Map<string, RankedCulinaryCandidate>();
  for (const item of ranked) {
    if (!index.has(item.candidate.candidateId)) {
      index.set(item.candidate.candidateId, item);
    }
  }
  return index;
}

export function assertSufficientRankedCandidates(
  request: RankedWeeklyStrategyRequest,
): Result<true, RankedWeeklyStrategyError> {
  const lunchIds = indexRankedCandidates(request.lunchCandidates);
  const dinnerIds = indexRankedCandidates(request.dinnerCandidates);
  if (lunchIds.size < MIN_RANKED_CANDIDATES_PER_MEAL_TYPE) {
    return err({
      code: "INSUFFICIENT_CANDIDATES",
      message: `Need at least ${MIN_RANKED_CANDIDATES_PER_MEAL_TYPE} lunch candidate to build a week. Received ${lunchIds.size}.`,
      details: { mealType: "lunch", candidateCount: lunchIds.size },
    });
  }
  if (dinnerIds.size < MIN_RANKED_CANDIDATES_PER_MEAL_TYPE) {
    return err({
      code: "INSUFFICIENT_CANDIDATES",
      message: `Need at least ${MIN_RANKED_CANDIDATES_PER_MEAL_TYPE} dinner candidate to build a week. Received ${dinnerIds.size}.`,
      details: { mealType: "dinner", candidateCount: dinnerIds.size },
    });
  }
  return ok(true);
}

function listOrNone(values: readonly string[] | undefined): string {
  if (!values || values.length === 0) {
    return "(none specified)";
  }
  return values.join(", ");
}

function formatPrepSessionMinutes(
  minutes: RankedWeeklyStrategyRequest["cookingPreferences"]["maxPrepSessionMinutes"],
): string {
  if (minutes === null) {
    return "flexible";
  }
  return `${minutes}`;
}

function formatPlannerCandidates(ranked: readonly RankedCulinaryCandidate[]): string {
  return ranked
    .map((item) => JSON.stringify(compactRankedCandidateForPrompt(item)))
    .join("\n");
}

export function buildRankedWeeklyStrategyPrompt(
  request: RankedWeeklyStrategyRequest,
): RankedWeeklyStrategyPrompt {
  const { nutrition, foodPreferences, cookingPreferences } = request;
  const varietyNote = VARIETY_GUIDANCE[foodPreferences.varietyLevel];
  const cookingNote = COOKING_STYLE_GUIDANCE[cookingPreferences.cookingStyle];
  const leftoverPolicy = `Direct leftover lunches are rare. At most ${MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK} lunch slot(s) per week may use lunchPreparationStrategy=direct_leftover.`;

  const finishNote =
    cookingPreferences.maxFinishMinutes === 0
      ? "Prefer mostly-ready / reheatable preparation (0-minute finish)."
      : `When using prepIntent=fresh or quick_fresh_finish, estimatedFinishMinutesAfterPrep must stay within ${cookingPreferences.maxFinishMinutes} minutes.`;

  const dinnerPrepNote = cookingPreferences.useDinnerPrepForNextLunch
    ? [
        "When useful, use dinner cooking time to reduce work for tomorrow's DIFFERENT lunch (piggyback_prep).",
        "Piggyback prep is NOT same-food reuse. The lunch does not need to share cuisine or protein.",
        "Possible reuse: chopping, equipment, grains, herbs, aromatics, roasting time, prep surface, sauces where culinarily appropriate, idle cooking time.",
        leftoverPolicy,
        "Reuse prep effort aggressively; reuse finished flavor experiences sparingly.",
      ].join(" ")
    : [
        "useDinnerPrepForNextLunch is false.",
        "Do not use lunchPreparationStrategy piggyback_prep or direct_leftover.",
        "Every lunch must be independent_meal_prep.",
      ].join(" ");

  const recent =
    request.recentConcepts && request.recentConcepts.length > 0
      ? request.recentConcepts
          .map((concept) => `${concept.name}${concept.cuisineFamily ? ` (${concept.cuisineFamily})` : ""}`)
          .join("; ")
      : "(none)";

  const systemInstruction = [
    "You are Fitness Autopilot's weekly meal strategy planner (PLAN-007).",
    "Select and schedule meal concepts from the supplied ranked culinary candidate pools.",
    "Return structured JSON matching the schema. One week: Monday through Sunday.",
    "Plan ONLY lunch and dinner — 7 lunches + 7 dinners. Do not plan breakfast or snacks.",
    "",
    "Architecture:",
    "- PLAN-005 discovered these dishes. PLAN-006 ranked them. You select and schedule candidate IDs.",
    "- Discovery finds food. Ranking filters food. Weekly strategy selects food.",
    "- Do NOT invent recipes, original concepts, or unsupported dishes.",
    "- There is NO original_concept escape hatch. If the pools cannot support a valid week, the server will fail — do not invent.",
    "- Do NOT rename, healthify, or silently modify a selected candidate into a different dish.",
    "- Example: candidateId meen-pollichathu must remain Meen Pollichathu, not a 'Healthy Coconut Fish Bowl'.",
    "- The candidate ID is the culinary identity. Copy IDs exactly from the supplied pools.",
    "",
    "Meal-type pools:",
    "- Lunch slots MUST choose candidateId values from lunchCandidates only.",
    "- Dinner slots MUST choose candidateId values from dinnerCandidates only.",
    "- Do not cross pools. If the same candidate exists in both pools, it may be used in either pool it was supplied in.",
    "",
    "Week structure:",
    "- Exactly seven days: monday, tuesday, wednesday, thursday, friday, saturday, sunday.",
    "- Each day appears exactly once and has exactly one lunch and one dinner.",
    "",
    "Optimization objective:",
    "Build a week that feels culinarily varied and exciting while minimizing unnecessary prep complexity and making intelligent use of shared ingredients and prep work.",
    "Priorities, in order:",
    "1. candidate validity (only supplied IDs; never invent)",
    "2. user hard constraints (allergies, dietary restrictions)",
    "3. culinary variety (experience, not protein alone)",
    "4. cooking/prep compatibility",
    "5. intelligent repetition",
    "6. likely ingredient/prep reuse (conceptual only)",
    "7. candidate ranking preference (important prior, not the only objective)",
    "8. fitness adaptability",
    "",
    "Candidate rank behavior:",
    "- Prefer higher-ranked candidates when other considerations are similar.",
    "- Do NOT simply schedule rank #1, #2, #3 as the first meals of the week.",
    "- A rank #7 candidate may be better than rank #2 if #2 is redundant with meals already scheduled.",
    "- Trade off candidate quality vs whole-week variety vs prep compatibility vs repetition.",
    "",
    "Culinary variety:",
    `- varietyLevel=${foodPreferences.varietyLevel}: ${varietyNote}`,
    "- Variety is culinary experience: cuisineFamily, regionalStyle, flavorFamilies, cookingTechniques, dishFormat, textureTags, experienceTags, primaryProtein.",
    "- Protein change alone is not variety. Chicken Tikka / Paneer Tikka / Fish Tikka should not dominate a week.",
    "- Kerala Meen Pollichathu, Pescado Zarandeado, Pescado a la Veracruzana, and Cajun Blackened Fish MAY coexist — they are different culinary experiences despite all being fish.",
    "- Do NOT encode exact unique-recipe counts. 14 slots does NOT mean 14 unique dishes.",
    "- A balanced week may reasonably use roughly 8–10 unique meal concepts; this is guidance, not a quota.",
    "- Simple generally repeats more. High variety generally repeats less.",
    "",
    "Adjacent meal similarity:",
    "- Avoid highly similar culinary experiences next to one another.",
    "- The important window is Monday lunch → Monday dinner → Tuesday lunch, and so on.",
    "- Avoid sequences like Chicken Tikka → Paneer Tikka → Butter Chicken.",
    "- Prefer sequences like Andhra Green Chilli Chicken → Pescado a la Veracruzana → Tagliata di Manzo when the pools support it.",
    "- This is a planning objective, not a rigid cuisine-alternation algorithm.",
    "",
    "Intelligent repetition:",
    "- Repetition is allowed and desirable when it meal-preps well, saves work, and still preserves weekly variety.",
    "- Good: Andhra Green Chilli Chicken Monday lunch and Thursday lunch.",
    "- Bad: the same candidate Monday lunch, Monday dinner, and Tuesday lunch — unless varietyLevel is simple and the pool is tiny.",
    "- Repeated meals should generally be spaced apart.",
    "",
    "Cooking / prep:",
    `- cookingStyle=${cookingPreferences.cookingStyle}: ${cookingNote}`,
    `- ${finishNote}`,
    `- prepFrequency=${cookingPreferences.prepFrequency}; maxPrepSessionMinutes=${formatPrepSessionMinutes(cookingPreferences.maxPrepSessionMinutes)}.`,
    "- Keep weekday effort realistic. Do not invent an exact prep-session timeline.",
    "",
    "Lunch preparation strategy (lunch slots only):",
    `- useDinnerPrepForNextLunch=${cookingPreferences.useDinnerPrepForNextLunch}.`,
    `- ${dinnerPrepNote}`,
    "- independent_meal_prep: lunch is prepared separately during dedicated prep.",
    "- piggyback_prep: tomorrow's lunch is a DIFFERENT dish; some work is done while making dinner.",
    "- direct_leftover: dinner itself becomes tomorrow's lunch. Use sparingly. The lunch candidateId MUST equal the previous day's dinner candidateId.",
    "- Monday lunch has no previous dinner in this week — use independent_meal_prep.",
    "- Dinner slots must omit lunchPreparationStrategy.",
    "",
    "Ingredient reuse:",
    "- You do not have resolved ingredient lists. Speak only of likely ingredient/prep reuse.",
    "- Infer likely shared components from cuisine, dish identity, flavor families, and techniques.",
    "- Do not claim exact grocery optimization.",
    "",
    "Nutrition:",
    "- Daily calorie/macro targets are contextual guidance only (protein-forward, reasonable meal distribution).",
    "- Do NOT output calories, protein, carbs, fat, portion grams, or serving sizes for any meal.",
    "- Do NOT 'healthify' dishes to chase macros. Later stages verify nutrition after recipes exist.",
    "",
    "Hard constraints:",
    "- allergies and dietaryRestrictions are absolute exclusions.",
    "- Strongly avoid disliked foods.",
    "- Cuisine, protein, and experience preferences are soft ranking signals — not mandatory quotas.",
    "",
    "Do not include uniqueCandidateIds or metadata — the server calculates those.",
    `Prompt version: ${RANKED_WEEKLY_STRATEGY_PROMPT_VERSION}`,
  ].join("\n");

  const userPrompt = [
    "Generate a 7-day lunch+dinner weekly meal strategy by selecting supplied candidate IDs.",
    "",
    "Nutrition (qualitative / contextual only — not per-meal targets):",
    `targetCaloriesPerDay: ${nutrition.targetCaloriesPerDay}`,
    `targetProteinGramsPerDay: ${nutrition.targetProteinGramsPerDay}`,
    `targetCarbsGramsPerDay: ${nutrition.targetCarbsGramsPerDay ?? "(not specified)"}`,
    `targetFatGramsPerDay: ${nutrition.targetFatGramsPerDay ?? "(not specified)"}`,
    "",
    "Food preferences (PLAN-001):",
    `cuisines: ${listOrNone(foodPreferences.cuisines)}`,
    `proteinPreferences: ${listOrNone(foodPreferences.proteinPreferences)}`,
    `experiencePreferences: ${listOrNone(foodPreferences.experiencePreferences)}`,
    `allergies (hard exclude): ${listOrNone(foodPreferences.allergies)}`,
    `dietaryRestrictions (hard exclude): ${listOrNone(foodPreferences.dietaryRestrictions)}`,
    `dislikes (strongly avoid): ${listOrNone(foodPreferences.dislikes)}`,
    `varietyLevel: ${foodPreferences.varietyLevel}`,
    `varietyLevel guidance: ${varietyNote}`,
    "",
    "Cooking preferences (PLAN-002):",
    `prepFrequency: ${cookingPreferences.prepFrequency}`,
    `maxPrepSessionMinutes: ${formatPrepSessionMinutes(cookingPreferences.maxPrepSessionMinutes)}`,
    `cookingStyle: ${cookingPreferences.cookingStyle}`,
    `cookingStyle guidance: ${cookingNote}`,
    `maxFinishMinutes: ${cookingPreferences.maxFinishMinutes}`,
    `finish-time guidance: ${finishNote}`,
    `useDinnerPrepForNextLunch: ${cookingPreferences.useDinnerPrepForNextLunch}`,
    `dinner-prep guidance: ${dinnerPrepNote}`,
    "",
    `Recent meal concepts: ${recent}`,
    "",
    "Lunch candidates (choose lunch candidateId values only from this list):",
    formatPlannerCandidates(request.lunchCandidates),
    "",
    "Dinner candidates (choose dinner candidateId values only from this list):",
    formatPlannerCandidates(request.dinnerCandidates),
    "",
    "Return exactly seven days with lunch and dinner slots.",
    "Each slot: candidateId, prepIntent, planningReason; lunch may include lunchPreparationStrategy.",
    "Do not invent candidate IDs. Do not rename dishes. Do not output nutrition fields.",
  ].join("\n");

  return {
    version: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
    systemInstruction,
    userPrompt,
  };
}

export function collectRankedMealSlots(
  days: readonly RankedWeeklyDay[],
): RankedWeeklyMealSlot[] {
  const slots: RankedWeeklyMealSlot[] = [];
  for (const dayName of WEEK_DAYS) {
    const day = days.find((item) => item.day === dayName);
    if (!day) {
      continue;
    }
    slots.push(day.lunch, day.dinner);
  }
  return slots;
}

export function collectAdjacentMealPairs(
  days: readonly RankedWeeklyDay[],
): Array<{ left: RankedWeeklyMealSlot; right: RankedWeeklyMealSlot }> {
  const slots = collectRankedMealSlots(days);
  const pairs: Array<{ left: RankedWeeklyMealSlot; right: RankedWeeklyMealSlot }> = [];
  for (let i = 0; i < slots.length - 1; i += 1) {
    const left = slots[i];
    const right = slots[i + 1];
    if (left && right) {
      pairs.push({ left, right });
    }
  }
  return pairs;
}

function lookupCandidate(
  pool: Map<string, RankedCulinaryCandidate>,
  candidateId: string,
): CulinaryDiscoveryCandidate | undefined {
  return pool.get(candidateId)?.candidate;
}

function resolveCandidateForSlot(
  slot: RankedWeeklyMealSlot,
  lunchPool: Map<string, RankedCulinaryCandidate>,
  dinnerPool: Map<string, RankedCulinaryCandidate>,
): CulinaryDiscoveryCandidate | undefined {
  if (slot.mealType === "lunch") {
    return lookupCandidate(lunchPool, slot.candidateId);
  }
  return lookupCandidate(dinnerPool, slot.candidateId);
}

export function calculateRankedWeeklyStrategyQualityStats(
  strategy: RankedWeeklyStrategy,
  request: RankedWeeklyStrategyRequest,
): RankedWeeklyStrategyQualityStats {
  const lunchPool = indexRankedCandidates(request.lunchCandidates);
  const dinnerPool = indexRankedCandidates(request.dinnerCandidates);
  const slots = collectRankedMealSlots(strategy.days);
  const uniqueIds = [...new Set(slots.map((slot) => slot.candidateId))];

  const cuisines = new Set<string>();
  const proteins = new Set<string>();
  const flavors = new Set<string>();
  const ranks: number[] = [];
  const usage = new Map<
    string,
    { candidateId: string; name: string; count: number; mealTypes: Set<"lunch" | "dinner"> }
  >();

  for (const slot of slots) {
    const candidate = resolveCandidateForSlot(slot, lunchPool, dinnerPool);
    if (candidate) {
      cuisines.add(candidate.cuisineFamily);
      if (candidate.primaryProtein) {
        proteins.add(candidate.primaryProtein);
      }
      for (const flavor of candidate.flavorFamilies) {
        flavors.add(flavor);
      }
    }
    const ranked =
      slot.mealType === "lunch"
        ? lunchPool.get(slot.candidateId)
        : dinnerPool.get(slot.candidateId);
    if (ranked) {
      ranks.push(ranked.rank);
    }
    const existing = usage.get(slot.candidateId) ?? {
      candidateId: slot.candidateId,
      name: slot.name,
      count: 0,
      mealTypes: new Set<"lunch" | "dinner">(),
    };
    existing.count += 1;
    existing.mealTypes.add(slot.mealType);
    usage.set(slot.candidateId, existing);
  }

  let directLeftoverLunchCount = 0;
  let piggybackLunchCount = 0;
  let independentLunchCount = 0;
  for (const slot of slots) {
    if (slot.mealType !== "lunch") {
      continue;
    }
    const prep = slot.lunchPreparationStrategy ?? "independent_meal_prep";
    if (prep === "direct_leftover") {
      directLeftoverLunchCount += 1;
    } else if (prep === "piggyback_prep") {
      piggybackLunchCount += 1;
    } else {
      independentLunchCount += 1;
    }
  }

  const adjacentPairs = collectAdjacentMealPairs(strategy.days);
  let adjacentSameCandidateCount = 0;
  let adjacentSameCuisineCount = 0;
  let adjacentHighSimilarityCount = 0;
  let maxAdjacentSimilarity = 0;
  let worstAdjacentPair: RankedWeeklyAdjacentPair | undefined;

  for (const pair of adjacentPairs) {
    const leftCandidate = resolveCandidateForSlot(pair.left, lunchPool, dinnerPool);
    const rightCandidate = resolveCandidateForSlot(pair.right, lunchPool, dinnerPool);
    const sameCandidate = pair.left.candidateId === pair.right.candidateId;
    if (sameCandidate) {
      adjacentSameCandidateCount += 1;
    }
    const sameCuisine = Boolean(
      leftCandidate &&
        rightCandidate &&
        leftCandidate.cuisineFamily === rightCandidate.cuisineFamily,
    );
    if (sameCuisine) {
      adjacentSameCuisineCount += 1;
    }

    let similarity = 0;
    if (leftCandidate && rightCandidate) {
      similarity = computeCandidateSimilarity(leftCandidate, rightCandidate).score;
    } else if (sameCandidate) {
      similarity = 1;
    }
    if (similarity >= ADJACENT_HIGH_SIMILARITY_THRESHOLD) {
      adjacentHighSimilarityCount += 1;
    }
    if (similarity > maxAdjacentSimilarity) {
      maxAdjacentSimilarity = similarity;
      worstAdjacentPair = {
        left: pair.left,
        right: pair.right,
        similarity,
        sameCandidate,
        sameCuisine,
      };
    }
  }

  const candidateUsage = [...usage.values()]
    .map((item) => ({
      candidateId: item.candidateId,
      name: item.name,
      count: item.count,
      mealTypes: [...item.mealTypes],
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.candidateId.localeCompare(b.candidateId);
    });

  return {
    totalMealSlots: slots.length,
    uniqueCandidateCount: uniqueIds.length,
    repeatedMealSlotCount: Math.max(0, slots.length - uniqueIds.length),
    uniqueCuisineCount: cuisines.size,
    uniqueProteinCount: proteins.size,
    uniqueFlavorFamilyCount: flavors.size,
    directLeftoverLunchCount,
    piggybackLunchCount,
    independentLunchCount,
    adjacentSameCandidateCount,
    adjacentSameCuisineCount,
    adjacentHighSimilarityCount,
    maxAdjacentSimilarity,
    averageCandidateRank:
      ranks.length === 0
        ? undefined
        : Math.round((ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length) * 100) / 100,
    candidateUsage,
    ...(worstAdjacentPair ? { worstAdjacentPair } : {}),
  };
}

function previousDay(day: DayOfWeek): DayOfWeek | null {
  const index = WEEK_DAYS.indexOf(day);
  if (index <= 0) {
    return null;
  }
  return WEEK_DAYS[index - 1] ?? null;
}

function isFinishPrepIntent(prepIntent: RankedWeeklyMealSlot["prepIntent"]): boolean {
  return prepIntent === "fresh" || prepIntent === "quick_fresh_finish";
}

function hydrateSlot(input: {
  day: DayOfWeek;
  mealType: "lunch" | "dinner";
  raw: RankedWeeklyModelSlot;
  ranked: RankedCulinaryCandidate;
}): RankedWeeklyMealSlot {
  const slot: RankedWeeklyMealSlot = {
    day: input.day,
    mealType: input.mealType,
    candidateId: input.ranked.candidate.candidateId,
    name: input.ranked.candidate.name,
    prepIntent: input.raw.prepIntent,
    planningReason: input.raw.planningReason,
  };
  if (input.mealType === "lunch") {
    slot.lunchPreparationStrategy =
      input.raw.lunchPreparationStrategy ?? "independent_meal_prep";
  }
  return slot;
}

function parseModelPayload(input: unknown): Result<RankedWeeklyModelPayload, RankedWeeklyStrategyError> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return err({
      code: "WEEKLY_STRATEGY_VALIDATION_FAILED",
      message: "Weekly strategy payload must be an object.",
    });
  }
  const record = input as Record<string, unknown>;
  const summary = record.strategySummary;
  if (summary === null || typeof summary !== "object" || Array.isArray(summary)) {
    return err({
      code: "WEEKLY_STRATEGY_VALIDATION_FAILED",
      message: "strategySummary is required.",
    });
  }
  const summaryRecord = summary as Record<string, unknown>;
  const varietyApproach =
    typeof summaryRecord.varietyApproach === "string" ? summaryRecord.varietyApproach.trim() : "";
  const prepApproach =
    typeof summaryRecord.prepApproach === "string" ? summaryRecord.prepApproach.trim() : "";
  const ingredientReuseApproach =
    typeof summaryRecord.ingredientReuseApproach === "string"
      ? summaryRecord.ingredientReuseApproach.trim()
      : "";
  if (!varietyApproach || !prepApproach || !ingredientReuseApproach) {
    return err({
      code: "WEEKLY_STRATEGY_VALIDATION_FAILED",
      message: "strategySummary must include varietyApproach, prepApproach, and ingredientReuseApproach.",
    });
  }

  if (!Array.isArray(record.days)) {
    return err({
      code: "INVALID_WEEK_STRUCTURE",
      message: "Expected exactly 7 days.",
    });
  }
  if (record.days.length !== 7) {
    return err({
      code: "INVALID_WEEK_STRUCTURE",
      message: `Expected exactly 7 days, received ${record.days.length}.`,
    });
  }

  const days: RankedWeeklyModelDay[] = [];
  for (const rawDay of record.days) {
    if (rawDay === null || typeof rawDay !== "object" || Array.isArray(rawDay)) {
      return err({
        code: "INVALID_WEEK_STRUCTURE",
        message: "Each day must be an object with lunch and dinner.",
      });
    }
    const dayRecord = rawDay as Record<string, unknown>;
    const dayParsed = DayOfWeekSchema.safeParse(dayRecord.day);
    if (!dayParsed.success) {
      return err({
        code: "INVALID_WEEK_STRUCTURE",
        message: `Invalid day value: ${String(dayRecord.day)}.`,
      });
    }
    const lunch = parseModelSlot(dayRecord.lunch, "lunch");
    if (!lunch.ok) {
      return lunch;
    }
    const dinner = parseModelSlot(dayRecord.dinner, "dinner");
    if (!dinner.ok) {
      return dinner;
    }
    days.push({
      day: dayParsed.data,
      lunch: lunch.value,
      dinner: dinner.value,
    });
  }

  return ok({
    strategySummary: {
      varietyApproach,
      prepApproach,
      ingredientReuseApproach,
    },
    days,
  });
}

function parseModelSlot(
  input: unknown,
  mealType: "lunch" | "dinner",
): Result<RankedWeeklyModelSlot, RankedWeeklyStrategyError> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return err({
      code: "INVALID_WEEK_STRUCTURE",
      message: `Each day must include a ${mealType} slot.`,
    });
  }
  const record = input as Record<string, unknown>;
  const candidateId =
    typeof record.candidateId === "string" ? record.candidateId.trim() : "";
  if (!candidateId) {
    return err({
      code: "INVALID_CANDIDATE_REFERENCE",
      message: `${mealType} slot is missing candidateId.`,
    });
  }
  const prepParsed = PrepIntentSchema.safeParse(record.prepIntent);
  if (!prepParsed.success) {
    return err({
      code: "INVALID_WEEK_STRUCTURE",
      message: `Invalid prep intent on ${mealType}.`,
    });
  }
  const planningReason =
    typeof record.planningReason === "string" ? record.planningReason.trim() : "";
  if (!planningReason) {
    return err({
      code: "INVALID_WEEK_STRUCTURE",
      message: `${mealType} slot is missing planningReason.`,
    });
  }
  const slot: RankedWeeklyModelSlot = {
    candidateId,
    prepIntent: prepParsed.data,
    planningReason,
  };
  if (record.lunchPreparationStrategy !== undefined) {
    if (mealType === "dinner") {
      return err({
        code: "INVALID_WEEK_STRUCTURE",
        message: "Dinner slots must not include lunchPreparationStrategy.",
      });
    }
    const prepStrategy = LunchPreparationStrategySchema.safeParse(
      record.lunchPreparationStrategy,
    );
    if (!prepStrategy.success) {
      return err({
        code: "INVALID_WEEK_STRUCTURE",
        message: "Invalid lunchPreparationStrategy.",
      });
    }
    slot.lunchPreparationStrategy = prepStrategy.data;
  }
  return ok(slot);
}

function validateHydratedWeek(
  days: readonly RankedWeeklyDay[],
  request: RankedWeeklyStrategyRequest,
): RankedWeeklyStrategyError | null {
  const lunchPool = indexRankedCandidates(request.lunchCandidates);
  const dinnerPool = indexRankedCandidates(request.dinnerCandidates);
  const seenDays = new Set<string>();

  if (days.length !== 7) {
    return rankedWeeklyStrategyError(
      "INVALID_WEEK_STRUCTURE",
      `Expected exactly 7 days, received ${days.length}.`,
    );
  }

  for (const required of WEEK_DAYS) {
    if (!days.some((day) => day.day === required)) {
      return rankedWeeklyStrategyError("INVALID_WEEK_STRUCTURE", `Missing day: ${required}.`);
    }
  }

  let directLeftovers = 0;
  const byDay = new Map(days.map((day) => [day.day, day]));

  for (const day of days) {
    if (seenDays.has(day.day)) {
      return rankedWeeklyStrategyError("INVALID_WEEK_STRUCTURE", `Duplicate day: ${day.day}.`);
    }
    seenDays.add(day.day);

    if (day.lunch.mealType !== "lunch" || day.dinner.mealType !== "dinner") {
      return rankedWeeklyStrategyError(
        "INVALID_WEEK_STRUCTURE",
        `Day ${day.day} has mismatched meal types.`,
      );
    }
    if (day.lunch.day !== day.day || day.dinner.day !== day.day) {
      return rankedWeeklyStrategyError(
        "INVALID_WEEK_STRUCTURE",
        `Day ${day.day} slots must reference the same day.`,
      );
    }

    if (!lunchPool.has(day.lunch.candidateId)) {
      const inDinner = dinnerPool.has(day.lunch.candidateId);
      return rankedWeeklyStrategyError(
        "INVALID_CANDIDATE_REFERENCE",
        inDinner
          ? `Lunch candidate "${day.lunch.candidateId}" is not in the lunch pool.`
          : `Unknown lunch candidate "${day.lunch.candidateId}".`,
        { candidateId: day.lunch.candidateId, mealType: "lunch" },
      );
    }
    if (!dinnerPool.has(day.dinner.candidateId)) {
      const inLunch = lunchPool.has(day.dinner.candidateId);
      return rankedWeeklyStrategyError(
        "INVALID_CANDIDATE_REFERENCE",
        inLunch
          ? `Dinner candidate "${day.dinner.candidateId}" is not in the dinner pool.`
          : `Unknown dinner candidate "${day.dinner.candidateId}".`,
        { candidateId: day.dinner.candidateId, mealType: "dinner" },
      );
    }

    const lunchRanked = lunchPool.get(day.lunch.candidateId);
    const dinnerRanked = dinnerPool.get(day.dinner.candidateId);
    if (lunchRanked && day.lunch.name !== lunchRanked.candidate.name) {
      return rankedWeeklyStrategyError(
        "INVALID_CANDIDATE_REFERENCE",
        `Lunch candidate "${day.lunch.candidateId}" must keep culinary identity "${lunchRanked.candidate.name}".`,
      );
    }
    if (dinnerRanked && day.dinner.name !== dinnerRanked.candidate.name) {
      return rankedWeeklyStrategyError(
        "INVALID_CANDIDATE_REFERENCE",
        `Dinner candidate "${day.dinner.candidateId}" must keep culinary identity "${dinnerRanked.candidate.name}".`,
      );
    }

    const lunchPrep = day.lunch.lunchPreparationStrategy ?? "independent_meal_prep";
    if (lunchPrep === "direct_leftover") {
      directLeftovers += 1;
    }

    if (!request.cookingPreferences.useDinnerPrepForNextLunch) {
      if (lunchPrep === "piggyback_prep" || lunchPrep === "direct_leftover") {
        return rankedWeeklyStrategyError(
          "INVALID_WEEK_STRUCTURE",
          "piggyback_prep and direct_leftover are not allowed when useDinnerPrepForNextLunch is false.",
        );
      }
    }

    const previous = previousDay(day.day);
    if (!previous && (lunchPrep === "piggyback_prep" || lunchPrep === "direct_leftover")) {
      return rankedWeeklyStrategyError(
        "INVALID_WEEK_STRUCTURE",
        "Monday lunch cannot use piggyback_prep or direct_leftover because there is no previous dinner in this week.",
      );
    }
    if (lunchPrep === "direct_leftover" && previous) {
      const previousDinner = byDay.get(previous)?.dinner;
      if (!previousDinner || previousDinner.candidateId !== day.lunch.candidateId) {
        return rankedWeeklyStrategyError(
          "INVALID_WEEK_STRUCTURE",
          `direct_leftover lunch on ${day.day} must reuse the previous day's dinner candidate.`,
        );
      }
    }

    const maxFinish = request.cookingPreferences.maxFinishMinutes;
    const lunchMinutes = lunchRanked?.candidate.estimatedFinishMinutesAfterPrep;
    if (
      isFinishPrepIntent(day.lunch.prepIntent) &&
      typeof lunchMinutes === "number" &&
      lunchMinutes > maxFinish
    ) {
      return rankedWeeklyStrategyError(
        "INVALID_WEEK_STRUCTURE",
        `Lunch "${day.lunch.name}" finish time ${lunchMinutes} minutes exceeds maxFinishMinutes ${maxFinish}.`,
      );
    }
    const dinnerMinutes = dinnerRanked?.candidate.estimatedFinishMinutesAfterPrep;
    if (
      isFinishPrepIntent(day.dinner.prepIntent) &&
      typeof dinnerMinutes === "number" &&
      dinnerMinutes > maxFinish
    ) {
      return rankedWeeklyStrategyError(
        "INVALID_WEEK_STRUCTURE",
        `Dinner "${day.dinner.name}" finish time ${dinnerMinutes} minutes exceeds maxFinishMinutes ${maxFinish}.`,
      );
    }
  }

  if (directLeftovers > MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK) {
    return rankedWeeklyStrategyError(
      "INVALID_WEEK_STRUCTURE",
      `At most ${MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK} direct leftover lunch(es) are allowed per week (received ${directLeftovers}).`,
    );
  }

  return null;
}

export function hydrateRankedWeeklyStrategy(
  payload: RankedWeeklyModelPayload,
  request: RankedWeeklyStrategyRequest,
  metadata: RankedWeeklyStrategy["metadata"],
): Result<RankedWeeklyStrategy, RankedWeeklyStrategyError> {
  const lunchPool = indexRankedCandidates(request.lunchCandidates);
  const dinnerPool = indexRankedCandidates(request.dinnerCandidates);
  const days: RankedWeeklyDay[] = payload.days.map((day) => {
    const lunchRanked = lunchPool.get(day.lunch.candidateId);
    const dinnerRanked = dinnerPool.get(day.dinner.candidateId);
    return {
      day: day.day,
      lunch: lunchRanked
        ? hydrateSlot({
            day: day.day,
            mealType: "lunch",
            raw: day.lunch,
            ranked: lunchRanked,
          })
        : {
            day: day.day,
            mealType: "lunch" as const,
            candidateId: day.lunch.candidateId,
            name: day.lunch.candidateId,
            prepIntent: day.lunch.prepIntent,
            lunchPreparationStrategy:
              day.lunch.lunchPreparationStrategy ?? "independent_meal_prep",
            planningReason: day.lunch.planningReason,
          },
      dinner: dinnerRanked
        ? hydrateSlot({
            day: day.day,
            mealType: "dinner",
            raw: day.dinner,
            ranked: dinnerRanked,
          })
        : {
            day: day.day,
            mealType: "dinner" as const,
            candidateId: day.dinner.candidateId,
            name: day.dinner.candidateId,
            prepIntent: day.dinner.prepIntent,
            planningReason: day.dinner.planningReason,
          },
    };
  });

  const structureError = validateHydratedWeek(days, request);
  if (structureError) {
    return err(structureError);
  }

  const uniqueCandidateIds = [
    ...new Set(collectRankedMealSlots(days).map((slot) => slot.candidateId)),
  ];

  return ok({
    days,
    uniqueCandidateIds,
    strategySummary: payload.strategySummary,
    metadata,
  });
}

export function validateRankedWeeklyStrategy(
  input: unknown,
  request: RankedWeeklyStrategyRequest,
  metadata: RankedWeeklyStrategy["metadata"],
): Result<RankedWeeklyStrategy, RankedWeeklyStrategyError> {
  const sufficient = assertSufficientRankedCandidates(request);
  if (!sufficient.ok) {
    return sufficient;
  }
  const parsed = parseModelPayload(input);
  if (!parsed.ok) {
    return parsed;
  }
  return hydrateRankedWeeklyStrategy(parsed.value, request, metadata);
}
