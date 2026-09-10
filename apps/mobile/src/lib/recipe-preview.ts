import type {
  CookingPreferences,
  GenerateRecipeResponse,
  MealPreferences,
  MealType,
  NutritionTarget,
  RecipeCandidate,
  RecipeGenerationRequest,
  RecipeIngredientCandidate,
} from "@fitness-autopilot/contracts";
import {
  CUISINE_OPTIONS,
  EXPERIENCE_OPTIONS,
  PROTEIN_OPTIONS,
  VARIETY_OPTIONS,
  WEEKLY_COOKING_STYLE_OPTIONS,
} from "@fitness-autopilot/contracts";
import { PlannerPolicy } from "@fitness-autopilot/domain";

export const RECIPE_PREVIEW_MEAL_TYPES: readonly MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
] as const;

export const DEFAULT_RECIPE_PREVIEW_MEAL_TYPE: MealType = "dinner";

export type RecipeGenerationMeta = NonNullable<GenerateRecipeResponse["meta"]>;

export type RecipePreviewError = {
  message: string;
  code?: string;
  /** Non-secret diagnostic text for development. */
  diagnostics?: string;
};

export type RecipePreviewSessionInput = {
  nutritionTarget: NutritionTarget | null;
  mealPreferences: MealPreferences | null;
  cookingPreferences: CookingPreferences | null;
};

export function mealTypeLabel(mealType: MealType): string {
  switch (mealType) {
    case "breakfast":
      return "Breakfast";
    case "lunch":
      return "Lunch";
    case "dinner":
      return "Dinner";
    case "snack":
      return "Snack";
  }
}

export function measurementStateLabel(
  state: RecipeIngredientCandidate["measurementState"],
): string {
  switch (state) {
    case "raw":
      return "raw";
    case "cooked":
      return "cooked";
    case "as_packaged":
      return "as packaged";
  }
}

