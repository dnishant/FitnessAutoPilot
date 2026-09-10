import { z } from "zod";
import { MealTypeSchema } from "./recipe";
import { VarietyLevelSchema } from "./meal-preferences";
import { WeeklyCookingStyleSchema } from "./cooking-preferences";

/**
 * PLAN-003: AI recipe candidate contracts.
 * Nutrition from the model is never authoritative and is intentionally omitted.
 */

export const MeasurementStateSchema = z.enum(["raw", "cooked", "as_packaged"]);

export const RecipeIngredientCandidateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantityGrams: z.number().finite().positive(),
  measurementState: MeasurementStateSchema,
  preparationNote: z.string().trim().min(1).max(200).optional(),
});

/**
 * Provenance for AI-original recipes today.
 * Future types (food_blog, creator, editorial, inspired_by, adapted) can extend
 * this discriminated union without changing RecipeCandidate consumers.
 */
export const AiOriginalRecipeSourceSchema = z.object({
  type: z.literal("ai_original"),
  provider: z.enum(["gemini", "openai", "anthropic"]),
  model: z.string().trim().min(1).max(120),
});

export const RecipeSourceSchema = AiOriginalRecipeSourceSchema;

export const RecipeCandidateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(800).optional(),
  mealType: MealTypeSchema,
  cuisineFamily: z.string().trim().min(1).max(80).optional(),
  servings: z.number().finite().positive(),
  ingredients: z.array(RecipeIngredientCandidateSchema).min(1),
  instructions: z.array(z.string().trim().min(1).max(600)).min(1),
  prepMinutes: z.number().int().nonnegative().max(24 * 60),
  cookMinutes: z.number().int().nonnegative().max(24 * 60),
  source: RecipeSourceSchema,
});

/**
 * One-recipe generation request.
 * Reuses PLAN-001/002 semantics: varietyLevel is context only (never a batch size).
 * Cuisine/protein/experience values may be catalog codes or display labels.
 */
export const RecipeGenerationRequestSchema = z.object({
  mealType: MealTypeSchema,
  targetCalories: z.number().finite().positive().max(5000).optional(),
  targetProteinGrams: z.number().finite().positive().max(400).optional(),
  cuisines: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  proteinPreferences: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  experiencePreferences: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  allergies: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  dietaryRestrictions: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  dislikes: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  varietyLevel: VarietyLevelSchema.optional(),
  cookingStyle: WeeklyCookingStyleSchema.or(z.string().trim().min(1).max(80)).optional(),
  maxFinishMinutes: z.number().int().nonnegative().max(180).optional(),
});

export const GenerateRecipeRequestSchema = RecipeGenerationRequestSchema;

export const GenerateRecipeResponseSchema = z.object({
  recipe: RecipeCandidateSchema,
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

export type MeasurementState = z.infer<typeof MeasurementStateSchema>;
export type RecipeIngredientCandidate = z.infer<typeof RecipeIngredientCandidateSchema>;
export type AiOriginalRecipeSource = z.infer<typeof AiOriginalRecipeSourceSchema>;
export type RecipeSource = z.infer<typeof RecipeSourceSchema>;
export type RecipeCandidate = z.infer<typeof RecipeCandidateSchema>;
export type RecipeGenerationRequest = z.infer<typeof RecipeGenerationRequestSchema>;
export type GenerateRecipeRequest = z.infer<typeof GenerateRecipeRequestSchema>;
export type GenerateRecipeResponse = z.infer<typeof GenerateRecipeResponseSchema>;
