import type {
  CompleteMeal,
  ComposeMealsResponse,
  ResolvedRecipe,
  WeeklyMealCompositionResult,
} from "@fitness-autopilot/contracts";
import {
  DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
  FIBER_POLICY_VERSION,
  MEAL_COMPOSITION_POLICY_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
} from "@fitness-autopilot/contracts";
import { plan009SimpleResolvedRecipes } from "@fitness-autopilot/domain";
import { readFunctionsInvokeErrorBody } from "./recipe-preview";

export const COMPOSE_MEALS_FUNCTION_NAME = "compose-meals";
export const MEAL_COMPOSITION_PREVIEW_TITLE = "Meal Composition Preview";
export const MEAL_COMPOSITION_PREVIEW_LOADING = "Composing complete meals...";

export type MealCompositionGenerationMeta = NonNullable<ComposeMealsResponse["meta"]>;

export { plan009SimpleResolvedRecipes };

export type MealCompositionPreviewUiState = {
  busy: boolean;
  error: { message: string; code?: string; diagnostics?: string } | null;
  recipes: ResolvedRecipe[];
  result: WeeklyMealCompositionResult | null;
  meta?: MealCompositionGenerationMeta;
  selectedCandidateId: string | null;
  showRaw: boolean;
  targetCalories: number;
};

export function createMealCompositionPreviewUiState(): MealCompositionPreviewUiState {
  const recipes = plan009SimpleResolvedRecipes();
  return {
    busy: false,
    error: null,
    recipes,
    result: null,
    selectedCandidateId: recipes[0]?.candidateId ?? null,
    showRaw: false,
    targetCalories: 2250,
  };
}

export function humanizeMealCompositionError(error: {
  message: string;
  code?: string;
}): string {
  if (error.code === "RATE_LIMITED") {
    return "Gemini rate-limited meal composition. Try again shortly.";
  }
  if (error.code === "LLM_CONFIGURATION_ERROR") {
    return "Gemini API key is not configured on the Edge Function.";
  }
  if (error.message === "Failed to send a request to the Edge Function") {
    return "Could not reach compose-meals. Deploy it with CORS enabled and confirm EXPO_PUBLIC_SUPABASE_URL points at that project.";
  }
  if (error.message === "Edge Function returned a non-2xx status code") {
    return "Meal composition failed in the Edge Function (non-2xx). Confirm compose-meals is deployed.";
  }
  return error.message;
}

type InvokeClient = (
  functionName: string,
  options: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: { message: string; context?: unknown } | null }>;

export async function invokeComposeMeals(
  invoke: InvokeClient,
  body: {
    recipes: ResolvedRecipe[];
    uniqueCandidateIds?: string[];
    concurrency?: number;
    targetCalories?: number;
    allergies?: string[];
    dietaryRestrictions?: string[];
    dislikes?: string[];
    resolveAddedComponents?: boolean;
  },
): Promise<
  | {
      ok: true;
      result: WeeklyMealCompositionResult;
      meta?: MealCompositionGenerationMeta;
    }
  | {
      ok: false;
      error: { message: string; code?: string; diagnostics?: string };
      meta?: MealCompositionGenerationMeta;
    }
> {
  const invoked = await invoke(COMPOSE_MEALS_FUNCTION_NAME, {
    body: {
      recipes: body.recipes,
      uniqueCandidateIds: body.uniqueCandidateIds,
      concurrency: body.concurrency ?? DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
      targetCalories: body.targetCalories,
      allergies: body.allergies ?? [],
      dietaryRestrictions: body.dietaryRestrictions ?? [],
      dislikes: body.dislikes ?? [],
      resolveAddedComponents: body.resolveAddedComponents ?? true,
      mealType: "dinner",
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

  const data = invoked.data as ComposeMealsResponse | null;
  if (!data || typeof data !== "object" || !("result" in data) || !data.result) {
    return {
      ok: false,
      error: { message: "compose-meals returned an empty payload." },
    };
  }

  return { ok: true, result: data.result, meta: data.meta };
}

export function weeklyCompositionSummaryRows(
  result: WeeklyMealCompositionResult | null,
): Array<{ label: string; value: string }> {
  if (!result) return [];
  const d = result.diagnostics;
  return [
    { label: "Unique mains", value: String(d.uniqueMainRecipes) },
    { label: "Provider calls", value: String(d.compositionProviderCalls) },
    {
      label: "Complete / with additions",
      value: `${d.mealsAlreadyComplete} / ${d.mealsWithAddedComponents}`,
    },
    {
      label: "Added components (total / unique / reused)",
      value: `${d.totalAddedComponents} / ${d.uniqueAddedComponents} / ${d.reusedComponents}`,
    },
    {
      label: "Atomic / recipe / unresolved",
      value: `${d.atomicComponents} / ${d.recipeComponents} / ${d.unresolvedComponents}`,
    },
    {
      label: "Daily fiber target",
      value: result.fiberTarget
        ? `${result.fiberTarget.displayFiberGrams} g (${result.fiberTarget.policyVersion})`
        : "—",
    },
    {
      label: "Policies",
      value: `${MEAL_COMPOSITION_POLICY_VERSION} · ${MEAL_COMPOSITION_PROMPT_VERSION} · ${FIBER_POLICY_VERSION}`,
    },
  ];
}

export function roleCheck(label: string, ok: boolean): string {
  return `${ok ? "✓" : "✗"} ${label}`;
}

export function sourceLabel(source: CompleteMeal["components"][number]["source"]): string {
  switch (source) {
    case "main_recipe":
      return "Intrinsic recipe";
    case "existing_recipe_component":
      return "Existing PLAN-008 component";
    case "composition_engine":
      return "Composition engine addition";
    default:
      return source;
  }
}

export function resolutionLabel(
  component: CompleteMeal["components"][number],
): string {
  const status = component.resolution?.status;
  if (!status) return "—";
  if (status === "canonical_food_resolved") return "canonical food resolved · pending quantity";
  if (status === "component_recipe_resolved") return "component recipe resolved · pending quantity";
  if (status === "pending_quantity") return "pending quantity";
  if (status === "skipped_intrinsic") return "intrinsic / covered by main";
  return "unresolved";
}