function labelFromOptions<T extends string>(
  value: T,
  options: ReadonlyArray<{ value: T; label: string }>,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function cuisinePreferenceLabels(values: readonly string[]): string[] {
  return values.map((value) =>
    labelFromOptions(
      value as (typeof CUISINE_OPTIONS)[number]["value"],
      CUISINE_OPTIONS as ReadonlyArray<{ value: string; label: string }>,
    ),
  );
}

export function proteinPreferenceLabels(values: readonly string[]): string[] {
  return values.map((value) =>
    labelFromOptions(
      value as (typeof PROTEIN_OPTIONS)[number]["value"],
      PROTEIN_OPTIONS as ReadonlyArray<{ value: string; label: string }>,
    ),
  );
}

export function experiencePreferenceLabels(values: readonly string[]): string[] {
  return values.map((value) =>
    labelFromOptions(
      value as (typeof EXPERIENCE_OPTIONS)[number]["value"],
      EXPERIENCE_OPTIONS as ReadonlyArray<{ value: string; label: string }>,
    ),
  );
}

export function varietyLevelLabel(value: string): string {
  return labelFromOptions(
    value as (typeof VARIETY_OPTIONS)[number]["value"],
    VARIETY_OPTIONS as ReadonlyArray<{ value: string; label: string }>,
  );
}

export function cookingStyleLabel(value: string): string {
  return labelFromOptions(
    value as (typeof WEEKLY_COOKING_STYLE_OPTIONS)[number]["value"],
    WEEKLY_COOKING_STYLE_OPTIONS as ReadonlyArray<{ value: string; label: string }>,
  );
}

export function mealShareTargets(
  mealType: MealType,
  nutritionTarget: NutritionTarget | null,
): { targetCalories?: number; targetProteinGrams?: number } {
  if (!nutritionTarget) {
    return {};
  }
  const calorieShare = PlannerPolicy.mealCalorieShares[mealType];
  const proteinShare = PlannerPolicy.mealProteinShares[mealType];
  return {
    targetCalories: Math.max(1, Math.round(nutritionTarget.targetCalories * calorieShare)),
    targetProteinGrams: Math.max(1, Math.round(nutritionTarget.proteinG * proteinShare)),
  };
}

/**
 * Build PLAN-003 request from saved nutrition + PLAN-001/002 preferences.
 */
export function buildRecipeGenerationRequest(
  mealType: MealType,
  session: RecipePreviewSessionInput,
): RecipeGenerationRequest {
  const shares = mealShareTargets(mealType, session.nutritionTarget);
  const meal = session.mealPreferences;
  const cooking = session.cookingPreferences;
  return {
    mealType,
    ...shares,
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
    varietyLevel: meal?.varietyLevel,
    cookingStyle: cooking?.cookingStyle,
    maxFinishMinutes: cooking?.maxFinishMinutes,
  };
}

export function formatIngredientLine(ingredient: RecipeIngredientCandidate): string {
  const note = ingredient.preparationNote ? ` (${ingredient.preparationNote})` : "";
  return `${ingredient.quantityGrams} g ${ingredient.name} — ${measurementStateLabel(
    ingredient.measurementState,
  )}${note}`;
}

export function formatRecipeTotalMinutes(recipe: RecipeCandidate): number {
  return recipe.prepMinutes + recipe.cookMinutes;
}

export type GenerationContextRows = Array<{ label: string; value: string }>;

export function buildGenerationContextRows(
  request: RecipeGenerationRequest,
): GenerationContextRows {
  return [
    { label: "Meal type", value: mealTypeLabel(request.mealType) },
    {
      label: "Requested target calories",
      value:
        request.targetCalories === undefined
          ? "(not set)"
          : `${request.targetCalories} kcal (meal share guidance)`,
    },
    {
      label: "Requested target protein",
      value:
        request.targetProteinGrams === undefined
          ? "(not set)"
          : `${request.targetProteinGrams} g (meal share guidance)`,
    },
    {
      label: "Cuisine preferences",
      value: request.cuisines?.length
        ? cuisinePreferenceLabels(request.cuisines).join(", ")
        : "(none)",
    },
    {
      label: "Protein preferences",
      value: request.proteinPreferences?.length
        ? proteinPreferenceLabels(request.proteinPreferences).join(", ")
        : "(none)",
    },
    {
      label: "Food experience preferences",
      value: request.experiencePreferences?.length
        ? experiencePreferenceLabels(request.experiencePreferences).join(", ")
        : "(none)",
    },
    {
      label: "Variety level",
      value: request.varietyLevel ? varietyLevelLabel(request.varietyLevel) : "(none)",
    },
    {
      label: "Cooking style",
      value: request.cookingStyle ? cookingStyleLabel(String(request.cookingStyle)) : "(none)",
    },
    {
      label: "Max finish time",
      value:
        request.maxFinishMinutes === undefined
          ? "(none)"
          : `${request.maxFinishMinutes} min`,
    },
    {
      label: "Allergies",
      value: request.allergies.length ? request.allergies.join(", ") : "(none)",
    },
    {
      label: "Dietary restrictions",
      value: request.dietaryRestrictions.length
        ? request.dietaryRestrictions.join(", ")
        : "(none)",
    },
    {
      label: "Dislikes",
      value: request.dislikes.length ? request.dislikes.join(", ") : "(none)",
    },
  ];
}

export function buildAiDetailsRows(
  recipe: RecipeCandidate,
  meta?: RecipeGenerationMeta,
): GenerationContextRows {
  return [
    { label: "Provider", value: meta?.provider ?? recipe.source.provider },
    { label: "Model", value: meta?.model ?? recipe.source.model },
    {
      label: "Prompt",
      value: meta?.promptVersion ?? "(not returned)",
    },
    {
      label: "Request ID",
      value: meta?.requestId ?? "(not returned)",
    },
    {
      label: "Duration",
      value:
        meta?.durationMs === undefined ? "(not returned)" : `${meta.durationMs} ms`,
    },
    { label: "Source type", value: recipe.source.type },
  ];
}

const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /GEMINI_API_KEY/i,
  /Authorization/i,
  /bearer\s+[a-z0-9._-]+/i,
  /service[_-]?role/i,
];

export function sanitizeDiagnosticText(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return undefined;
  }
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      return "(diagnostics omitted — may contain secrets)";
    }
  }
  // Cap length for UI
  return text.length > 800 ? `${text.slice(0, 800)}…` : text;
}

