import type {
  CulinaryDiscoveryCandidate,
  CulinaryDiscoveryRequest,
  GenerateRankedWeeklyStrategyResponse,
  RankedCulinaryCandidate,
  RankedWeeklyMealSlot,
  RankedWeeklyStrategy,
  RankedWeeklyStrategyQualityStats,
  RankedWeeklyStrategyRequest,
  VarietyLevel,
} from "@fitness-autopilot/contracts";
import {
  DEFAULT_TARGET_POOL_SIZE,
  PLAN007_LARGE_DINNER_POOL,
  PLAN007_LARGE_LUNCH_POOL,
  PLAN007_SMALL_DINNER_POOL,
  PLAN007_SMALL_LUNCH_POOL,
  PLAN007_TIKKA_PRESSURE_DINNER,
  PLAN007_TIKKA_PRESSURE_LUNCH,
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  SCENARIO_C_LARGE_MIXED_POOL,
  buildRankedWeeklyStrategyPrompt,
  rankCulinaryCandidates,
} from "@fitness-autopilot/domain";
import {
  WEEKLY_STRATEGY_FUNCTION_NAME,
  buildWeeklyStrategyRequest,
  dayOfWeekLabel,
  humanizeWeeklyStrategyError,
  parseGenerateWeeklyStrategyFailure,
  prepIntentLabel,
  type WeeklyStrategyPreviewError,
  type WeeklyStrategyPreviewSessionInput,
} from "./weekly-strategy-preview";
import { rankCulinaryCandidatesLocally } from "./candidate-ranking-preview";
import { readFunctionsInvokeErrorBody } from "./recipe-preview";

export const RANKED_WEEKLY_STRATEGY_FUNCTION_NAME = WEEKLY_STRATEGY_FUNCTION_NAME;
export const RANKED_WEEKLY_STRATEGY_PREVIEW_LOADING = "Planning ranked week...";

export type RankedWeeklyStrategyGenerationMeta = NonNullable<
  GenerateRankedWeeklyStrategyResponse["meta"]
>;

export type RankedWeekPreviewScenarioId =
  | "balanced"
  | "simple"
  | "high"
  | "tikka"
  | "small";

export const RANKED_WEEK_PREVIEW_SCENARIOS: ReadonlyArray<{
  id: RankedWeekPreviewScenarioId;
  label: string;
  varietyLevel: VarietyLevel;
}> = [
  { id: "balanced", label: "A · Balanced", varietyLevel: "balanced" },
  { id: "simple", label: "B · Simple", varietyLevel: "simple" },
  { id: "high", label: "C · High variety", varietyLevel: "high" },
  { id: "tikka", label: "D · Tikka pressure", varietyLevel: "balanced" },
  { id: "small", label: "E · Small pool", varietyLevel: "balanced" },
];

export type RankedWeeklyStrategyPreviewUiState = {
  busy: boolean;
  pipelineBusy: "lunch" | "dinner" | "week" | null;
  error: WeeklyStrategyPreviewError | null;
  scenarioId: RankedWeekPreviewScenarioId;
  lunchCandidates: RankedCulinaryCandidate[];
  dinnerCandidates: RankedCulinaryCandidate[];
  lunchSource: "fixture" | "discover";
  dinnerSource: "fixture" | "discover";
  request: RankedWeeklyStrategyRequest | null;
  strategy: RankedWeeklyStrategy | null;
  stats: RankedWeeklyStrategyQualityStats | null;
  meta?: RankedWeeklyStrategyGenerationMeta;
  showContext: boolean;
  showRaw: boolean;
  showPrompt: boolean;
};

export function createRankedWeeklyStrategyPreviewUiState(): RankedWeeklyStrategyPreviewUiState {
  const lunch = PLAN007_LARGE_LUNCH_POOL.slice(0, 12);
  const dinner = PLAN007_LARGE_DINNER_POOL.slice(0, 12);
  return {
    busy: false,
    pipelineBusy: null,
    error: null,
    scenarioId: "balanced",
    lunchCandidates: lunch,
    dinnerCandidates: dinner,
    lunchSource: "fixture",
    dinnerSource: "fixture",
    request: null,
    strategy: null,
    stats: null,
    showContext: true,
    showRaw: false,
    showPrompt: false,
  };
}

