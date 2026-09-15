import { z } from "zod";
import { CulinaryDiscoveryCandidateSchema, CulinaryDiscoverySourceSchema } from "./culinary-discovery.ts";
import { IngredientRoleSchema } from "./recipe.ts";
import { PrepIntentSchema } from "./weekly-strategy.ts";

/**
 * PLAN-008: Source-grounded recipe resolution contracts.
 * Culinary identity + structured cooking detail only — never authoritative nutrition.
 */

export const RECIPE_RESOLUTION_PROMPT_VERSION = "recipe-resolution-v1" as const;

/** Default bounded concurrency for unique-candidate weekly resolution. */
export const DEFAULT_RECIPE_RESOLUTION_CONCURRENCY = 2;

export const IngredientScalingBehaviorSchema = z.enum([
  "primary_scalable",
  "secondary_scalable",
  "ratio_bound",
  "fixed",
]);

export const MealComponentTypeSchema = z.enum([
  "main",
  "carb_side",
  "vegetable_side",
  "sauce",
  "condiment",
  "garnish",
  "other",
]);

export const MealComponentRelationshipSchema = z.enum([
  "intrinsic",
  "recommended_side",
  "optional",
]);

export const MoistureLevelSchema = z.enum(["dry", "moderate", "saucy"]);
export const FlavorIntensitySchema = z.enum(["mild", "medium", "bold"]);
export const MealPrepQualitySchema = z.enum(["poor", "good", "excellent"]);

/**
 * Culinary provenance retained from PLAN-005 discovery.
 * Distinct from PLAN-003 AI-original RecipeSource.
 */
export const ResolvedRecipeSourceSchema = CulinaryDiscoverySourceSchema.extend({
  url: CulinaryDiscoverySourceSchema.shape.url.nullable().optional(),
});

/**
 * How the culinary quantity was measured (PLAN-009).
 * Distinct from PLAN-003 RecipeIngredientCandidate measurementState (as_packaged).
 * Optional for backward compatibility with PLAN-008 payloads.
 */
export const CulinaryMeasurementStateSchema = z.enum([
  "raw",
  "cooked",
  "as_purchased",
  "prepared",
  "unknown",
]);

export const ResolvedRecipeIngredientSchema = z.object({
  ingredientId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  quantity: z.number().finite().positive(),
  unit: z.string().trim().min(1).max(40),
  preparation: z.string().trim().min(1).max(200).nullable().optional(),
  /**
   * Measurement state for the stated quantity (raw vs cooked, etc.).
   * Do not silently invent when absent — food resolution treats missing as unknown.
   */
  measurementState: CulinaryMeasurementStateSchema.optional(),
  role: IngredientRoleSchema,
  scalingBehavior: IngredientScalingBehaviorSchema,
  /** When scalingBehavior is ratio_bound, optionally name the anchor ingredient. */
  scalingReferenceIngredientId: z.string().trim().min(1).max(80).nullable().optional(),
});

export const RecipeInstructionSchema = z.object({
  stepNumber: z.number().int().positive().max(40),
  text: z.string().trim().min(1).max(800),
});

export const MealComponentSchema = z.object({
  componentId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  type: MealComponentTypeSchema,
  required: z.boolean(),
  purpose: z.string().trim().min(1).max(400),
  relationship: MealComponentRelationshipSchema,
});

export const FlavorProfileSchema = z.object({
  cuisineFamily: z.string().trim().min(1).max(80),
  regionalStyle: z.string().trim().min(1).max(120).nullable().optional(),
  flavorFamilies: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  primarySauce: z.string().trim().min(1).max(120).nullable().optional(),
  cookingTechniques: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  textureProfile: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
});

export const RecipeExperienceSchema = z.object({
  moistureLevel: MoistureLevelSchema,
  flavorIntensity: FlavorIntensitySchema,
  textureTags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  mealPrepQuality: MealPrepQualitySchema,
});

/**
 * How a supported prep intent works for this recipe.
 * Reuses weekly PrepIntent values (canonical PrepMode equivalents).
 */
export const RecipePrepModeSchema = z.object({
  mode: PrepIntentSchema,
  advanceTasks: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  finishTasks: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  finishTimeMinutes: z.number().int().nonnegative().max(180),
  storageInstructions: z.string().trim().min(1).max(600).nullable().optional(),
});

export const RecipeResolutionMetadataSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  promptVersion: z.string().trim().min(1).max(80),
  requestId: z.string().trim().min(1).max(120).optional(),
  durationMs: z.number().nonnegative().optional(),
  searchGrounded: z.boolean().optional(),
});

