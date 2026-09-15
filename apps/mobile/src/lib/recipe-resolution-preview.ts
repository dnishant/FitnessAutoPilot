import type {
  CulinaryDiscoveryCandidate,
  RankedWeeklyStrategy,
  RecipeResolutionFailure,
  ResolvedRecipe,
  ResolveRecipesResponse,
  WeeklyRecipeResolutionResult,
} from "@fitness-autopilot/contracts";
import {
  DEFAULT_RECIPE_RESOLUTION_CONCURRENCY,
  RECIPE_RESOLUTION_PROMPT_VERSION,
} from "@fitness-autopilot/contracts";
import {
  PLAN008_SIMPLE_CANDIDATES,
  PLAN008_SIMPLE_UNIQUE_IDS,
  buildRecipeResolutionPrompt,
  getUniqueCandidatesFromWeeklyStrategy,
  plan008SimpleWeeklyStrategy,
} from "@fitness-autopilot/domain";
import { readFunctionsInvokeErrorBody } from "./recipe-preview";

export const RESOLVE_RECIPES_FUNCTION_NAME = "resolve-recipes";
export const RECIPE_RESOLUTION_PREVIEW_TITLE = "Recipe Resolution Preview";
export const RECIPE_RESOLUTION_PREVIEW_LOADING = "Resolving unique recipes...";

export type RecipeResolutionGenerationMeta = NonNullable<ResolveRecipesResponse["meta"]>;

export type RecipeResolutionPreviewUiState = {
  busy: boolean;
  error: { message: string; code?: string; diagnostics?: string } | null;
  strategy: RankedWeeklyStrategy | null;
  candidates: CulinaryDiscoveryCandidate[];
  uniqueCandidateIds: string[];
  result: WeeklyRecipeResolutionResult | null;
  failures: RecipeResolutionFailure[];
  meta?: RecipeResolutionGenerationMeta;
  selectedCandidateId: string | null;
  showRaw: boolean;
  showPrompt: boolean;
};

export function createRecipeResolutionPreviewUiState(): RecipeResolutionPreviewUiState {
  const strategy = plan008SimpleWeeklyStrategy();
  return {
    busy: false,
    error: null,
    strategy,
    candidates: [...PLAN008_SIMPLE_CANDIDATES],
    uniqueCandidateIds: [...PLAN008_SIMPLE_UNIQUE_IDS],
    result: null,
    failures: [],
    selectedCandidateId: PLAN008_SIMPLE_UNIQUE_IDS[0] ?? null,
    showRaw: false,
    showPrompt: false,
  };
}

export function slotUsageCountForCandidate(
  strategy: RankedWeeklyStrategy | null,
  candidateId: string,
): number {
  if (!strategy) return 0;
  let count = 0;
  for (const day of strategy.days) {
    if (day.lunch.candidateId === candidateId) count += 1;
    if (day.dinner.candidateId === candidateId) count += 1;
  }
  return count;
}

export function buildRecipeResolutionPromptPreview(
  candidate: CulinaryDiscoveryCandidate,
): { systemInstruction: string; userPrompt: string; version: string } {
  const prompt = buildRecipeResolutionPrompt({ candidate });
  return {
    systemInstruction: prompt.systemInstruction,
    userPrompt: prompt.userPrompt,
    version: prompt.version,
  };
}

export function humanizeRecipeResolutionError(error: {
  message: string;
  code?: string;
}): string {
  if (error.code === "RATE_LIMITED") {
    return "Gemini rate-limited recipe resolution. Try again shortly.";
  }
  if (error.code === "PARTIAL_WEEKLY_RESOLUTION_FAILURE") {
    return error.message;
  }
  return error.message;
}

type InvokeClient = (
  functionName: string,
  options: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: { message: string; context?: unknown } | null }>;

export async function invokeResolveRecipes(
  invoke: InvokeClient,
  body: {
    candidates: CulinaryDiscoveryCandidate[];
    uniqueCandidateIds?: string[];
    concurrency?: number;
  },
): Promise<
  | {
      ok: true;
      result: WeeklyRecipeResolutionResult;
      failures: RecipeResolutionFailure[];
      meta?: RecipeResolutionGenerationMeta;
    }
  | { ok: false; error: { message: string; code?: string; diagnostics?: string } }
> {
  const invoked = await invoke(RESOLVE_RECIPES_FUNCTION_NAME, {
    body: {
      candidates: body.candidates,
      uniqueCandidateIds: body.uniqueCandidateIds,
      concurrency: body.concurrency ?? DEFAULT_RECIPE_RESOLUTION_CONCURRENCY,
    },
  });

  if (invoked.error) {
    const parsedBody = await readFunctionsInvokeErrorBody(invoked.error);
    const errorPayload =
      parsedBody && typeof parsedBody === "object" && "error" in parsedBody
        ? (parsedBody as { error: { message?: string; code?: string } }).error
        : null;
    return {
      ok: false,
      error: {
        message: errorPayload?.message ?? invoked.error.message,
        code: errorPayload?.code,
        diagnostics: parsedBody ? JSON.stringify(parsedBody).slice(0, 2000) : undefined,
      },
    };
  }

  const data = invoked.data as ResolveRecipesResponse | null;
  if (!data || typeof data !== "object" || !("result" in data) || !data.result) {
    return {
      ok: false,
      error: { message: "resolve-recipes returned an empty payload." },
    };
  }

  return {
    ok: true,
    result: data.result,
    failures: data.failures ?? [],
    meta: data.meta,
  };
}

export function recipeCardSummaryRows(recipe: ResolvedRecipe): Array<{ label: string; value: string }> {
  return [
    { label: "Source", value: `${recipe.source.name}${recipe.source.author ? ` · ${recipe.source.author}` : ""}` },
    { label: "Base servings", value: String(recipe.baseServings) },
    { label: "Prep / cook", value: `${recipe.prepTimeMinutes} / ${recipe.cookTimeMinutes} min` },
    {
      label: "Prep modes",
      value: recipe.supportedPrepModes.map((m) => m.mode).join(", "),
    },
    {
      label: "Experience",
      value: `${recipe.experienceProfile.moistureLevel} · ${recipe.experienceProfile.flavorIntensity} · meal-prep ${recipe.experienceProfile.mealPrepQuality}`,
    },
    {
      label: "Provider",
      value: `${recipe.resolutionMetadata.provider} / ${recipe.resolutionMetadata.model} / ${recipe.resolutionMetadata.promptVersion}`,
    },
  ];
}

export function dedupeProofRows(
  strategy: RankedWeeklyStrategy | null,
  result: WeeklyRecipeResolutionResult | null,
): Array<{ label: string; value: string }> {
  const uniqueFromStrategy = strategy
    ? getUniqueCandidatesFromWeeklyStrategy(strategy).length
    : 0;
  return [
    { label: "Weekly meal slots", value: String(result?.slotCount ?? (strategy ? 14 : 0)) },
    { label: "Unique candidates", value: String(result?.uniqueCandidateIds.length ?? uniqueFromStrategy) },
    { label: "Resolver calls", value: String(result?.resolverCallCount ?? 0) },
    { label: "Prompt version", value: RECIPE_RESOLUTION_PROMPT_VERSION },
  ];
}
