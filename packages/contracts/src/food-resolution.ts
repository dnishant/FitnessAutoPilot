import { z } from "zod";
import {
  CulinaryMeasurementStateSchema,
  MealComponentSchema,
  ResolvedRecipeIngredientSchema,
  ResolvedRecipeSchema,
} from "./recipe-resolution";

/**
 * PLAN-009: Canonical food resolution & deterministic nutrition contracts.
 * Semantic matching may use AI; nutrition arithmetic never does.
 */

export const FOOD_RESOLUTION_POLICY_VERSION = "food-resolution-v1" as const;
export const NUTRITION_CALCULATION_POLICY_VERSION = "nutrition-calculation-v1" as const;
export const QUANTITY_NORMALIZATION_POLICY_VERSION = "quantity-normalization-v1" as const;
export const FOOD_DISAMBIGUATION_PROMPT_VERSION = "food-disambiguation-v1" as const;

/** Default bounded concurrency for provider food lookups. */
export const DEFAULT_FOOD_RESOLUTION_CONCURRENCY = 4;

/** Alias schema for PLAN-009 culinary measurement state (defined in recipe-resolution). */
export { CulinaryMeasurementStateSchema };

export const FoodProviderIdSchema = z.enum(["usda"]);

export const ConfidenceLevelSchema = z.enum(["high", "medium", "low"]);

export const ResolutionMethodSchema = z.enum([
  "deterministic",
  "semantic_disambiguation",
  "manual",
  "builtin",
]);

export const NutrientsPer100gSchema = z.object({
  caloriesKcal: z.number().finite().nonnegative(),
  proteinGrams: z.number().finite().nonnegative(),
  carbohydrateGrams: z.number().finite().nonnegative(),
  fatGrams: z.number().finite().nonnegative(),
  /** Optional; null means unknown (not zero). */
  fiberGrams: z.number().finite().nonnegative().nullable().optional(),
});

/**
 * Provider-independent canonical food.
 * Distinct from catalog `Food` used by the gram-based planner seed recipes.
 */
export const CanonicalFoodSchema = z.object({
  foodId: z.string().uuid(),
  canonicalName: z.string().trim().min(1).max(240),
  source: z.object({
    provider: FoodProviderIdSchema,
    externalId: z.string().trim().min(1).max(80),
    dataType: z.string().trim().min(1).max(80).nullable().optional(),
  }),
  description: z.string().trim().min(1).max(400),
  nutrientsPer100g: NutrientsPer100gSchema,
  measures: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        amount: z.number().finite().positive(),
        unitName: z.string().trim().min(1).max(80),
        gramWeight: z.number().finite().positive(),
      }),
    )
    .max(40)
    .default([]),
  metadata: z
    .object({
      brandName: z.string().trim().min(1).max(160).nullable().optional(),
      foodCategory: z.string().trim().min(1).max(160).nullable().optional(),
    })
    .optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const FoodSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(200),
  dataTypes: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  pageSize: z.number().int().positive().max(50).optional(),
  requireGeneric: z.boolean().optional(),
});

export const FoodSearchResultSchema = z.object({
  externalId: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(400),
  dataType: z.string().trim().min(1).max(80).nullable().optional(),
  brandName: z.string().trim().min(1).max(160).nullable().optional(),
  foodCategory: z.string().trim().min(1).max(160).nullable().optional(),
  score: z.number().finite().optional(),
});

export const ExternalFoodRecordSchema = CanonicalFoodSchema.omit({
  foodId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  externalId: z.string().trim().min(1).max(80),
  provider: FoodProviderIdSchema,
});

export const FoodResolutionCandidateSchema = z.object({
  food: CanonicalFoodSchema.optional(),
  externalId: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(400),
  dataType: z.string().trim().min(1).max(80).nullable().optional(),
  brandName: z.string().trim().min(1).max(160).nullable().optional(),
  score: z.number().finite(),
  matchReason: z.string().trim().min(1).max(400),
});

export const FoodResolutionResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("resolved"),
    food: CanonicalFoodSchema,
    confidence: z.enum(["high", "medium"]),
    matchReason: z.string().trim().min(1).max(400),
    resolutionMethod: ResolutionMethodSchema,
  }),
  z.object({
    status: z.literal("ambiguous"),
    candidates: z.array(FoodResolutionCandidateSchema).min(1).max(12),
    reason: z.string().trim().min(1).max(400),
  }),
  z.object({
    status: z.literal("not_found"),
    reason: z.string().trim().min(1).max(400),
  }),
]);

export const QuantityNormalizationMethodSchema = z.enum([
  "direct_mass",
  "provider_measure",
  "density_mapping",
  "manual_mapping",
  "builtin_zero",
]);