export function parseGenerateRecipeFailure(input: {
  errorMessage?: string | null;
  data?: unknown;
}): RecipePreviewError {
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
      const message =
        typeof record.message === "string" && record.message.trim()
          ? record.message
          : input.errorMessage?.trim() || "Recipe generation failed.";
      const code = typeof record.code === "string" ? record.code : undefined;
      return {
        message,
        code,
        diagnostics: sanitizeDiagnosticText(record.details ?? data),
      };
    }
  }
  return {
    message: input.errorMessage?.trim() || "Recipe generation failed.",
    diagnostics: sanitizeDiagnosticText(data),
  };
}

export type InvokeGenerateRecipeFn = (
  functionName: string,
  options: { body: RecipeGenerationRequest },
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function invokeGenerateRecipe(
  invoke: InvokeGenerateRecipeFn,
  request: RecipeGenerationRequest,
): Promise<
  | { ok: true; recipe: RecipeCandidate; meta?: RecipeGenerationMeta }
  | { ok: false; error: RecipePreviewError }
> {
  const { data, error } = await invoke("generate-recipe", { body: request });
  if (error) {
    return {
      ok: false,
      error: parseGenerateRecipeFailure({
        errorMessage: error.message,
        data,
      }),
    };
  }
  if (!data || typeof data !== "object" || !("recipe" in data)) {
    if (data && typeof data === "object" && "error" in data) {
      return {
        ok: false,
        error: parseGenerateRecipeFailure({ data }),
      };
    }
    return {
      ok: false,
      error: { message: "Recipe generation returned an empty response." },
    };
  }
  const payload = data as GenerateRecipeResponse;
  return {
    ok: true,
    recipe: payload.recipe,
    meta: payload.meta,
  };
}

export type RecipePreviewHistoryEntry = {
  id: string;
  label: string;
  request: RecipeGenerationRequest;
  recipe: RecipeCandidate;
  meta?: RecipeGenerationMeta;
};

export type RecipePreviewUiState = {
  mealType: MealType;
  busy: boolean;
  error: RecipePreviewError | null;
  /** Last successful generation; kept visible while a new request is in flight. */
  current: RecipePreviewHistoryEntry | null;
  history: RecipePreviewHistoryEntry[];
  showContext: boolean;
  showRaw: boolean;
  showAiDetails: boolean;
};

export function createRecipePreviewUiState(
  mealType: MealType = DEFAULT_RECIPE_PREVIEW_MEAL_TYPE,
): RecipePreviewUiState {
  return {
    mealType,
    busy: false,
    error: null,
    current: null,
    history: [],
    showContext: true,
    showRaw: false,
    showAiDetails: true,
  };
}

export function canStartGeneration(state: RecipePreviewUiState): boolean {
  return !state.busy;
}

export function beginRecipeGeneration(state: RecipePreviewUiState): RecipePreviewUiState {
  if (!canStartGeneration(state)) {
    return state;
  }
  return {
    ...state,
    busy: true,
    error: null,
  };
}

export function failRecipeGeneration(
  state: RecipePreviewUiState,
  error: RecipePreviewError,
): RecipePreviewUiState {
  return {
    ...state,
    busy: false,
    error,
  };
}

export function succeedRecipeGeneration(
  state: RecipePreviewUiState,
  entry: Omit<RecipePreviewHistoryEntry, "id" | "label"> & { id?: string },
): RecipePreviewUiState {
  const generationNumber = state.history.length + 1;
  const nextEntry: RecipePreviewHistoryEntry = {
    id: entry.id ?? `gen_${generationNumber}_${Date.now()}`,
    label: `Generation ${generationNumber}`,
    request: entry.request,
    recipe: entry.recipe,
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

export function selectHistoryEntry(
  state: RecipePreviewUiState,
  id: string,
): RecipePreviewUiState {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) {
    return state;
  }
  return { ...state, current: entry, error: null };
}

/** Assert helper text never includes secret-like tokens for UI rendering. */
export function assertSafeForClientDisplay(text: string): boolean {
  return !SECRET_PATTERNS.some((pattern) => pattern.test(text));
}
