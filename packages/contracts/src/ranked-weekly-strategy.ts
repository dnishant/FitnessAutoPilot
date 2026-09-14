import { z } from "zod";
import { RankedCulinaryCandidateSchema } from "./candidate-ranking";
import { RecentMealConceptSchema } from "./culinary-discovery";
import { LunchPreparationStrategySchema } from "./cooking-preferences";
import {
  DayOfWeekSchema,
  PrepIntentSchema,
  WeeklyStrategyCookingPreferencesSchema,
  WeeklyStrategyFoodPreferencesSchema,
  WeeklyStrategyNutritionSchema,
} from "./weekly-strategy";

/**
 * PLAN-007: Ranked-candidate weekly meal strategy contracts.
 * Selects and schedules lunch/dinner candidate IDs. No recipe resolution
 * or authoritative per-meal nutrition.
 */

export const RANKED_WEEKLY_STRATEGY_PROMPT_VERSION = "weekly-strategy-ranked-v1" as const;

export const MIN_RANKED_CANDIDATES_PER_MEAL_TYPE = 1;

export const RankedWeeklyMealTypeSchema = z.enum(["lunch", "dinner"]);

export const RankedWeeklyMealSlotSchema = z.object({
  day: DayOfWeekSchema,
  mealType: RankedWeeklyMealTypeSchema,
  candidateId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  prepIntent: PrepIntentSchema,
  lunchPreparationStrategy: LunchPreparationStrategySchema.optional(),
  planningReason: z.string().trim().min(1).max(400),
});

export const RankedWeeklyDaySchema = z.object({
  day: DayOfWeekSchema,
  lunch: RankedWeeklyMealSlotSchema,
  dinner: RankedWeeklyMealSlotSchema,
});

export const RankedWeeklyStrategySummarySchema = z.object({
  varietyApproach: z.string().trim().min(1).max(600),
  prepApproach: z.string().trim().min(1).max(600),
  ingredientReuseApproach: z.string().trim().min(1).max(600),
});

export const RankedWeeklyStrategyMetadataSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  promptVersion: z.string().trim().min(1).max(80),
});

export const RankedWeeklyStrategySchema = z.object({
  days: z.array(RankedWeeklyDaySchema).length(7),
  uniqueCandidateIds: z.array(z.string().trim().min(1).max(80)).max(14),
  strategySummary: RankedWeeklyStrategySummarySchema,
  metadata: RankedWeeklyStrategyMetadataSchema,
});

export const RankedWeeklyCandidateUsageSchema = z.object({
  candidateId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  count: z.number().int().positive(),
  mealTypes: z.array(RankedWeeklyMealTypeSchema).min(1).max(2),
});

export const RankedWeeklyAdjacentPairSchema = z.object({
  left: RankedWeeklyMealSlotSchema,
  right: RankedWeeklyMealSlotSchema,
  similarity: z.number().min(0).max(1),
  sameCandidate: z.boolean(),
  sameCuisine: z.boolean(),
});

export const RankedWeeklyStrategyQualityStatsSchema = z.object({
  totalMealSlots: z.number().int().nonnegative(),
  uniqueCandidateCount: z.number().int().nonnegative(),
  repeatedMealSlotCount: z.number().int().nonnegative(),
  uniqueCuisineCount: z.number().int().nonnegative(),
  uniqueProteinCount: z.number().int().nonnegative(),
  uniqueFlavorFamilyCount: z.number().int().nonnegative(),
  directLeftoverLunchCount: z.number().int().nonnegative(),
  piggybackLunchCount: z.number().int().nonnegative(),
  independentLunchCount: z.number().int().nonnegative(),
  adjacentSameCandidateCount: z.number().int().nonnegative(),
  adjacentSameCuisineCount: z.number().int().nonnegative(),
  adjacentHighSimilarityCount: z.number().int().nonnegative(),
  maxAdjacentSimilarity: z.number().min(0).max(1),
  averageCandidateRank: z.number().nonnegative().optional(),
  candidateUsage: z.array(RankedWeeklyCandidateUsageSchema).max(28),
  worstAdjacentPair: RankedWeeklyAdjacentPairSchema.optional(),
});

export const RankedWeeklyStrategyRequestSchema = z.object({
  nutrition: WeeklyStrategyNutritionSchema,
  foodPreferences: WeeklyStrategyFoodPreferencesSchema,
  cookingPreferences: WeeklyStrategyCookingPreferencesSchema,
  lunchCandidates: z.array(RankedCulinaryCandidateSchema).max(40),
  dinnerCandidates: z.array(RankedCulinaryCandidateSchema).max(40),
  recentConcepts: z.array(RecentMealConceptSchema).max(40).optional(),
});

export const GenerateRankedWeeklyStrategyRequestSchema = RankedWeeklyStrategyRequestSchema;

export const GenerateRankedWeeklyStrategyResponseSchema = z.object({
  strategy: RankedWeeklyStrategySchema,
  stats: RankedWeeklyStrategyQualityStatsSchema,
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

export type RankedWeeklyMealType = z.infer<typeof RankedWeeklyMealTypeSchema>;
export type RankedWeeklyMealSlot = z.infer<typeof RankedWeeklyMealSlotSchema>;
export type RankedWeeklyDay = z.infer<typeof RankedWeeklyDaySchema>;
export type RankedWeeklyStrategySummary = z.infer<typeof RankedWeeklyStrategySummarySchema>;
export type RankedWeeklyStrategyMetadata = z.infer<typeof RankedWeeklyStrategyMetadataSchema>;
export type RankedWeeklyStrategy = z.infer<typeof RankedWeeklyStrategySchema>;
export type RankedWeeklyCandidateUsage = z.infer<typeof RankedWeeklyCandidateUsageSchema>;
export type RankedWeeklyAdjacentPair = z.infer<typeof RankedWeeklyAdjacentPairSchema>;
export type RankedWeeklyStrategyQualityStats = z.infer<
  typeof RankedWeeklyStrategyQualityStatsSchema
>;
export type RankedWeeklyStrategyRequest = z.infer<typeof RankedWeeklyStrategyRequestSchema>;
export type GenerateRankedWeeklyStrategyRequest = z.infer<
  typeof GenerateRankedWeeklyStrategyRequestSchema
>;
export type GenerateRankedWeeklyStrategyResponse = z.infer<
  typeof GenerateRankedWeeklyStrategyResponseSchema
>;
