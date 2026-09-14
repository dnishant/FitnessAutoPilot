import { z } from "zod";
import {
  DayOfWeekSchema,
  LunchPreparationStrategySchema,
  PrepIntentSchema,
} from "../../contracts/index.ts";
import { zodToGeminiJsonSchema } from "./json-schema.ts";

/**
 * Gemini structured output for PLAN-007 ranked weekly strategy.
 * Candidate identity is an ID only — names are hydrated from the supplied pool.
 * Nutrition, uniqueCandidateIds, and metadata are omitted (server-calculated).
 */
export const GeminiRankedWeeklyLunchSlotSchema = z.object({
  candidateId: z.string().min(1).max(80),
  prepIntent: PrepIntentSchema,
  lunchPreparationStrategy: LunchPreparationStrategySchema.optional(),
  planningReason: z.string().min(1).max(400),
});

export const GeminiRankedWeeklyDinnerSlotSchema = z.object({
  candidateId: z.string().min(1).max(80),
  prepIntent: PrepIntentSchema,
  planningReason: z.string().min(1).max(400),
});

export const GeminiRankedWeeklyDaySchema = z.object({
  day: DayOfWeekSchema,
  lunch: GeminiRankedWeeklyLunchSlotSchema,
  dinner: GeminiRankedWeeklyDinnerSlotSchema,
});

export const GeminiRankedWeeklyStrategyPayloadSchema = z.object({
  strategySummary: z.object({
    varietyApproach: z.string().min(1).max(600),
    prepApproach: z.string().min(1).max(600),
    ingredientReuseApproach: z.string().min(1).max(600),
  }),
  // `.length(7)` documents the week; Gemini 3.x rejects minItems/maxItems, so
  // the sanitizer strips both. Domain validation still requires exactly 7 days.
  days: z.array(GeminiRankedWeeklyDaySchema).length(7),
});

export type GeminiRankedWeeklyStrategyPayload = z.infer<
  typeof GeminiRankedWeeklyStrategyPayloadSchema
>;

export function geminiRankedWeeklyStrategyResponseJsonSchema(): Record<string, unknown> {
  return zodToGeminiJsonSchema(GeminiRankedWeeklyStrategyPayloadSchema);
}
