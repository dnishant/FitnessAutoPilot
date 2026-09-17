import type {
  ComposeMealsResponse,
  MealConcept,
  RankedCulinaryCandidate,
  ResolvedRecipe,
  WeeklyMealConceptResult,
} from "@fitness-autopilot/contracts";
import {
  DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
  FIBER_POLICY_VERSION,
  MEAL_COMPOSITION_POLICY_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
} from "@fitness-autopilot/contracts";
import {
  CHICKEN_TIKKA,
  JAMAICAN_JERK_CHICKEN,
  KERALA_BEEF_FRY,
  SHRIMP_TACOS,
  THAI_GREEN_CURRY,
  CA_KHO_TO,
  makeRankedCandidate,
} from "@fitness-autopilot/domain";
import { readFunctionsInvokeErrorBody } from "./recipe-preview";

export const COMPOSE_MEALS_FUNCTION_NAME = "compose-meals";
export const MEAL_COMPOSITION_PREVIEW_TITLE = "Meal Planning Pipeline Preview";
export const MEAL_COMPOSITION_PREVIEW_LOADING = "Composing complete meal concepts...";

export type MealCompositionGenerationMeta = NonNullable<ComposeMealsResponse["meta"]>;

export function planCompositionPreviewRankedCandidates(): RankedCulinaryCandidate[] {
  return [
    CHICKEN_TIKKA,
    KERALA_BEEF_FRY,
    JAMAICAN_JERK_CHICKEN,
    THAI_GREEN_CURRY,
    CA_KHO_TO,
    SHRIMP_TACOS,
  ].map((candidate, index) => makeRankedCandidate(candidate, index + 1));
}

export type MealCompositionPreviewUiState = {
  busy: boolean;
  error: { message: string; code?: string; diagnostics?: string } | null;
  rankedCandidates: RankedCulinaryCandidate[];
  concepts: WeeklyMealConceptResult | null;
  meta?: MealCompositionGenerationMeta;
  selectedCandidateId: string | null;
  showRaw: boolean;
  targetCalories: number;
};

export function createMealCompositionPreviewUiState(): MealCompositionPreviewUiState {
  const rankedCandidates = planCompositionPreviewRankedCandidates();
  return {
    busy: false,
    error: null,
    rankedCandidates,
    concepts: null,
    selectedCandidateId: rankedCandidates[0]?.candidate.candidateId ?? null,
    showRaw: false,
    targetCalories: 2250,
  };
}

export function isLegacyComposeMealsRecipesRequiredError(error: {
  message?: string;
  code?: string;
  diagnostics?: string;
}): boolean {
  const blob = `${error.message ?? ""}\n${error.diagnostics ?? ""}`;
  return (
    /"recipes"\s*:\s*\[\s*"Required"\s*\]/.test(blob) ||
    (error.code === "INVALID_COMPOSITION_REQUEST" &&
      error.message === "Required" &&
      blob.includes("recipes"))
  );
}

export function humanizeMealCompositionError(error: {
  message: string;
  code?: string;
  diagnostics?: string;
}): string {
  if (error.code === "RATE_LIMITED") {
    return "Gemini rate-limited meal composition. Try again shortly.";
  }
  if (error.code === "LLM_CONFIGURATION_ERROR") {
    return "Gemini API key is not configured on the Edge Function.";
  }
  if (isLegacyComposeMealsRecipesRequiredError(error)) {
    return "Hosted compose-meals still expects PLAN-009.5 recipes. Lightweight composition sends rankedCandidates only — deploy this branch with `pnpm sync:edge` and `npx supabase functions deploy compose-meals`, or use EXPO_PUBLIC_USE_LOCAL_PLANNER=true.";
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
    rankedCandidates: RankedCulinaryCandidate[];
    uniqueCandidateIds?: string[];
    concurrency?: number;
    targetCalories?: number;
    allergies?: string[];
    dietaryRestrictions?: string[];
    dislikes?: string[];
  },
): Promise<
  | {
      ok: true;
      concepts: WeeklyMealConceptResult;
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
      stage: "concepts",
      rankedCandidates: body.rankedCandidates,
      uniqueCandidateIds: body.uniqueCandidateIds,
      concurrency: body.concurrency ?? DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
      targetCalories: body.targetCalories,
      allergies: body.allergies ?? [],
      dietaryRestrictions: body.dietaryRestrictions ?? [],
      dislikes: body.dislikes ?? [],
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
  if (!data || typeof data !== "object" || !data.concepts) {
    return {
      ok: false,
      error: { message: "compose-meals returned an empty concept payload." },
    };
  }

  return { ok: true, concepts: data.concepts, meta: data.meta };
}

/** Selected CompleteMeal resolution (PLAN-009.5) with optional USDA staple identity. */
export async function invokeComposeSelectedCompleteMeals(
  invoke: InvokeClient,
  body: {
    mealConcepts: Record<string, MealConcept>;
    selectedCandidateIds: string[];
    recipes: ResolvedRecipe[];
    concurrency?: number;
    targetCalories?: number;
    resolveAddedComponents?: boolean;
  },
): Promise<
  | {
      ok: true;
      result: NonNullable<ComposeMealsResponse["result"]>;
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
      stage: "selected_resolution",
      mealConcepts: body.mealConcepts,
      selectedCandidateIds: body.selectedCandidateIds,
      recipes: body.recipes,
      concurrency: body.concurrency ?? DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
      targetCalories: body.targetCalories,
      resolveAddedComponents: body.resolveAddedComponents !== false,
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
  if (!data || typeof data !== "object" || !data.result) {
    return {
      ok: false,
      error: { message: "compose-meals selected_resolution returned an empty payload." },
    };
  }

  return { ok: true, result: data.result, meta: data.meta };
}

export function weeklyCompositionSummaryRows(
  result: WeeklyMealConceptResult | null,
): Array<{ label: string; value: string }> {
  if (!result) return [];
  const d = result.diagnostics;
  return [
    { label: "Ranked candidates", value: String(d.rankedCandidates ?? result.uniqueCandidateIds.length) },
    { label: "Unique candidates composed", value: String(d.uniqueCandidatesComposed ?? result.conceptCount) },
    { label: "Composition provider calls", value: String(d.compositionProviderCalls) },
    {
      label: "Complete / with additions",
      value: `${d.mealsAlreadyComplete} / ${d.mealsWithAddedComponents}`,
    },
    {
      label: "Added components (total / unique / reused)",
      value: `${d.totalAddedComponents} / ${d.uniqueAddedComponents} / ${d.reusedComponents}`,
    },
    {
      label: "Complexity signal",
      value: d.componentComplexitySignal ?? "—",
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

export function plateLines(concept: MealConcept): string[] {
  return [concept.main.name, ...concept.components.map((c) => c.name)];
}

export function roleCheck(label: string, ok: boolean): string {
  return `${ok ? "✓" : "✗"} ${label}`;
}

export function sourceLabel(source: MealConcept["components"][number]["source"]): string {
  switch (source) {
    case "candidate":
      return "Intrinsic candidate";
    case "existing_candidate_component":
      return "Existing candidate component";
    case "composition_engine":
      return "Composition engine addition";
    default:
      return source;
  }
}
