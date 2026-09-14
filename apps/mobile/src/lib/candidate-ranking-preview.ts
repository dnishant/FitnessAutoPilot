import type {
  CandidateRankingMealType,
  CandidateRankingRequest,
  CandidateRankingResult,
  CandidateRankingUserPreferences,
  CookingPreferences,
  CulinaryDiscoveryCandidate,
  CulinaryDiscoveryRequest,
  CulinaryDiscoveryResult,
  MealPreferences,
  RankCulinaryCandidatesResponse,
  RankedCulinaryCandidate,
  RankingDecision,
} from "@fitness-autopilot/contracts";
import {
  CANDIDATE_RANKING_POLICY_VERSION,
  DEFAULT_TARGET_POOL_SIZE,
  NEAR_DUPLICATE_THRESHOLD,
  SIMILARITY_PENALTY_THRESHOLD,
  inspectableRankingScores,
  rankCulinaryCandidates,
  strongestSimilarityDiagnostic,
  SCENARIO_A_TIKKA_REDUNDANCY,
  SCENARIO_B_FISH_DIVERSITY,
  SCENARIO_C_LARGE_MIXED_POOL,
  SCENARIO_PLAN006_MIX,
  FRESH_ONLY_LONG_DINNER,
  QUICK_FRESH_DINNER,
} from "@fitness-autopilot/domain";
import {
  cookingStyleLabel,
  cuisinePreferenceLabels,
  mealTypeLabel,
  proteinPreferenceLabels,
  readFunctionsInvokeErrorBody,
  sanitizeDiagnosticText,
} from "./recipe-preview";

export const CANDIDATE_RANKING_PREVIEW_ROUTE = "/candidate-ranking-preview";
export const CANDIDATE_RANKING_PREVIEW_TITLE = "Dev: Candidate Ranking";
export const CANDIDATE_RANKING_PREVIEW_LOADING = "Ranking culinary candidates...";
export const CANDIDATE_RANKING_FUNCTION_NAME = "rank-culinary-candidates";

export const CANDIDATE_RANKING_MEAL_TYPES: readonly CandidateRankingMealType[] = [
  "lunch",
  "dinner",
] as const;

export const DEFAULT_CANDIDATE_RANKING_MEAL_TYPE: CandidateRankingMealType = "dinner";

export type CandidateRankingGenerationMeta = NonNullable<
  RankCulinaryCandidatesResponse["meta"]
>;

export type CandidateRankingPreviewError = {
  message: string;
  code?: string;
  diagnostics?: string;
};

export type CandidateRankingPreviewSessionInput = {
  mealPreferences: MealPreferences | null;
  cookingPreferences: CookingPreferences | null;
};

export type CandidateRankingValidationFixtureId = "real" | "tikka" | "fish" | "mixed";

export type CandidateRankingFormState = {
  mealType: CandidateRankingMealType;
  targetPoolSizeText: string;
  candidatesJson: string;
  recentConceptsJson: string;
  cuisinesText: string;
  proteinsText: string;
  experiencesText: string;
  dislikesText: string;
  validationFixtureId: CandidateRankingValidationFixtureId;
};

export type CandidateRankingPreviewUiState = {
  status: "idle" | "loading" | "success" | "error";
  form: CandidateRankingFormState;
  lastRequest: CandidateRankingRequest | null;
  result: CandidateRankingResult | null;
  meta: CandidateRankingGenerationMeta | null;
  error: CandidateRankingPreviewError | null;
  detailsOpen: boolean;
  lastDiscovery: CulinaryDiscoveryResult | null;
};

function labelsToCsv(values: readonly string[]): string {
  return values.join(", ");
}

