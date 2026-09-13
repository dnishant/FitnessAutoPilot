import { z } from "zod";
import {
  DayOfWeekSchema,
  PrepIntentSchema,
  VarietyLevelSchema,
  MealTypeSchema,
} from "../../contracts/index.ts";
import { zodToGeminiJsonSchema } from "./json-schema.ts";

/**
 * Schema sent to Gemini structured output for weekly strategy.
 * Omits uniqueConceptCount — domain calculates it deterministically.
 * Intentionally excludes nutrition/macro fields and detailed recipe fields.
 */
export const GeminiWeeklyMealConceptPayloadSchema = z.object({
  conceptId: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  mealType: MealTypeSchema,
  cuisineFamily: z.string().min(1).max(80).optional(),
  primaryProtein: z.string().min(1).max(80).optional(),
  flavorFamilies: z.array(z.string().min(1).max(80)).max(12).optional(),
  experienceTags: z.array(z.string().min(1).max(80)).max(12).optional(),
  prepIntent: PrepIntentSchema,
  estimatedFinishMinutes: z.number().int().nonnegative().max(180).optional(),
  // Optional only (not nullable): Zod `.nullable()` emits anyOf+null which
  // Gemini rejects with opaque 400 INVALID_ARGUMENT. Model may omit the field;
  // domain validation still accepts null if present.
  repeatOfConceptId: z.string().min(1).max(80).optional(),
  rationale: z.string().min(1).max(400).optional(),
});

export const GeminiWeeklyDayStrategyPayloadSchema = z.object({
  day: DayOfWeekSchema,
  breakfast: GeminiWeeklyMealConceptPayloadSchema.optional(),
  lunch: GeminiWeeklyMealConceptPayloadSchema.optional(),
  snack: GeminiWeeklyMealConceptPayloadSchema.optional(),
  dinner: GeminiWeeklyMealConceptPayloadSchema.optional(),
});

export const GeminiWeeklyMealStrategyPayloadSchema = z.object({
  strategySummary: z.object({
    varietyLevel: VarietyLevelSchema,
    breakfastPattern: z.string().min(1).max(400),
    lunchPattern: z.string().min(1).max(400),
    dinnerPattern: z.string().min(1).max(400),
    snackPattern: z.string().min(1).max(400),
    prepApproach: z.string().min(1).max(600),
  }),
  days: z.array(GeminiWeeklyDayStrategyPayloadSchema).length(7),
  sharedIngredientIntents: z.array(z.string().min(1).max(160)).max(40),
  planningNotes: z.array(z.string().min(1).max(400)).max(20).optional(),
});

export type GeminiWeeklyMealStrategyPayload = z.infer<
  typeof GeminiWeeklyMealStrategyPayloadSchema
>;

/** Build a root object JSON Schema for Gemini weekly strategy structured output. */
export function geminiWeeklyStrategyResponseJsonSchema(): Record<
  string,
  unknown
> {
  return zodToGeminiJsonSchema(GeminiWeeklyMealStrategyPayloadSchema);
}
