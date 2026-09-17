import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CandidateRankingRequest, CandidateRankingResult } from "@fitness-autopilot/contracts";
import { CHICKEN_TIKKA, PANEER_TIKKA } from "@fitness-autopilot/domain";
import {
  CANDIDATE_RANKING_FUNCTION_NAME,
  CANDIDATE_RANKING_PREVIEW_ROUTE,
  CANDIDATE_RANKING_PREVIEW_TITLE,
  CANDIDATE_RANKING_QA_PRESETS,
  CANDIDATE_RANKING_VALIDATION_FIXTURES,
  applyValidationFixture,
  beginCandidateRanking,
  buildCandidateRankingRequest,
  buildRankingDiagnosticsRows,
  canStartCandidateRanking,
  createCandidateRankingPreviewUiState,
  describeRankingPenalty,
  failCandidateRanking,
  formatBaseVsEffectiveScore,
  humanizeCandidateRankingError,
  invokeCandidateRanking,
  parseCandidateRankingFailure,
  parseCandidatesJson,
  rankCulinaryCandidatesLocally,
  succeedCandidateRanking,
} from "./candidate-ranking-preview";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");

const sampleResult: CandidateRankingResult = {
  selected: [
    {
      candidate: CHICKEN_TIKKA,
      score: 70,
      baseScore: 70,
      scoreBreakdown: {
        userPreferenceFit: 0.5,
        culinaryInterest: 0.8,
        sourceQuality: 0.92,
        prepFit: 0.5,
        fitnessAdaptability: 1,
        novelty: 0.7,
        repetitionPenalty: 0,
        similarityPenalty: 0,
      },
      rank: 1,
      decision: "selected",
      reasons: ["+ High culinary distinctiveness"],
    },
  ],
  deprioritized: [
    {
      candidate: PANEER_TIKKA,
      score: 40,
      baseScore: 70,
      scoreBreakdown: {
        userPreferenceFit: 0.5,
        culinaryInterest: 0.8,
        sourceQuality: 0.92,
        prepFit: 0.5,
        fitnessAdaptability: 0.6,
        novelty: 0.6,
        repetitionPenalty: 0,
        similarityPenalty: 1,
      },
      rank: 2,
      decision: "duplicate",
      reasons: ["- Near-duplicate of already selected Chicken Tikka"],
      similarToCandidateIds: ["tikka-chicken"],
    },
  ],
  stats: {
    inputCandidateCount: 2,
    selectedCandidateCount: 1,
    duplicateCount: 1,
    deprioritizedCount: 0,
    uniqueCuisineCount: 1,
    uniqueProteinCount: 1,
    uniqueFlavorFamilyCount: 3,
  },
  policy: {
    version: "candidate-ranking-v1",
    targetPoolSize: 12,
    nearDuplicateThreshold: 0.78,
    similarityPenaltyThreshold: 0.48,
  },
};

