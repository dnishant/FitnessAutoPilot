import { z } from "zod";
import { RankedCulinaryCandidateSchema } from "./candidate-ranking.ts";
import { RecentMealConceptSchema } from "./culinary-discovery.ts";
import { LunchPreparationStrategySchema } from "./cooking-preferences.ts";
import {
  ComponentReuseEntrySchema,
  CompositionComplexitySignalSchema,
  MealConceptSchema,
} from "./meal-composition.ts";
import type { VarietyLevel } from "./meal-preferences.ts";
import {
  DayOfWeekSchema,
  PrepIntentSchema,
  WeeklyStrategyCookingPreferencesSchema,
  WeeklyStrategyFoodPreferencesSchema,
  WeeklyStrategyNutritionSchema,
} from "./weekly-strategy.ts";
import {
  CoreMealRepertoireSchema,
  V1_CORE_MEAL_COUNT,
  V1_COVERED_DAY_COUNT,
  V1_FLEXIBLE_DAY_DEFAULT,
  V1_PLANNED_LUNCH_DINNER_SLOTS,
  V1_VARIETY_DIVERSITY_POLICY,
} from "./v1-meal-prep.ts";

/**
 * PLAN-007 / PLAN-007.1 / V1 meal-prep: Ranked-candidate weekly strategy.
 * Selects a coordinated 4-meal repertoire and schedules 12 lunch/dinner
 * instances across 6 covered days. Day 7 is intentionally flexible.
 * No recipe resolution or authoritative per-meal nutrition here.
 */

export const RANKED_WEEKLY_STRATEGY_PROMPT_VERSION = "weekly-strategy-ranked-v1.5.0" as const;

export const MIN_RANKED_CANDIDATES_PER_MEAL_TYPE = 1;

/**
 * V1: unique core meals are fixed at 4 for every variety level.
 * Variety only changes diversity/overlap pressure between those four
 * (see V1_VARIETY_DIVERSITY_POLICY) — never the repertoire size.
 */
export type VarietyComplexityPolicy = {
  minPreferredUniqueCandidates: number;
  maxPreferredUniqueCandidates: number;
  maxHardUniqueCandidates: number;
  /** Soft lunch uniqueness guidance for ready_lunch_fresh_dinner weeks. */
  minPreferredUniqueLunchCandidates: number;
  maxPreferredUniqueLunchCandidates: number;
  /** Soft dinner uniqueness guidance for ready_lunch_fresh_dinner weeks. */
  minPreferredUniqueDinnerCandidates: number;
  maxPreferredUniqueDinnerCandidates: number;
};

export const WEEKLY_VARIETY_COMPLEXITY_POLICY = {
  simple: {
    minPreferredUniqueCandidates: V1_CORE_MEAL_COUNT,
    maxPreferredUniqueCandidates: V1_CORE_MEAL_COUNT,
    maxHardUniqueCandidates: V1_CORE_MEAL_COUNT,
    minPreferredUniqueLunchCandidates: 2,
    maxPreferredUniqueLunchCandidates: V1_CORE_MEAL_COUNT,
    minPreferredUniqueDinnerCandidates: 2,
    maxPreferredUniqueDinnerCandidates: V1_CORE_MEAL_COUNT,
  },
  balanced: {
    minPreferredUniqueCandidates: V1_CORE_MEAL_COUNT,
    maxPreferredUniqueCandidates: V1_CORE_MEAL_COUNT,
    maxHardUniqueCandidates: V1_CORE_MEAL_COUNT,
    minPreferredUniqueLunchCandidates: 2,
    maxPreferredUniqueLunchCandidates: V1_CORE_MEAL_COUNT,
    minPreferredUniqueDinnerCandidates: 2,
    maxPreferredUniqueDinnerCandidates: V1_CORE_MEAL_COUNT,
  },
  high: {
    minPreferredUniqueCandidates: V1_CORE_MEAL_COUNT,
    maxPreferredUniqueCandidates: V1_CORE_MEAL_COUNT,
    maxHardUniqueCandidates: V1_CORE_MEAL_COUNT,
    minPreferredUniqueLunchCandidates: 3,
    maxPreferredUniqueLunchCandidates: V1_CORE_MEAL_COUNT,
    minPreferredUniqueDinnerCandidates: 3,
    maxPreferredUniqueDinnerCandidates: V1_CORE_MEAL_COUNT,
  },
} as const satisfies Record<VarietyLevel, VarietyComplexityPolicy>;

export {
  V1_CORE_MEAL_COUNT,
  V1_COVERED_DAY_COUNT,
  V1_FLEXIBLE_DAY_DEFAULT,
  V1_PLANNED_LUNCH_DINNER_SLOTS,
  V1_VARIETY_DIVERSITY_POLICY,
};
export type WeeklyComplexityStatus =
  | "within_preferred_range"
  | "above_preferred_range"
  | "excessive";

export const WeeklyComplexityStatusSchema = z.enum([
  "within_preferred_range",
  "above_preferred_range",
  "excessive",
]);

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

export const RankedWeeklyComplexityRetryMetadataSchema = z.object({
  occurred: z.boolean(),
  providerCallCount: z.number().int().positive().max(2),
  firstAttemptUniqueCandidates: z.number().int().nonnegative().optional(),
  finalAttemptUniqueCandidates: z.number().int().nonnegative().optional(),
});

export const RankedWeeklyStrategyMetadataSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  promptVersion: z.string().trim().min(1).max(80),
  complexityRetry: RankedWeeklyComplexityRetryMetadataSchema.optional(),
});