function splitCsv(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function createCandidateRankingFormFromSession(
  input: CandidateRankingPreviewSessionInput,
): CandidateRankingFormState {
  const meal = input.mealPreferences;
  return {
    mealType: DEFAULT_CANDIDATE_RANKING_MEAL_TYPE,
    targetPoolSizeText: String(DEFAULT_TARGET_POOL_SIZE),
    candidatesJson: JSON.stringify(SCENARIO_PLAN006_MIX, null, 2),
    recentConceptsJson: "",
    cuisinesText: meal
      ? labelsToCsv(cuisinePreferenceLabels(meal.cuisines).filter((label) => label !== "Surprise me"))
      : "Indian, Mexican",
    proteinsText: meal ? labelsToCsv(proteinPreferenceLabels(meal.proteinPreferences)) : "",
    experiencesText: meal?.experiencePreferences.length
      ? meal.experiencePreferences.join(", ")
      : "",
    dislikesText: meal?.dislikes.join(", ") ?? "",
    validationFixtureId: "real",
  };
}

export function createCandidateRankingPreviewUiState(
  input: CandidateRankingPreviewSessionInput = {
    mealPreferences: null,
    cookingPreferences: null,
  },
): CandidateRankingPreviewUiState {
  return {
    status: "idle",
    form: createCandidateRankingFormFromSession(input),
    lastRequest: null,
    result: null,
    meta: null,
    error: null,
    detailsOpen: false,
    lastDiscovery: null,
  };
}

export function parseCandidatesJson(
  text: string,
):
  | { ok: true; value: CulinaryDiscoveryCandidate[] }
  | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, message: "Paste PLAN-005 candidates JSON, or load a QA scenario." };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return { ok: true, value: parsed as CulinaryDiscoveryCandidate[] };
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as {
        candidates?: unknown;
        result?: { candidates?: unknown };
      };
      if (Array.isArray(record.candidates)) {
        return { ok: true, value: record.candidates as CulinaryDiscoveryCandidate[] };
      }
      if (Array.isArray(record.result?.candidates)) {
        return { ok: true, value: record.result.candidates as CulinaryDiscoveryCandidate[] };
      }
    }
    return { ok: false, message: "Candidates JSON must be an array or a discovery result object." };
  } catch {
    return { ok: false, message: "Candidates JSON is invalid." };
  }
}

export function parseRecentConceptsJson(
  text: string,
):
  | { ok: true; value: CandidateRankingRequest["recentConcepts"] }
  | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return { ok: false, message: "Recent concepts JSON must be an array." };
    }
    return { ok: true, value: parsed as CandidateRankingRequest["recentConcepts"] };
  } catch {
    return { ok: false, message: "Recent concepts JSON is invalid." };
  }
}

export function buildCandidateRankingRequest(
  form: CandidateRankingFormState,
  session: CandidateRankingPreviewSessionInput,
):
  | { ok: true; request: CandidateRankingRequest }
  | { ok: false; error: CandidateRankingPreviewError } {
  const targetPoolSize = Number.parseInt(form.targetPoolSizeText.trim(), 10);
  if (!Number.isFinite(targetPoolSize) || targetPoolSize < 1 || targetPoolSize > 40) {
    return {
      ok: false,
      error: {
        message: "Target pool size must be an integer from 1 to 40.",
        code: "INVALID_RANKING_REQUEST",
      },
    };
  }

  const candidates = parseCandidatesJson(form.candidatesJson);
  if (!candidates.ok) {
    return { ok: false, error: { message: candidates.message, code: "INVALID_RANKING_REQUEST" } };
  }

  const recent = parseRecentConceptsJson(form.recentConceptsJson);
  if (!recent.ok) {
    return { ok: false, error: { message: recent.message, code: "INVALID_RANKING_REQUEST" } };
  }

  const cooking = session.cookingPreferences;
  const userPreferences: CandidateRankingUserPreferences = {
    cuisines: splitCsv(form.cuisinesText),
    proteinPreferences: splitCsv(form.proteinsText),
    experiencePreferences: splitCsv(form.experiencesText),
    dislikes: splitCsv(form.dislikesText),
  };

  const request: CandidateRankingRequest = {
    mealType: form.mealType,
    candidates: candidates.value,
    userPreferences,
    cookingPreferences: cooking
      ? {
          cookingStyle: cooking.cookingStyle,
          maxFinishMinutes: cooking.maxFinishMinutes ?? undefined,
        }
      : undefined,
    recentConcepts: recent.value,
    targetPoolSize,
  };

  return { ok: true, request };
}

export function canStartCandidateRanking(state: CandidateRankingPreviewUiState): boolean {
  return state.status !== "loading";
}

export function beginCandidateRanking(
  state: CandidateRankingPreviewUiState,
  request: CandidateRankingRequest,
): CandidateRankingPreviewUiState {
  return {
    ...state,
    status: "loading",
    lastRequest: request,
    error: null,
  };
}

