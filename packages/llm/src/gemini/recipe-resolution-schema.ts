import { z } from "zod";
import {
  FlavorIntensitySchema,
  IngredientRoleSchema,
  IngredientScalingBehaviorSchema,
  MealComponentRelationshipSchema,
  MealComponentTypeSchema,
  MealPrepQualitySchema,
  MoistureLevelSchema,
} from "@fitness-autopilot/contracts";
import { PrepIntentSchema } from "@fitness-autopilot/contracts";
import { zodToGeminiJsonSchema } from "./json-schema";

/**
 * Model payload for PLAN-008. Omits server-stamped fields:
 * candidateId (forced from request), source provenance, resolutionMetadata.
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
});

export type GeminiResolvedRecipePayload = z.infer<typeof GeminiResolvedRecipePayloadSchema>;

export function geminiResolvedRecipeResponseJsonSchema(): Record<string, unknown> {
  return zodToGeminiJsonSchema(GeminiResolvedRecipePayloadSchema);
}
