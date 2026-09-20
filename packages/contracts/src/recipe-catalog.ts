import { z } from "zod";
import {
  CuisineValueSchema,
  ExperienceValueSchema,
} from "./meal-preferences";

/**
 * RECIPE-001: Versioned recipe catalog foundation.
 * Application-owned curated recipes — distinct from legacy public.recipes (Food-based).
 */

export const RECIPE_CATALOG_POLICY_VERSION = "recipe-catalog-v1" as const;

export const RecipeSectionSchema = z.enum(["breakfast", "meal", "snack"]);
export type RecipeSection = z.infer<typeof RecipeSectionSchema>;

export const RECIPE_SECTION_LABELS: Record<RecipeSection, string> = {
  breakfast: "Breakfast",
  meal: "Meals",
  snack: "Snacks",
};

export const RecipeVersionStatusSchema = z.enum([
  "draft",
  "validated",
  "published",
  "retired",
]);
export type RecipeVersionStatus = z.infer<typeof RecipeVersionStatusSchema>;

export const KitchenTestStatusSchema = z.enum([
  "not_tested",
  "passed",
  "failed",
]);
export type KitchenTestStatus = z.infer<typeof KitchenTestStatusSchema>;

export const MealSlotSuitabilityValueSchema = z.enum([
  "preferred",
  "compatible",
  "unsuitable",
]);
export type MealSlotSuitabilityValue = z.infer<
  typeof MealSlotSuitabilityValueSchema
>;

export const RecipeComponentKindSchema = z.enum([
  "main",
  "carbohydrate",
  "vegetable",
  "sauce",
  "topping",
  "other",
]);
export type RecipeComponentKind = z.infer<typeof RecipeComponentKindSchema>;

export const RecipeScalingMethodSchema = z.enum([
  "linear",
  "constrained",
  "unsupported",
]);
export type RecipeScalingMethod = z.infer<typeof RecipeScalingMethodSchema>;

export const RecipePrepStyleSchema = z.enum([
  "batch_cook",
  "fresh_finish",
  "assemble_later",
  "cook_fresh",
]);
export type RecipePrepStyle = z.infer<typeof RecipePrepStyleSchema>;

export const RecipeProvenanceTypeSchema = z.enum([
  "editor_authored",
  "licensed_source",
  "user_submitted",
  "social_import",
  "generated_draft",
]);
export type RecipeProvenanceType = z.infer<typeof RecipeProvenanceTypeSchema>;

export const RecipeCookingMethodSchema = z.enum([
  "stovetop",
  "oven",
  "assembly",
  "no_cook",
  "grill",
  "other",
]);
export type RecipeCookingMethod = z.infer<typeof RecipeCookingMethodSchema>;

export const RecipeFlavorProfileSchema = z.enum([
  "savory",
  "bright",
  "rich",
  "mild",
  "aromatic",
  "tangy",
]);
export type RecipeFlavorProfile = z.infer<typeof RecipeFlavorProfileSchema>;

export const RecipeAllergenSchema = z.enum([
  "egg",
  "dairy",
  "tree_nut",
  "peanut",
  "gluten",
  "soy",
  "shellfish",
  "fish",
  "sesame",
]);
export type RecipeAllergen = z.infer<typeof RecipeAllergenSchema>;

export const RecipeDietaryAttributeSchema = z.enum([
  "vegetarian",
  "vegan",
  "high_protein",
  "contains_meat",
  "contains_dairy",
  "contains_gluten",
]);
export type RecipeDietaryAttribute = z.infer<typeof RecipeDietaryAttributeSchema>;

/** Controlled recipe quantity units — mass / volume / count; no invented density. */
export const RecipeQuantityUnitSchema = z.enum([
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "tsp",
  "tbsp",
  "cup",
  "count",
]);
export type RecipeQuantityUnit = z.infer<typeof RecipeQuantityUnitSchema>;

const CanonicalKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "canonicalKey must be snake_case");

