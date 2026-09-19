import { z } from "zod";
import { DayOfWeekSchema, PrepIntentSchema, WEEK_DAYS } from "./weekly-strategy.ts";
import { LunchPreparationStrategySchema } from "./cooking-preferences.ts";
import type { VarietyLevel } from "./meal-preferences.ts";

/**
 * V1 meal-prep product constants.
 *
 * Standard weekly plan: 4 distinct core meals → 12 lunch/dinner instances
 * across 6 covered days. Day 7 is intentionally flexible (no prescribed
 * lunch/dinner meal-prep nutrition).
 */

export const V1_MEAL_PREP_POLICY_VERSION = "v1-meal-prep-policy-v1" as const;

export const V1_CORE_MEAL_COUNT = 4 as const;
export const V1_COVERED_DAY_COUNT = 6 as const;
export const V1_PLANNED_LUNCH_DINNER_SLOTS = 12 as const;
export const V1_FLEXIBLE_DAY_DEFAULT = "sunday" as const;

/** Covered days for the standard V1 plan (Mon–Sat when week starts Monday). */
export const V1_COVERED_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const satisfies ReadonlyArray<(typeof WEEK_DAYS)[number]>;

export const CoreMealIdSchema = z.string().trim().min(1).max(80);

export const CoreMealSlotRefSchema = z.object({
  day: DayOfWeekSchema,
  mealType: z.enum(["lunch", "dinner"]),
});

/**
 * First-class core meal in the weekly repertoire.
 * Stable identity — meal instances reference this, never infer by name.
 */
export const CoreMealSchema = z.object({
  coreMealId: CoreMealIdSchema,
  /** Discovery/ranking candidate that produced this core meal. */
  candidateId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  cuisineFamily: z.string().trim().min(1).max(80).optional(),
  mealForm: z.string().trim().min(1).max(80).optional(),
  /** Semantic protein anchor label (planning metadata, not grocery truth). */
  proteinAnchor: z.string().trim().min(1).max(80).optional(),
  flavorTags: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  prepIntent: PrepIntentSchema.optional(),
  lunchPreparationStrategy: LunchPreparationStrategySchema.optional(),
  /** Fridge life in days when fully prepped (from prep profile when known). */
  fridgeLifeDays: z.number().int().positive().max(14).optional(),
  freezerFriendly: z.boolean().optional(),
  reheatingQuality: z.enum(["excellent", "good", "fair", "poor"]).optional(),
  /** Meal instance slots assigned this core meal. */
  mealInstanceSlots: z.array(CoreMealSlotRefSchema).min(1).max(12),
  /** Count of weekly lunch/dinner instances using this core meal. */
  weeklyInstanceCount: z.number().int().positive().max(12),
});

export const CoreMealRepertoireSchema = z.object({
  policyVersion: z.literal(V1_MEAL_PREP_POLICY_VERSION),
  coreMeals: z.array(CoreMealSchema).length(V1_CORE_MEAL_COUNT),
  coveredDays: z.array(DayOfWeekSchema).length(V1_COVERED_DAY_COUNT),
  flexibleDay: DayOfWeekSchema,
  plannedLunchDinnerSlots: z.literal(V1_PLANNED_LUNCH_DINNER_SLOTS),
});

/**
 * Variety no longer controls unique-meal count (always 4).
 * It controls diversity pressure BETWEEN the four meals vs grocery overlap.
 */
export type V1VarietyDiversityPolicy = {
  /** Soft preference for distinct cuisine families among the four. */
  preferredMinDistinctCuisines: number;
  /** Soft preference for distinct protein anchors among the four. */
  preferredMinDistinctProteins: number;
  /** Soft preference for distinct meal forms among the four. */
  preferredMinDistinctMealForms: number;
  /** Relative weight for culinary diversity in set scoring (0–1). */
  diversityWeight: number;
  /** Relative weight for ingredient-overlap / grocery economy (0–1). */
  overlapWeight: number;
};

export const V1_VARIETY_DIVERSITY_POLICY = {
  simple: {
    preferredMinDistinctCuisines: 2,
    preferredMinDistinctProteins: 2,
    preferredMinDistinctMealForms: 2,
    diversityWeight: 0.25,
    overlapWeight: 0.75,
  },
  balanced: {
    preferredMinDistinctCuisines: 3,
    preferredMinDistinctProteins: 2,
    preferredMinDistinctMealForms: 3,
    diversityWeight: 0.5,
    overlapWeight: 0.5,
  },
  high: {
    preferredMinDistinctCuisines: 4,
    preferredMinDistinctProteins: 3,
    preferredMinDistinctMealForms: 3,
    diversityWeight: 0.75,
    overlapWeight: 0.25,
  },
} as const satisfies Record<VarietyLevel, V1VarietyDiversityPolicy>;

export function getV1VarietyDiversityPolicy(
  varietyLevel: VarietyLevel,
): V1VarietyDiversityPolicy {
  return V1_VARIETY_DIVERSITY_POLICY[varietyLevel];
}

export type CoreMeal = z.infer<typeof CoreMealSchema>;
export type CoreMealRepertoire = z.infer<typeof CoreMealRepertoireSchema>;
export type CoreMealSlotRef = z.infer<typeof CoreMealSlotRefSchema>;
