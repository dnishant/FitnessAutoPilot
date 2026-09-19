import { z } from "zod";
import type { VarietyLevel } from "./meal-preferences";

/**
 * Ingredient-economy planning contracts.
 *
 * Lightweight footprints guide weekly repertoire selection BEFORE detailed
 * recipe resolution. Exact grocery complexity is measured AFTER resolution.
 * PLAN-012 remains the deterministic accountant — it does not repair weeks.
 */

export const INGREDIENT_ECONOMY_POLICY_VERSION = "ingredient-economy-policy-v1" as const;
export const GROCERY_COMPLEXITY_POLICY_VERSION = "grocery-complexity-policy-v2" as const;

export const IngredientBurdenClassSchema = z.enum([
  "common_staple",
  "common_fresh",
  "reusable_weekly",
  "specialty",
  "high_waste_risk",
]);

export const LeftoverDispositionSchema = z.enum([
  "consume_this_week",
  "pantry_carryover",
  "fridge_carryover",
  "freezer_carryover",
  "high_waste_risk",
]);

export const IngredientConceptSchema = z.object({
  /** Normalized concept key used for planning reuse (e.g. "garlic", "onion"). */
  conceptKey: z.string().trim().min(1).max(80),
  /** Broader family when applicable (e.g. "onion" for red/yellow onion). */
  familyKey: z.string().trim().min(1).max(80).optional(),
  /** Human-readable label for prompts/diagnostics. */
  label: z.string().trim().min(1).max(120),
  burdenClass: IngredientBurdenClassSchema,
  leftoverDisposition: LeftoverDispositionSchema.optional(),
});

/**
 * Planning-only estimate of a meal's grocery footprint.
 * NOT authoritative grocery data — PLAN-012 owns exact demand after resolution.
 */
export const IngredientFootprintSchema = z.object({
  coreIngredients: z.array(IngredientConceptSchema).max(24).default([]),
  likelyProduce: z.array(IngredientConceptSchema).max(24).default([]),
  likelyProteins: z.array(IngredientConceptSchema).max(12).default([]),
  likelyStarches: z.array(IngredientConceptSchema).max(12).default([]),
  likelyFlavorIngredients: z.array(IngredientConceptSchema).max(24).default([]),
  specialtyIngredients: z.array(IngredientConceptSchema).max(16).default([]),
  /** Free-text note for culinary reuse opportunities (optional). */
  reuseNotes: z.string().trim().min(1).max(400).optional(),
});

export const GroceryComplexityBandSchema = z.enum(["within_limit", "elevated", "excessive"]);

export const GroceryComplexityMetricsSchema = z.object({
  policyVersion: z.literal(GROCERY_COMPLEXITY_POLICY_VERSION),
  uniqueCanonicalIngredients: z.number().int().nonnegative(),
  uniquePantryStaples: z.number().int().nonnegative(),
  uniqueFreshPerishables: z.number().int().nonnegative(),
  uniqueSpecialtyIngredients: z.number().int().nonnegative(),
  oneOffIngredients: z.number().int().nonnegative(),
  oneOffFreshPerishables: z.number().int().nonnegative(),
  oneOffSpecialtyIngredients: z.number().int().nonnegative(),
  /** Meals that contribute at least one shared (non-one-off) ingredient / unique ingredients. */
  ingredientReuseRatio: z.number().min(0).max(1),
  /** Average distinct recipes per reusable (non-staple) ingredient. */
  averageMealsPerReusableIngredient: z.number().nonnegative(),
  weightedComplexity: z.number().nonnegative(),
  band: GroceryComplexityBandSchema,
  uniqueMealConcepts: z.number().int().nonnegative().optional(),
  varietyLevel: z.enum(["simple", "balanced", "high"]).optional(),
});

export const GroceryComplexityLimitsSchema = z.object({
  maxUniqueCanonicalIngredients: z.number().int().positive(),
  maxUniqueFreshPerishables: z.number().int().positive(),
  maxUniqueSpecialtyIngredients: z.number().int().positive(),
  maxOneOffFreshPerishables: z.number().int().positive(),
  maxOneOffSpecialtyIngredients: z.number().int().positive(),
  maxWeightedComplexity: z.number().positive(),
  minIngredientReuseRatio: z.number().min(0).max(1),
});