export function succeedCandidateRanking(
  state: CandidateRankingPreviewUiState,
  result: CandidateRankingResult,
  meta?: CandidateRankingGenerationMeta,
): CandidateRankingPreviewUiState {
  return {
    ...state,
    status: "success",
    result,
    meta: meta ?? null,
    error: null,
  };
}

export function failCandidateRanking(
  state: CandidateRankingPreviewUiState,
  error: CandidateRankingPreviewError,
): CandidateRankingPreviewUiState {
  return {
    ...state,
    status: "error",
    error,
  };
}

export function applyDiscoveryCandidates(
  state: CandidateRankingPreviewUiState,
  discovery: CulinaryDiscoveryResult,
): CandidateRankingPreviewUiState {
  return {
    ...state,
    lastDiscovery: discovery,
    form: {
      ...state.form,
      candidatesJson: JSON.stringify(discovery.candidates, null, 2),
    },
  };
}

export function rankingDecisionLabel(decision: RankingDecision): string {
  switch (decision) {
    case "selected":
      return "Selected";
    case "deprioritized":
      return "Deprioritized";
    case "duplicate":
      return "Duplicate";
  }
}

export function buildRankingContextRows(
  request: CandidateRankingRequest,
): Array<{ label: string; value: string }> {
  return [
    { label: "Meal type", value: mealTypeLabel(request.mealType) },
    { label: "Input candidates", value: String(request.candidates.length) },
    { label: "Target pool size", value: String(request.targetPoolSize) },
    { label: "Cuisines", value: request.userPreferences.cuisines?.join(", ") || "(none)" },
    {
      label: "Proteins",
      value: request.userPreferences.proteinPreferences?.join(", ") || "(none)",
    },
    {
      label: "Experiences",
      value: request.userPreferences.experiencePreferences?.join(", ") || "(none)",
    },
    { label: "Dislikes", value: request.userPreferences.dislikes?.join(", ") || "(none)" },
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
      label: "Recent concepts",
      value: request.recentConcepts?.length ? `${request.recentConcepts.length} provided` : "(none)",
    },
  ];
}

export function buildRankingDiagnosticsRows(
  result: CandidateRankingResult,
  meta?: CandidateRankingGenerationMeta | null,
): Array<{ label: string; value: string }> {
  return [
    { label: "Ranking policy version", value: result.policy.version },
    { label: "Input candidate count", value: String(result.stats.inputCandidateCount) },
    { label: "Selected count", value: String(result.stats.selectedCandidateCount) },
    { label: "Duplicate count", value: String(result.stats.duplicateCount) },
    { label: "Deprioritized count", value: String(result.stats.deprioritizedCount) },
    { label: "Unique cuisines", value: String(result.stats.uniqueCuisineCount) },
    { label: "Unique proteins", value: String(result.stats.uniqueProteinCount) },
    { label: "Unique flavor families", value: String(result.stats.uniqueFlavorFamilyCount) },
    { label: "Target pool size", value: String(result.policy.targetPoolSize) },
    { label: "Near-duplicate threshold", value: String(result.policy.nearDuplicateThreshold) },
    { label: "Similarity penalty threshold", value: String(result.policy.similarityPenaltyThreshold) },
    { label: "Similarity pair count", value: String(result.similarities?.length ?? 0) },
    {
      label: "Near-duplicate pair count",
      value: String(
        (result.similarities ?? []).filter((item) => item.classification === "near_duplicate")
          .length,
      ),
    },
    { label: "Request ID", value: meta?.requestId ?? "(local)" },
    { label: "Duration", value: `${meta?.durationMs ?? "—"} ms` },
  ];
}

export function formatBaseVsEffectiveScore(item: RankedCulinaryCandidate): string {
  const inspectable = inspectableRankingScores(item.scoreBreakdown);
  const penalty = inspectable.similarityDelta;
  return [
    `Base score: ${inspectable.baseScore.toFixed(1)}`,
    `Similarity: ${penalty > 0 ? `-${penalty.toFixed(1)}` : "0.0"}`,
    `Final score: ${inspectable.effectiveScore.toFixed(1)}`,
  ].join("\n");
}

