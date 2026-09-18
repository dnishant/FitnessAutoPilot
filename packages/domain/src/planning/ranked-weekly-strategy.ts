import type {
  CulinaryDiscoveryCandidate,
  DayOfWeek,
  LunchPreparationStrategy,
  MealConcept,
  RankedCulinaryCandidate,
  RankedWeeklyAdjacentPair,
  RankedWeeklyDay,
  RankedWeeklyMealSlot,
  RankedWeeklyStrategy,
  RankedWeeklyStrategyQualityStats,
  RankedWeeklyStrategyRequest,
  VarietyComplexityPolicy,
  WeeklyComplexityStatus,
} from "@fitness-autopilot/contracts";
import {
  DayOfWeekSchema,
  LunchPreparationStrategySchema,
  MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK,
  MIN_RANKED_CANDIDATES_PER_MEAL_TYPE,
  PrepIntentSchema,
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  RankedWeeklyStrategyRequestSchema,
  WEEKLY_VARIETY_COMPLEXITY_POLICY,
  WEEK_DAYS,
  getWeeklyVarietyComplexityPolicy,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import {
  SIMILARITY_PENALTY_THRESHOLD,
  computeCandidateSimilarity,
} from "../recipes/candidate-ranking";
import {
  formatComponentReuseForPrompt,
  summarizeMealConceptRepertoire,
} from "../meal-composition/repertoire";

export {
  MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK,
  MIN_RANKED_CANDIDATES_PER_MEAL_TYPE,
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  WEEKLY_VARIETY_COMPLEXITY_POLICY,
  getWeeklyVarietyComplexityPolicy,
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
  | "INVALID_WEEK_STRUCTURE"
  | "EXCESSIVE_WEEKLY_COMPLEXITY";

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
  mealConcept?: {
    plate: string[];
    components: Array<{
      role: string;
      name: string;
      relationship: string;
      source: string;
      definitionKind: string;
    }>;
    compositionProfile: MealConcept["compositionProfile"];
  };
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
    "Prioritize prep efficiency heavily.",
    "Use strong strategic repetition.",
    "Prefer a small number of reliable meals repeated across the week.",
    "Avoid unnecessary new cooking workflows.",
    "Preferred unique candidates for 14 lunch+dinner slots: roughly 5–7 (hard max 8).",
  ].join(" "),
  balanced: [
    "Create noticeable variety without requiring a different recipe for nearly every meal.",
    "Prefer strategic repetition.",
    "Repeat strong meal-prep-friendly dishes when appropriate.",
    "Space repeats apart when possible.",
    "Do not introduce a new candidate merely to increase variety.",
    "Prefer an intentional repeat over another independent recipe when both would be equally satisfying.",
    "Preferred unique candidates for 14 lunch+dinner slots: roughly 7–9 (hard max 10).",
  ].join(" "),
  high: [
    "Allow more unique culinary experiences and less repetition.",
    "Accept somewhat higher weekly prep complexity in exchange for variety,",
    "while still avoiding obviously impractical planning.",
    "Preferred unique candidates for 14 lunch+dinner slots: roughly 9–12 (hard max 13).",
  ].join(" "),
};

const PREP_FREQUENCY_GUIDANCE: Record<
  RankedWeeklyStrategyRequest["cookingPreferences"]["prepFrequency"],
  string