describe("candidate ranking preview", () => {
  it("preview route and screen exist", () => {
    const screen = readFileSync(join(appRoot, "app/candidate-ranking-preview.tsx"), "utf8");
    const layout = readFileSync(join(appRoot, "app/_layout.tsx"), "utf8");
    const developer = readFileSync(join(appRoot, "app/developer/index.tsx"), "utf8");
    expect(screen).toContain("CANDIDATE_RANKING_PREVIEW_TITLE");
    expect(screen).toContain("Rank Candidates");
    expect(screen).toContain("Discover then Rank");
    expect(screen).toContain("Validation fixtures");
    expect(CANDIDATE_RANKING_PREVIEW_TITLE).toBe("Dev: Candidate Ranking");
    expect(layout).toContain("candidate-ranking-preview");
    expect(developer).toContain("/candidate-ranking-preview");
    expect(CANDIDATE_RANKING_PREVIEW_ROUTE).toBe("/candidate-ranking-preview");
  });

  it("builds a ranking request from session + JSON candidates", () => {
    const state = createCandidateRankingPreviewUiState();
    state.form.candidatesJson = JSON.stringify([CHICKEN_TIKKA]);
    const built = buildCandidateRankingRequest(state.form, {
      mealPreferences: null,
      cookingPreferences: null,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.mealType).toBe("dinner");
    expect(built.request.targetPoolSize).toBe(12);
    expect(built.request.candidates).toHaveLength(1);
  });

  it("parses discovery result JSON as well as a candidate array", () => {
    const fromArray = parseCandidatesJson(JSON.stringify([CHICKEN_TIKKA]));
    const fromResult = parseCandidatesJson(JSON.stringify({ candidates: [CHICKEN_TIKKA] }));
    expect(fromArray.ok && fromResult.ok).toBe(true);
  });

  it("calls the rank-culinary-candidates endpoint helper", async () => {
    let calledName = "";
    const request: CandidateRankingRequest = {
      mealType: "lunch",
      candidates: [CHICKEN_TIKKA],
      userPreferences: {},
      targetPoolSize: 12,
    };
    const invoked = await invokeCandidateRanking(async (functionName, options) => {
      calledName = functionName;
      expect(options.body.mealType).toBe("lunch");
      return {
        data: {
          result: sampleResult,
          meta: { requestId: "cr_test", policyVersion: "candidate-ranking-v1" },
        },
        error: null,
      };
    }, request);
    expect(calledName).toBe(CANDIDATE_RANKING_FUNCTION_NAME);
    expect(invoked.ok).toBe(true);
  });

  it("can rank locally without Gemini", () => {
    const ranked = rankCulinaryCandidatesLocally({
      mealType: "dinner",
      candidates: [CHICKEN_TIKKA, PANEER_TIKKA],
      userPreferences: {},
      targetPoolSize: 2,
    });
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    expect(ranked.meta.policyVersion).toBe("candidate-ranking-v1");
    expect(ranked.result.stats.inputCandidateCount).toBe(2);
  });

  it("tracks preview status transitions", () => {
    let state = createCandidateRankingPreviewUiState();
    expect(canStartCandidateRanking(state)).toBe(true);
    const request: CandidateRankingRequest = {
      mealType: "dinner",
      candidates: [CHICKEN_TIKKA],
      userPreferences: {},
      targetPoolSize: 1,
    };
    state = beginCandidateRanking(state, request);
    expect(state.status).toBe("loading");
    state = succeedCandidateRanking(state, sampleResult, {
      requestId: "cr_1",
      policyVersion: "candidate-ranking-v1",
    });
    expect(state.status).toBe("success");
    state = failCandidateRanking(state, { message: "boom", code: "INVALID_RANKING_REQUEST" });
    expect(state.status).toBe("error");
  });

  it("includes validation fixtures and QA presets", () => {
    expect(CANDIDATE_RANKING_VALIDATION_FIXTURES.map((fixture) => fixture.id)).toEqual([
      "real",
      "tikka",
      "fish",
      "mixed",
    ]);
    expect(CANDIDATE_RANKING_QA_PRESETS.map((preset) => preset.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
    const state = createCandidateRankingPreviewUiState();
    const tikka = applyValidationFixture(state, "tikka");
    expect(tikka.form.validationFixtureId).toBe("tikka");
    expect(tikka.form.targetPoolSizeText).toBe("6");
    const mixed = applyValidationFixture(state, "mixed");
    expect(mixed.form.targetPoolSizeText).toBe("8");
    expect(JSON.parse(mixed.form.candidatesJson).length).toBeGreaterThanOrEqual(15);
  });

  it("exposes base vs effective scores and similarity diagnostics from local ranking", () => {
    const ranked = rankCulinaryCandidatesLocally({
      mealType: "dinner",
      candidates: [CHICKEN_TIKKA, PANEER_TIKKA],
      userPreferences: {},
      targetPoolSize: 2,
    });
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    const rows = buildRankingDiagnosticsRows(ranked.result, ranked.meta);
    expect(rows.some((row) => row.label === "Unique flavor families")).toBe(true);
    expect(rows.some((row) => row.label === "Similarity pair count")).toBe(true);
    const duplicate = ranked.result.deprioritized.find((item) => item.decision === "duplicate");
    expect(duplicate).toBeDefined();
    expect(formatBaseVsEffectiveScore(duplicate!)).toContain("Base score:");
    expect(formatBaseVsEffectiveScore(duplicate!)).toContain("Final score:");
    expect(describeRankingPenalty(duplicate!, ranked.result)).toContain("Chicken Tikka");
  });

  it("keeps Gemini off the ranking client path", () => {
    const session = readFileSync(join(appRoot, "src/state/session.tsx"), "utf8");
    const lib = readFileSync(join(here, "candidate-ranking-preview.ts"), "utf8");
    expect(session).toContain("rankCulinaryCandidates");
    expect(session).toContain("rankCulinaryCandidatesLocally");
    expect(session).not.toContain("invokeCandidateRanking");
    expect(lib).toContain('CANDIDATE_RANKING_FUNCTION_NAME = "rank-culinary-candidates"');
    expect(lib).not.toContain("@google/genai");
    expect(lib).not.toContain("GEMINI_API_KEY");
  });

  it("humanizes unreachable Edge Function / CORS failures", () => {
    expect(
      humanizeCandidateRankingError("Failed to send a request to the Edge Function"),
    ).toContain("in-process");
    const parsed = parseCandidateRankingFailure({
      errorMessage: "Failed to send a request to the Edge Function",
      data: null,
    });
    expect(parsed.message).toContain("rank-culinary-candidates");
    expect(parsed.message).not.toBe("Failed to send a request to the Edge Function");
  });

  it("serves rank-culinary-candidates with CORS like culinary-discovery", () => {
    const ranking = readFileSync(
      join(appRoot, "../../supabase/functions/rank-culinary-candidates/index.ts"),
      "utf8",
    );
    const discovery = readFileSync(
      join(appRoot, "../../supabase/functions/culinary-discovery/index.ts"),
      "utf8",
    );
    const config = readFileSync(join(appRoot, "../../supabase/config.toml"), "utf8");
    expect(ranking).toContain("serveWithCors");
    expect(ranking).not.toMatch(/Deno\.serve\(/);
    expect(discovery).toContain("serveWithCors");
    expect(config).toContain("[functions.rank-culinary-candidates]");
    expect(config).toMatch(
      /\[functions\.rank-culinary-candidates\][\s\S]*?verify_jwt\s*=\s*false/,
    );
  });
});