export const GroceryComplexityWeightsSchema = z.object({
  commonStaple: z.number().nonnegative(),
  commonFresh: z.number().nonnegative(),
  reusableWeekly: z.number().nonnegative(),
  specialty: z.number().nonnegative(),
  highWasteRisk: z.number().nonnegative(),
  oneOffFreshMultiplier: z.number().positive(),
  oneOffSpecialtyMultiplier: z.number().positive(),
  reuseRewardPerSharedConcept: z.number().nonnegative(),
});

export type IngredientBurdenClass = z.infer<typeof IngredientBurdenClassSchema>;
export type LeftoverDisposition = z.infer<typeof LeftoverDispositionSchema>;
export type IngredientConcept = z.infer<typeof IngredientConceptSchema>;
export type IngredientFootprint = z.infer<typeof IngredientFootprintSchema>;
export type GroceryComplexityBand = z.infer<typeof GroceryComplexityBandSchema>;
export type GroceryComplexityMetrics = z.infer<typeof GroceryComplexityMetricsSchema>;
export type GroceryComplexityLimits = z.infer<typeof GroceryComplexityLimitsSchema>;
export type GroceryComplexityWeights = z.infer<typeof GroceryComplexityWeightsSchema>;

export type GroceryComplexityPolicy = {
  version: typeof GROCERY_COMPLEXITY_POLICY_VERSION;
  weights: GroceryComplexityWeights;
  limitsByVariety: Record<VarietyLevel, GroceryComplexityLimits>;
};

/**
 * Versioned grocery-complexity policy for V1 four-meal weeks.
 *
 * Calibrated so a normal 4-recipe meal-prep basket (roughly a weekly grocery trip)
 * passes Balanced, while pathological ~80–100 unique purchase weeks still fail.
 * Limits are intentionally looser than early v1 drafts that rejected realistic
 * four-meal resolved recipes.
 */
export const GROCERY_COMPLEXITY_POLICY: GroceryComplexityPolicy = {
  version: GROCERY_COMPLEXITY_POLICY_VERSION,
  weights: {
    commonStaple: 0.05,
    commonFresh: 0.55,
    reusableWeekly: 0.4,
    specialty: 2.0,
    highWasteRisk: 2.4,
    oneOffFreshMultiplier: 2.0,
    oneOffSpecialtyMultiplier: 3.0,
    reuseRewardPerSharedConcept: 0.15,
  },
  limitsByVariety: {
    simple: {
      maxUniqueCanonicalIngredients: 48,
      maxUniqueFreshPerishables: 18,
      maxUniqueSpecialtyIngredients: 5,
      maxOneOffFreshPerishables: 10,
      maxOneOffSpecialtyIngredients: 3,
      maxWeightedComplexity: 48,
      minIngredientReuseRatio: 0.3,
    },
    balanced: {
      maxUniqueCanonicalIngredients: 58,
      maxUniqueFreshPerishables: 24,
      maxUniqueSpecialtyIngredients: 8,
      maxOneOffFreshPerishables: 14,
      maxOneOffSpecialtyIngredients: 4,
      maxWeightedComplexity: 58,
      minIngredientReuseRatio: 0.22,
    },
    high: {
      maxUniqueCanonicalIngredients: 68,
      maxUniqueFreshPerishables: 28,
      maxUniqueSpecialtyIngredients: 10,
      maxOneOffFreshPerishables: 18,
      maxOneOffSpecialtyIngredients: 6,
      maxWeightedComplexity: 68,
      minIngredientReuseRatio: 0.15,
    },
  },
};

export function getGroceryComplexityLimits(varietyLevel: VarietyLevel): GroceryComplexityLimits {
  return GROCERY_COMPLEXITY_POLICY.limitsByVariety[varietyLevel];
}
