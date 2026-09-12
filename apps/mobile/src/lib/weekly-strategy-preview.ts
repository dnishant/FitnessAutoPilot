import type {
  CookingPreferences,
  DayOfWeek,
  GenerateWeeklyStrategyResponse,
  MealPreferences,
  MealType,
  NutritionTarget,
  PrepIntent,
  WeeklyDayStrategy,
  WeeklyMealConcept,
  WeeklyMealStrategy,
  WeeklyStrategyRequest,
  WeeklyStrategyStats,
} from "@fitness-autopilot/contracts";
import {
  PREP_FREQUENCY_OPTIONS,
  PREP_SESSION_TIME_OPTIONS,
} from "@fitness-autopilot/contracts";
import {
  DEFAULT_VARIETY_LEVEL,
  applyCookingPreferenceDefaults,
} from "@fitness-autopilot/domain";
import {
  cookingStyleLabel,
  cuisinePreferenceLabels,
  experiencePreferenceLabels,
  mealTypeLabel,
  proteinPreferenceLabels,
  readFunctionsInvokeErrorBody,
  sanitizeDiagnosticText,
  varietyLevelLabel,
} from "./recipe-preview";

export const WEEKLY_STRATEGY_PREVIEW_ROUTE = "/weekly-strategy-preview";
export const WEEKLY_STRATEGY_PREVIEW_TITLE = "Dev: Weekly Strategy Preview";
export const WEEKLY_STRATEGY_PREVIEW_LOADING = "Planning your week...";
export const WEEKLY_STRATEGY_FUNCTION_NAME = "generate-weekly-strategy";

export type WeeklyStrategyGenerationMeta = NonNullable<
  GenerateWeeklyStrategyResponse["meta"]
