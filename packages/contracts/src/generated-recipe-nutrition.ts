import { z } from "zod";

/**
 * LLM-estimated recipe nutrition (active planning architecture).
 * USDA food-resolution remains available for future verification — not the planning source of truth.
 *
 * Kept free of imports from food-resolution / recipe-resolution to avoid circular Zod init.
 */

export const GENERATED_RECIPE_NUTRITION_SOURCE = "llm_estimate" as const;
export const GENERATED_RECIPE_NUTRITION_POLICY_VERSION =
  "generated-recipe-nutrition-v1" as const;

/** Macro bag for recipe totals / per-serving (IngredientNutrition field names). */
export const RecipeMacroTotalsSchema = z.object({
  caloriesKcal: z.number().finite().nonnegative(),
  proteinGrams: z.number().finite().nonnegative(),
  carbohydrateGrams: z.number().finite().nonnegative(),
  fatGrams: z.number().finite().nonnegative(),
  fiberGrams: z.number().finite().nonnegative().optional(),
});
export type RecipeMacroTotals = z.infer<typeof RecipeMacroTotalsSchema>;

export const GeneratedNutritionConfidenceSchema = z.enum(["low", "medium", "high"]);

export const GeneratedRecipeNutritionSchema = z.object({
  source: z.literal(GENERATED_RECIPE_NUTRITION_SOURCE),
  total: RecipeMacroTotalsSchema,
  perServing: RecipeMacroTotalsSchema,
  confidence: GeneratedNutritionConfidenceSchema.optional(),
  /** Optional free-text note from the model about estimation approach. */
  estimationNotes: z.string().trim().min(1).max(600).optional(),
});

export const RecipeOptimizationChangeTypeSchema = z.enum([
  "cooking_method",
  "ingredient_substitution",
  "quantity_adjustment",
  "fat_reduction",
  "protein_increase",
  "vegetable_increase",
  "other",
]);

export const RecipeOptimizationChangeSchema = z.object({
  type: RecipeOptimizationChangeTypeSchema,
  from: z.string().trim().min(1).max(200),
  to: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(400),
});

export const RecipeOptimizationObjectiveSchema = z.object({
  calories: z.literal("reduce").optional(),
  protein: z.literal("increase").optional(),
  fat: z.literal("reduce").optional(),
  fiber: z.literal("increase").optional(),
});

export const RecipeOptimizationSchema = z.object({
  applied: z.boolean(),
  changes: z.array(RecipeOptimizationChangeSchema).max(20).default([]),
  objective: RecipeOptimizationObjectiveSchema.optional(),
});

export type GeneratedNutritionConfidence = z.infer<typeof GeneratedNutritionConfidenceSchema>;
export type GeneratedRecipeNutrition = z.infer<typeof GeneratedRecipeNutritionSchema>;
export type RecipeOptimizationChangeType = z.infer<typeof RecipeOptimizationChangeTypeSchema>;
export type RecipeOptimizationChange = z.infer<typeof RecipeOptimizationChangeSchema>;
export type RecipeOptimizationObjective = z.infer<typeof RecipeOptimizationObjectiveSchema>;
export type RecipeOptimization = z.infer<typeof RecipeOptimizationSchema>;