export const QuantityNormalizationResultSchema = z.object({
  grams: z.number().finite().positive(),
  method: QuantityNormalizationMethodSchema,
  confidence: ConfidenceLevelSchema,
  detail: z.string().trim().min(1).max(400).optional(),
});

export const IngredientNutritionSchema = z.object({
  caloriesKcal: z.number().finite().nonnegative(),
  proteinGrams: z.number().finite().nonnegative(),
  carbohydrateGrams: z.number().finite().nonnegative(),
  fatGrams: z.number().finite().nonnegative(),
  fiberGrams: z.number().finite().nonnegative().optional(),
});

export const NutritionResolutionStatusSchema = z.enum(["complete", "partial", "blocked"]);

export const RecipeNutritionResolutionQualitySchema = z.object({
  status: NutritionResolutionStatusSchema,
  totalIngredientCount: z.number().int().nonnegative(),
  resolvedIngredientCount: z.number().int().nonnegative(),
  ambiguousIngredientCount: z.number().int().nonnegative(),
  unresolvedIngredientCount: z.number().int().nonnegative(),
  highConfidenceCount: z.number().int().nonnegative(),
  mediumConfidenceCount: z.number().int().nonnegative(),
  directMassConversionCount: z.number().int().nonnegative(),
  providerMeasureConversionCount: z.number().int().nonnegative(),
  lowConfidenceConversionCount: z.number().int().nonnegative(),
  pendingPortioningComponentCount: z.number().int().nonnegative().default(0),
});

export const IngredientNutritionBreakdownSchema = z.object({
  ingredientId: z.string().trim().min(1).max(80),
  ingredientName: z.string().trim().min(1).max(200),
  foodId: z.string().uuid().optional(),
  foodDescription: z.string().trim().min(1).max(400).optional(),
  grams: z.number().finite().positive().optional(),
  nutrition: IngredientNutritionSchema.optional(),
  status: z.enum([
    "resolved",
    "ambiguous",
    "not_found",
    "conversion_failed",
    "pending_portioning",
    "missing_nutrients",
  ]),
});

export const RecipeNutritionTotalsSchema = IngredientNutritionSchema;

export const RecipeNutritionSchema = z.object({
  total: RecipeNutritionTotalsSchema,
  perBaseServing: RecipeNutritionTotalsSchema,
  ingredientBreakdown: z.array(IngredientNutritionBreakdownSchema).max(80),
  resolutionQuality: RecipeNutritionResolutionQualitySchema,
});

export const QuantityStatusSchema = z.enum([
  "normalized",
  "pending_portioning",
  "conversion_failed",
  "skipped",
]);

export const ResolvedNutritionIngredientSchema = z.object({
  recipeIngredient: ResolvedRecipeIngredientSchema,
  foodResolution: FoodResolutionResultSchema,
  normalizedQuantity: QuantityNormalizationResultSchema.nullable().optional(),
  nutrition: IngredientNutritionSchema.nullable().optional(),
  quantityStatus: QuantityStatusSchema,
});

export const MealComponentNutritionSchema = z.object({
  mealComponent: MealComponentSchema,
  status: z.enum([
    "intrinsic_covered",
    "pending_portioning",
    "identity_resolved",
    "unresolved",
  ]),
  foodResolution: FoodResolutionResultSchema.optional(),
  note: z.string().trim().min(1).max(400).optional(),
});

