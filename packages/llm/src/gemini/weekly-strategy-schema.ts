import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  DayOfWeekSchema,
  PrepIntentSchema,
  VarietyLevelSchema,
  MealTypeSchema,
} from "@fitness-autopilot/contracts";

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
  repeatOfConceptId: z.string().min(1).max(80).nullable().optional(),
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
  sharedIngredientIntents: z.array(z.string().min(1).max(80)).max(40),
  planningNotes: z.array(z.string().min(1).max(400)).max(20).optional(),
});

export type GeminiWeeklyMealStrategyPayload = z.infer<
  typeof GeminiWeeklyMealStrategyPayloadSchema
>;

export function geminiWeeklyStrategyResponseJsonSchema(): Record<string, unknown> {
  // Do not pass `name` — that returns `{ $ref: "#/definitions/...", definitions: {...} }`.
  // Deleting definitions then leaves a dangling top-level $ref that Gemini rejects as
  // "reference to undefined schema at top-level".
  const schema = zodToJsonSchema(GeminiWeeklyMealStrategyPayloadSchema, {
    $refStrategy: "none",
  }) as Record<string, unknown>;

  // Gemini rejects some JSON Schema meta keys.
  delete schema.$schema;
  delete schema.definitions;
  delete schema.$defs;

  if (schema.$ref !== undefined) {
    throw new Error(
      "Gemini weekly strategy schema must be an inlined object, not a $ref wrapper.",
    );
  }

  return schema;
}