export function scenarioPools(
  scenarioId: RankedWeekPreviewScenarioId,
): {
  lunchCandidates: RankedCulinaryCandidate[];
  dinnerCandidates: RankedCulinaryCandidate[];
  varietyLevel: VarietyLevel;
} {
  switch (scenarioId) {
    case "simple":
      return {
        lunchCandidates: PLAN007_LARGE_LUNCH_POOL.slice(0, 12),
        dinnerCandidates: PLAN007_LARGE_DINNER_POOL.slice(0, 12),
        varietyLevel: "simple",
      };
    case "high":
      return {
        lunchCandidates: PLAN007_LARGE_LUNCH_POOL.slice(0, 14),
        dinnerCandidates: PLAN007_LARGE_DINNER_POOL.slice(0, 14),
        varietyLevel: "high",
      };
    case "tikka":
      return {
        lunchCandidates: PLAN007_TIKKA_PRESSURE_LUNCH,
        dinnerCandidates: PLAN007_TIKKA_PRESSURE_DINNER,
        varietyLevel: "balanced",
      };
    case "small":
      return {
        lunchCandidates: PLAN007_SMALL_LUNCH_POOL,
        dinnerCandidates: PLAN007_SMALL_DINNER_POOL,
        varietyLevel: "balanced",
      };
    case "balanced":
    default:
      return {
        lunchCandidates: PLAN007_LARGE_LUNCH_POOL.slice(0, 12),
        dinnerCandidates: PLAN007_LARGE_DINNER_POOL.slice(0, 12),
        varietyLevel: "balanced",
      };
  }
}

export function applyRankedWeekScenario(
  state: RankedWeeklyStrategyPreviewUiState,
  scenarioId: RankedWeekPreviewScenarioId,
): RankedWeeklyStrategyPreviewUiState {
  const pools = scenarioPools(scenarioId);
  return {
    ...state,
    scenarioId,
    lunchCandidates: pools.lunchCandidates,
    dinnerCandidates: pools.dinnerCandidates,
    lunchSource: "fixture",
    dinnerSource: "fixture",
    error: null,
  };
}

export function rankDiscoveryCandidatesForPreview(
  mealType: "lunch" | "dinner",
  candidates: CulinaryDiscoveryCandidate[],
  session: WeeklyStrategyPreviewSessionInput,
): RankedCulinaryCandidate[] {
  const meal = session.mealPreferences;
  const cooking = session.cookingPreferences;
  const ranked = rankCulinaryCandidates({
    mealType,
    candidates,
    userPreferences: {
      cuisines: meal?.cuisines,
      proteinPreferences: meal?.proteinPreferences,
      experiencePreferences: meal?.experiencePreferences,
      dislikes: meal?.dislikes,
    },
    cookingPreferences: cooking
      ? {
          cookingStyle: cooking.cookingStyle,
          maxFinishMinutes: cooking.maxFinishMinutes,
        }
      : undefined,
    targetPoolSize: DEFAULT_TARGET_POOL_SIZE,
  });
  if (!ranked.ok) {
    return [];
  }
  return ranked.value.selected;
}

export function buildDiscoveryRequestForWeekPreview(
  mealType: "lunch" | "dinner",
  session: WeeklyStrategyPreviewSessionInput,
): CulinaryDiscoveryRequest {
  const meal = session.mealPreferences;
  const cooking = session.cookingPreferences;
  return {
    mealType,
    cuisines: meal?.cuisines.length ? [...meal.cuisines] : ["indian", "mexican"],
    proteinPreferences: meal?.proteinPreferences.length
      ? [...meal.proteinPreferences]
      : ["chicken", "fish"],
    experiencePreferences: meal?.experiencePreferences.length
      ? [...meal.experiencePreferences]
      : undefined,
    allergies: meal?.allergies ?? [],
    dietaryRestrictions: meal?.dietaryRestrictions ?? [],
    dislikes: meal?.dislikes ?? [],
    cookingPreferences: cooking
      ? {
          cookingStyle: cooking.cookingStyle,
          maxFinishMinutes: cooking.maxFinishMinutes,
        }
      : undefined,
    targetCandidateCount: 20,
  };
}

export function buildRankedWeeklyStrategyRequestFromPreview(
  session: WeeklyStrategyPreviewSessionInput,
  lunchCandidates: RankedCulinaryCandidate[],
  dinnerCandidates: RankedCulinaryCandidate[],
  varietyLevel: VarietyLevel,
): RankedWeeklyStrategyRequest | null {
  const base = buildWeeklyStrategyRequest(session);
  if (!base) {
    return null;
  }
  return {
    ...base,
    foodPreferences: {
      ...base.foodPreferences,
      varietyLevel,
    },
    lunchCandidates,
    dinnerCandidates,
  };
}