export function formatSimilaritySignals(
  item: NonNullable<CandidateRankingResult["similarities"]>[number],
): string {
  const signals = item.signals;
  const parts = [
    signals.sharedFlavorFamilies.length > 0
      ? `flavors ${signals.sharedFlavorFamilies.join(", ")}`
      : null,
    signals.sharedTechniques.length > 0
      ? `techniques ${signals.sharedTechniques.join(", ")}`
      : null,
    signals.sameDishFormat ? "same dish format" : null,
    signals.sameCuisineFamily ? "same cuisine family" : null,
    signals.sameRegionalStyle ? "same regional style" : null,
    signals.samePrimaryProtein ? "same primary protein" : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : "no shared culinary signals";
}

export function describeRankingPenalty(
  item: RankedCulinaryCandidate,
  result: CandidateRankingResult,
): string | null {
  if (item.scoreBreakdown.similarityPenalty <= 0 && item.decision !== "duplicate") {
    return null;
  }
  const diagnostic = strongestSimilarityDiagnostic(result.similarities, item.candidate.candidateId);
  const partnerId =
    diagnostic == null
      ? item.similarToCandidateIds?.[0]
      : diagnostic.candidateAId === item.candidate.candidateId
        ? diagnostic.candidateBId
        : diagnostic.candidateAId;
  if (!partnerId) {
    return null;
  }
  const partner = [...result.selected, ...result.deprioritized].find(
    (row) => row.candidate.candidateId === partnerId,
  );
  const name = partner?.candidate.name ?? partnerId;
  const classification =
    diagnostic?.classification ?? (item.decision === "duplicate" ? "near_duplicate" : "similar");
  const scoreLabel = diagnostic != null ? diagnostic.score.toFixed(2) : "—";
  const signalLabel = diagnostic ? `\nShared: ${formatSimilaritySignals(diagnostic)}` : "";
  const prefix = classification === "near_duplicate" ? "Near-duplicate of" : "Highly similar to";
  return `${prefix} selected ${name}\nSimilarity: ${scoreLabel} (${classification.replace("_", " ")})${signalLabel}`;
}

export function formatScoreBreakdown(
  result: CandidateRankingResult["selected"][number]["scoreBreakdown"],
): string {
  return [
    `pref ${result.userPreferenceFit.toFixed(2)}`,
    `interest ${result.culinaryInterest.toFixed(2)}`,
    `source ${result.sourceQuality.toFixed(2)}`,
    `prep ${result.prepFit.toFixed(2)}`,
    `fitness ${result.fitnessAdaptability.toFixed(2)}`,
    `novelty ${result.novelty.toFixed(2)}`,
    `rep -${result.repetitionPenalty.toFixed(2)}`,
    `sim -${result.similarityPenalty.toFixed(2)}`,
  ].join(" · ");
}

export function similarityScoreFor(
  result: CandidateRankingResult,
  candidateId: string,
  otherId: string,
): number | undefined {
  return result.similarities?.find(
    (item) =>
      (item.candidateAId === candidateId && item.candidateBId === otherId) ||
      (item.candidateBId === candidateId && item.candidateAId === otherId),
  )?.score;
}

export function humanizeCandidateRankingError(message: string, code?: string): string {
  if (message === "Failed to send a request to the Edge Function") {
    return "Could not reach rank-culinary-candidates. Ranking does not need that function — the preview runs candidate-ranking-v1 in-process. If you still want the hosted endpoint, deploy it with CORS enabled (`npx supabase functions deploy rank-culinary-candidates`) and confirm EXPO_PUBLIC_SUPABASE_URL points at that project.";
  }
  if (message === "Edge Function returned a non-2xx status code") {
    return "rank-culinary-candidates returned a non-2xx status. The preview can rank in-process without that function. If you are calling the hosted endpoint, deploy it with `verify_jwt = false` and CORS enabled.";
  }
  if (code === "INVALID_RANKING_REQUEST") {
    return message;
  }
  return message;
}

export function parseCandidateRankingFailure(input: {
  errorMessage?: string | null;
  data?: unknown;
}): CandidateRankingPreviewError {
  const data = input.data;
  if (data && typeof data === "object") {
    const record = data as { code?: unknown; message?: unknown; error?: unknown };
    if (typeof record.code === "string" && record.error === undefined) {
      const baseMessage =
        typeof record.message === "string" && record.message.trim()
          ? record.message
          : input.errorMessage?.trim() || "Candidate ranking failed.";
      return {
        message: humanizeCandidateRankingError(baseMessage, record.code),
        code: record.code,
        diagnostics: sanitizeDiagnosticText(data),
      };
    }
    if ("error" in record && record.error && typeof record.error === "object") {
      const err = record.error as { code?: unknown; message?: unknown; details?: unknown };
      const code = typeof err.code === "string" ? err.code : undefined;
      const baseMessage =
        typeof err.message === "string" && err.message.trim()
          ? err.message
          : input.errorMessage?.trim() || "Candidate ranking failed.";
      return {
        message: humanizeCandidateRankingError(baseMessage, code),
        code,
        diagnostics: sanitizeDiagnosticText(err.details ?? data),
      };
    }
  }
  return {
    message: humanizeCandidateRankingError(
      input.errorMessage?.trim() || "Candidate ranking failed.",
    ),
    diagnostics: sanitizeDiagnosticText(data),
  };
}

export type InvokeCandidateRankingFn = (
  functionName: string,
  options: { body: CandidateRankingRequest },
) => Promise<{ data: unknown; error: { message: string; context?: unknown } | null }>;

export async function invokeCandidateRanking(
  invoke: InvokeCandidateRankingFn,
  rankingRequest: CandidateRankingRequest,
): Promise<
  | {
      ok: true;
      result: CandidateRankingResult;
      meta?: CandidateRankingGenerationMeta;
    }
  | { ok: false; error: CandidateRankingPreviewError }
> {
  const invoked = await invoke(CANDIDATE_RANKING_FUNCTION_NAME, { body: rankingRequest });
  if (invoked.error) {
    const body = await readFunctionsInvokeErrorBody(invoked.error);
    return {
      ok: false,
      error: parseCandidateRankingFailure({
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
    const response = data as RankCulinaryCandidatesResponse;
    return { ok: true, result: response.result, meta: response.meta };
  }

  return {
    ok: false,
    error: parseCandidateRankingFailure({
      errorMessage: "Unexpected rank-culinary-candidates response shape.",
      data,
    }),
  };
}

export function rankCulinaryCandidatesLocally(
  rankingRequest: CandidateRankingRequest,
):
  | { ok: true; result: CandidateRankingResult; meta: CandidateRankingGenerationMeta }
  | { ok: false; error: CandidateRankingPreviewError } {
  const started = Date.now();
  const ranked = rankCulinaryCandidates(rankingRequest);
  if (!ranked.ok) {
    return {
      ok: false,
      error: {
        message: ranked.error.message,
        code: ranked.error.code,
        diagnostics: sanitizeDiagnosticText(ranked.error.details),
      },
    };
  }
  return {
    ok: true,
    result: ranked.value,
    meta: {
      requestId: `local_${Date.now()}`,
      policyVersion: CANDIDATE_RANKING_POLICY_VERSION,
      durationMs: Date.now() - started,
    },
  };
}

export function buildDiscoveryRequestFromRankingForm(
  form: CandidateRankingFormState,
  session: CandidateRankingPreviewSessionInput,
): CulinaryDiscoveryRequest {
  const cooking = session.cookingPreferences;
  const meal = session.mealPreferences;
  return {
    mealType: form.mealType,
    cuisines: splitCsv(form.cuisinesText),
    proteinPreferences: splitCsv(form.proteinsText),
    experiencePreferences: splitCsv(form.experiencesText),
    allergies: meal?.allergies ?? [],
    dietaryRestrictions: meal?.dietaryRestrictions ?? [],
    dislikes: splitCsv(form.dislikesText),
    cookingPreferences: cooking
      ? {
          cookingStyle: cooking.cookingStyle,
          maxFinishMinutes: cooking.maxFinishMinutes ?? undefined,
        }
      : undefined,
    targetCandidateCount: 12,
  };
}

export const RANKING_RECENT_CONCEPTS_SAMPLE = JSON.stringify(
  [
    {
      name: "Chicken Tikka",
      cuisineFamily: "Indian",
      flavorFamilies: ["tandoori", "yogurt-chili", "smoky"],
      timesSuggestedLast30Days: 3,
      lastSuggestedDaysAgo: 1,
    },
  ],
  null,
  2,
);

export const CANDIDATE_RANKING_VALIDATION_FIXTURES = [
  {
    id: "real" as const,
    label: "Real discovery candidates",
  },
  {
    id: "tikka" as const,
    label: "Tikka redundancy test",
    patch: {
      mealType: "dinner" as CandidateRankingMealType,
      candidatesJson: JSON.stringify(SCENARIO_A_TIKKA_REDUNDANCY, null, 2),
      targetPoolSizeText: "6",
      validationFixtureId: "tikka" as const,
    },
  },
  {
    id: "fish" as const,
    label: "Fish diversity test",
    patch: {
      mealType: "dinner" as CandidateRankingMealType,
      candidatesJson: JSON.stringify(SCENARIO_B_FISH_DIVERSITY, null, 2),
      targetPoolSizeText: "4",
      validationFixtureId: "fish" as const,
    },
  },
  {
    id: "mixed" as const,
    label: "Large mixed pool test",
    patch: {
      mealType: "dinner" as CandidateRankingMealType,
      candidatesJson: JSON.stringify(SCENARIO_C_LARGE_MIXED_POOL, null, 2),
      targetPoolSizeText: "8",
      validationFixtureId: "mixed" as const,
    },
  },
] as const;

export function applyValidationFixture(
  state: CandidateRankingPreviewUiState,
  fixtureId: CandidateRankingValidationFixtureId,
): CandidateRankingPreviewUiState {
  if (fixtureId === "real") {
    return {
      ...state,
      form: {
        ...state.form,
        validationFixtureId: "real",
        candidatesJson: state.lastDiscovery
          ? JSON.stringify(state.lastDiscovery.candidates, null, 2)
          : state.form.candidatesJson,
      },
    };
  }
  const fixture = CANDIDATE_RANKING_VALIDATION_FIXTURES.find((item) => item.id === fixtureId);
  if (!fixture || !("patch" in fixture)) {
    return state;
  }
  return {
    ...state,
    form: {
      ...state.form,
      ...fixture.patch,
    },
  };
}

export const CANDIDATE_RANKING_QA_PRESETS = [
  {
    id: "A",
    label: "A · Tikka redundancy",
    patch: {
      mealType: "dinner" as CandidateRankingMealType,
      candidatesJson: JSON.stringify(SCENARIO_A_TIKKA_REDUNDANCY, null, 2),
      targetPoolSizeText: "6",
      validationFixtureId: "tikka" as const,
    },
  },
  {
    id: "B",
    label: "B · Fish diversity",
    patch: {
      mealType: "dinner" as CandidateRankingMealType,
      candidatesJson: JSON.stringify(SCENARIO_B_FISH_DIVERSITY, null, 2),
      targetPoolSizeText: "4",
      validationFixtureId: "fish" as const,
    },
  },
  {
    id: "C",
    label: "C · Large mixed pool",
    patch: {
      mealType: "dinner" as CandidateRankingMealType,
      candidatesJson: JSON.stringify(SCENARIO_C_LARGE_MIXED_POOL, null, 2),
      cuisinesText: "Indian, Mexican",
      experiencesText: "spicy, saucy_flavorful, crispy_textured",
      targetPoolSizeText: "8",
      validationFixtureId: "mixed" as const,
    },
  },
  {
    id: "D",
    label: "D · Cooking preference dinner",
    patch: {
      mealType: "dinner" as CandidateRankingMealType,
      candidatesJson: JSON.stringify([QUICK_FRESH_DINNER, FRESH_ONLY_LONG_DINNER], null, 2),
      targetPoolSizeText: "2",
    },
  },
  {
    id: "E",
    label: "E · Recent tikka repetition",
    patch: {
      mealType: "dinner" as CandidateRankingMealType,
      candidatesJson: JSON.stringify(SCENARIO_A_TIKKA_REDUNDANCY, null, 2),
      recentConceptsJson: RANKING_RECENT_CONCEPTS_SAMPLE,
      targetPoolSizeText: "6",
    },
  },
] as const;

export const RANKING_POLICY_DEFAULTS = {
  version: CANDIDATE_RANKING_POLICY_VERSION,
  targetPoolSize: DEFAULT_TARGET_POOL_SIZE,
  nearDuplicateThreshold: NEAR_DUPLICATE_THRESHOLD,
  similarityPenaltyThreshold: SIMILARITY_PENALTY_THRESHOLD,
} as const;