> & {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

export type WeeklyStrategyPreviewError = {
  message: string;
  code?: string;
  diagnostics?: string;
};

export type WeeklyStrategyPreviewSessionInput = {
  nutritionTarget: NutritionTarget | null;
  mealPreferences: MealPreferences | null;
  cookingPreferences: CookingPreferences | null;
};

const MEAL_SLOTS: readonly MealType[] = ["breakfast", "lunch", "snack", "dinner"];

export function dayOfWeekLabel(day: DayOfWeek): string {
  switch (day) {
    case "monday":
      return "Monday";
    case "tuesday":
      return "Tuesday";
    case "wednesday":
      return "Wednesday";
    case "thursday":
      return "Thursday";
    case "friday":
      return "Friday";
    case "saturday":
      return "Saturday";
    case "sunday":
      return "Sunday";
  }
}

export function prepIntentLabel(intent: PrepIntent): string {
  switch (intent) {
    case "fully_prepped":
      return "Fully prepped";
    case "component_prepped":
      return "Component prepped";
    case "fresh":
      return "Fresh";
  }
}

export function prepFrequencyLabel(value: string): string {
  return (
    PREP_FREQUENCY_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

export function prepSessionMinutesLabel(value: number | null): string {
  const match = PREP_SESSION_TIME_OPTIONS.find((option) => option.value === value);
  return match?.label ?? (value === null ? "Flexible" : `${value} min`);
}

export function canBuildWeeklyStrategyRequest(
  session: WeeklyStrategyPreviewSessionInput,
): boolean {
  return session.nutritionTarget !== null;
}

/**
 * Build PLAN-004 request from saved nutrition + PLAN-001/002 preferences.
 * Does not invent meal-level nutrition. Daily targets only.
 */
export function buildWeeklyStrategyRequest(
  session: WeeklyStrategyPreviewSessionInput,
): WeeklyStrategyRequest | null {
  const nutrition = session.nutritionTarget;
  if (!nutrition) {
    return null;
  }
  const meal = session.mealPreferences;
  const cooking = applyCookingPreferenceDefaults(session.cookingPreferences ?? {});
  const fatG = nutrition.fatG;
  return {
    nutrition: {
      targetCaloriesPerDay: nutrition.targetCalories,
      targetProteinGramsPerDay: nutrition.proteinG,
      targetCarbsGramsPerDay: nutrition.carbohydrateG,
      ...(fatG !== undefined ? { targetFatGramsPerDay: fatG } : {}),
    },
    foodPreferences: {
      cuisines: meal?.cuisines.length ? [...meal.cuisines] : undefined,
      proteinPreferences: meal?.proteinPreferences.length
        ? [...meal.proteinPreferences]
        : undefined,
      experiencePreferences: meal?.experiencePreferences.length
        ? [...meal.experiencePreferences]
        : undefined,
      allergies: meal ? [...meal.allergies] : [],
      dietaryRestrictions: meal ? [...meal.dietaryRestrictions] : [],
      dislikes: meal ? [...meal.dislikes] : [],
      varietyLevel: meal?.varietyLevel ?? DEFAULT_VARIETY_LEVEL,
    },
    cookingPreferences: {
      prepFrequency: cooking.prepFrequency,
      maxPrepSessionMinutes: cooking.maxPrepSessionMinutes,
      cookingStyle: cooking.cookingStyle,
      maxFinishMinutes: cooking.maxFinishMinutes,
      useDinnerPrepForNextLunch: cooking.useDinnerPrepForNextLunch,
    },
  };
}

export type GenerationContextRows = Array<{ label: string; value: string }>;

export function buildPlanningContextRows(
  request: WeeklyStrategyRequest,
): GenerationContextRows {
  return [
    {
      label: "Daily calorie target",
      value: `${request.nutrition.targetCaloriesPerDay} kcal`,
    },
    {
      label: "Daily protein target",
      value: `${request.nutrition.targetProteinGramsPerDay} g`,
    },
    {
      label: "Daily carb target",
      value:
        request.nutrition.targetCarbsGramsPerDay === undefined
          ? "(not set)"
          : `${request.nutrition.targetCarbsGramsPerDay} g`,
    },
    {
      label: "Daily fat target",
      value:
        request.nutrition.targetFatGramsPerDay === undefined
          ? "(not set)"
          : `${request.nutrition.targetFatGramsPerDay} g`,
    },
    {
      label: "Variety level",
      value: varietyLevelLabel(request.foodPreferences.varietyLevel),
    },
    {
      label: "Cuisine preferences",
      value: request.foodPreferences.cuisines?.length
        ? cuisinePreferenceLabels(request.foodPreferences.cuisines).join(", ")
        : "(none)",
    },
    {
      label: "Protein preferences",
      value: request.foodPreferences.proteinPreferences?.length
        ? proteinPreferenceLabels(request.foodPreferences.proteinPreferences).join(", ")
        : "(none)",
    },
    {
      label: "Food experience preferences",
      value: request.foodPreferences.experiencePreferences?.length
        ? experiencePreferenceLabels(request.foodPreferences.experiencePreferences).join(
            ", ",
          )
        : "(none)",
    },
    {
      label: "Prep frequency",
      value: prepFrequencyLabel(request.cookingPreferences.prepFrequency),
    },
    {
      label: "Prep-session time",
      value: prepSessionMinutesLabel(request.cookingPreferences.maxPrepSessionMinutes),
    },
    {
      label: "Cooking style",
      value: cookingStyleLabel(request.cookingPreferences.cookingStyle),
    },
    {
      label: "Max finish time",
      value: `${request.cookingPreferences.maxFinishMinutes} min`,
    },
    {
      label: "Dinner prep → next lunch",
      value: request.cookingPreferences.useDinnerPrepForNextLunch ? "Yes" : "No",
    },
    {
      label: "Allergies",
      value: request.foodPreferences.allergies.length
        ? request.foodPreferences.allergies.join(", ")
        : "(none)",
    },
    {
      label: "Dietary restrictions",
      value: request.foodPreferences.dietaryRestrictions.length
        ? request.foodPreferences.dietaryRestrictions.join(", ")
        : "(none)",
    },
    {
      label: "Dislikes",
      value: request.foodPreferences.dislikes.length
        ? request.foodPreferences.dislikes.join(", ")
        : "(none)",
    },
  ];
}

export function buildWeeklyStrategyAiDetailsRows(
  meta?: WeeklyStrategyGenerationMeta,
): GenerationContextRows {
  const usage = meta?.usageMetadata;
  const usageParts = [
    usage?.promptTokenCount !== undefined ? `prompt ${usage.promptTokenCount}` : null,
    usage?.candidatesTokenCount !== undefined
      ? `candidates ${usage.candidatesTokenCount}`
      : null,
    usage?.totalTokenCount !== undefined ? `total ${usage.totalTokenCount}` : null,
  ].filter((part): part is string => part !== null);

  return [
    { label: "Provider", value: meta?.provider ?? "(not returned)" },
    { label: "Model", value: meta?.model ?? "(not returned)" },
    { label: "Prompt", value: meta?.promptVersion ?? "(not returned)" },
    { label: "Request ID", value: meta?.requestId ?? "(not returned)" },
    {
      label: "Duration",
      value: meta?.durationMs === undefined ? "(not returned)" : `${meta.durationMs} ms`,
    },
    {
      label: "Usage",
      value: usageParts.length ? usageParts.join(" • ") : "(not returned)",
    },
  ];
}

export function buildStrategySummaryRows(
  strategy: WeeklyMealStrategy,
): GenerationContextRows {
  return [
    {
      label: "Variety",
      value: varietyLevelLabel(strategy.strategySummary.varietyLevel),
    },
    { label: "Breakfast pattern", value: strategy.strategySummary.breakfastPattern },
    { label: "Lunch pattern", value: strategy.strategySummary.lunchPattern },
    { label: "Dinner pattern", value: strategy.strategySummary.dinnerPattern },
    { label: "Snack pattern", value: strategy.strategySummary.snackPattern },
    { label: "Prep approach", value: strategy.strategySummary.prepApproach },
  ];
}

export function buildStrategyStatsRows(stats: WeeklyStrategyStats): GenerationContextRows {
  return [
    { label: "Total meal slots", value: String(stats.totalMealSlots) },
    { label: "Unique concepts", value: String(stats.uniqueConcepts) },
    { label: "Repeated meal slots", value: String(stats.repeatedMealSlots) },
    { label: "Unique breakfasts", value: String(stats.uniqueBreakfastConcepts) },
    { label: "Unique lunches", value: String(stats.uniqueLunchConcepts) },
    { label: "Unique snacks", value: String(stats.uniqueSnackConcepts) },
    { label: "Unique dinners", value: String(stats.uniqueDinnerConcepts) },
    {
      label: "Cuisine families",
      value: stats.cuisineFamilies.length ? stats.cuisineFamilies.join(", ") : "(none)",
    },
    {
      label: "Primary proteins",
      value: stats.primaryProteins.length ? stats.primaryProteins.join(", ") : "(none)",
    },
  ];
}

export function isRepeatedConcept(concept: WeeklyMealConcept): boolean {
  return Boolean(concept.repeatOfConceptId);
}

export function findFirstConceptOccurrence(
  days: readonly WeeklyDayStrategy[],
  conceptId: string,
): { day: DayOfWeek; mealType: MealType } | null {
  for (const day of days) {
    for (const mealType of MEAL_SLOTS) {
      const concept = day[mealType];
      if (concept?.conceptId === conceptId && !concept.repeatOfConceptId) {
        return { day: day.day, mealType };
      }
    }
  }
  for (const day of days) {
    for (const mealType of MEAL_SLOTS) {
      const concept = day[mealType];
      if (concept?.conceptId === conceptId) {
        return { day: day.day, mealType };
      }
    }
  }
  return null;
}

export function repeatStatusLabel(
  concept: WeeklyMealConcept,
  days: readonly WeeklyDayStrategy[],
): string | null {
  if (!concept.repeatOfConceptId) {
    return null;
  }
  const first = findFirstConceptOccurrence(days, concept.repeatOfConceptId);
  if (!first) {
    return "Repeat";
  }
  return `Same as ${dayOfWeekLabel(first.day)} ${mealTypeLabel(first.mealType).toLowerCase()}`;
}

export function formatConceptMetaLine(concept: WeeklyMealConcept): string | null {
  const parts = [concept.cuisineFamily, concept.primaryProtein].filter(
    (value): value is string => Boolean(value),
  );
  return parts.length ? parts.join(" • ") : null;
}

export function formatPrepLine(concept: WeeklyMealConcept): string {
  const parts = [prepIntentLabel(concept.prepIntent)];
  if (concept.estimatedFinishMinutes !== undefined) {
    parts.push(`≤${concept.estimatedFinishMinutes} min finish`);
  }
  return parts.join(" • ");
}

export type WeeklyStrategyPreviewSlotView = {
  mealType: MealType;
  mealTypeLabel: string;
  name: string;
  metaLine: string | null;
  flavorLine: string | null;
  experienceLine: string | null;
  prepLine: string;
  repeatLabel: string | null;
  isRepeat: boolean;
};

export type WeeklyStrategyPreviewDayView = {
  day: DayOfWeek;
  dayLabel: string;
  slots: WeeklyStrategyPreviewSlotView[];
};

export function buildWeeklyDayViews(
  days: readonly WeeklyDayStrategy[],
): WeeklyStrategyPreviewDayView[] {
  return days.map((day) => ({
    day: day.day,
    dayLabel: dayOfWeekLabel(day.day).toUpperCase(),
    slots: MEAL_SLOTS.flatMap((mealType) => {
      const concept = day[mealType];
      if (!concept) {
        return [];
      }
      return [
        {
          mealType,
          mealTypeLabel: mealTypeLabel(mealType),
          name: concept.name,
          metaLine: formatConceptMetaLine(concept),
          flavorLine: concept.flavorFamilies?.length
            ? concept.flavorFamilies.join(", ")
            : null,
          experienceLine: concept.experienceTags?.length
            ? concept.experienceTags.join(", ")
            : null,
          prepLine: formatPrepLine(concept),
          repeatLabel: repeatStatusLabel(concept, days),
          isRepeat: isRepeatedConcept(concept),
        },
      ];
    }),
  }));
}

export function humanizeWeeklyStrategyError(message: string, code?: string): string {
  if (code === "LLM_CONFIGURATION_ERROR") {
    return `${message} Set GEMINI_API_KEY as a Supabase Edge Function secret, then redeploy generate-weekly-strategy.`;
  }
  if (message === "Failed to send a request to the Edge Function") {
    return "Could not reach generate-weekly-strategy. Deploy it with CORS enabled (`npx supabase functions deploy generate-weekly-strategy`) and confirm EXPO_PUBLIC_SUPABASE_URL points at that project.";
  }
  if (message === "Edge Function returned a non-2xx status code") {
    return "Weekly strategy generation failed in the Edge Function (non-2xx). Check that generate-weekly-strategy is deployed and GEMINI_API_KEY is set.";
  }
  return message;
}

export function parseGenerateWeeklyStrategyFailure(input: {
  errorMessage?: string | null;
  data?: unknown;
}): WeeklyStrategyPreviewError {
  const data = input.data;
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error: unknown }).error;
    if (typeof err === "string") {
      return {
        message: err,
        diagnostics: sanitizeDiagnosticText(data),
      };
    }
    if (err && typeof err === "object") {
      const record = err as { code?: unknown; message?: unknown; details?: unknown };
      const code = typeof record.code === "string" ? record.code : undefined;
      const baseMessage =
        typeof record.message === "string" && record.message.trim()
          ? record.message
          : input.errorMessage?.trim() || "Weekly strategy generation failed.";
      return {
        message: humanizeWeeklyStrategyError(baseMessage, code),
        code,
        diagnostics: sanitizeDiagnosticText(record.details ?? data),
      };
    }
  }
  return {
    message: humanizeWeeklyStrategyError(
      input.errorMessage?.trim() || "Weekly strategy generation failed.",
      undefined,
    ),
    diagnostics: sanitizeDiagnosticText(data),
  };
}

