import { z } from "zod";
import { MealTypeSchema } from "./recipe";

/**
 * PLAN-005: Recipe discovery contracts.
 *
 * Nutrition fields on discovery candidates are source-provided metadata only.
 * They are NOT authoritative Fitness Autopilot nutrition and are not USDA verified.
 */

export const DEFAULT_RECIPE_DISCOVERY_MAX_RESULTS = 30;
export const MAX_RECIPE_DISCOVERY_MAX_RESULTS = 50;

const PreferenceTagSchema = z.string().trim().min(1).max(80);

export const RecipeDiscoveryRequestSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  mealType: MealTypeSchema.optional(),
  cuisines: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  proteins: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  allergies: z.array(PreferenceTagSchema).max(40).optional(),
  dietaryRestrictions: z.array(PreferenceTagSchema).max(40).optional(),
  dislikes: z.array(PreferenceTagSchema).max(40).optional(),
  highProteinPreferred: z.boolean().optional(),
  maxResults: z
    .number()
    .int()
    .positive()
    .max(MAX_RECIPE_DISCOVERY_MAX_RESULTS)
    .optional(),
});

export const DiscoveryConstraintReportSchema = z.object({
  appliedConstraints: z.array(z.string()),
  unsupportedConstraints: z.array(z.string()),
});

export const RecipeDiscoveryCandidateSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  externalId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  sourceName: z.string().trim().min(1).max(200).optional(),
  sourceUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  cuisineLabels: z.array(z.string()).default([]),
  mealTypeLabels: z.array(z.string()).default([]),
  dishTypeLabels: z.array(z.string()).default([]),
  ingredientLines: z.array(z.string()).default([]),
  servings: z.number().finite().positive().optional(),
  /** Source-provided only — not authoritative FA nutrition. */
  caloriesPerServing: z.number().finite().nonnegative().optional(),
  /** Source-provided only — not authoritative FA nutrition. */
  proteinGramsPerServing: z.number().finite().nonnegative().optional(),
  /** Source-provided only — not authoritative FA nutrition. */
  carbsGramsPerServing: z.number().finite().nonnegative().optional(),
  /** Source-provided only — not authoritative FA nutrition. */
  fatGramsPerServing: z.number().finite().nonnegative().optional(),
  dietLabels: z.array(z.string()).optional(),
  healthLabels: z.array(z.string()).optional(),
  providerMetadata: z
    .object({
      rawCuisineLabels: z.array(z.string()).optional(),
      rawMealTypeLabels: z.array(z.string()).optional(),
    })
    .optional(),
});

export const RecipeDiscoveryResultMetadataSchema = z.object({
  provider: z.string().trim().min(1),
  totalReturned: z.number().int().nonnegative(),
  externalRequestsMade: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative().optional(),
  appliedConstraints: z.array(z.string()).optional(),
  unsupportedConstraints: z.array(z.string()).optional(),
});

export const RecipeDiscoveryResultSchema = z.object({
  candidates: z.array(RecipeDiscoveryCandidateSchema),
  metadata: RecipeDiscoveryResultMetadataSchema,
});

/** Edge Function body for POST /recipe-discovery-search (PLAN-005). */
export const RecipeDiscoverySearchRequestSchema = RecipeDiscoveryRequestSchema;

export const RecipeDiscoverySearchResponseSchema = RecipeDiscoveryResultSchema;

export type RecipeDiscoveryRequest = z.infer<typeof RecipeDiscoveryRequestSchema>;
export type DiscoveryConstraintReport = z.infer<typeof DiscoveryConstraintReportSchema>;
export type RecipeDiscoveryCandidate = z.infer<typeof RecipeDiscoveryCandidateSchema>;
export type RecipeDiscoveryResultMetadata = z.infer<
  typeof RecipeDiscoveryResultMetadataSchema
>;
export type RecipeDiscoveryResult = z.infer<typeof RecipeDiscoveryResultSchema>;
export type RecipeDiscoverySearchRequest = z.infer<
  typeof RecipeDiscoverySearchRequestSchema
>;
export type RecipeDiscoverySearchResponse = z.infer<
  typeof RecipeDiscoverySearchResponseSchema
>;
