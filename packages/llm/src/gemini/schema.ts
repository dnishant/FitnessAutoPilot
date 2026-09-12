import { z } from "zod";
import {
  MealTypeSchema,
  RecipeIngredientCandidateSchema,
} from "@fitness-autopilot/contracts";
import { zodToGeminiJsonSchema } from "./json-schema";

/**
 * Schema sent to Gemini structured output.
 * Omits `source` — the adapter stamps provider/model provenance after generation.
 * Intentionally excludes any nutrition/macro fields.
 */
export const GeminiRecipeCandidatePayloadSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(800).optional(),
  mealType: MealTypeSchema,
  cuisineFamily: z.string().min(1).max(80).optional(),
  // Prefer min(0.01) over positive() so JSON Schema avoids exclusiveMinimum,
  // which Gemini structured output often rejects.
  servings: z.number().min(0.01),
  ingredients: z.array(RecipeIngredientCandidateSchema).min(1),
  instructions: z.array(z.string().min(1).max(600)).min(1),
  prepMinutes: z.number().int().nonnegative().max(24 * 60),
  cookMinutes: z.number().int().nonnegative().max(24 * 60),
});

export type GeminiRecipeCandidatePayload = z.infer<
  typeof GeminiRecipeCandidatePayloadSchema
>;

/** Build a root object JSON Schema for Gemini recipe structured output. */
export function geminiRecipeResponseJsonSchema(): Record<string, unknown> {
  return zodToGeminiJsonSchema(GeminiRecipeCandidatePayloadSchema);
}
