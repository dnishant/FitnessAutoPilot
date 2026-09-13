import { z } from "zod";
import { MealTypeSchema } from "./recipe";
import { VarietyLevelSchema } from "./meal-preferences";
import {
  MaxFinishMinutesSchema,
  MaxPrepSessionMinutesSchema,
  PrepFrequencySchema,
  WeeklyCookingStyleSchema,
} from "./cooking-preferences";

/**
 * PLAN-004: Weekly meal strategy contracts.
 * High-level meal concepts only — no detailed recipes, ingredients, or authoritative nutrition.
 */

export const DayOfWeekSchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export const WEEK_DAYS = DayOfWeekSchema.options;

export const PrepIntentSchema = z.enum([
  "fully_prepped",
  "component_prepped",
  "fresh",
]);

export const WeeklyMealConceptSchema = z.object({
  conceptId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  mealType: MealTypeSchema,
  cuisineFamily: z.string().trim().min(1).max(80).optional(),
  primaryProtein: z.string().trim().min(1).max(80).optional(),
  flavorFamilies: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  experienceTags: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  prepIntent: PrepIntentSchema,
  estimatedFinishMinutes: z.number().int().nonnegative().max(180).optional(),
  repeatOfConceptId: z.string().trim().min(1).max(80).nullable().optional(),
  rationale: z.string().trim().min(1).max(400).optional(),
});

export const WeeklyDayStrategySchema = z.object({
  day: DayOfWeekSchema,
  breakfast: WeeklyMealConceptSchema.optional(),
  lunch: WeeklyMealConceptSchema.optional(),
  snack: WeeklyMealConceptSchema.optional(),
  dinner: WeeklyMealConceptSchema.optional(),
});

export const WeeklyStrategySummarySchema = z.object({
  varietyLevel: VarietyLevelSchema,
  breakfastPattern: z.string().trim().min(1).max(400),
  lunchPattern: z.string().trim().min(1).max(400),
  dinnerPattern: z.string().trim().min(1).max(400),
  snackPattern: z.string().trim().min(1).max(400),
  prepApproach: z.string().trim().min(1).max(600),
});

/**
 * Raw strategy shape from LLM / transport.
 * `uniqueConceptCount` is optional on input and always overwritten by deterministic code.
 */
export const WeeklyMealStrategySchema = z.object({
  strategySummary: WeeklyStrategySummarySchema,
  days: z.array(WeeklyDayStrategySchema).length(7),
  // Soft planning labels — Gemini sometimes emits short phrases, not single tokens.
  sharedIngredientIntents: z.array(z.string().trim().min(1).max(160)).max(40),
  uniqueConceptCount: z.number().int().nonnegative().optional(),
  planningNotes: z.array(z.string().trim().min(1).max(400)).max(20).optional(),
});

export const WeeklyStrategyStatsSchema = z.object({
  totalMealSlots: z.number().int().nonnegative(),
  uniqueConcepts: z.number().int().nonnegative(),
  uniqueBreakfastConcepts: z.number().int().nonnegative(),
  uniqueLunchConcepts: z.number().int().nonnegative(),
  uniqueSnackConcepts: z.number().int().nonnegative(),
  uniqueDinnerConcepts: z.number().int().nonnegative(),
  repeatedMealSlots: z.number().int().nonnegative(),
  cuisineFamilies: z.array(z.string()),
  primaryProteins: z.array(z.string()),
});

/**
 * Weekly strategy generation request.
 * Reuses PLAN-001/002 enums; string arrays accept catalog codes or display labels.
 */
export const WeeklyStrategyNutritionSchema = z.object({
  targetCaloriesPerDay: z.number().finite().positive().max(10000),
  targetProteinGramsPerDay: z.number().finite().positive().max(500),
  targetCarbsGramsPerDay: z.number().finite().positive().max(1000).optional(),
  targetFatGramsPerDay: z.number().finite().positive().max(400).optional(),
});

export const WeeklyStrategyFoodPreferencesSchema = z.object({
  cuisines: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  proteinPreferences: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  experiencePreferences: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  allergies: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  dietaryRestrictions: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  dislikes: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  varietyLevel: VarietyLevelSchema,
});

export const WeeklyStrategyCookingPreferencesSchema = z.object({
  prepFrequency: PrepFrequencySchema,
  maxPrepSessionMinutes: MaxPrepSessionMinutesSchema,
  cookingStyle: WeeklyCookingStyleSchema,
  maxFinishMinutes: MaxFinishMinutesSchema,
  useDinnerPrepForNextLunch: z.boolean(),
});

export const WeeklyStrategyRequestSchema = z.object({
  nutrition: WeeklyStrategyNutritionSchema,
  foodPreferences: WeeklyStrategyFoodPreferencesSchema,
  cookingPreferences: WeeklyStrategyCookingPreferencesSchema,
});

export const GenerateWeeklyStrategyRequestSchema = WeeklyStrategyRequestSchema;

export const GenerateWeeklyStrategyResponseSchema = z.object({
  strategy: WeeklyMealStrategySchema.extend({
    uniqueConceptCount: z.number().int().nonnegative(),
  }),
  stats: WeeklyStrategyStatsSchema,
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

export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;
export type PrepIntent = z.infer<typeof PrepIntentSchema>;
export type WeeklyMealConcept = z.infer<typeof WeeklyMealConceptSchema>;
export type WeeklyDayStrategy = z.infer<typeof WeeklyDayStrategySchema>;
export type WeeklyStrategySummary = z.infer<typeof WeeklyStrategySummarySchema>;
export type WeeklyMealStrategy = z.infer<typeof WeeklyMealStrategySchema> & {
  uniqueConceptCount: number;
};
export type WeeklyStrategyStats = z.infer<typeof WeeklyStrategyStatsSchema>;
export type WeeklyStrategyNutrition = z.infer<typeof WeeklyStrategyNutritionSchema>;
export type WeeklyStrategyFoodPreferences = z.infer<
  typeof WeeklyStrategyFoodPreferencesSchema
>;
export type WeeklyStrategyCookingPreferences = z.infer<
  typeof WeeklyStrategyCookingPreferencesSchema
>;
export type WeeklyStrategyRequest = z.infer<typeof WeeklyStrategyRequestSchema>;
export type GenerateWeeklyStrategyRequest = z.infer<
  typeof GenerateWeeklyStrategyRequestSchema
>;
export type GenerateWeeklyStrategyResponse = z.infer<
  typeof GenerateWeeklyStrategyResponseSchema
>;