export type InvokeGenerateWeeklyStrategyError = {
  message: string;
  context?: unknown;
};

export type InvokeGenerateWeeklyStrategyFn = (
  functionName: string,
  options: { body: WeeklyStrategyRequest },
) => Promise<{ data: unknown; error: InvokeGenerateWeeklyStrategyError | null }>;

export async function invokeGenerateWeeklyStrategy(
  invoke: InvokeGenerateWeeklyStrategyFn,
  request: WeeklyStrategyRequest,
): Promise<
  | {
      ok: true;
      strategy: WeeklyMealStrategy;
      stats: WeeklyStrategyStats;
      meta?: WeeklyStrategyGenerationMeta;
    }
  | { ok: false; error: WeeklyStrategyPreviewError }
> {
  const { data, error } = await invoke(WEEKLY_STRATEGY_FUNCTION_NAME, { body: request });
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
      return {
        ok: false,
        error: parseGenerateWeeklyStrategyFailure({ data }),
      };
    }
    return {
      ok: false,
      error: { message: "Weekly strategy generation returned an empty response." },
    };
  }
  const payload = data as GenerateWeeklyStrategyResponse;
  return {
    ok: true,
    strategy: payload.strategy as WeeklyMealStrategy,
    stats: payload.stats,
    meta: payload.meta,
  };
}