export const CatalogRecipeSchema = z.object({
  id: z.string().uuid(),
  canonicalKey: CanonicalKeySchema,
  section: RecipeSectionSchema,
  currentPublishedVersionId: z.string().uuid().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type CatalogRecipe = z.infer<typeof CatalogRecipeSchema>;

export const CatalogRecipeVersionSchema = z
  .object({
    id: z.string().uuid(),
    recipeId: z.string().uuid(),
    version: z.number().int().positive(),
    status: RecipeVersionStatusSchema,
    kitchenTestStatus: KitchenTestStatusSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000).optional(),
    referenceServings: z.number().positive(),
    activeMinutes: z.number().int().nonnegative(),
    passiveMinutes: z.number().int().nonnegative(),
    lunchSuitability: MealSlotSuitabilityValueSchema.optional(),
    dinnerSuitability: MealSlotSuitabilityValueSchema.optional(),
    createdAt: z.string().min(1),
    publishedAt: z.string().min(1).optional(),
    retiredAt: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "published" && !value.publishedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "published versions require publishedAt",
      });
    }
    if (value.status === "retired" && !value.retiredAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "retired versions require retiredAt",
      });
    }
  });
export type CatalogRecipeVersion = z.infer<typeof CatalogRecipeVersionSchema>;

export const CatalogRecipeComponentSchema = z.object({
  id: z.string().uuid(),
  recipeVersionId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  kind: RecipeComponentKindSchema,
  displayOrder: z.number().int().nonnegative(),
  adjustable: z.boolean(),
});
export type CatalogRecipeComponent = z.infer<typeof CatalogRecipeComponentSchema>;

export const CatalogRecipeIngredientSchema = z.object({
  id: z.string().uuid(),
  recipeVersionId: z.string().uuid(),
  componentId: z.string().uuid().optional(),
  canonicalIngredientId: z.string().uuid(),
  proteinProductId: z.string().uuid().optional(),
  quantity: z.number().positive(),
  unit: RecipeQuantityUnitSchema,
  preparation: z.string().trim().min(1).max(200).optional(),
  optional: z.boolean(),
  displayOrder: z.number().int().nonnegative(),
});
export type CatalogRecipeIngredient = z.infer<typeof CatalogRecipeIngredientSchema>;

export const CatalogRecipeStepSchema = z.object({
  id: z.string().uuid(),
  recipeVersionId: z.string().uuid(),
  componentId: z.string().uuid().optional(),
  order: z.number().int().positive(),
  title: z.string().trim().min(1).max(120).optional(),
  instruction: z.string().trim().min(1).max(2000),
  activeMinutes: z.number().int().nonnegative().optional(),
  passiveMinutes: z.number().int().nonnegative().optional(),
  equipment: z.array(z.string().trim().min(1).max(80)).default([]),
});
export type CatalogRecipeStep = z.infer<typeof CatalogRecipeStepSchema>;

export const CatalogRecipeStepIngredientUsageSchema = z.object({
  id: z.string().uuid(),
  recipeStepId: z.string().uuid(),
  recipeIngredientId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: RecipeQuantityUnitSchema,
  action: z.string().trim().min(1).max(120).optional(),
});
export type CatalogRecipeStepIngredientUsage = z.infer<
  typeof CatalogRecipeStepIngredientUsageSchema
>;

export const CatalogRecipeScalingProfileSchema = z
  .object({
    recipeVersionId: z.string().uuid(),
    method: RecipeScalingMethodSchema,
    minimumServings: z.number().positive(),
    maximumServings: z.number().positive(),
    servingIncrement: z.number().positive(),
    notes: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.minimumServings > value.maximumServings) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minimumServings cannot exceed maximumServings",
      });
    }
  });
export type CatalogRecipeScalingProfile = z.infer<
  typeof CatalogRecipeScalingProfileSchema
>;

export const CatalogRecipeStorageProfileSchema = z.object({
  recipeVersionId: z.string().uuid(),
  prepStyle: RecipePrepStyleSchema,
  refrigerationSupported: z.boolean(),
  freezingSupported: z.boolean(),
  storeComponentsSeparately: z.boolean(),
  guidanceSource: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().min(1).max(500).optional(),
});
export type CatalogRecipeStorageProfile = z.infer<
  typeof CatalogRecipeStorageProfileSchema
>;

export const CatalogRecipeProvenanceSchema = z.object({
  recipeVersionId: z.string().uuid(),
  type: RecipeProvenanceTypeSchema,
  sourceUrl: z.string().url().optional(),
  sourceCreator: z.string().trim().min(1).max(160).optional(),
  reviewedBy: z.string().trim().min(1).max(160).optional(),
  reviewedAt: z.string().min(1).optional(),
  kitchenTestedAt: z.string().min(1).optional(),
});
export type CatalogRecipeProvenance = z.infer<typeof CatalogRecipeProvenanceSchema>;

