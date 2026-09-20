import { z } from "zod";

/**
 * CATALOG-001: Canonical ingredient and purchasable protein-product foundation.
 * Application-owned catalog data — not user-owned preferences.
 */

export const INGREDIENT_CATALOG_POLICY_VERSION = "ingredient-catalog-v1" as const;

export const AVAILABILITY_DISCLAIMER =
  "Availability reflects typical retailer coverage, not live local inventory." as const;

export const AvailabilityClassSchema = z.enum([
  "widely_available",
  "commonly_available",
  "retailer_dependent",
  "specialty",
  "seasonal",
]);
export type AvailabilityClass = z.infer<typeof AvailabilityClassSchema>;

export const IngredientCategorySchema = z.enum([
  "protein",
  "produce",
  "grain",
  "dairy",
  "legume",
  "spice",
  "condiment",
  "oil",
  "other",
]);
export type IngredientCategory = z.infer<typeof IngredientCategorySchema>;

export const NutritionSourceTypeSchema = z.enum([
  "usda_fdc",
  "manufacturer",
  "verified_manual",
]);
export type NutritionSourceType = z.infer<typeof NutritionSourceTypeSchema>;

export const ProteinFamilySchema = z.enum([
  "chicken",
  "turkey",
  "egg",
  "beef",
  "fish",
  "shellfish",
  "paneer",
  "tofu",
  "legume",
  "other",
]);
export type ProteinFamily = z.infer<typeof ProteinFamilySchema>;

export const BoneStateSchema = z.enum(["bone_in", "boneless", "not_applicable"]);
export type BoneState = z.infer<typeof BoneStateSchema>;

export const SkinStateSchema = z.enum([
  "skin_on",
  "skinless",
  "variable",
  "not_applicable",
]);
export type SkinState = z.infer<typeof SkinStateSchema>;

export const TypicalPurchaseUnitSchema = z.enum(["lb", "oz", "count", "package"]);
export type TypicalPurchaseUnit = z.infer<typeof TypicalPurchaseUnitSchema>;

export const RetailerSchema = z.enum([
  "costco",
  "walmart",
  "whole_foods",
  "trader_joes",
]);
export type Retailer = z.infer<typeof RetailerSchema>;

export const AvailabilityConfidenceSchema = z.enum([
  "verified",
  "likely",
  "unknown",
]);
export type AvailabilityConfidence = z.infer<typeof AvailabilityConfidenceSchema>;

export const SubstitutionCompatibilitySchema = z.enum([
  "equivalent",
  "recipe_dependent",
  "limited",
]);
export type SubstitutionCompatibility = z.infer<typeof SubstitutionCompatibilitySchema>;

const CanonicalKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "canonicalKey must be snake_case");

export const CanonicalIngredientSchema = z
  .object({
    id: z.string().uuid(),
    canonicalKey: CanonicalKeySchema,
    displayName: z.string().trim().min(1).max(160),
    category: IngredientCategorySchema,
    defaultUnit: z.string().trim().min(1).max(40).optional(),
    availabilityClass: AvailabilityClassSchema,
    nutritionSourceType: NutritionSourceTypeSchema.optional(),
    nutritionSourceId: z.string().trim().min(1).max(80).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    const hasType = value.nutritionSourceType !== undefined;
    const hasId = value.nutritionSourceId !== undefined;
    if (hasType !== hasId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "nutritionSourceType and nutritionSourceId must both be set or both omitted (unmapped)",
      });
    }
  });
export type CanonicalIngredient = z.infer<typeof CanonicalIngredientSchema>;

export const IngredientAliasSchema = z.object({
  id: z.string().uuid(),
  ingredientId: z.string().uuid(),
  normalizedAlias: z.string().trim().min(1).max(160),
  displayAlias: z.string().trim().min(1).max(160),
});
export type IngredientAlias = z.infer<typeof IngredientAliasSchema>;

