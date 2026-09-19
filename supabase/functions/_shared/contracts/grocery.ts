import { z } from "zod";
import { CulinaryMeasurementStateSchema } from "./recipe-resolution.ts";

/**
 * PLAN-012: Deterministic grocery aggregation contracts.
 *
 * GroceryList is DERIVED from a finalized personalized weekly plan + resolved
 * recipes. The UI must never invent quantities from meal names or LLMs.
 */

export const GROCERY_AGGREGATION_POLICY_VERSION = "grocery-aggregation-policy-v1" as const;

export const GroceryCategorySchema = z.enum([
  "produce",
  "meat_seafood",
  "dairy_eggs",
  "grains_bakery",
  "canned_packaged",
  "pantry_spices",
  "frozen",
  "other",
]);

export const GROCERY_CATEGORY_LABELS = {
  produce: "Produce",
  meat_seafood: "Meat & Seafood",
  dairy_eggs: "Dairy & Eggs",
  grains_bakery: "Grains & Bakery",
  canned_packaged: "Canned & Packaged",
  pantry_spices: "Pantry & Spices",
  frozen: "Frozen",
  other: "Other",
} as const satisfies Record<z.infer<typeof GroceryCategorySchema>, string>;

export const GroceryItemStatusSchema = z.enum(["needed", "have", "got"]);

export const GroceryConversionConfidenceSchema = z.enum(["high", "medium", "low", "none"]);

export const GroceryQuantityLineSchema = z.object({
  /** Exact required cooking quantity (authoritative). */
  requiredQuantity: z.number().finite().positive(),
  unit: z.string().trim().min(1).max(40),
  /** Practical display number — never mutates requiredQuantity. */
  displayQuantity: z.number().finite().positive(),
  displayUnit: z.string().trim().min(1).max(40),
  displayLabel: z.string().trim().min(1).max(80),
  conversionConfidence: GroceryConversionConfidenceSchema.optional(),
});

export const GroceryProvenanceEntrySchema = z.object({
  mealInstanceId: z.string().trim().min(1).max(120),
  mealName: z.string().trim().min(1).max(160).optional(),
  recipeId: z.string().trim().min(1).max(80).optional(),
  recipeName: z.string().trim().min(1).max(160).optional(),
  componentId: z.string().trim().min(1).max(80).optional(),
  quantity: z.number().finite().positive(),
  unit: z.string().trim().min(1).max(40),
});

export const GroceryItemSchema = z.object({
  id: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(200),
  canonicalFoodId: z.string().uuid().nullable().optional(),
  measurementState: CulinaryMeasurementStateSchema.optional(),
  /**
   * One or more quantity lines. Multiple lines appear when units are incompatible
   * and no trusted conversion exists (e.g. 100g + 2 cups).
   */
  quantities: z.array(GroceryQuantityLineSchema).min(1).max(8),
  /**
   * Convenience mirrors of the primary quantity line for simple UIs.
   * Always derived from quantities[0] — not a second source of truth.
   */
  quantity: z.number().finite().positive().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  /** Practical display string for the primary line (e.g. "~3 lb"). */
  displayQuantityLabel: z.string().trim().min(1).max(80).optional(),
  category: GroceryCategorySchema,
  status: GroceryItemStatusSchema.default("needed"),
  /** UI checkbox convenience — true when status is have|got. */
  checked: z.boolean().default(false),
  sourceMealInstanceIds: z.array(z.string().trim().min(1).max(120)).max(64).default([]),
  sourceRecipeIds: z.array(z.string().trim().min(1).max(80)).max(32).default([]),
  sourceRecipeNames: z.array(z.string().trim().min(1).max(160)).max(32).default([]),
  provenance: z.array(GroceryProvenanceEntrySchema).max(128).default([]),
});

export const GrocerySectionSchema = z.object({
  category: GroceryCategorySchema,
  items: z.array(GroceryItemSchema).max(200),
});

export const GroceryAggregationFailureCodeSchema = z.enum([
  "MISSING_RECIPE_INGREDIENTS",
  "MISSING_RECIPE_YIELD",
  "UNSUPPORTED_INGREDIENT_QUANTITY",
  "UNRESOLVED_GROCERY_IDENTITY",
  "UNIT_CONVERSION_UNAVAILABLE",
  "MISSING_FINALIZED_PLAN",
  "EMPTY_PLAN",
]);

export const GroceryAggregationIssueSchema = z.object({
  code: GroceryAggregationFailureCodeSchema,
  message: z.string().trim().min(1).max(600),
  mealInstanceId: z.string().trim().min(1).max(120).optional(),
  recipeId: z.string().trim().min(1).max(80).optional(),
  componentId: z.string().trim().min(1).max(80).optional(),
  ingredientName: z.string().trim().min(1).max(200).optional(),
  /** When true, the list may still be produced with this quantity preserved/excluded. */
  preservable: z.boolean(),
});

export const GroceryAggregationDiagnosticsSchema = z.object({
  policyVersion: z.literal(GROCERY_AGGREGATION_POLICY_VERSION),
  sourceIngredientRequirementCount: z.number().int().nonnegative(),
  aggregatedItemCount: z.number().int().nonnegative(),
  droppedRequirementCount: z.number().int().nonnegative(),
  duplicateRequirementCount: z.number().int().nonnegative(),
  excludedNonPurchasedCount: z.number().int().nonnegative(),
  incompatibleQuantityLineCount: z.number().int().nonnegative(),
  issues: z.array(GroceryAggregationIssueSchema).max(64).default([]),
});

export const GroceryListSchema = z.object({
  generatedPlanId: z.string().trim().min(1).max(120).optional(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  aggregationPolicyVersion: z
    .literal(GROCERY_AGGREGATION_POLICY_VERSION)
    .default(GROCERY_AGGREGATION_POLICY_VERSION),
  sections: z.array(GrocerySectionSchema).max(20),
  generatedAt: z.string().optional(),
  /** When false/undefined, UI should treat the list as unavailable. */
  available: z.boolean().optional(),
  progress: z
    .object({
      totalItems: z.number().int().nonnegative(),
      readyItems: z.number().int().nonnegative(),
    })
    .optional(),
  diagnostics: GroceryAggregationDiagnosticsSchema.optional(),
});

export type GroceryCategory = z.infer<typeof GroceryCategorySchema>;
export type GroceryItemStatus = z.infer<typeof GroceryItemStatusSchema>;
export type GroceryConversionConfidence = z.infer<typeof GroceryConversionConfidenceSchema>;
export type GroceryQuantityLine = z.infer<typeof GroceryQuantityLineSchema>;
export type GroceryProvenanceEntry = z.infer<typeof GroceryProvenanceEntrySchema>;
export type GroceryItem = z.infer<typeof GroceryItemSchema>;
export type GrocerySection = z.infer<typeof GrocerySectionSchema>;
export type GroceryAggregationFailureCode = z.infer<typeof GroceryAggregationFailureCodeSchema>;
export type GroceryAggregationIssue = z.infer<typeof GroceryAggregationIssueSchema>;
export type GroceryAggregationDiagnostics = z.infer<typeof GroceryAggregationDiagnosticsSchema>;
export type GroceryList = z.infer<typeof GroceryListSchema>;

export function groceryCategoryLabel(category: GroceryCategory): string {
  return GROCERY_CATEGORY_LABELS[category];
}

export function groceryItemIsReady(item: Pick<GroceryItem, "status" | "checked">): boolean {
  if (item.status === "have" || item.status === "got") return true;
  return item.checked === true;
}