export const CatalogRecipeClassificationsSchema = z.object({
  recipeVersionId: z.string().uuid(),
  cuisines: z.array(CuisineValueSchema).default([]),
  flavorProfiles: z.array(RecipeFlavorProfileSchema).default([]),
  experiencePreferences: z.array(ExperienceValueSchema).default([]),
  cookingMethods: z.array(RecipeCookingMethodSchema).default([]),
  allergens: z.array(RecipeAllergenSchema).default([]),
  dietaryAttributes: z.array(RecipeDietaryAttributeSchema).default([]),
  requiredEquipment: z.array(z.string().trim().min(1).max(80)).default([]),
});
export type CatalogRecipeClassifications = z.infer<
  typeof CatalogRecipeClassificationsSchema
>;

export const RecipeCatalogListFiltersSchema = z.object({
  section: RecipeSectionSchema.optional(),
  proteinProductId: z.string().uuid().optional(),
  cuisine: CuisineValueSchema.optional(),
  status: RecipeVersionStatusSchema.optional(),
  search: z.string().trim().max(160).optional(),
  /** When true (default for consumers), only published current versions. */
  publishedOnly: z.boolean().optional().default(true),
  /** Internal verification surfaces may include non-published versions. */
  includeInternal: z.boolean().optional().default(false),
});
export type RecipeCatalogListFilters = z.infer<
  typeof RecipeCatalogListFiltersSchema
>;

export const RecipeCatalogListItemSchema = z.object({
  recipe: CatalogRecipeSchema,
  version: CatalogRecipeVersionSchema,
  primaryProteinProductId: z.string().uuid().optional(),
  primaryProteinDisplayName: z.string().optional(),
  cuisines: z.array(CuisineValueSchema),
  totalMinutes: z.number().int().nonnegative(),
});
export type RecipeCatalogListItem = z.infer<typeof RecipeCatalogListItemSchema>;

export const RecipeCatalogVersionDetailSchema = z.object({
  recipe: CatalogRecipeSchema,
  version: CatalogRecipeVersionSchema,
  components: z.array(CatalogRecipeComponentSchema),
  ingredients: z.array(CatalogRecipeIngredientSchema),
  steps: z.array(CatalogRecipeStepSchema),
  usages: z.array(CatalogRecipeStepIngredientUsageSchema),
  classifications: CatalogRecipeClassificationsSchema,
  scaling: CatalogRecipeScalingProfileSchema,
  storage: CatalogRecipeStorageProfileSchema,
  provenance: CatalogRecipeProvenanceSchema,
  structureValidated: z.boolean(),
  kitchenTested: z.boolean(),
});
export type RecipeCatalogVersionDetail = z.infer<
  typeof RecipeCatalogVersionDetailSchema
>;

export const RECIPE_VERSION_STATUS_LABELS: Record<RecipeVersionStatus, string> = {
  draft: "Draft",
  validated: "Validated structure",
  published: "Published",
  retired: "Retired",
};

export const KITCHEN_TEST_STATUS_LABELS: Record<KitchenTestStatus, string> = {
  not_tested: "Not kitchen tested",
  passed: "Kitchen tested — passed",
  failed: "Kitchen tested — failed",
};

export type RecipeCatalogFailureCode =
  | "INVALID_RECIPE_SECTION"
  | "DUPLICATE_RECIPE_KEY"
  | "DUPLICATE_RECIPE_VERSION"
  | "INVALID_VERSION_TRANSITION"
  | "IMMUTABLE_PUBLISHED_VERSION"
  | "MISSING_CANONICAL_INGREDIENT"
  | "INVALID_PROTEIN_INGREDIENT_PAIR"
  | "MISSING_RECIPE_COMPONENT"
  | "MISSING_RECIPE_STEP"
  | "MISSING_INGREDIENT_STEP_LINK"
  | "UNACCOUNTED_INGREDIENT"
  | "DUPLICATED_INGREDIENT_USAGE"
  | "INCOMPATIBLE_USAGE_UNIT"
  | "INVALID_REFERENCE_YIELD"
  | "INVALID_SCALING_PROFILE"
  | "MISSING_STORAGE_PROFILE"
  | "MISSING_PROVENANCE"
  | "INVALID_CURRENT_PUBLISHED_VERSION"
  | "RECIPE_NOT_FOUND"
  | "RECIPE_VERSION_NOT_FOUND"
  | "UNAUTHORIZED_CATALOG_MUTATION"
  | "INVALID_FILTERS"
  | "INVALID_CATALOG_STATE"
  | "MISSING_SCALING_PROFILE"
  | "INVALID_LIFECYCLE_STATE"
  | "FREE_TEXT_INGREDIENT_NOT_ALLOWED";