export const ProteinProductSchema = z.object({
  id: z.string().uuid(),
  canonicalKey: CanonicalKeySchema,
  ingredientId: z.string().uuid(),
  proteinFamily: ProteinFamilySchema,
  displayName: z.string().trim().min(1).max(160),
  species: z.string().trim().min(1).max(80).optional(),
  cut: z.string().trim().min(1).max(80).optional(),
  form: z.string().trim().min(1).max(120),
  boneState: BoneStateSchema.optional(),
  skinState: SkinStateSchema.optional(),
  fatDescriptor: z.string().trim().min(1).max(40).optional(),
  typicalPurchaseUnit: TypicalPurchaseUnitSchema,
  availabilityClass: AvailabilityClassSchema,
  active: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type ProteinProduct = z.infer<typeof ProteinProductSchema>;

export const RetailerAvailabilityEvidenceSchema = z
  .object({
    id: z.string().uuid(),
    ingredientId: z.string().uuid().optional(),
    proteinProductId: z.string().uuid().optional(),
    retailer: RetailerSchema,
    confidence: AvailabilityConfidenceSchema,
    region: z.string().trim().min(1).max(80).optional(),
    productForm: z.string().trim().min(1).max(120).optional(),
    sourceUrl: z.string().url().optional(),
    verifiedAt: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    const hasIngredient = value.ingredientId !== undefined;
    const hasProtein = value.proteinProductId !== undefined;
    if (hasIngredient === hasProtein) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evidence must target exactly one of ingredientId or proteinProductId",
      });
    }
    if (value.confidence === "verified") {
      if (!value.sourceUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "verified evidence requires a product-specific sourceUrl",
        });
      }
      if (!value.verifiedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "verified evidence requires verifiedAt",
        });
      }
    }
  });
export type RetailerAvailabilityEvidence = z.infer<
  typeof RetailerAvailabilityEvidenceSchema
>;

export const IngredientSubstitutionSchema = z
  .object({
    id: z.string().uuid(),
    sourceIngredientId: z.string().uuid(),
    substituteIngredientId: z.string().uuid(),
    compatibility: SubstitutionCompatibilitySchema,
    notes: z.string().trim().min(1).max(500).optional(),
    approved: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.sourceIngredientId === value.substituteIngredientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An ingredient cannot substitute itself",
      });
    }
  });
export type IngredientSubstitution = z.infer<typeof IngredientSubstitutionSchema>;

export const ProteinProductListFiltersSchema = z.object({
  proteinFamily: ProteinFamilySchema.optional(),
  availabilityClass: AvailabilityClassSchema.optional(),
  activeOnly: z.boolean().optional().default(true),
  search: z.string().trim().max(160).optional(),
});
export type ProteinProductListFilters = z.infer<typeof ProteinProductListFiltersSchema>;

export const NutritionMappingStatusSchema = z.enum(["mapped", "unmapped"]);
export type NutritionMappingStatus = z.infer<typeof NutritionMappingStatusSchema>;

export const ProteinProductDetailSchema = z.object({
  product: ProteinProductSchema,
  ingredient: CanonicalIngredientSchema,
  nutritionMappingStatus: NutritionMappingStatusSchema,
  aliases: z.array(IngredientAliasSchema),
  retailerEvidence: z.array(RetailerAvailabilityEvidenceSchema),
  approvedSubstitutions: z.array(IngredientSubstitutionSchema),
  availabilityDisclaimer: z.literal(AVAILABILITY_DISCLAIMER),
});
export type ProteinProductDetail = z.infer<typeof ProteinProductDetailSchema>;

export type AliasResolveSuccess = {
  kind: "resolved";
  ingredientId: string;
  canonicalKey: string;
  displayName: string;
};

export type AliasResolveNotFound = {
  kind: "not_found";
  alias: string;
};

export type AliasResolveAmbiguous = {
  kind: "ambiguous";
  alias: string;
  candidateIngredientIds: string[];
  reason: "duplicate_alias" | "refinement_required";
};

export type AliasResolveResult =
  | AliasResolveSuccess
  | AliasResolveNotFound
  | AliasResolveAmbiguous;

export const PROTEIN_FAMILY_LABELS: Record<ProteinFamily, string> = {
  chicken: "Poultry (chicken)",
  turkey: "Poultry (turkey)",
  egg: "Eggs",
  beef: "Beef",
  fish: "Fish",
  shellfish: "Shellfish",
  paneer: "Paneer",
  tofu: "Tofu",
  legume: "Legumes",
  other: "Other",
};

export const AVAILABILITY_CLASS_LABELS: Record<AvailabilityClass, string> = {
  widely_available: "Widely available",
  commonly_available: "Commonly available",
  retailer_dependent: "Retailer dependent",
  specialty: "Specialty",
  seasonal: "Seasonal",
};

export const RETAILER_LABELS: Record<Retailer, string> = {
  costco: "Costco",
  walmart: "Walmart",
  whole_foods: "Whole Foods",
  trader_joes: "Trader Joe's",
};

export const CONFIDENCE_LABELS: Record<AvailabilityConfidence, string> = {
  verified: "Verified coverage",
  likely: "Likely coverage",
  unknown: "Unknown coverage",
};
