import { z } from "zod";
import { MealTypeSchema } from "./recipe.ts";
import { WeeklyCookingStyleSchema } from "./cooking-preferences.ts";

/**
 * PLAN-005: Search-grounded culinary discovery contracts.
 * Candidates are provenance-backed meal ideas — not detailed recipes or nutrition.
 */

/**
 * How easy it would be later to fit the dish into a calorie/protein plan
 * while preserving its culinary identity. Discovery classifies — it must not
 * rewrite the recipe.
 *
 * PLAN-005 used excellent|good|difficult; v1.1 maps those onto this enum
 * at the provider boundary.
 */
export const FitnessAdaptabilitySchema = z.enum(["easy", "moderate", "hard"]);

export const MealPrepAdaptabilitySchema = z.enum([
  "fully_prepped",
  "component_prepped",
  "quick_fresh_finish",
  "fresh_only",
]);

export const DiscoveryConfidenceSchema = z.enum(["high", "medium", "low"]);

export const HttpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => {
    // Avoid depending on DOM `URL` typings in packages without @types/node/DOM lib.
    return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value);
  }, "Source URL must be an http(s) URL");

export const CulinaryDiscoverySourceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  url: HttpUrlSchema,
  author: z.string().trim().min(1).max(160).nullable().optional(),
});

export const RecentMealConceptSchema = z.object({
  name: z.string().trim().min(1).max(160),
  cuisineFamily: z.string().trim().min(1).max(80).optional(),
  flavorFamilies: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  timesSuggestedLast30Days: z.number().int().nonnegative().max(100).optional(),
  lastSuggestedDaysAgo: z.number().int().nonnegative().max(3650).optional(),
});

export const CulinaryDiscoveryCookingPreferencesSchema = z.object({
  cookingStyle: WeeklyCookingStyleSchema.or(z.string().trim().min(1).max(80)).optional(),
  maxFinishMinutes: z.number().int().nonnegative().max(180).optional(),
});

/**
 * Discovery request. Nutrition targets are intentionally omitted —
 * culinary discovery must not optimize primarily around macros.
 */
export const CulinaryDiscoveryRequestSchema = z.object({
  mealType: MealTypeSchema,
  cuisines: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  proteinPreferences: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  experiencePreferences: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  allergies: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  dietaryRestrictions: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  dislikes: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  cookingPreferences: CulinaryDiscoveryCookingPreferencesSchema.optional(),
  recentConcepts: z.array(RecentMealConceptSchema).max(40).optional(),
  rejectedConcepts: z.array(z.string().trim().min(1).max(160)).max(40).optional(),
  targetCandidateCount: z.number().int().min(1).max(40).default(20),
});

export const CulinaryDiscoveryCandidateSchema = z.object({
  candidateId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  source: CulinaryDiscoverySourceSchema,
  cuisineFamily: z.string().trim().min(1).max(80),
  regionalStyle: z.string().trim().min(1).max(120).nullable().optional(),
  primaryProtein: z.string().trim().min(1).max(80).nullable().optional(),
  dishFormat: z.string().trim().min(1).max(80),
  flavorFamilies: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  cookingTechniques: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  textureTags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  experienceTags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  whyItIsInteresting: z.string().trim().min(1).max(600),
  fitnessAdaptability: FitnessAdaptabilitySchema,
  fitnessAdaptabilityReason: z.string().trim().min(1).max(400),
  mealPrepAdaptability: MealPrepAdaptabilitySchema,
  estimatedFinishMinutesAfterPrep: z.number().int().nonnegative().max(180).nullable().optional(),
  noveltyReason: z.string().trim().min(1).max(400),
  discoveryConfidence: DiscoveryConfidenceSchema,
});

export const CulinaryDiscoveryGroundingChunkSchema = z.object({
  web: z
    .object({
      uri: z.string().trim().min(1).max(2000).optional(),
      title: z.string().trim().min(1).max(300).optional(),
      domain: z.string().trim().min(1).max(200).optional(),
    })
    .optional(),
});

export const CulinaryDiscoveryGroundingSupportSchema = z.object({
  groundingChunkIndices: z.array(z.number().int().nonnegative()).optional(),
  confidenceScores: z.array(z.number().min(0).max(1)).optional(),
  segment: z
    .object({
      startIndex: z.number().int().nonnegative().optional(),
      endIndex: z.number().int().nonnegative().optional(),
      text: z.string().max(2000).optional(),
    })
    .optional(),
});

/** Safe grounding metadata — no API keys, no raw HTML search widgets. */
export const CulinaryDiscoveryGroundingMetadataSchema = z.object({
  webSearchQueries: z.array(z.string().trim().min(1).max(300)).max(40).optional(),
  groundingChunks: z.array(CulinaryDiscoveryGroundingChunkSchema).max(80).optional(),
  groundingSupports: z.array(CulinaryDiscoveryGroundingSupportSchema).max(120).optional(),
  hasSearchEntryPoint: z.boolean().optional(),
  imageSearchQueries: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
});

