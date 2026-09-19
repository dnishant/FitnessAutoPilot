import type {
  CulinaryMeasurementState,
  GroceryAggregationIssue,
  GroceryConversionConfidence,
} from "@fitness-autopilot/contracts";

/**
 * One exact ingredient demand before canonical aggregation.
 * Every finalized recipe ingredient / atomic food maps to exactly one of these.
 */
export type IngredientRequirement = {
  requirementId: string;
  /** Preferred aggregation key when PLAN-009 resolved the food. */
  canonicalFoodId: string | null;
  /**
   * Stable fallback identity when no foodId exists.
   * Includes measurement state; excludes culinary role (roles must not split groceries).
   */
  identityKey: string;
  displayName: string;
  measurementState?: CulinaryMeasurementState;
  foodCategory?: string | null;
  quantity: number;
  unit: string;
  sourceRecipeId?: string;
  sourceRecipeName?: string;
  sourceMealInstanceId: string;
  /** All meal instances that contributed to this (already-aggregated) recipe demand. */
  sourceMealInstanceIds: string[];
  /** Per-meal contribution quantities for provenance (same length as sourceMealInstanceIds). */
  mealContributionQuantities?: number[];
  sourceMealName?: string;
  sourceMealNames?: string[];
  sourceComponentId?: string;
  /** Explicit policy exclusion (e.g. tap water) — counted in diagnostics, not groceries. */
  excludedAsNonPurchased?: boolean;
  conversionConfidence?: GroceryConversionConfidence;
};

export type RecipeDemandBucket = {
  /** Stable recipe / component recipe identity — never recipe.name alone. */
  demandKey: string;
  kind: "resolved_recipe" | "component_recipe";
  recipeId: string;
  recipeName: string;
  /** Sum of personalServings (authored servings) across meal instances. */
  totalPersonalServings: number;
  baseServings: number;
  mealInstanceIds: string[];
  mealNames: string[];
  /** personalServings contributed by each meal instance (same order as mealInstanceIds). */
  mealPersonalServings: number[];
  componentId?: string;
};

export type GroceryDerivationIssue = GroceryAggregationIssue;

export type GroceryReconciliation = {
  sourceIngredientRequirementCount: number;
  aggregatedItemCount: number;
  droppedRequirementCount: number;
  duplicateRequirementCount: number;
  excludedNonPurchasedCount: number;
  incompatibleQuantityLineCount: number;
};