export type WeeklyStrategyPreviewHistoryEntry = {
  id: string;
  label: string;
  request: WeeklyStrategyRequest;
  strategy: WeeklyMealStrategy;
  stats: WeeklyStrategyStats;
  meta?: WeeklyStrategyGenerationMeta;
};

export type WeeklyStrategyPreviewUiState = {
  busy: boolean;
  error: WeeklyStrategyPreviewError | null;
  current: WeeklyStrategyPreviewHistoryEntry | null;
  history: WeeklyStrategyPreviewHistoryEntry[];
  showContext: boolean;
  showRaw: boolean;
  showAiDetails: boolean;
};

export function createWeeklyStrategyPreviewUiState(): WeeklyStrategyPreviewUiState {
  return {
    busy: false,
    error: null,
    current: null,
    history: [],
    showContext: true,
    showRaw: false,
    showAiDetails: true,
  };
}

export function canStartWeeklyStrategyGeneration(
  state: WeeklyStrategyPreviewUiState,
): boolean {
  return !state.busy;
}

export function beginWeeklyStrategyGeneration(
  state: WeeklyStrategyPreviewUiState,
): WeeklyStrategyPreviewUiState {
  if (!canStartWeeklyStrategyGeneration(state)) {
    return state;
  }
  return {
    ...state,
    busy: true,
    error: null,
  };
}