export function canStartRankedWeeklyGeneration(
  state: RankedWeeklyStrategyPreviewUiState,
): boolean {
  return !state.busy && state.lunchCandidates.length > 0 && state.dinnerCandidates.length > 0;
}

export function lunchPreparationStrategyLabel(
  value: RankedWeeklyMealSlot["lunchPreparationStrategy"],
): string | null {
  switch (value) {
    case "independent_meal_prep":
      return "Independent meal prep";
    case "piggyback_prep":
      return "Piggyback prep";
    case "direct_leftover":
      return "Direct leftover";
    default:
      return null;
  }
}

export function candidateRankLabel(
  slot: RankedWeeklyMealSlot,
  pool: readonly RankedCulinaryCandidate[],
): string {
  const ranked = pool.find((item) => item.candidate.candidateId === slot.candidateId);
  return ranked ? `Rank #${ranked.rank}` : "Rank unknown";
}

export type RankedWeeklyDayView = {
  dayLabel: string;
  lunch: RankedWeeklyMealSlot;
  dinner: RankedWeeklyMealSlot;
  lunchRank: string;
  dinnerRank: string;
  lunchPrep: string;
  dinnerPrep: string;
  lunchStrategy: string | null;
  why: string;
};

export function buildRankedWeeklyDayViews(
  strategy: RankedWeeklyStrategy,
  lunchPool: readonly RankedCulinaryCandidate[],
  dinnerPool: readonly RankedCulinaryCandidate[],
): RankedWeeklyDayView[] {
  return strategy.days.map((day) => ({
    dayLabel: dayOfWeekLabel(day.day).toUpperCase(),
    lunch: day.lunch,
    dinner: day.dinner,
    lunchRank: candidateRankLabel(day.lunch, lunchPool),
    dinnerRank: candidateRankLabel(day.dinner, dinnerPool),
    lunchPrep: prepIntentLabel(day.lunch.prepIntent),
    dinnerPrep: prepIntentLabel(day.dinner.prepIntent),
    lunchStrategy: lunchPreparationStrategyLabel(day.lunch.lunchPreparationStrategy),
    why: [day.lunch.planningReason, day.dinner.planningReason].join(" "),
  }));
}

export function buildRankedQualityStatRows(
  stats: RankedWeeklyStrategyQualityStats,
  options?: {
    varietyLevel?: VarietyLevel;
    prepFrequency?: string;
    cookingStyle?: string;
    complexityRetry?: {
      occurred: boolean;
      firstAttemptUniqueCandidates?: number;
      finalAttemptUniqueCandidates?: number;
    };
  },
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (options?.varietyLevel) {
    rows.push({ label: "Variety level", value: options.varietyLevel });
  }
  if (options?.prepFrequency) {
    rows.push({ label: "Prep frequency", value: options.prepFrequency });
  }
  if (options?.cookingStyle) {
    rows.push({ label: "Cooking style", value: options.cookingStyle });
  }
  rows.push(
    { label: "Unique dishes", value: String(stats.uniqueCandidateCount) },
    { label: "Unique lunch dishes", value: String(stats.uniqueLunchCandidateCount) },
    { label: "Unique dinner dishes", value: String(stats.uniqueDinnerCandidateCount) },
    { label: "Repeated slots", value: String(stats.repeatedMealSlotCount) },
    {
      label: "Preferred unique range",
      value: `${stats.preferredUniqueCandidateRange.min}–${stats.preferredUniqueCandidateRange.max}`,
    },
    { label: "Hard max unique dishes", value: String(stats.hardMaxUniqueCandidates) },
    { label: "Complexity status", value: stats.complexityStatus },
    { label: "Piggyback lunches", value: String(stats.piggybackLunchCount) },
    { label: "Direct leftovers", value: String(stats.directLeftoverLunchCount) },
    { label: "Cuisines", value: String(stats.uniqueCuisineCount) },
    { label: "Proteins", value: String(stats.uniqueProteinCount) },
    { label: "Cooking techniques", value: String(stats.uniqueCookingTechniqueCount) },
    { label: "Flavor families", value: String(stats.uniqueFlavorFamilyCount) },
    {
      label: "Average candidate rank",
      value:
        stats.averageCandidateRank === undefined
          ? "(n/a)"
          : stats.averageCandidateRank.toFixed(2),
    },
    { label: "Adjacent high-similarity", value: String(stats.adjacentHighSimilarityCount) },
    { label: "Max adjacent similarity", value: stats.maxAdjacentSimilarity.toFixed(3) },
  );
  if (options?.complexityRetry) {
    rows.push({
      label: "Complexity retry",
      value: options.complexityRetry.occurred ? "Yes" : "No",
    });
    if (options.complexityRetry.occurred) {
      rows.push(
        {
          label: "First attempt unique candidates",
          value: String(options.complexityRetry.firstAttemptUniqueCandidates ?? "(n/a)"),
        },
        {
          label: "Final attempt unique candidates",
          value: String(
            options.complexityRetry.finalAttemptUniqueCandidates ?? stats.uniqueCandidateCount,
          ),
        },
      );
    }
  }
  return rows;
}

