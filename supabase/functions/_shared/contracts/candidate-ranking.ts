import { z } from "zod";
import {
  CulinaryDiscoveryCandidateSchema,
  CulinaryDiscoveryCookingPreferencesSchema,
  RecentMealConceptSchema,
} from "./culinary-discovery.ts";

/**
 * PLAN-006: Deterministic culinary candidate ranking + deduplication.
 * Operates on already-discovered PLAN-005 candidates. No LLM call.
 * Ranking behavior is implemented for lunch and dinner only.
 */

export const CANDIDATE_RANKING_POLICY_VERSION = "candidate-ranking-v1" as const;

export const CandidateRankingMealTypeSchema = z.enum(["lunch", "dinner"]);

export const RankingDecisionSchema = z.enum(["selected", "deprioritized", "duplicate"]);

export const CandidateRankingUserPreferencesSchema = z.object({
  cuisines: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  proteinPreferences: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  experiencePreferences: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  dislikes: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
});

export const CandidateRankingRequestSchema = z.object({
  mealType: CandidateRankingMealTypeSchema,
  candidates: z.array(CulinaryDiscoveryCandidateSchema).max(40),
  userPreferences: CandidateRankingUserPreferencesSchema.default({}),
  cookingPreferences: CulinaryDiscoveryCookingPreferencesSchema.optional(),
  recentConcepts: z.array(RecentMealConceptSchema).max(40).optional(),
  targetPoolSize: z.number().int().min(1).max(40).default(12),
});

export const RankingScoreBreakdownSchema = z.object({
  userPreferenceFit: z.number().min(0).max(1),
  culinaryInterest: z.number().min(0).max(1),
  sourceQuality: z.number().min(0).max(1),
  prepFit: z.number().min(0).max(1),
  fitnessAdaptability: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  repetitionPenalty: z.number().min(0).max(1),
  similarityPenalty: z.number().min(0).max(1),
});

export const SimilarityClassificationSchema = z.enum(["similar", "near_duplicate"]);

export const RankedCulinaryCandidateSchema = z.object({
  candidate: CulinaryDiscoveryCandidateSchema,
  /** Effective score after similarity penalty (0–100 scale). */
  score: z.number(),
  /** Isolated score before similarity against the selected pool. */
  baseScore: z.number(),
  scoreBreakdown: RankingScoreBreakdownSchema,
  rank: z.number().int().positive(),
  decision: RankingDecisionSchema,
  reasons: z.array(z.string().trim().min(1).max(240)).max(20),
  similarToCandidateIds: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
});

export const CandidateSimilaritySignalsSchema = z.object({
  sharedFlavorFamilies: z.array(z.string()),
  sharedTechniques: z.array(z.string()),
  sameDishFormat: z.boolean(),
  sameCuisineFamily: z.boolean(),
  sameRegionalStyle: z.boolean(),
  samePrimaryProtein: z.boolean(),
  sameCanonicalDish: z.boolean().optional(),
});

export const CandidateSimilaritySchema = z.object({
  candidateAId: z.string().trim().min(1).max(80),
  candidateBId: z.string().trim().min(1).max(80),
  score: z.number().min(0).max(1),
  classification: SimilarityClassificationSchema.optional(),
  signals: CandidateSimilaritySignalsSchema,
});

export const CandidateRankingPolicySnapshotSchema = z.object({
  version: z.literal(CANDIDATE_RANKING_POLICY_VERSION),
  targetPoolSize: z.number().int().positive(),
  nearDuplicateThreshold: z.number().min(0).max(1),
  similarityPenaltyThreshold: z.number().min(0).max(1),
});

export const CandidateRankingStatsSchema = z.object({
  inputCandidateCount: z.number().int().nonnegative(),
  selectedCandidateCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  deprioritizedCount: z.number().int().nonnegative(),
  uniqueCuisineCount: z.number().int().nonnegative(),
  uniqueProteinCount: z.number().int().nonnegative(),
  uniqueFlavorFamilyCount: z.number().int().nonnegative(),
});

export const CandidateRankingResultSchema = z.object({
  selected: z.array(RankedCulinaryCandidateSchema).max(40),
  deprioritized: z.array(RankedCulinaryCandidateSchema).max(40),
  stats: CandidateRankingStatsSchema,
  policy: CandidateRankingPolicySnapshotSchema,
  similarities: z.array(CandidateSimilaritySchema).max(200).optional(),
});

export const RankCulinaryCandidatesRequestSchema = CandidateRankingRequestSchema;

export const RankCulinaryCandidatesResponseSchema = z.object({
  result: CandidateRankingResultSchema,
  meta: z
    .object({
      requestId: z.string().min(1),
      policyVersion: z.string().min(1),
      durationMs: z.number().nonnegative().optional(),
    })
    .optional(),
});

export type CandidateRankingMealType = z.infer<typeof CandidateRankingMealTypeSchema>;
export type RankingDecision = z.infer<typeof RankingDecisionSchema>;
export type SimilarityClassification = z.infer<typeof SimilarityClassificationSchema>;
export type CandidateRankingUserPreferences = z.infer<
  typeof CandidateRankingUserPreferencesSchema
>;
export type CandidateRankingRequest = z.infer<typeof CandidateRankingRequestSchema>;
export type RankingScoreBreakdown = z.infer<typeof RankingScoreBreakdownSchema>;
export type RankedCulinaryCandidate = z.infer<typeof RankedCulinaryCandidateSchema>;
export type CandidateSimilaritySignals = z.infer<typeof CandidateSimilaritySignalsSchema>;
export type CandidateSimilarity = z.infer<typeof CandidateSimilaritySchema>;
export type CandidateRankingPolicySnapshot = z.infer<
  typeof CandidateRankingPolicySnapshotSchema
>;
export type CandidateRankingStats = z.infer<typeof CandidateRankingStatsSchema>;
export type CandidateRankingResult = z.infer<typeof CandidateRankingResultSchema>;
export type RankCulinaryCandidatesRequest = z.infer<
  typeof RankCulinaryCandidatesRequestSchema
>;
export type RankCulinaryCandidatesResponse = z.infer<
  typeof RankCulinaryCandidatesResponseSchema
>;
