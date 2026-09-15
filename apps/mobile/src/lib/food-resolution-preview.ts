import type {
  ResolveRecipeNutritionResponse,
  ResolvedRecipe,
  WeeklyRecipeNutritionResult,
} from "@fitness-autopilot/contracts";
import {
  DEFAULT_FOOD_RESOLUTION_CONCURRENCY,
  FOOD_RESOLUTION_POLICY_VERSION,
  NUTRITION_CALCULATION_POLICY_VERSION,
  QUANTITY_NORMALIZATION_POLICY_VERSION,
} from "@fitness-autopilot/contracts";
import { plan009SimpleResolvedRecipes } from "@fitness-autopilot/domain";
import { readFunctionsInvokeErrorBody } from "./recipe-preview";

export const RESOLVE_RECIPE_NUTRITION_FUNCTION_NAME = "resolve-recipe-nutrition";
export const FOOD_RESOLUTION_PREVIEW_TITLE = "Food Resolution Preview";
export const FOOD_RESOLUTION_PREVIEW_LOADING = "Resolving canonical foods & nutrition...";

export type FoodResolutionGenerationMeta = NonNullable<
  ResolveRecipeNutritionResponse["meta"]
>;

export { plan009SimpleResolvedRecipes };

export type FoodResolutionPreviewUiState = {
  busy: boolean;
  error: { message: string; code?: string; diagnostics?: string } | null;
  recipes: ResolvedRecipe[];
  result: WeeklyRecipeNutritionResult | null;
  meta?: FoodResolutionGenerationMeta;
  selectedCandidateId: string | null;
  showRaw: boolean;
};

export function createFoodResolutionPreviewUiState(): FoodResolutionPreviewUiState {
  const recipes = plan009SimpleResolvedRecipes();
  return {
    busy: false,
    error: null,
    recipes,
    result: null,
    selectedCandidateId: recipes[0]?.candidateId ?? null,
    showRaw: false,
  };
}

export function humanizeFoodResolutionError(error: {
  message: string;
  code?: string;
}): string {
  if (error.code === "FOOD_PROVIDER_RATE_LIMITED") {
    return "USDA rate-limited food resolution. Try again shortly.";
  }
  if (error.code === "FOOD_PROVIDER_CONFIGURATION_ERROR") {
    return "USDA_API_KEY is not configured on the Edge Function.";
  }
  if (error.message === "Failed to send a request to the Edge Function") {
    return "Could not reach resolve-recipe-nutrition. Deploy it with CORS enabled and confirm EXPO_PUBLIC_SUPABASE_URL.";
  }
  return error.message;
}

type InvokeClient = (
  functionName: string,
  options: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: { message: string; context?: unknown } | null }>;

export async function invokeResolveRecipeNutrition(
  invoke: InvokeClient,
  body: {
    recipes: ResolvedRecipe[];
    uniqueCandidateIds?: string[];
    concurrency?: number;
    enableSemanticDisambiguation?: boolean;
  },
): Promise<
  | {
      ok: true;
      result: WeeklyRecipeNutritionResult;
      meta?: FoodResolutionGenerationMeta;
    }
  | {
      ok: false;
      error: { message: string; code?: string; diagnostics?: string };
      meta?: FoodResolutionGenerationMeta;
    }
> {
  const invoked = await invoke(RESOLVE_RECIPE_NUTRITION_FUNCTION_NAME, {
    body: {
      recipes: body.recipes,
      uniqueCandidateIds: body.uniqueCandidateIds,
      concurrency: body.concurrency ?? DEFAULT_FOOD_RESOLUTION_CONCURRENCY,
      enableSemanticDisambiguation: body.enableSemanticDisambiguation ?? true,
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

  const data = invoked.data as ResolveRecipeNutritionResponse | null;
  if (!data || typeof data !== "object" || !("result" in data) || !data.result) {
    return {
      ok: false,
      error: { message: "resolve-recipe-nutrition returned an empty payload." },
    };
  }

  return { ok: true, result: data.result, meta: data.meta };
}

export function weeklyNutritionSummaryRows(
  result: WeeklyRecipeNutritionResult | null,
): Array<{ label: string; value: string }> {
  if (!result) return [];
  const d = result.diagnostics;
  return [
    { label: "Unique recipes", value: String(result.recipeCount) },
    { label: "Complete / partial / blocked", value: `${result.completeCount} / ${result.partialCount} / ${result.blockedCount}` },
    { label: "Unique resolution keys", value: String(d.uniqueResolutionKeys) },
    { label: "Resolved / ambiguous / not found", value: `${d.resolvedCount} / ${d.ambiguousCount} / ${d.notFoundCount}` },
    { label: "Mapping cache hits", value: String(d.mappingCacheHits) },
    { label: "USDA searches / detail fetches", value: `${d.providerSearchCount} / ${d.providerDetailFetchCount}` },
    { label: "Semantic disambiguations", value: String(d.semanticDisambiguationCount) },
    {
      label: "Policies",
      value: `${FOOD_RESOLUTION_POLICY_VERSION} · ${NUTRITION_CALCULATION_POLICY_VERSION} · ${QUANTITY_NORMALIZATION_POLICY_VERSION}`,
    },
  ];
}

export function formatNutritionLine(n: {
  caloriesKcal: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
}): string {
  return `${Math.round(n.caloriesKcal)} kcal · P ${n.proteinGrams.toFixed(1)}g · C ${n.carbohydrateGrams.toFixed(1)}g · F ${n.fatGrams.toFixed(1)}g`;
}