const SHORT_DAY: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export function buildRankedCandidateUsageRows(
  stats: RankedWeeklyStrategyQualityStats,
): Array<{ label: string; value: string }> {
  return stats.candidateUsage.map((item) => {
    const slotLabels = item.slots
      .map((slot) => `${SHORT_DAY[slot.day] ?? slot.day} ${slot.mealType}`)
      .join(", ");
    return {
      label: `${item.name} — ${item.count} meal${item.count === 1 ? "" : "s"}`,
      value: slotLabels,
    };
  });
}

export function buildRankedPromptPreview(request: RankedWeeklyStrategyRequest): {
  version: string;
  systemInstruction: string;
  userPrompt: string;
} {
  const prompt = buildRankedWeeklyStrategyPrompt(request);
  return {
    version: prompt.version,
    systemInstruction: prompt.systemInstruction,
    userPrompt: prompt.userPrompt,
  };
}

export type InvokeGenerateRankedWeeklyStrategyFn = (
  functionName: string,
  options: { body: RankedWeeklyStrategyRequest },
) => Promise<{ data: unknown; error: { message: string; context?: unknown } | null }>;

export async function invokeGenerateRankedWeeklyStrategy(
  invoke: InvokeGenerateRankedWeeklyStrategyFn,
  request: RankedWeeklyStrategyRequest,
): Promise<
  | {
      ok: true;
      strategy: RankedWeeklyStrategy;
      stats: RankedWeeklyStrategyQualityStats;
      meta?: RankedWeeklyStrategyGenerationMeta;
    }
  | { ok: false; error: WeeklyStrategyPreviewError }
> {
  const { data, error } = await invoke(RANKED_WEEKLY_STRATEGY_FUNCTION_NAME, { body: request });
  if (error) {
    const errorBody = (await readFunctionsInvokeErrorBody(error)) ?? data;
    return {
      ok: false,
      error: parseGenerateWeeklyStrategyFailure({
        errorMessage: error.message,
        data: errorBody,
      }),
    };
  }
  if (!data || typeof data !== "object" || !("strategy" in data) || !("stats" in data)) {
    if (data && typeof data === "object" && "error" in data) {
      return { ok: false, error: parseGenerateWeeklyStrategyFailure({ data }) };
    }
    return {
      ok: false,
      error: { message: "Ranked weekly strategy generation returned an empty response." },
    };
  }
  const payload = data as GenerateRankedWeeklyStrategyResponse;
  return {
    ok: true,
    strategy: payload.strategy,
    stats: payload.stats,
    meta: payload.meta,
  };
}

export function humanizeRankedWeeklyStrategyError(message: string, code?: string): string {
  if (code === "INSUFFICIENT_CANDIDATES") {
    return `${message} Supply at least one ranked lunch candidate and one ranked dinner candidate.`;
  }
  if (code === "INVALID_CANDIDATE_REFERENCE") {
    return `${message} Gemini selected an ID that was not in the matching meal-type pool.`;
  }
  if (code === "EXCESSIVE_WEEKLY_COMPLEXITY") {
    return `${message} The corrective complexity retry still exceeded the hard unique-candidate limit.`;
  }
  return humanizeWeeklyStrategyError(message, code);
}

export function rankedWeeklyPreviewContainsSecrets(text: string): boolean {
  return /api[_-]?key/i.test(text) || /GEMINI_API_KEY/i.test(text) || /bearer\s+/i.test(text);
}

/** Used by tests to prove fixture ranking is local and does not call Gemini. */
export function rankMixedPoolLocallyForPreview(): RankedCulinaryCandidate[] {
  const ranked = rankCulinaryCandidatesLocally({
    mealType: "dinner",
    candidates: SCENARIO_C_LARGE_MIXED_POOL,
    userPreferences: {},
    targetPoolSize: DEFAULT_TARGET_POOL_SIZE,
  });
  return ranked.ok ? ranked.result.selected : [];
}

export { RANKED_WEEKLY_STRATEGY_PROMPT_VERSION };