export const RankedWeeklyStrategySchema = z.object({
  /** Six covered days with lunch + dinner (12 slots). */
  days: z.array(RankedWeeklyDaySchema).length(V1_COVERED_DAY_COUNT),
  /** Exactly four distinct core meals for the standard V1 plan. */
  uniqueCandidateIds: z
    .array(z.string().trim().min(1).max(80))
    .length(V1_CORE_MEAL_COUNT),
  /** Intentional unplanned day (no prescribed lunch/dinner meal-prep). */
  flexibleDay: DayOfWeekSchema.default(V1_FLEXIBLE_DAY_DEFAULT),
  /** First-class repertoire graph: CoreMealId → meal instance slots. */
  coreRepertoire: CoreMealRepertoireSchema.optional(),
  strategySummary: RankedWeeklyStrategySummarySchema,
  metadata: RankedWeeklyStrategyMetadataSchema,
});

export const RankedWeeklyCandidateUsageSlotSchema = z.object({
  day: DayOfWeekSchema,
  mealType: RankedWeeklyMealTypeSchema,
});

export const RankedWeeklyCandidateUsageSchema = z.object({
  candidateId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  count: z.number().int().positive(),
  mealTypes: z.array(RankedWeeklyMealTypeSchema).min(1).max(2),
  slots: z.array(RankedWeeklyCandidateUsageSlotSchema).min(1).max(V1_PLANNED_LUNCH_DINNER_SLOTS),
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
  uniqueLunchCandidateCount: z.number().int().nonnegative(),
  uniqueDinnerCandidateCount: z.number().int().nonnegative(),
  repeatedMealSlotCount: z.number().int().nonnegative(),
  uniqueCuisineCount: z.number().int().nonnegative(),
  uniqueProteinCount: z.number().int().nonnegative(),
  uniqueCookingTechniqueCount: z.number().int().nonnegative(),
  uniqueFlavorFamilyCount: z.number().int().nonnegative(),
  fullyPreppedUniqueCandidateCount: z.number().int().nonnegative(),
  componentPreppedUniqueCandidateCount: z.number().int().nonnegative(),
  quickFreshUniqueCandidateCount: z.number().int().nonnegative(),
  freshUniqueCandidateCount: z.number().int().nonnegative(),
  directLeftoverLunchCount: z.number().int().nonnegative(),
  piggybackLunchCount: z.number().int().nonnegative(),
  independentLunchCount: z.number().int().nonnegative(),
  complexityStatus: WeeklyComplexityStatusSchema,
  preferredUniqueCandidateRange: z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
  }),
  hardMaxUniqueCandidates: z.number().int().nonnegative(),
  adjacentSameCandidateCount: z.number().int().nonnegative(),
  adjacentSameCuisineCount: z.number().int().nonnegative(),
  adjacentHighSimilarityCount: z.number().int().nonnegative(),
  maxAdjacentSimilarity: z.number().min(0).max(1),
  averageCandidateRank: z.number().nonnegative().optional(),
  candidateUsage: z.array(RankedWeeklyCandidateUsageSchema).max(V1_PLANNED_LUNCH_DINNER_SLOTS),
  worstAdjacentPair: RankedWeeklyAdjacentPairSchema.optional(),
  uniqueComponentCount: z.number().int().nonnegative().optional(),
  reusedComponentCount: z.number().int().nonnegative().optional(),
  uniqueComponentsInSelectedWeek: z.number().int().nonnegative().optional(),
  reusedComponentsInSelectedWeek: z.number().int().nonnegative().optional(),
  componentComplexitySignal: CompositionComplexitySignalSchema.optional(),
  componentReuse: z.array(ComponentReuseEntrySchema).max(40).optional(),
});

export const RankedWeeklyStrategyRequestSchema = z.object({
  nutrition: WeeklyStrategyNutritionSchema,
  foodPreferences: WeeklyStrategyFoodPreferencesSchema,
  cookingPreferences: WeeklyStrategyCookingPreferencesSchema,
  lunchCandidates: z.array(RankedCulinaryCandidateSchema).max(40),
  dinnerCandidates: z.array(RankedCulinaryCandidateSchema).max(40),
  recentConcepts: z.array(RecentMealConceptSchema).max(40).optional(),
  /** Lightweight complete-plate concepts keyed by candidateId (meal-composition-v2). */
  mealConceptsByCandidateId: z.record(z.string(), MealConceptSchema).optional(),
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
      complexityRetry: RankedWeeklyComplexityRetryMetadataSchema.optional(),
      providerCallCount: z.number().int().positive().max(2).optional(),
      firstAttemptUniqueCandidates: z.number().int().nonnegative().optional(),
      finalUniqueCandidates: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type RankedWeeklyMealType = z.infer<typeof RankedWeeklyMealTypeSchema>;
export type RankedWeeklyMealSlot = z.infer<typeof RankedWeeklyMealSlotSchema>;
export type RankedWeeklyDay = z.infer<typeof RankedWeeklyDaySchema>;
export type RankedWeeklyStrategySummary = z.infer<typeof RankedWeeklyStrategySummarySchema>;
export type RankedWeeklyComplexityRetryMetadata = z.infer<
  typeof RankedWeeklyComplexityRetryMetadataSchema
>;
export type RankedWeeklyStrategyMetadata = z.infer<typeof RankedWeeklyStrategyMetadataSchema>;
export type RankedWeeklyStrategy = z.infer<typeof RankedWeeklyStrategySchema>;
export type RankedWeeklyCandidateUsageSlot = z.infer<typeof RankedWeeklyCandidateUsageSlotSchema>;
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

export function getWeeklyVarietyComplexityPolicy(
  varietyLevel: VarietyLevel,
): VarietyComplexityPolicy {
  return WEEKLY_VARIETY_COMPLEXITY_POLICY[varietyLevel];
}
