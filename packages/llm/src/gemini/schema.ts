import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  MealTypeSchema,
  RecipeIngredientCandidateSchema,
} from "@fitness-autopilot/contracts";

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
  servings: z.number().positive(),
  ingredients: z.array(RecipeIngredientCandidateSchema).min(1),
  instructions: z.array(z.string().min(1).max(600)).min(1),
  prepMinutes: z.number().int().nonnegative().max(24 * 60),
  cookMinutes: z.number().int().nonnegative().max(24 * 60),
});

export type GeminiRecipeCandidatePayload = z.infer<
  typeof GeminiRecipeCandidatePayloadSchema
>;

export function geminiRecipeResponseJsonSchema(): Record<string, unknown> {
  const schema = zodToJsonSchema(GeminiRecipeCandidatePayloadSchema, {
    name: "RecipeCandidatePayload",
    $refStrategy: "none",
  }) as Record<string, unknown>;

  // Gemini rejects some JSON Schema meta keys.
  delete schema.$schema;
  delete schema.definitions;
  delete schema.$defs;

  return schema;
}
