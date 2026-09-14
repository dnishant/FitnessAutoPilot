import { describe, expect, it } from "vitest";
import {
  CandidateRankingRequestSchema,
  CandidateRankingResultSchema,
  CANDIDATE_RANKING_POLICY_VERSION,
  RankedCulinaryCandidateSchema,
} from "./candidate-ranking";
import { CulinaryDiscoveryCandidateSchema } from "./culinary-discovery";

const candidate = {
  candidateId: "c1",
  name: "Chicken Chettinad",
  source: {
    name: "Specialist Kitchen",
    url: "https://example.com/chicken-chettinad",
    author: "A. Author",
  },
  cuisineFamily: "Indian",
  regionalStyle: "Tamil Nadu",
  primaryProtein: "Chicken",
  dishFormat: "skillet curry",
  flavorFamilies: ["peppery", "aromatic"],
  cookingTechniques: ["roasted spices"],
  textureTags: ["saucy"],
  experienceTags: ["bold"],
  whyItIsInteresting: "Pepper-forward South Indian chicken.",
  fitnessAdaptability: "easy",
  fitnessAdaptabilityReason: "Portions can be scaled while preserving the sauce.",
  mealPrepAdaptability: "component_prepped",
  estimatedFinishMinutesAfterPrep: 12,
  noveltyReason: "Regional discovery.",
  discoveryConfidence: "high",
};

describe("candidate ranking contracts", () => {
  it("parses a ranking request with default target pool size 12", () => {
    const parsed = CandidateRankingRequestSchema.parse({
      mealType: "dinner",
      candidates: [candidate],
    });
    expect(parsed.targetPoolSize).toBe(12);
    expect(parsed.userPreferences).toEqual({});
  });

  it("accepts lunch and dinner only", () => {
    expect(
      CandidateRankingRequestSchema.safeParse({
        mealType: "lunch",
        candidates: [candidate],
      }).success,
    ).toBe(true);
    expect(
      CandidateRankingRequestSchema.safeParse({
        mealType: "breakfast",
        candidates: [candidate],
      }).success,
    ).toBe(false);
    expect(
      CandidateRankingRequestSchema.safeParse({
        mealType: "snack",
        candidates: [candidate],
      }).success,
    ).toBe(false);
  });

  it("reuses PLAN-005 candidate schema without duplicating fields", () => {
    expect(CulinaryDiscoveryCandidateSchema.parse(candidate).candidateId).toBe("c1");
  });

  it("parses a ranked candidate and result", () => {
    const ranked = RankedCulinaryCandidateSchema.parse({
      candidate,
      score: 71.25,
      baseScore: 71.25,
      scoreBreakdown: {
        userPreferenceFit: 0.8,
        culinaryInterest: 0.7,
        sourceQuality: 0.55,
        prepFit: 0.6,
        fitnessAdaptability: 1,
        novelty: 0.7,
        repetitionPenalty: 0,
        similarityPenalty: 0,
      },
      rank: 1,
      decision: "selected",
      reasons: ["+ Matches Indian cuisine preference"],
    });
    expect(ranked.decision).toBe("selected");

    const result = CandidateRankingResultSchema.parse({
      selected: [ranked],
      deprioritized: [],
      stats: {
        inputCandidateCount: 1,
        selectedCandidateCount: 1,
        duplicateCount: 0,
        deprioritizedCount: 0,
        uniqueCuisineCount: 1,
        uniqueProteinCount: 1,
        uniqueFlavorFamilyCount: 2,
      },
      policy: {
        version: CANDIDATE_RANKING_POLICY_VERSION,
        targetPoolSize: 12,
        nearDuplicateThreshold: 0.78,
        similarityPenaltyThreshold: 0.48,
      },
    });
    expect(result.policy.version).toBe("candidate-ranking-v1");
    expect(result.stats.uniqueFlavorFamilyCount).toBe(2);
  });

  it("accepts similarity diagnostics with similar / near_duplicate classification", () => {
    const result = CandidateRankingResultSchema.parse({
      selected: [],
      deprioritized: [],
      stats: {
        inputCandidateCount: 0,
        selectedCandidateCount: 0,
        duplicateCount: 0,
        deprioritizedCount: 0,
        uniqueCuisineCount: 0,
        uniqueProteinCount: 0,
        uniqueFlavorFamilyCount: 0,
      },
      policy: {
        version: CANDIDATE_RANKING_POLICY_VERSION,
        targetPoolSize: 12,
        nearDuplicateThreshold: 0.78,
        similarityPenaltyThreshold: 0.48,
      },
      similarities: [
        {
          candidateAId: "a",
          candidateBId: "b",
          score: 0.81,
          classification: "near_duplicate",
          signals: {
            sharedFlavorFamilies: ["tandoori"],
            sharedTechniques: ["char"],
            sameDishFormat: true,
            sameCuisineFamily: true,
            sameRegionalStyle: true,
            samePrimaryProtein: false,
          },
        },
      ],
    });
    expect(result.similarities?.[0]?.classification).toBe("near_duplicate");
  });

  it("rejects invalid score breakdown ranges", () => {
    const parsed = RankedCulinaryCandidateSchema.safeParse({
      candidate,
      score: 10,
      baseScore: 10,
      scoreBreakdown: {
        userPreferenceFit: 1.5,
        culinaryInterest: 0,
        sourceQuality: 0,
        prepFit: 0,
        fitnessAdaptability: 0,
        novelty: 0,
        repetitionPenalty: 0,
        similarityPenalty: 0,
      },
      rank: 1,
      decision: "selected",
      reasons: ["ok"],
    });
    expect(parsed.success).toBe(false);
  });
});
