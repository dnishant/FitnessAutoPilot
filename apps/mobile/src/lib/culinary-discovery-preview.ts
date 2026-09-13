import type {
  CookingPreferences,
  CulinaryDiscoveryCandidate,
  CulinaryDiscoveryRequest,
  CulinaryDiscoveryResult,
  GenerateCulinaryDiscoveryResponse,
  MealPreferences,
  MealType,
} from "@fitness-autopilot/contracts";
import {
  CUISINE_OPTIONS,
  PROTEIN_OPTIONS,
} from "@fitness-autopilot/contracts";
import {
  cuisinePreferenceLabels,
  mealTypeLabel,
  proteinPreferenceLabels,
  readFunctionsInvokeErrorBody,
  sanitizeDiagnosticText,
  cookingStyleLabel,
} from "./recipe-preview";

export const CULINARY_DISCOVERY_PREVIEW_ROUTE = "/culinary-discovery-preview";
export const CULINARY_DISCOVERY_PREVIEW_TITLE = "Dev: Culinary Discovery";
export const CULINARY_DISCOVERY_PREVIEW_LOADING = "Searching culinary sources...";
export const CULINARY_DISCOVERY_FUNCTION_NAME = "culinary-discovery";

export const CULINARY_DISCOVERY_MEAL_TYPES: readonly MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
] as const;

export const DEFAULT_CULINARY_DISCOVERY_MEAL_TYPE: MealType = "dinner";
export const DEFAULT_CULINARY_DISCOVERY_TARGET_COUNT = 20;

export type CulinaryDiscoveryGenerationMeta = NonNullable<
  GenerateCulinaryDiscoveryResponse["meta"]
>;

export type CulinaryDiscoveryPreviewError = {
  message: string;
  code?: string;
  diagnostics?: string;
};

export type CulinaryDiscoveryPreviewSessionInput = {
  mealPreferences: MealPreferences | null;
  cookingPreferences: CookingPreferences | null;
};

export type CulinaryDiscoveryFormState = {
  mealType: MealType;
  cuisinesText: string;
  proteinsText: string;
  targetCandidateCountText: string;
  recentConceptsJson: string;
};

export type CulinaryDiscoveryPreviewUiState = {
  status: "idle" | "loading" | "success" | "error";
  form: CulinaryDiscoveryFormState;
  lastRequest: CulinaryDiscoveryRequest | null;
  result: CulinaryDiscoveryResult | null;
  meta: CulinaryDiscoveryGenerationMeta | null;
  error: CulinaryDiscoveryPreviewError | null;
  detailsOpen: boolean;
  history: Array<{
    id: string;
    at: string;
    request: CulinaryDiscoveryRequest;
    result: CulinaryDiscoveryResult;
    meta?: CulinaryDiscoveryGenerationMeta;
  }>;
};

function labelsToCsv(values: readonly string[]): string {
  return values.join(", ");
}

export function createCulinaryDiscoveryFormFromSession(
  input: CulinaryDiscoveryPreviewSessionInput,
): CulinaryDiscoveryFormState {
  const meal = input.mealPreferences;
  const cooking = input.cookingPreferences;
  return {
    mealType: DEFAULT_CULINARY_DISCOVERY_MEAL_TYPE,
    cuisinesText: meal
      ? labelsToCsv(cuisinePreferenceLabels(meal.cuisines).filter((l) => l !== "Surprise me"))
      : "Indian",
    proteinsText: meal
      ? labelsToCsv(proteinPreferenceLabels(meal.proteinPreferences))
      : "Chicken",
    targetCandidateCountText: String(DEFAULT_CULINARY_DISCOVERY_TARGET_COUNT),
    recentConceptsJson: "",
  };
}

export function createCulinaryDiscoveryPreviewUiState(
  input: CulinaryDiscoveryPreviewSessionInput = {
    mealPreferences: null,
    cookingPreferences: null,
  },
): CulinaryDiscoveryPreviewUiState {
  return {
    status: "idle",
    form: createCulinaryDiscoveryFormFromSession(input),
    lastRequest: null,
    result: null,
    meta: null,
    error: null,
    detailsOpen: false,
    history: [],
  };
}

function splitCsv(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function parseRecentConceptsJson(
  text: string,
): { ok: true; value: CulinaryDiscoveryRequest["recentConcepts"] } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return { ok: false, message: "Recent concepts JSON must be an array." };
    }
    return { ok: true, value: parsed as CulinaryDiscoveryRequest["recentConcepts"] };
  } catch {
    return { ok: false, message: "Recent concepts JSON is invalid." };
  }
}