/**
 * Locally derived quality/provenance diagnostics.
 * `groundingCoverage === 1` means every returned candidate correlated with
 * grounding metadata — not that every source is high quality.
 */
export const CulinaryDiscoveryQualityStatsSchema = z.object({
  groundedCandidateCount: z.number().int().nonnegative(),
  groundingCoverage: z.number().min(0).max(1),
  uniqueSourceCount: z.number().int().nonnegative(),
  uniqueDomainCount: z.number().int().nonnegative(),
  searchQueryCount: z.number().int().nonnegative(),
  broadSearchQueryCount: z.number().int().nonnegative(),
  specificDishSearchQueryCount: z.number().int().nonnegative().optional(),
  rejectedForWeakProvenanceCount: z.number().int().nonnegative(),
  genericHomepageSourceCount: z.number().int().nonnegative(),
  communitySourceCount: z.number().int().nonnegative().optional(),
});

export const CulinaryDiscoveryMetadataSchema = z.object({
  provider: z.literal("gemini"),
  model: z.string().trim().min(1).max(120),
  promptVersion: z.string().trim().min(1).max(80),
  requestedCandidateCount: z.number().int().nonnegative(),
  returnedCandidateCount: z.number().int().nonnegative(),
  searchQueries: z.array(z.string().trim().min(1).max(300)).max(40).optional(),
  searchQueryCount: z.number().int().nonnegative().optional(),
  sourceCount: z.number().int().nonnegative().optional(),
  uniqueSourceCount: z.number().int().nonnegative().optional(),
  uniqueCuisineCount: z.number().int().nonnegative().optional(),
  uniqueDomainCount: z.number().int().nonnegative().optional(),
  groundedCandidateCount: z.number().int().nonnegative().optional(),
  groundingCoverage: z.number().min(0).max(1).optional(),
  broadSearchQueryCount: z.number().int().nonnegative().optional(),
  specificDishSearchQueryCount: z.number().int().nonnegative().optional(),
  rejectedForWeakProvenanceCount: z.number().int().nonnegative().optional(),
  genericHomepageSourceCount: z.number().int().nonnegative().optional(),
  communitySourceCount: z.number().int().nonnegative().optional(),
  qualityStats: CulinaryDiscoveryQualityStatsSchema.optional(),
  requestId: z.string().trim().min(1).max(120).optional(),
  durationMs: z.number().nonnegative().optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().int().nonnegative().optional(),
      candidatesTokenCount: z.number().int().nonnegative().optional(),
      totalTokenCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export const CulinaryDiscoveryResultSchema = z.object({
  candidates: z.array(CulinaryDiscoveryCandidateSchema).max(40),
  discoveryMetadata: CulinaryDiscoveryMetadataSchema,
  groundingMetadata: CulinaryDiscoveryGroundingMetadataSchema.optional(),
});

export const GenerateCulinaryDiscoveryRequestSchema = CulinaryDiscoveryRequestSchema;

export const GenerateCulinaryDiscoveryResponseSchema = z.object({
  result: CulinaryDiscoveryResultSchema,
  meta: z
    .object({
      requestId: z.string().min(1),
      promptVersion: z.string().min(1),
      provider: z.string().min(1),
      model: z.string().min(1),
      durationMs: z.number().nonnegative().optional(),
    })
    .optional(),
});

export type FitnessAdaptability = z.infer<typeof FitnessAdaptabilitySchema>;
export type MealPrepAdaptability = z.infer<typeof MealPrepAdaptabilitySchema>;
export type DiscoveryConfidence = z.infer<typeof DiscoveryConfidenceSchema>;
export type CulinaryDiscoverySource = z.infer<typeof CulinaryDiscoverySourceSchema>;
export type RecentMealConcept = z.infer<typeof RecentMealConceptSchema>;
export type CulinaryDiscoveryRequest = z.infer<typeof CulinaryDiscoveryRequestSchema>;
export type CulinaryDiscoveryCandidate = z.infer<typeof CulinaryDiscoveryCandidateSchema>;
export type CulinaryDiscoveryGroundingMetadata = z.infer<
  typeof CulinaryDiscoveryGroundingMetadataSchema
>;
export type CulinaryDiscoveryQualityStats = z.infer<typeof CulinaryDiscoveryQualityStatsSchema>;
export type CulinaryDiscoveryMetadata = z.infer<typeof CulinaryDiscoveryMetadataSchema>;
export type CulinaryDiscoveryResult = z.infer<typeof CulinaryDiscoveryResultSchema>;
export type GenerateCulinaryDiscoveryRequest = z.infer<
  typeof GenerateCulinaryDiscoveryRequestSchema
>;
export type GenerateCulinaryDiscoveryResponse = z.infer<
  typeof GenerateCulinaryDiscoveryResponseSchema
>;
