import {
  CanonicalIngredientSchema,
  IngredientAliasSchema,
  IngredientSubstitutionSchema,
  ProteinProductSchema,
  RetailerAvailabilityEvidenceSchema,
  type CanonicalIngredient,
  type IngredientAlias,
  type IngredientSubstitution,
  type ProteinProduct,
  type RetailerAvailabilityEvidence,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import { normalizeIngredientAlias } from "./normalize";

export type CatalogValidationError = {
  code:
    | "invalid_ingredient"
    | "invalid_protein_product"
    | "invalid_alias"
    | "invalid_evidence"
    | "invalid_substitution"
    | "duplicate_canonical_key"
    | "duplicate_alias"
    | "orphan_protein_product"
    | "self_substitution";
  message: string;
  details?: string[];
};

export function validateCanonicalIngredient(
  input: unknown,
): Result<CanonicalIngredient, CatalogValidationError> {
  const parsed = CanonicalIngredientSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "invalid_ingredient",
      message: parsed.error.issues[0]?.message ?? "Invalid canonical ingredient",
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  return ok(parsed.data);
}

export function validateProteinProduct(
  input: unknown,
  knownIngredientIds?: ReadonlySet<string>,
): Result<ProteinProduct, CatalogValidationError> {
  const parsed = ProteinProductSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "invalid_protein_product",
      message: parsed.error.issues[0]?.message ?? "Invalid protein product",
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  if (knownIngredientIds && !knownIngredientIds.has(parsed.data.ingredientId)) {
    return err({
      code: "orphan_protein_product",
      message: `Protein product ${parsed.data.canonicalKey} references unknown ingredient`,
    });
  }
  return ok(parsed.data);
}

export function validateIngredientAlias(
  input: unknown,
): Result<IngredientAlias, CatalogValidationError> {
  const parsed = IngredientAliasSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "invalid_alias",
      message: parsed.error.issues[0]?.message ?? "Invalid ingredient alias",
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  const expected = normalizeIngredientAlias(parsed.data.displayAlias);
  if (parsed.data.normalizedAlias !== expected) {
    return err({
      code: "invalid_alias",
      message: `normalizedAlias must equal normalize(displayAlias); expected "${expected}"`,
    });
  }
  return ok(parsed.data);
}

export function validateRetailerEvidence(
  input: unknown,
): Result<RetailerAvailabilityEvidence, CatalogValidationError> {
  const parsed = RetailerAvailabilityEvidenceSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "invalid_evidence",
      message: parsed.error.issues[0]?.message ?? "Invalid retailer evidence",
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  return ok(parsed.data);
}

export function validateIngredientSubstitution(
  input: unknown,
): Result<IngredientSubstitution, CatalogValidationError> {
  const parsed = IngredientSubstitutionSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid substitution";
    return err({
      code: message.includes("itself") ? "self_substitution" : "invalid_substitution",
      message,
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  return ok(parsed.data);
}

export function assertUniqueCanonicalKeys(
  keys: readonly string[],
): Result<true, CatalogValidationError> {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const key of keys) {
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }
  if (duplicates.length > 0) {
    return err({
      code: "duplicate_canonical_key",
      message: "Duplicate canonical keys",
      details: [...new Set(duplicates)],
    });
  }
  return ok(true);
}

export function assertUniqueNormalizedAliases(
  aliases: readonly string[],
): Result<true, CatalogValidationError> {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const alias of aliases) {
    const normalized = normalizeIngredientAlias(alias);
    if (seen.has(normalized)) duplicates.push(normalized);
    seen.add(normalized);
  }
  if (duplicates.length > 0) {
    return err({
      code: "duplicate_alias",
      message: "Duplicate normalized aliases",
      details: [...new Set(duplicates)],
    });
  }
  return ok(true);
}

/** Nutrition is mapped only when both source type and source id are present. */
export function nutritionMappingStatus(ingredient: CanonicalIngredient): "mapped" | "unmapped" {
  return ingredient.nutritionSourceType && ingredient.nutritionSourceId
    ? "mapped"
    : "unmapped";
}

/** Availability classification never means live local inventory. */
export function availabilityImpliesLiveInventory(_class: string): false {
  return false;
}

/** Likely/unknown retailer confidence must not be presented as verified. */
export function isVerifiedConfidence(confidence: string): boolean {
  return confidence === "verified";
}