export function failWeeklyStrategyGeneration(
  state: WeeklyStrategyPreviewUiState,
  error: WeeklyStrategyPreviewError,
): WeeklyStrategyPreviewUiState {
  return {
    ...state,
    busy: false,
    error,
  };
}

export function succeedWeeklyStrategyGeneration(
  state: WeeklyStrategyPreviewUiState,
  entry: Omit<WeeklyStrategyPreviewHistoryEntry, "id" | "label"> & { id?: string },
): WeeklyStrategyPreviewUiState {
  const generationNumber = state.history.length + 1;
  const nextEntry: WeeklyStrategyPreviewHistoryEntry = {
    id: entry.id ?? `week_${generationNumber}_${Date.now()}`,
    label: `Week ${generationNumber}`,
    request: entry.request,
    strategy: entry.strategy,
    stats: entry.stats,
    meta: entry.meta,
  };
  return {
    ...state,
    busy: false,
    error: null,
    current: nextEntry,
    history: [...state.history, nextEntry],
  };
}

export function selectWeeklyStrategyHistoryEntry(
  state: WeeklyStrategyPreviewUiState,
  id: string,
): WeeklyStrategyPreviewUiState {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) {
    return state;
  }
  return { ...state, current: entry, error: null };
}

export function weeklyStrategyPreviewContainsSecrets(text: string): boolean {
  return /api[_-]?key/i.test(text) || /GEMINI_API_KEY/i.test(text) || /bearer\s+/i.test(text);
}