export function buildCulinaryDiscoveryRequest(
  form: CulinaryDiscoveryFormState,
  session: CulinaryDiscoveryPreviewSessionInput,
):
  | { ok: true; request: CulinaryDiscoveryRequest }
  | { ok: false; error: CulinaryDiscoveryPreviewError } {
  const count = Number.parseInt(form.targetCandidateCountText.trim(), 10);
  if (!Number.isFinite(count) || count < 1 || count > 40) {
    return {
      ok: false,
      error: {
        message: "Target candidate count must be an integer from 1 to 40.",
        code: "INVALID_DISCOVERY_REQUEST",
      },
    };
  }

  const recent = parseRecentConceptsJson(form.recentConceptsJson);
  if (!recent.ok) {
    return {
      ok: false,
      error: { message: recent.message, code: "INVALID_DISCOVERY_REQUEST" },
    };
  }

  const meal = session.mealPreferences;
  const cooking = session.cookingPreferences;

  const request: CulinaryDiscoveryRequest = {
    mealType: form.mealType,
    cuisines: splitCsv(form.cuisinesText),
    proteinPreferences: splitCsv(form.proteinsText),
    experiencePreferences: meal?.experiencePreferences.length
      ? [...meal.experiencePreferences]
      : undefined,
    allergies: meal?.allergies ?? [],
    dietaryRestrictions: meal?.dietaryRestrictions ?? [],
    dislikes: meal?.dislikes ?? [],
    cookingPreferences: cooking
      ? {
          cookingStyle: cooking.cookingStyle,
          maxFinishMinutes: cooking.maxFinishMinutes ?? undefined,
        }
      : undefined,
    recentConcepts: recent.value,
    targetCandidateCount: count,
  };

  return { ok: true, request };
}

export function canStartCulinaryDiscovery(
  state: CulinaryDiscoveryPreviewUiState,
): boolean {
  return state.status !== "loading";
}

export function beginCulinaryDiscovery(
  state: CulinaryDiscoveryPreviewUiState,
  request: CulinaryDiscoveryRequest,
): CulinaryDiscoveryPreviewUiState {
  return {
    ...state,
    status: "loading",
    lastRequest: request,
    error: null,
  };
}

export function succeedCulinaryDiscovery(
  state: CulinaryDiscoveryPreviewUiState,
  result: CulinaryDiscoveryResult,
  meta?: CulinaryDiscoveryGenerationMeta,
): CulinaryDiscoveryPreviewUiState {
  const entry = {
    id: meta?.requestId ?? `local_${Date.now()}`,
    at: new Date().toISOString(),
    request: state.lastRequest!,
    result,
    meta,
  };
  return {
    ...state,
    status: "success",
    result,
    meta: meta ?? null,
    error: null,
    history: [entry, ...state.history].slice(0, 5),
  };
}

export function failCulinaryDiscovery(
  state: CulinaryDiscoveryPreviewUiState,
  error: CulinaryDiscoveryPreviewError,
): CulinaryDiscoveryPreviewUiState {
  return {
    ...state,
    status: "error",
    error,
  };
}

export function fitnessAdaptabilityLabel(
  value: CulinaryDiscoveryCandidate["fitnessAdaptability"],
): string {
  switch (value) {
    case "easy":
      return "Easy";
    case "moderate":
      return "Moderate";
    case "hard":
      return "Hard";
  }
}

export function mealPrepAdaptabilityLabel(
  value: CulinaryDiscoveryCandidate["mealPrepAdaptability"],
): string {
  switch (value) {
    case "fully_prepped":
      return "Fully prepped";
    case "component_prepped":
      return "Component prepped";
    case "quick_fresh_finish":
      return "Quick fresh finish";
    case "fresh_only":
      return "Fresh only";
  }
}

export function buildDiscoveryContextRows(
  request: CulinaryDiscoveryRequest,
): Array<{ label: string; value: string }> {
  return [
    { label: "Meal type", value: mealTypeLabel(request.mealType) },
    { label: "Cuisines", value: request.cuisines?.join(", ") || "(none)" },
    {
      label: "Proteins",
      value: request.proteinPreferences?.join(", ") || "(none)",
    },
    {
      label: "Experiences",
      value: request.experiencePreferences?.join(", ") || "(none)",
    },
    { label: "Allergies", value: request.allergies.join(", ") || "(none)" },
    {
      label: "Dietary restrictions",
      value: request.dietaryRestrictions.join(", ") || "(none)",
    },
    { label: "Dislikes", value: request.dislikes.join(", ") || "(none)" },
    {
      label: "Cooking style",
      value: request.cookingPreferences?.cookingStyle
        ? cookingStyleLabel(String(request.cookingPreferences.cookingStyle))
        : "(none)",
    },
    {
      label: "Max finish minutes",
      value:
        request.cookingPreferences?.maxFinishMinutes !== undefined
          ? String(request.cookingPreferences.maxFinishMinutes)
          : "(none)",
    },
    {
      label: "Target candidates",
      value: String(request.targetCandidateCount),
    },
    {
      label: "Recent concepts",
      value: request.recentConcepts?.length
        ? `${request.recentConcepts.length} provided`
        : "(none)",
    },
  ];
}