export const IngredientFoodMappingSchema = z.object({
  mappingId: z.string().uuid(),
  resolutionKey: z.string().trim().min(1).max(240),
  normalizedIngredientName: z.string().trim().min(1).max(200),
  measurementState: CulinaryMeasurementStateSchema.optional(),
  foodId: z.string().uuid(),
  confidence: z.enum(["high", "medium"]),
  resolutionMethod: ResolutionMethodSchema,
  policyVersion: z.string().trim().min(1).max(80),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const FoodResolutionDiagnosticsSchema = z.object({
  totalIngredients: z.number().int().nonnegative(),
  uniqueResolutionKeys: z.number().int().nonnegative(),
  mappingCacheHits: z.number().int().nonnegative(),
  canonicalFoodCacheHits: z.number().int().nonnegative(),
  providerSearchCount: z.number().int().nonnegative(),
  providerDetailFetchCount: z.number().int().nonnegative(),
  semanticDisambiguationCount: z.number().int().nonnegative(),
  resolvedCount: z.number().int().nonnegative(),
  ambiguousCount: z.number().int().nonnegative(),
  notFoundCount: z.number().int().nonnegative(),
  builtinResolvedCount: z.number().int().nonnegative().default(0),
});

export const RecipeNutritionResultSchema = z.object({
  recipeId: z.string().trim().min(1).max(80),
  candidateId: z.string().trim().min(1).max(80),
  recipeName: z.string().trim().min(1).max(160),
  baseServings: z.number().finite().positive(),
  ingredients: z.array(ResolvedNutritionIngredientSchema).max(80),
  mealComponents: z.array(MealComponentNutritionSchema).max(12),
  nutrition: RecipeNutritionSchema.optional(),
  resolutionQuality: RecipeNutritionResolutionQualitySchema,
  policyVersions: z.object({
    foodResolution: z.literal(FOOD_RESOLUTION_POLICY_VERSION),
    nutritionCalculation: z.literal(NUTRITION_CALCULATION_POLICY_VERSION),
    quantityNormalization: z.literal(QUANTITY_NORMALIZATION_POLICY_VERSION),
  }),
});

export const WeeklyRecipeNutritionResultSchema = z.object({
  recipesByCandidateId: z.record(z.string(), RecipeNutritionResultSchema),
  uniqueCandidateIds: z.array(z.string().trim().min(1).max(80)).max(14),
  recipeCount: z.number().int().nonnegative(),
  slotCount: z.number().int().nonnegative(),
  diagnostics: FoodResolutionDiagnosticsSchema,
  completeCount: z.number().int().nonnegative(),
  partialCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
});

export const ResolveRecipeNutritionRequestSchema = z.object({
  recipes: z.array(ResolvedRecipeSchema).min(1).max(14),
  /** When set, only these candidate IDs are processed (must be subset). */
  uniqueCandidateIds: z.array(z.string().trim().min(1).max(80)).max(14).optional(),
  concurrency: z.number().int().positive().max(8).optional(),
  enableSemanticDisambiguation: z.boolean().optional().default(true),
});

export const ResolveRecipeNutritionResponseSchema = z.object({
  result: WeeklyRecipeNutritionResultSchema,
  meta: z
    .object({
      requestId: z.string().min(1),
      foodResolutionPolicy: z.string().min(1),
      nutritionCalculationPolicy: z.string().min(1),
      quantityNormalizationPolicy: z.string().min(1),
      provider: z.string().min(1),
      durationMs: z.number().nonnegative().optional(),
      concurrency: z.number().int().positive().optional(),
    })
    .optional(),
});

export type FoodProviderId = z.infer<typeof FoodProviderIdSchema>;
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;
export type ResolutionMethod = z.infer<typeof ResolutionMethodSchema>;
export type NutrientsPer100g = z.infer<typeof NutrientsPer100gSchema>;
export type CanonicalFood = z.infer<typeof CanonicalFoodSchema>;
export type FoodSearchQuery = z.infer<typeof FoodSearchQuerySchema>;
export type FoodSearchResult = z.infer<typeof FoodSearchResultSchema>;
export type ExternalFoodRecord = z.infer<typeof ExternalFoodRecordSchema>;
export type FoodResolutionCandidate = z.infer<typeof FoodResolutionCandidateSchema>;
export type FoodResolutionResult = z.infer<typeof FoodResolutionResultSchema>;
export type QuantityNormalizationMethod = z.infer<typeof QuantityNormalizationMethodSchema>;
export type QuantityNormalizationResult = z.infer<typeof QuantityNormalizationResultSchema>;
export type IngredientNutrition = z.infer<typeof IngredientNutritionSchema>;
export type NutritionResolutionStatus = z.infer<typeof NutritionResolutionStatusSchema>;
export type RecipeNutritionResolutionQuality = z.infer<
  typeof RecipeNutritionResolutionQualitySchema
>;
export type IngredientNutritionBreakdown = z.infer<typeof IngredientNutritionBreakdownSchema>;
export type RecipeNutrition = z.infer<typeof RecipeNutritionSchema>;
export type QuantityStatus = z.infer<typeof QuantityStatusSchema>;
export type ResolvedNutritionIngredient = z.infer<typeof ResolvedNutritionIngredientSchema>;
export type MealComponentNutrition = z.infer<typeof MealComponentNutritionSchema>;
export type IngredientFoodMapping = z.infer<typeof IngredientFoodMappingSchema>;
export type FoodResolutionDiagnostics = z.infer<typeof FoodResolutionDiagnosticsSchema>;
export type RecipeNutritionResult = z.infer<typeof RecipeNutritionResultSchema>;
export type WeeklyRecipeNutritionResult = z.infer<typeof WeeklyRecipeNutritionResultSchema>;
export type ResolveRecipeNutritionRequest = z.infer<typeof ResolveRecipeNutritionRequestSchema>;
export type ResolveRecipeNutritionResponse = z.infer<typeof ResolveRecipeNutritionResponseSchema>;