> = {
  once_weekly: [
    "Strongly favor batch-friendly lunches, repeated prepared meals,",
    "component reuse, and fewer independent recipes.",
    "The user primarily meal preps once per week — weekly cooking complexity must stay realistic.",
  ].join(" "),
  twice_weekly: [
    "Allow somewhat more unique dishes and fresher second-half meals than once-weekly prep,",
    "while still preferring strategic repetition over a tasting-menu week.",
  ].join(" "),
  throughout_week: [
    "Permit more variety because cooking is intentionally distributed through the week,",
    "but still avoid obviously impractical independent-prep overload.",
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
  mealConcept?: MealConcept,
): RankedWeeklyPlannerCandidate {
  const { candidate } = ranked;
  const compacted: RankedWeeklyPlannerCandidate = {
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
  if (mealConcept) {
    compacted.mealConcept = {
      plate: [mealConcept.main.name, ...mealConcept.components.map((c) => c.name)],
      components: mealConcept.components.map((c) => ({
        role: c.role,
        name: c.name,
        relationship: c.relationship,
        source: c.source,
        definitionKind: c.definitionKind,
      })),
      compositionProfile: mealConcept.compositionProfile,
    };
  }
  return compacted;
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

function formatPlannerCandidates(
  ranked: readonly RankedCulinaryCandidate[],
  mealConceptsByCandidateId?: Record<string, MealConcept>,
): string {
  return ranked
    .map((item) =>
      JSON.stringify(
        compactRankedCandidateForPrompt(
          item,
          mealConceptsByCandidateId?.[item.candidate.candidateId],
        ),
      ),
    )
    .join("\n");
}

function formatComplexityPolicy(policy: VarietyComplexityPolicy): string {
  return [
    `preferred unique candidates ≈ ${policy.minPreferredUniqueCandidates}–${policy.maxPreferredUniqueCandidates}`,
    `hard max unique candidates = ${policy.maxHardUniqueCandidates}`,
    `soft lunch unique ≈ ${policy.minPreferredUniqueLunchCandidates}–${policy.maxPreferredUniqueLunchCandidates}`,
    `soft dinner unique ≈ ${policy.minPreferredUniqueDinnerCandidates}–${policy.maxPreferredUniqueDinnerCandidates}`,
  ].join("; ");
}

export function buildRankedWeeklyStrategyPrompt(
  request: RankedWeeklyStrategyRequest,
): RankedWeeklyStrategyPrompt {
  const { nutrition, foodPreferences, cookingPreferences } = request;
  const varietyLevel = foodPreferences.varietyLevel;
  const policy = getWeeklyVarietyComplexityPolicy(varietyLevel);
  const varietyNote = VARIETY_GUIDANCE[varietyLevel];
  const cookingNote = COOKING_STYLE_GUIDANCE[cookingPreferences.cookingStyle];
  const prepFrequencyNote = PREP_FREQUENCY_GUIDANCE[cookingPreferences.prepFrequency];
  const leftoverPolicy = `Direct leftover lunches are rare. At most ${MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK} lunch slot(s) per week may use lunchPreparationStrategy=direct_leftover. Do not encourage direct leftovers merely to meet complexity targets — strategic repeats scheduled independently are preferable when appropriate.`;

  const finishNote =
    cookingPreferences.maxFinishMinutes === 0
      ? "Prefer mostly-ready / reheatable preparation (0-minute finish)."
      : `When using prepIntent=fresh or quick_fresh_finish, estimatedFinishMinutesAfterPrep must stay within ${cookingPreferences.maxFinishMinutes} minutes.`;

  const dinnerPrepNote = [
    "Shared prep across the weekly schedule is an AUTOMATIC optimization opportunity — not a user permission flag.",
    "The planner may use independent prep, shared component prep, piggyback prep, batch prep, direct leftovers, or fresh finish",
    "across any meals in the week when beneficial (not only previous-dinner → next-lunch).",
    "Use piggyback_prep ONLY when candidate metadata provides a concrete and plausible shared prep dependency.",
    "Strong evidence: same batch-cooked protein, same grain/base, same roasted vegetable batch, same sauce or marinade base,",
    "clearly shared chopped aromatics/herbs in meaningful quantity, or a meaningful shared cooking process that actually removes prep work.",
    "Weak evidence is NOT sufficient: both use herbs/chili/onions/a knife/a skillet, prep can happen 'at the same time', or generic shared kitchen equipment.",
    "Default to independent_meal_prep unless there is a real efficiency opportunity.",
    "When uncertain, use independent_meal_prep. Do NOT invent prep dependencies.",
    "Do not maximize piggyback usage. For a Balanced once-weekly-prep week, expect roughly 0–3 genuine piggyback lunches.",
    "A plan with zero piggyback lunches can still be excellent.",
    leftoverPolicy,
  ].join(" ");

  const lunchDinnerSplitNote =
    cookingPreferences.cookingStyle === "ready_lunch_fresh_dinner"
      ? [
          "Lunch is the primary batch-prep meal. Dinner is where more freshness and variety should generally occur.",
          `For ${varietyLevel}: prefer roughly ${policy.minPreferredUniqueLunchCandidates}–${policy.maxPreferredUniqueLunchCandidates} unique lunch candidates`,
          `and roughly ${policy.minPreferredUniqueDinnerCandidates}–${policy.maxPreferredUniqueDinnerCandidates} unique dinner candidates.`,
          "These are soft planning targets — do not force exact counts if pools or preferences make another result clearly better.",
        ].join(" ")
      : "Match prepIntent patterns to the cooking style while still minimizing unnecessary weekly complexity.";

  const recent =
    request.recentConcepts && request.recentConcepts.length > 0
      ? request.recentConcepts
          .map((concept) => `${concept.name}${concept.cuisineFamily ? ` (${concept.cuisineFamily})` : ""}`)
          .join("; ")
      : "(none)";

  const lunchRepertoireNote =
    cookingPreferences.cookingStyle === "ready_lunch_fresh_dinner"
      ? [
          "LUNCH REPERTOIRE:",
          "For ready_lunch_fresh_dinner, lunches should carry more repetition than dinners.",
          "When choosing recurring lunch candidates, strongly prefer:",
          "1. fully_prepped",
          "2. component_prepped",
          "Use quick_fresh_finish lunches occasionally when they meaningfully improve the week.",
          "Do not fill the lunch schedule with seven different dishes simply because each is individually quick to cook.",
          "A batch-friendly lunch repeated twice is usually better than adding another independent lunch workflow.",
          "Preserve dinner freshness: dinners may have somewhat more variety than lunches,",
          "but still stay inside the overall hard unique maximum.",
        ].join(" ")
      : "";

  const repertoireSplitNote =
    cookingPreferences.cookingStyle === "ready_lunch_fresh_dinner"
      ? [
          `For ready_lunch_fresh_dinner + ${varietyLevel}:`,
          `Lunch repertoire: prefer approximately ${policy.minPreferredUniqueLunchCandidates}–${policy.maxPreferredUniqueLunchCandidates} unique lunch candidates.`,
          `Dinner repertoire: prefer approximately ${policy.minPreferredUniqueDinnerCandidates}–${policy.maxPreferredUniqueDinnerCandidates} unique dinner candidates.`,
        ].join(" ")
      : "Choose a compact repertoire that matches the cooking style while staying within the hard unique maximum.";

  const systemInstruction = [
    "You are Fitness Autopilot's weekly meal strategy planner (PLAN-007 / PLAN-007.1).",
    "Select and schedule meal concepts from the supplied ranked culinary candidate pools.",
    "Return structured JSON matching the schema. One week: Monday through Sunday.",
    "Plan ONLY lunch and dinner — 7 lunches + 7 dinners. Do not plan breakfast or snacks.",
    "",
    "Architecture:",
    "- PLAN-005 discovered these dishes (broad, exciting pool).",
    "- PLAN-006 ranked and removed redundant candidates.",
    "- Lightweight meal composition described the complete plate for each unique ranked candidate (names/roles only).",
    "- You choose and schedule candidate IDs into an operationally practical week, using those complete-meal concepts.",
    "- Detailed recipes, USDA nutrition, and portions are resolved later — and only for selected meals.",
    "- The candidate pool SHOULD be more diverse than the actual week. Do not schedule nearly every candidate.",
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
    "PRIMARY PLANNING OBJECTIVE:",
    "Build the most practical meal-prep week that still feels varied, delicious, and worth eating.",
    "Minimize weekly cooking and prep complexity while satisfying the user's desired variety level.",
    "Variety is a constraint to prevent boredom, not something to maximize.",
    "Every additional unique dish has a weekly complexity cost.",
    "",
    "WEEKLY REPERTOIRE FIRST:",
    "Do not choose meals independently one slot at a time.",
    "Before assigning Monday–Sunday meals, first mentally choose a compact weekly repertoire from the supplied candidate pools.",
    `For ${varietyLevel}: prefer ${policy.minPreferredUniqueCandidates}–${policy.maxPreferredUniqueCandidates} unique candidates overall.`,
    `Absolute hard maximum: ${policy.maxHardUniqueCandidates} unique candidates.`,
    "The hard maximum is not guidance. A strategy above the hard maximum is INVALID and will be rejected by the server.",
    repertoireSplitNote,
    "Once the repertoire provides sufficient culinary variety, stop adding new dishes.",
    "Then schedule ONLY from that chosen repertoire across all 14 meal slots.",
    "Repeating a repertoire member is usually preferable to introducing another independent recipe merely for novelty.",
    "",
    "Do not create a restaurant tasting-menu week.",
    "The user is meal prepping at home.",
    "A meal being interesting or quick to finish does not make it free from weekly prep complexity.",
    "Each new dish may introduce: another marinade, another sauce, another spice profile,",
    "another protein preparation, another cooking workflow, more groceries, more containers, more cleanup.",
    "Prefer repeating a strong meal-prep-friendly dish over introducing another independent recipe",
    "when the new recipe does not materially improve the week.",
    "",
    "Complexity-aware selection:",
    "Before selecting a new candidate, ask:",
    "Does introducing this meal add enough culinary value to justify another independent prep workflow?",
    "If not, prefer a suitable repeat from the repertoire.",
    "Once the week already has enough culinary diversity, stop adding new dishes simply to increase variety.",
    "Do not always force the minimum unique count — an eighth candidate may be better than seven when it",
    "materially improves satisfaction without significant complexity, as long as you stay at or under the hard maximum.",
    "Optimize practicality, not a single counter.",
    "",
    "Priorities, in order:",
    "1. candidate validity / hard constraints (only supplied IDs; allergies; dietary restrictions; never invent)",
    "2. weekly prep practicality / hard unique-candidate maximum",
    "3. cooking-style compatibility",
    "4. strategic repetition within the chosen repertoire",
    "5. sufficient culinary variety (boredom constraint — do NOT maximize; stay within preferred band when possible)",
    "6. candidate quality/rank (prior only — not a quota)",
    "7. likely ingredient/component reuse (complete-plate concepts when provided)",
    "8. fitness adaptability",
    "",
    "COMPLETE MEAL CONCEPTS:",
    "Candidates may include a lightweight complete-plate concept (main + components).",
    "Use that plate when judging eating variety, flavor similarity, prep complexity,",
    "ingredient/component reuse, repeated side components, unique component count,",
    "and whether sides are fresh vs prep-friendly.",
    "Ingredient/component reuse is NOT meal repetition.",
    "Example: Chicken Tikka and Kerala Beef Fry may both use basmati rice while remaining distinct culinary experiences. That reuse is desirable.",
    "Do not force reuse merely because component names match if culinary fit is poor.",
    "",
    "COMPOSITION COMPLEXITY (diagnostic, not a hard quota):",
    "The unique-main-dish cap still applies.",
    "Also notice component explosion: a Simple week with 6 mains plus ~18 completely unique sides/sauces can be operationally terrible even if mains stay inside the hard max.",
    "Prefer a compact reusable component set over a large collection of unique sides when culinary fit remains good.",
    "Do not invent numeric component quotas. Treat this as a ranking/diagnostic signal.",
    "",
    "Candidate rank behavior:",
    "- Prefer higher-ranked candidates when other considerations are similar.",
    "- Do NOT simply schedule rank #1, #2, #3 as the first meals of the week.",
    "- Rank is a prior, not a quota.",
    "- Once a strong recurring lunch candidate has been selected, it may be better to repeat it",
    "  than introduce a lower-ranked candidate solely to increase variety.",
    "- A lower-ranked candidate may still be better when it completes the repertoire without adding prep burden.",
    "",
    "Operational variety semantics:",
    `- varietyLevel=${varietyLevel}: ${varietyNote}`,
    `- Complexity policy: ${formatComplexityPolicy(policy)}.`,
    `- Preferred unique range ${policy.minPreferredUniqueCandidates}–${policy.maxPreferredUniqueCandidates} is a soft target.`,
    `- Exactly at hard max ${policy.maxHardUniqueCandidates} is allowed only when justified.`,
    `- Above hard max ${policy.maxHardUniqueCandidates} is INVALID.`,
    "- Cuisine count and flavor-family count are NOT hard constraints.",
    "",
    "Culinary variety (sufficient, not maximal):",
    "- Variety is culinary experience: cuisineFamily, regionalStyle, flavorFamilies, cookingTechniques, dishFormat, textureTags, experienceTags, primaryProtein.",
    "- Protein change alone is not variety. Chicken Tikka / Paneer Tikka / Fish Tikka should not dominate a week.",
    "- Kerala Meen Pollichathu, Pescado Zarandeado, Pescado a la Veracruzana, and Cajun Blackened Fish MAY coexist — they are different culinary experiences despite all being fish.",
    "- Goal: strategic repetition + flavor rotation — NOT the same chicken dish every day, and NOT 14 unrelated recipes.",
    "",
    "Adjacent meal similarity:",
    "- First create a practical repertoire. Then arrange that repertoire to avoid monotonous adjacent meals.",
    "- Similarity should affect scheduling of the repertoire, not continuously cause new dishes to be added.",
    "- Bad: meal A is similar to the previous meal → select another brand-new candidate.",
    "- Preferred: meal A is similar to the previous meal → schedule another already-selected repertoire meal here.",
    "- Avoid highly similar culinary experiences next to one another when the repertoire allows a better arrangement.",
    "- The important window is Monday lunch → Monday dinner → Tuesday lunch, and so on.",
    "",
    "Strategic repetition (positively encouraged):",
    "- Repetition is a useful meal-prep tool.",
    "- A repeated meal is often preferable when: it stores/reheats well; it was already batch prepared;",
    "  it prevents another sauce/marinade/workflow; it is spaced reasonably apart;",
    "  and the surrounding meals create enough flavor variety.",
    "- Good Balanced pattern: Monday lunch Chicken Tikka, Thursday lunch Chicken Tikka;",
    "  Tuesday lunch Kerala Beef Fry, Friday lunch Kerala Beef Fry.",
    "- Avoid only excessive adjacent repetition (same candidate Monday lunch, Monday dinner, Tuesday lunch)",
    "  unless varietyLevel is simple and the pool is tiny.",
    "",
    "Cooking / prep:",
    `- cookingStyle=${cookingPreferences.cookingStyle}: ${cookingNote}`,
    `- ${lunchDinnerSplitNote}`,
    lunchRepertoireNote,
    `- ${finishNote}`,
    `- prepFrequency=${cookingPreferences.prepFrequency}: ${prepFrequencyNote}`,
    `- maxPrepSessionMinutes=${formatPrepSessionMinutes(cookingPreferences.maxPrepSessionMinutes)}.`,
    "- Keep weekday effort realistic. Do not invent an exact prep-session timeline.",
    "",
    "Lunch preparation strategy (lunch slots only):",
    "- Shared prep reuse is always allowed as an automatic optimization when evidence supports it.",
    `- ${dinnerPrepNote}`,
    "- independent_meal_prep: lunch is prepared separately during dedicated prep (default).",
    "- piggyback_prep: a DIFFERENT lunch dish; some work is done while making another meal — only with strong metadata evidence.",
    "- direct_leftover: dinner itself becomes a later lunch. Use sparingly. The lunch candidateId MUST equal the previous day's dinner candidateId.",
    "- Monday lunch has no previous dinner in this week — use independent_meal_prep.",
    "- Dinner slots must omit lunchPreparationStrategy.",
    "- Because exact ingredient lists are not resolved yet, default to independent_meal_prep unless a shared prep dependency is very obvious from structured candidate metadata.",
    "- Do not infer piggyback prep merely because two dishes probably contain aromatics, herbs, chili, citrus, seeds, or common pantry ingredients.",
    "- If the claimed reuse cannot be explained concretely from the supplied candidate fields, choose independent_meal_prep.",
    "",
    "Ingredient / component reuse and planning reasons:",
    "- Prefer complete-plate component names when mealConcept data is supplied.",
    "- Component reuse (shared rice, chutney, slaw) is a positive prep-efficiency signal when culinary fit remains good.",
    "- Do not treat two meals that share a side as the same meal.",
    "- You still must not invent grocery lists or exact ingredient quantities.",
    "- Do not claim specific ingredient/prep reuse unless it is strongly supported by candidate metadata or the supplied mealConcept components.",
    "- Use cautious language when exact recipes are unresolved.",
    "- Bad: 'Uses the chopped onion and parsley from Tuesday.' / 'leveraging chili and herb prep from Tuesday'",
    "- Acceptable: 'Pairs well with the existing batch-prep structure.' / 'Reuses basmati rice already in the week's plate concepts.'",
    "- Best: only claim specific reuse when candidate metadata or mealConcept components make it obvious.",
    "- For repeats, prefer reasons like: 'Repeated intentionally to reuse the batch-prepped dish while spacing the meal several days from its first appearance.'",
    "- For new dishes, prefer reasons like: 'Adds a distinct fresh dinner experience without introducing a major additional prep burden.'",
    "- Avoid empty statements such as: 'Provides variety.'",
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
  ].filter((line) => line !== "").join("\n");

  const concepts = Object.values(request.mealConceptsByCandidateId ?? {});
  const repertoireSummary =
    concepts.length > 0 ? summarizeMealConceptRepertoire(concepts) : null;
  const compositionBlock =
    repertoireSummary == null
      ? [
          "Complete meal concepts were not supplied. Reason from candidate metadata only.",
          "Do not invent detailed recipes or nutrition.",
        ].join("\n")
      : [
          "Complete meal concepts (lightweight plates — not recipes):",
          `unique mains in ranked repertoire: ${repertoireSummary.uniqueMains}`,
          `unique side/sauce components: ${repertoireSummary.uniqueComponents}`,
          `reused components: ${repertoireSummary.reusedComponents}`,
          `composition complexity signal: ${repertoireSummary.complexitySignal}`,
          "This complexity signal is diagnostic, not a hard quota.",
          "Component reuse index (prep-efficiency; do not force reuse merely because names match):",
          formatComponentReuseForPrompt(repertoireSummary.reuseIndex),
        ].join("\n");

  const userPrompt = [
    "Generate a 7-day lunch+dinner weekly meal strategy by selecting supplied candidate IDs.",
    "Optimize for practical meal-prep complexity first; keep variety sufficient to prevent boredom.",
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
    `varietyLevel: ${varietyLevel}`,
    `varietyLevel guidance: ${varietyNote}`,
    `complexity policy: ${formatComplexityPolicy(policy)}`,
    "",
    "Cooking preferences (PLAN-002):",
    `prepFrequency: ${cookingPreferences.prepFrequency}`,
    `prepFrequency guidance: ${prepFrequencyNote}`,
    `maxPrepSessionMinutes: ${formatPrepSessionMinutes(cookingPreferences.maxPrepSessionMinutes)}`,
    `cookingStyle: ${cookingPreferences.cookingStyle}`,
    `cookingStyle guidance: ${cookingNote}`,
    `lunch/dinner uniqueness guidance: ${lunchDinnerSplitNote}`,
    `maxFinishMinutes: ${cookingPreferences.maxFinishMinutes}`,
    `finish-time guidance: ${finishNote}`,
    `dinner-prep guidance: ${dinnerPrepNote}`,
    "",
    `Recent meal concepts: ${recent}`,
    "",
    "Lunch candidates (choose lunch candidateId values only from this list):",
    formatPlannerCandidates(request.lunchCandidates, request.mealConceptsByCandidateId),
    "",
    "Dinner candidates (choose dinner candidateId values only from this list):",
    formatPlannerCandidates(request.dinnerCandidates, request.mealConceptsByCandidateId),
    "",
    compositionBlock,
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

export type WeeklyComplexityEvaluation = {
  uniqueCandidateCount: number;
  uniqueLunchCandidateCount: number;
  uniqueDinnerCandidateCount: number;
  status: WeeklyComplexityStatus;
  policy: VarietyComplexityPolicy;
  varietyLevel: RankedWeeklyStrategyRequest["foodPreferences"]["varietyLevel"];
};

export function classifyWeeklyComplexityStatus(
  uniqueCandidateCount: number,
  policy: VarietyComplexityPolicy,
): WeeklyComplexityStatus {
  if (uniqueCandidateCount > policy.maxHardUniqueCandidates) {
    return "excessive";
  }
  if (uniqueCandidateCount > policy.maxPreferredUniqueCandidates) {
    return "above_preferred_range";
  }
  return "within_preferred_range";
}

export function evaluateWeeklyComplexity(
  strategy: RankedWeeklyStrategy,
  request: RankedWeeklyStrategyRequest,
): WeeklyComplexityEvaluation {
  const slots = collectRankedMealSlots(strategy.days);
  const uniqueCandidateCount = new Set(slots.map((slot) => slot.candidateId)).size;
  const uniqueLunchCandidateCount = new Set(
    slots.filter((slot) => slot.mealType === "lunch").map((slot) => slot.candidateId),
  ).size;
  const uniqueDinnerCandidateCount = new Set(
    slots.filter((slot) => slot.mealType === "dinner").map((slot) => slot.candidateId),
  ).size;
  const varietyLevel = request.foodPreferences.varietyLevel;
  const policy = getWeeklyVarietyComplexityPolicy(varietyLevel);
  return {
    uniqueCandidateCount,
    uniqueLunchCandidateCount,
    uniqueDinnerCandidateCount,
    status: classifyWeeklyComplexityStatus(uniqueCandidateCount, policy),
    policy,
    varietyLevel,
  };
}

export function exceedsHardUniqueCandidateLimit(
  uniqueCandidateCount: number,
  policy: VarietyComplexityPolicy,
): boolean {
  return uniqueCandidateCount > policy.maxHardUniqueCandidates;
}

export function buildComplexityRetryFeedback(
  request: RankedWeeklyStrategyRequest,
  evaluation: WeeklyComplexityEvaluation,
): string {
  const policy = evaluation.policy;
  const varietyLevel = evaluation.varietyLevel;
  const preferredMin = policy.minPreferredUniqueCandidates;
  const preferredMax = policy.maxPreferredUniqueCandidates;
  const hardMax = policy.maxHardUniqueCandidates;
  return [
    `Your previous ${varietyLevel} plan used ${evaluation.uniqueCandidateCount} unique candidates across 14 meal slots.`,
    `This violates the ${varietyLevel} hard maximum of ${hardMax} unique candidates and is too complex for once-weekly meal prep.`,
    "Regenerate the week.",
    "First choose a compact weekly repertoire, then schedule only from that repertoire.",
    `Preferred: ${preferredMin}–${preferredMax} unique candidates total.`,
    cookingPreferencesReadyLunchHint(request),
    `Absolute maximum: ${hardMax} unique candidates total.`,
    "Increase strategic repetition, especially for lunches.",
    "Do not introduce another candidate merely to increase variety.",
    "Prefer repeating already selected meal-prep-friendly dishes over introducing additional independent recipes.",
    "Do not reduce quality by creating adjacent repetitive meals.",
    "Keep the original candidate pools, preferences, cooking context, and structural requirements.",
    "Do not invent dishes. Do not cross lunch/dinner pools.",
  ]
    .filter(Boolean)
    .join(" ");
}

function cookingPreferencesReadyLunchHint(request: RankedWeeklyStrategyRequest): string {
  if (request.cookingPreferences.cookingStyle !== "ready_lunch_fresh_dinner") {
    return "";
  }
  const policy = getWeeklyVarietyComplexityPolicy(request.foodPreferences.varietyLevel);
  return [
    `Approximately ${policy.minPreferredUniqueLunchCandidates}–${policy.maxPreferredUniqueLunchCandidates} unique lunch candidates.`,
    `Approximately ${policy.minPreferredUniqueDinnerCandidates}–${policy.maxPreferredUniqueDinnerCandidates} unique dinner candidates.`,
  ].join(" ");
}

export function buildRankedWeeklyStrategyRetryPrompt(
  request: RankedWeeklyStrategyRequest,
  evaluation: WeeklyComplexityEvaluation,
  priorStrategy?: RankedWeeklyStrategy,
): RankedWeeklyStrategyPrompt {
  const base = buildRankedWeeklyStrategyPrompt(request);
  const feedback = buildComplexityRetryFeedback(request, evaluation);
  // Token-saving corrective path: compact system + prior week JSON + feedback
  // instead of re-sending the full ranked strategy system/user prompt.
  if (priorStrategy) {
    const compactDays = priorStrategy.days.map((day) => ({
      day: day.day,
      lunchCandidateId: day.lunch.candidateId,
      dinnerCandidateId: day.dinner.candidateId,
    }));
    const lunchIds = request.lunchCandidates.map((c) => c.candidate.candidateId);
    const dinnerIds = request.dinnerCandidates.map((c) => c.candidate.candidateId);
    return {
      version: base.version,
      systemInstruction: [
        "You are correcting a ranked weekly meal strategy that exceeded the hard unique-candidate limit.",
        "Select only from the provided lunch and dinner candidate ID pools.",
        "Do not invent dishes. Do not cross lunch/dinner pools.",
        "Output the same ranked weekly strategy JSON schema as before (full days with meal slots).",
      ].join(" "),
      userPrompt: [
        `Variety level: ${request.foodPreferences.varietyLevel}`,
        `Cooking style: ${request.cookingPreferences.cookingStyle}`,
        `Allowed lunch candidate IDs: ${lunchIds.join(", ")}`,
        `Allowed dinner candidate IDs: ${dinnerIds.join(", ")}`,
        "",
        "PREVIOUS_WEEK_CANDIDATE_SCHEDULE_JSON:",
        JSON.stringify(compactDays),
        "",
        "CORRECTIVE RETRY FEEDBACK:",
        feedback,
      ].join("\n"),
    };
  }
  return {
    version: base.version,
    systemInstruction: base.systemInstruction,
    userPrompt: [base.userPrompt, "", "CORRECTIVE RETRY FEEDBACK:", feedback].join("\n"),
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

function compositionStatsFromRequest(
  strategy: RankedWeeklyStrategy,
  request: RankedWeeklyStrategyRequest,
): Pick<
  RankedWeeklyStrategyQualityStats,
  | "uniqueComponentCount"
  | "reusedComponentCount"
  | "uniqueComponentsInSelectedWeek"
  | "reusedComponentsInSelectedWeek"
  | "componentComplexitySignal"
  | "componentReuse"
> {
  const conceptsById = request.mealConceptsByCandidateId ?? {};
  const selectedIds = [
    ...new Set(collectRankedMealSlots(strategy.days).map((slot) => slot.candidateId)),
  ];
  const selectedConcepts = selectedIds
    .map((id) => conceptsById[id])
    .filter((concept): concept is MealConcept => concept != null);
  if (selectedConcepts.length === 0) {
    return {
      uniqueComponentCount: selectedIds.length,
      reusedComponentCount: 0,
      uniqueComponentsInSelectedWeek: selectedIds.length,
      reusedComponentsInSelectedWeek: 0,
      componentComplexitySignal: "unknown",
      componentReuse: [],
    };
  }
  const summary = summarizeMealConceptRepertoire(selectedConcepts);
  return {
    uniqueComponentCount: summary.uniqueComponents,
    reusedComponentCount: summary.reusedComponents,
    uniqueComponentsInSelectedWeek: summary.uniqueComponents,
    reusedComponentsInSelectedWeek: summary.reusedComponents,
    componentComplexitySignal: summary.complexitySignal,
    componentReuse: summary.reuseIndex,
  };
}

export function calculateRankedWeeklyStrategyQualityStats(
  strategy: RankedWeeklyStrategy,
  request: RankedWeeklyStrategyRequest,
): RankedWeeklyStrategyQualityStats {
  const lunchPool = indexRankedCandidates(request.lunchCandidates);
  const dinnerPool = indexRankedCandidates(request.dinnerCandidates);
  const slots = collectRankedMealSlots(strategy.days);
  const uniqueIds = [...new Set(slots.map((slot) => slot.candidateId))];
  const uniqueLunchIds = [
    ...new Set(slots.filter((slot) => slot.mealType === "lunch").map((slot) => slot.candidateId)),
  ];
  const uniqueDinnerIds = [
    ...new Set(slots.filter((slot) => slot.mealType === "dinner").map((slot) => slot.candidateId)),
  ];

  const cuisines = new Set<string>();
  const proteins = new Set<string>();
  const flavors = new Set<string>();
  const techniques = new Set<string>();
  const ranks: number[] = [];
  const usage = new Map<
    string,
    {
      candidateId: string;
      name: string;
      count: number;
      mealTypes: Set<"lunch" | "dinner">;
      slots: Array<{ day: DayOfWeek; mealType: "lunch" | "dinner" }>;
    }
  >();
  const prepIntentByCandidate = new Map<string, RankedWeeklyMealSlot["prepIntent"]>();

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
      for (const technique of candidate.cookingTechniques) {
        techniques.add(technique);
      }
    }
    const ranked =
      slot.mealType === "lunch"
        ? lunchPool.get(slot.candidateId)
        : dinnerPool.get(slot.candidateId);
    if (ranked) {
      ranks.push(ranked.rank);
    }
    if (!prepIntentByCandidate.has(slot.candidateId)) {
      prepIntentByCandidate.set(slot.candidateId, slot.prepIntent);
    }
    const existing = usage.get(slot.candidateId) ?? {
      candidateId: slot.candidateId,
      name: slot.name,
      count: 0,
      mealTypes: new Set<"lunch" | "dinner">(),
      slots: [],
    };
    existing.count += 1;
    existing.mealTypes.add(slot.mealType);
    existing.slots.push({ day: slot.day, mealType: slot.mealType });
    usage.set(slot.candidateId, existing);
  }

  let fullyPreppedUniqueCandidateCount = 0;
  let componentPreppedUniqueCandidateCount = 0;
  let quickFreshUniqueCandidateCount = 0;
  let freshUniqueCandidateCount = 0;
  for (const prepIntent of prepIntentByCandidate.values()) {
    switch (prepIntent) {
      case "fully_prepped":
        fullyPreppedUniqueCandidateCount += 1;
        break;
      case "component_prepped":
        componentPreppedUniqueCandidateCount += 1;
        break;
      case "quick_fresh_finish":
        quickFreshUniqueCandidateCount += 1;
        break;
      case "fresh":
        freshUniqueCandidateCount += 1;
        break;
      default:
        break;
    }
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

  const dayOrder = new Map(WEEK_DAYS.map((day, index) => [day, index]));
  const candidateUsage = [...usage.values()]
    .map((item) => ({
      candidateId: item.candidateId,
      name: item.name,
      count: item.count,
      mealTypes: [...item.mealTypes],
      slots: [...item.slots].sort((a, b) => {
        const dayDiff = (dayOrder.get(a.day) ?? 0) - (dayOrder.get(b.day) ?? 0);
        if (dayDiff !== 0) {
          return dayDiff;
        }
        if (a.mealType === b.mealType) {
          return 0;
        }
        return a.mealType === "lunch" ? -1 : 1;
      }),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.candidateId.localeCompare(b.candidateId);
    });

  const policy = getWeeklyVarietyComplexityPolicy(request.foodPreferences.varietyLevel);
  const complexityStatus = classifyWeeklyComplexityStatus(uniqueIds.length, policy);

  return {
    totalMealSlots: slots.length,
    uniqueCandidateCount: uniqueIds.length,
    uniqueLunchCandidateCount: uniqueLunchIds.length,
    uniqueDinnerCandidateCount: uniqueDinnerIds.length,
    repeatedMealSlotCount: Math.max(0, slots.length - uniqueIds.length),
    uniqueCuisineCount: cuisines.size,
    uniqueProteinCount: proteins.size,
    uniqueCookingTechniqueCount: techniques.size,
    uniqueFlavorFamilyCount: flavors.size,
    fullyPreppedUniqueCandidateCount,
    componentPreppedUniqueCandidateCount,
    quickFreshUniqueCandidateCount,
    freshUniqueCandidateCount,
    directLeftoverLunchCount,
    piggybackLunchCount,
    independentLunchCount,
    complexityStatus,
    preferredUniqueCandidateRange: {
      min: policy.minPreferredUniqueCandidates,
      max: policy.maxPreferredUniqueCandidates,
    },
    hardMaxUniqueCandidates: policy.maxHardUniqueCandidates,
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
    ...compositionStatsFromRequest(strategy, request),
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
