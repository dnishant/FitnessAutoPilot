import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  MealTypeSchema,
  RecipeIngredientCandidateSchema,
} from "../../contracts/index.ts";

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

/**
 * Build a root object JSON Schema for Gemini.
 *
 * Important: do not pass `name` to zod-to-json-schema. That option returns
 * `{ $ref: "#/definitions/...", definitions: {...} }`. Deleting `definitions`
 * (to strip meta) left a dangling `$ref`, which Gemini rejects immediately
 * (~100–200ms LLM_PROVIDER_ERROR).
 */
export function geminiRecipeResponseJsonSchema(): Record<string, unknown> {
  const schema = zodToJsonSchema(GeminiRecipeCandidatePayloadSchema, {
    $refStrategy: "none",
  }) as Record<string, unknown>;

  delete schema.$schema;
  delete schema.definitions;
  delete schema.$defs;

  if (schema.$ref !== undefined) {
    throw new Error(
      "Gemini response schema must be an inlined object, not a $ref wrapper.",
    );
  }

  return schema;
}
