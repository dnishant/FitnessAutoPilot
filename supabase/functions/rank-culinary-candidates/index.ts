import { json, requireUser, serveWithCors } from "../_shared/http.ts";
import {
  CANDIDATE_RANKING_POLICY_VERSION,
  parseCandidateRankingRequest,
  rankCulinaryCandidates,
  type CandidateRankingError,
} from "../_shared/domain/recipes/candidate-ranking.ts";

function statusFor(error: CandidateRankingError): number {
  switch (error.code) {
    case "INVALID_RANKING_REQUEST":
    case "RANKING_VALIDATION_FAILED":
      return 422;
    default:
      return 500;
  }
}

function asRankingError(error: unknown): CandidateRankingError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as CandidateRankingError).code === "string" &&
    typeof (error as CandidateRankingError).message === "string"
  ) {
    return error as CandidateRankingError;
  }
  return {
    code: "RANKING_VALIDATION_FAILED",
    message: error instanceof Error ? error.message : "Candidate ranking failed.",
  };
}

serveWithCors(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(
      { error: { code: "INVALID_RANKING_REQUEST", message: "Invalid JSON body" } },
      400,
    );
  }

  const parsed = parseCandidateRankingRequest(body);
  if (!parsed.ok) {
    return json({ error: parsed.error }, statusFor(parsed.error));
  }

  const started = Date.now();
  const requestId = `cr_${crypto.randomUUID()}`;
  try {
    const ranked = rankCulinaryCandidates(parsed.value);
    if (!ranked.ok) {
      return json({ error: ranked.error }, statusFor(ranked.error));
    }

    console.log(
      JSON.stringify({
        event: "candidate_ranking",
        policyVersion: CANDIDATE_RANKING_POLICY_VERSION,
        requestId,
        durationMs: Date.now() - started,
        success: true,
        mealType: parsed.value.mealType,
        inputCandidateCount: ranked.value.stats.inputCandidateCount,
        selectedCandidateCount: ranked.value.stats.selectedCandidateCount,
        duplicateCount: ranked.value.stats.duplicateCount,
        targetPoolSize: ranked.value.policy.targetPoolSize,
        userIdPresent: true,
      }),
    );

    return json({
      result: ranked.value,
      meta: {
        requestId,
        policyVersion: CANDIDATE_RANKING_POLICY_VERSION,
        durationMs: Date.now() - started,
      },
    });
  } catch (error) {
    const mapped = asRankingError(error);
    console.log(
      JSON.stringify({
        event: "candidate_ranking",
        policyVersion: CANDIDATE_RANKING_POLICY_VERSION,
        requestId,
        durationMs: Date.now() - started,
        success: false,
        errorCode: mapped.code,
        errorMessage: mapped.message,
      }),
    );
    return json({ error: mapped }, statusFor(mapped));
  }
});