export const ResolvedRecipeSchema = z.object({
  recipeId: z.string().trim().min(1).max(80),
  candidateId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  source: ResolvedRecipeSourceSchema,
  description: z.string().trim().min(1).max(800),
  baseServings: z.number().finite().positive().max(24),
  ingredients: z.array(ResolvedRecipeIngredientSchema).min(1).max(60),
  instructions: z.array(RecipeInstructionSchema).min(1).max(40),
  prepTimeMinutes: z.number().int().nonnegative().max(24 * 60),
  cookTimeMinutes: z.number().int().nonnegative().max(24 * 60),
  supportedPrepModes: z.array(RecipePrepModeSchema).min(1).max(4),
  storageInstructions: z.string().trim().min(1).max(800).nullable().optional(),
  reheatingInstructions: z.string().trim().min(1).max(800).nullable().optional(),
  mealComponents: z.array(MealComponentSchema).min(1).max(12),
  flavorProfile: FlavorProfileSchema,
  experienceProfile: RecipeExperienceSchema,
  resolutionMetadata: RecipeResolutionMetadataSchema,
});

/**
 * Input for resolving one unique culinary candidate into a structured recipe.
 * Nutrition targets are intentionally omitted — taste and identity first.
 */
export const RecipeResolutionRequestSchema = z.object({
  candidate: CulinaryDiscoveryCandidateSchema,
  /** Optional slot context (does not change culinary identity). */
  preferredPrepIntents: z.array(PrepIntentSchema).max(4).optional(),
});

export const RecipeResolutionFailureSchema = z.object({
  candidateId: z.string().trim().min(1).max(80),
  candidateName: z.string().trim().min(1).max(160),
  failureReason: z.string().trim().min(1).max(600),
  code: z
    .enum([
      "INVALID_RESOLUTION_REQUEST",
      "RECIPE_SCHEMA_VALIDATION_FAILED",
      "CANDIDATE_IDENTITY_MISMATCH",
      "LLM_CONFIGURATION_ERROR",
      "LLM_PROVIDER_ERROR",
      "LLM_INVALID_STRUCTURED_OUTPUT",
      "RATE_LIMITED",
      "CANDIDATE_NOT_FOUND",
      "PARTIAL_WEEKLY_RESOLUTION_FAILURE",
    ])
    .optional(),
});

export const WeeklyRecipeResolutionResultSchema = z.object({
  recipesByCandidateId: z.record(z.string(), ResolvedRecipeSchema),
  uniqueCandidateIds: z.array(z.string().trim().min(1).max(80)).max(14),
  resolvedCount: z.number().int().nonnegative(),
  slotCount: z.number().int().nonnegative(),
  resolverCallCount: z.number().int().nonnegative(),
});

export const ResolveRecipesRequestSchema = z.object({
  candidates: z.array(CulinaryDiscoveryCandidateSchema).min(1).max(14),
  /** When set, only these IDs are resolved (must be subset of candidates). */
  uniqueCandidateIds: z.array(z.string().trim().min(1).max(80)).max(14).optional(),
  concurrency: z.number().int().positive().max(8).optional(),
});

export const ResolveRecipesResponseSchema = z.object({
  result: WeeklyRecipeResolutionResultSchema,
  failures: z.array(RecipeResolutionFailureSchema).max(14).optional(),
  meta: z
    .object({
      requestId: z.string().min(1),
      promptVersion: z.string().min(1),
      provider: z.string().min(1),
      model: z.string().min(1),
      durationMs: z.number().nonnegative().optional(),
      concurrency: z.number().int().positive().optional(),
      uniqueCandidateCount: z.number().int().nonnegative().optional(),
      resolverCallCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type IngredientScalingBehavior = z.infer<typeof IngredientScalingBehaviorSchema>;
export type MealComponentType = z.infer<typeof MealComponentTypeSchema>;
export type MealComponentRelationship = z.infer<typeof MealComponentRelationshipSchema>;
export type MoistureLevel = z.infer<typeof MoistureLevelSchema>;
export type FlavorIntensity = z.infer<typeof FlavorIntensitySchema>;
export type MealPrepQuality = z.infer<typeof MealPrepQualitySchema>;
export type CulinaryMeasurementState = z.infer<typeof CulinaryMeasurementStateSchema>;
export type ResolvedRecipeSource = z.infer<typeof ResolvedRecipeSourceSchema>;
export type ResolvedRecipeIngredient = z.infer<typeof ResolvedRecipeIngredientSchema>;
export type RecipeInstruction = z.infer<typeof RecipeInstructionSchema>;
export type MealComponent = z.infer<typeof MealComponentSchema>;
export type FlavorProfile = z.infer<typeof FlavorProfileSchema>;
export type RecipeExperience = z.infer<typeof RecipeExperienceSchema>;
export type RecipePrepMode = z.infer<typeof RecipePrepModeSchema>;
export type RecipeResolutionMetadata = z.infer<typeof RecipeResolutionMetadataSchema>;
export type ResolvedRecipe = z.infer<typeof ResolvedRecipeSchema>;
export type RecipeResolutionRequest = z.infer<typeof RecipeResolutionRequestSchema>;
export type RecipeResolutionFailure = z.infer<typeof RecipeResolutionFailureSchema>;
export type WeeklyRecipeResolutionResult = z.infer<typeof WeeklyRecipeResolutionResultSchema>;
export type ResolveRecipesRequest = z.infer<typeof ResolveRecipesRequestSchema>;
export type ResolveRecipesResponse = z.infer<typeof ResolveRecipesResponseSchema>;