export function buildDiscoveryDetailsRows(
  result: CulinaryDiscoveryResult,
  meta?: CulinaryDiscoveryGenerationMeta | null,
): Array<{ label: string; value: string }> {
  const md = result.discoveryMetadata;
  const stats = md.qualityStats;
  const usage = md.usageMetadata;
  const searchQueryCount = md.searchQueryCount ?? md.searchQueries?.length ?? 0;
  const usageLabel = usage
    ? [
        usage.promptTokenCount !== undefined ? `prompt ${usage.promptTokenCount}` : null,
        usage.candidatesTokenCount !== undefined
          ? `candidates ${usage.candidatesTokenCount}`
          : null,
        usage.totalTokenCount !== undefined ? `total ${usage.totalTokenCount}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "—";

  return [
    { label: "Provider", value: md.provider },
    { label: "Model", value: md.model },
    { label: "Prompt version", value: md.promptVersion },
    {
      label: "Requested candidate count",
      value: String(md.requestedCandidateCount),
    },
    {
      label: "Returned candidate count",
      value: String(md.returnedCandidateCount),
    },
    {
      label: "Search query count",
      value: String(searchQueryCount),
    },
    {
      label: "Search queries",
      value: md.searchQueries?.length
        ? md.searchQueries.join(" · ")
        : "(none reported)",
    },
    {
      label: "Broad vs specific-dish searches",
      value: `${md.broadSearchQueryCount ?? stats?.broadSearchQueryCount ?? "—"} broad / ${md.specificDishSearchQueryCount ?? stats?.specificDishSearchQueryCount ?? "—"} specific-dish`,
    },
    {
      label: "Unique source URLs",
      value: String(md.uniqueSourceCount ?? md.sourceCount ?? "—"),
    },
    {
      label: "Unique domains",
      value: String(md.uniqueDomainCount ?? "—"),
    },
    {
      label: "Unique cuisines",
      value: String(md.uniqueCuisineCount ?? "—"),
    },
    {
      label: "Grounding coverage",
      value:
        md.groundingCoverage !== undefined
          ? `${Math.round(md.groundingCoverage * 100)}%`
          : "—",
    },
    {
      label: "Grounding coverage note",
      value:
        "Coverage is candidate–chunk correlation, not a source-quality score. 100% grounded does not mean every source is high quality.",
    },
    {
      label: "Rejected for weak provenance",
      value: String(
        md.rejectedForWeakProvenanceCount ?? stats?.rejectedForWeakProvenanceCount ?? "—",
      ),
    },
    {
      label: "Generic homepage sources",
      value: String(md.genericHomepageSourceCount ?? stats?.genericHomepageSourceCount ?? "—"),
    },
    {
      label: "Community/social canonical sources",
      value: String(md.communitySourceCount ?? stats?.communitySourceCount ?? "—"),
    },
    {
      label: "Duration",
      value: `${md.durationMs ?? meta?.durationMs ?? "—"} ms`,
    },
    { label: "Request ID", value: md.requestId ?? meta?.requestId ?? "—" },
    { label: "Token usage", value: usageLabel || "—" },
  ];
}

export function humanizeCulinaryDiscoveryError(message: string, code?: string): string {
  if (code === "LLM_CONFIGURATION_ERROR") {
    return `${message} Set GEMINI_API_KEY as a Supabase Edge Function secret, then redeploy culinary-discovery.`;
  }
  if (code === "DISCOVERY_NOT_GROUNDED") {
    return `${message} Gemini did not return usable Google Search grounding — check model support for tools + structured output.`;
  }
  if (message === "Failed to send a request to the Edge Function") {
    return "Could not reach culinary-discovery. Deploy it with CORS enabled (`npx supabase functions deploy culinary-discovery`) and confirm EXPO_PUBLIC_SUPABASE_URL points at that project.";
  }
  if (message === "Edge Function returned a non-2xx status code") {
    return "Culinary discovery failed in the Edge Function (non-2xx). Check that culinary-discovery is deployed and GEMINI_API_KEY is set.";
  }
  return message;
}

export function parseCulinaryDiscoveryFailure(input: {
  errorMessage?: string | null;
  data?: unknown;
}): CulinaryDiscoveryPreviewError {
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
          : input.errorMessage?.trim() || "Culinary discovery failed.";
      return {
        message: humanizeCulinaryDiscoveryError(baseMessage, code),
        code,
        diagnostics: sanitizeDiagnosticText(record.details ?? data),
      };
    }
  }
  return {
    message: humanizeCulinaryDiscoveryError(
      input.errorMessage?.trim() || "Culinary discovery failed.",
      undefined,
    ),
    diagnostics: sanitizeDiagnosticText(data),
  };
}

export type InvokeCulinaryDiscoveryError = {
  message: string;
  context?: unknown;
};

export type InvokeCulinaryDiscoveryFn = (
  functionName: string,
  options: { body: CulinaryDiscoveryRequest },
) => Promise<{ data: unknown; error: InvokeCulinaryDiscoveryError | null }>;

export async function invokeCulinaryDiscovery(
  invoke: InvokeCulinaryDiscoveryFn,
  request: CulinaryDiscoveryRequest,
): Promise<
  | {
      ok: true;
      result: CulinaryDiscoveryResult;
      meta?: CulinaryDiscoveryGenerationMeta;
    }
  | { ok: false; error: CulinaryDiscoveryPreviewError }
> {
  const invoked = await invoke(CULINARY_DISCOVERY_FUNCTION_NAME, { body: request });
  if (invoked.error) {
    const body = await readFunctionsInvokeErrorBody(invoked.error);
    return {
      ok: false,
      error: parseCulinaryDiscoveryFailure({
        errorMessage: invoked.error.message,
        data: body ?? invoked.data,
      }),
    };
  }

  const data = invoked.data;
  if (
    data &&
    typeof data === "object" &&
    "result" in data &&
    (data as { result: unknown }).result &&
    typeof (data as { result: unknown }).result === "object"
  ) {
    const response = data as GenerateCulinaryDiscoveryResponse;
    return {
      ok: true,
      result: response.result,
      meta: response.meta,
    };
  }

  return {
    ok: false,
    error: parseCulinaryDiscoveryFailure({
      errorMessage: "Unexpected culinary-discovery response shape.",
      data,
    }),
  };
}

/** Manual QA presets — not production logic. */
export const CULINARY_DISCOVERY_QA_PRESETS = [
  {
    id: "A",
    label: "Test A · Indian chicken dinner",
    patch: {
      mealType: "dinner" as MealType,
      cuisinesText: "Indian",
      proteinsText: "Chicken",
      targetCandidateCountText: "20",
    },
  },
  {
    id: "B",
    label: "Test B · Indian vegetarian lunch",
    patch: {
      mealType: "lunch" as MealType,
      cuisinesText: "Indian",
      proteinsText: "Paneer, Beans / Lentils, Tofu",
      targetCandidateCountText: "20",
    },
  },
  {
    id: "C",
    label: "Test C · Mexican chicken dinner",
    patch: {
      mealType: "dinner" as MealType,
      cuisinesText: "Mexican",
      proteinsText: "Chicken",
      targetCandidateCountText: "20",
    },
  },
  {
    id: "D",
    label: "Test D · East Asian seafood dinner",
    patch: {
      mealType: "dinner" as MealType,
      cuisinesText: "East Asian",
      proteinsText: "Fish, Shrimp",
      targetCandidateCountText: "20",
    },
  },
  {
    id: "E",
    label: "Test E · Mediterranean chicken dinner",
    patch: {
      mealType: "dinner" as MealType,
      cuisinesText: "Mediterranean",
      proteinsText: "Chicken",
      targetCandidateCountText: "20",
    },
  },
  {
    id: "F",
    label: "Test F · Italian chicken/fish dinner",
    patch: {
      mealType: "dinner" as MealType,
      cuisinesText: "Italian",
      proteinsText: "Chicken, Fish",
      targetCandidateCountText: "20",
    },
  },
] as const;

export const ANTI_REPETITION_RECENT_JSON = JSON.stringify(
  [
    {
      name: "Chicken Tikka Masala",
      timesSuggestedLast30Days: 3,
      lastSuggestedDaysAgo: 2,
    },
    {
      name: "Chicken Tikka",
      timesSuggestedLast30Days: 2,
      lastSuggestedDaysAgo: 5,
    },
  ],
  null,
  2,
);

export function cuisineCatalogHint(): string {
  return CUISINE_OPTIONS.filter((o) => o.value !== "surprise_me")
    .map((o) => o.label)
    .join(", ");
}

export function proteinCatalogHint(): string {
  return PROTEIN_OPTIONS.map((o) => o.label).join(", ");
}
