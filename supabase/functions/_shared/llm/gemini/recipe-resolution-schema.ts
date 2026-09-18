import { z } from "zod";
import {
  FlavorIntensitySchema,
  IngredientRoleSchema,
  IngredientScalingBehaviorSchema,
  MealComponentRelationshipSchema,
  MealComponentTypeSchema,
  MealPrepQualitySchema,
  MoistureLevelSchema,
  RecipeOptimizationChangeTypeSchema,
} from "../../contracts/index.ts";
import { PrepIntentSchema } from "../../contracts/index.ts";
import { zodToGeminiJsonSchema } from "./json-schema.ts";

const GeminiNutritionMacrosSchema = z.object({
  caloriesKcal: z.number().min(0),
  proteinGrams: z.number().min(0),
  carbohydrateGrams: z.number().min(0),
  fatGrams: z.number().min(0),
  fiberGrams: z.number().min(0).optional(),
});

/**
 * Model payload for recipe resolution with LLM-estimated nutrition.
 * Omits server-stamped fields: candidateId (forced from request), source provenance, resolutionMetadata.
 */
export const GeminiResolvedRecipePayloadSchema = z.object({
  recipeId: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(800),
  baseServings: z.number().min(0.01).max(24),
  ingredients: z
    .array(
      z.object({
        ingredientId: z.string().min(1).max(80),
        name: z.string().min(1).max(200),
        quantity: z.number().min(0.01),
        unit: z.string().min(1).max(40),
        preparation: z.string().min(1).max(200).nullable().optional(),
        role: IngredientRoleSchema,
        scalingBehavior: IngredientScalingBehaviorSchema,
        scalingReferenceIngredientId: z.string().min(1).max(80).nullable().optional(),
      }),
    )
    .min(1),
  instructions: z
    .array(
      z.object({
        stepNumber: z.number().int().positive().max(40),
        text: z.string().min(1).max(800),
      }),
    )
    .min(1),
  prepTimeMinutes: z.number().int().nonnegative().max(24 * 60),
  cookTimeMinutes: z.number().int().nonnegative().max(24 * 60),
  supportedPrepModes: z
    .array(
      z.object({
        mode: PrepIntentSchema,
        advanceTasks: z.array(z.string().min(1).max(300)).optional(),
        finishTasks: z.array(z.string().min(1).max(300)).min(1),
        finishTimeMinutes: z.number().int().nonnegative().max(180),
        storageInstructions: z.string().min(1).max(600).nullable().optional(),
      }),
    )
    .min(1),
  storageInstructions: z.string().min(1).max(800).nullable().optional(),
  reheatingInstructions: z.string().min(1).max(800).nullable().optional(),
  mealComponents: z
    .array(
      z.object({
        componentId: z.string().min(1).max(80),
        name: z.string().min(1).max(160),
        type: MealComponentTypeSchema,
        required: z.boolean(),
        purpose: z.string().min(1).max(400),
        relationship: MealComponentRelationshipSchema,
      }),
    )
    .min(1),
  flavorProfile: z.object({
    cuisineFamily: z.string().min(1).max(80),
    regionalStyle: z.string().min(1).max(120).nullable().optional(),
    flavorFamilies: z.array(z.string().min(1).max(80)).min(1),
    primarySauce: z.string().min(1).max(120).nullable().optional(),
    cookingTechniques: z.array(z.string().min(1).max(80)).min(1),
    textureProfile: z.array(z.string().min(1).max(80)).optional(),
  }),
  experienceProfile: z.object({
    moistureLevel: MoistureLevelSchema,
    flavorIntensity: FlavorIntensitySchema,
    textureTags: z.array(z.string().min(1).max(80)).optional(),
    mealPrepQuality: MealPrepQualitySchema,
  }),
  nutrition: z.object({
    source: z.literal("llm_estimate"),
    total: GeminiNutritionMacrosSchema,
    perServing: GeminiNutritionMacrosSchema,
    confidence: z.enum(["low", "medium", "high"]).optional(),
    estimationNotes: z.string().min(1).max(600).optional(),
  }),
  optimization: z
    .object({
      applied: z.boolean(),
      changes: z
        .array(
          z.object({
            type: RecipeOptimizationChangeTypeSchema,
            from: z.string().min(1).max(200),
            to: z.string().min(1).max(200),
            reason: z.string().min(1).max(400),
          }),
        )
        .optional(),
    })
    .optional(),
});

export type GeminiResolvedRecipePayload = z.infer<typeof GeminiResolvedRecipePayloadSchema>;

export function geminiResolvedRecipeResponseJsonSchema(): Record<string, unknown> {
  return zodToGeminiJsonSchema(GeminiResolvedRecipePayloadSchema);
}
