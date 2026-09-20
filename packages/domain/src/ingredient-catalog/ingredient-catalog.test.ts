import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_DISCLAIMER,
  CanonicalIngredientSchema,
  type CanonicalIngredient,
} from "@fitness-autopilot/contracts";
import {
  assertUniqueCanonicalKeys,
  assertUniqueNormalizedAliases,
  availabilityImpliesLiveInventory,
  createProteinCatalogService,
  createSeedCatalogSnapshot,
  formatCatalogIntegrityReport,
  isVerifiedConfidence,
  normalizeIngredientAlias,
  nutritionMappingStatus,
  resolveIngredientAlias,
  SEED_INGREDIENT_IDS,
  SEED_PRODUCT_IDS,
  SEED_PROTEIN_PRODUCTS,
  validateCanonicalIngredient,
  validateCatalogIntegrity,
  validateIngredientAlias,
  validateIngredientSubstitution,
  validateProteinProduct,
  validateRetailerEvidence,
} from "./index";

const baseIngredient: CanonicalIngredient = {
  id: "11111111-1111-4111-8111-111111111111",
  canonicalKey: "test_chicken_breast",
  displayName: "Test chicken breast",
  category: "protein",
  availabilityClass: "widely_available",
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};

describe("CATALOG-001 domain validation", () => {
  it("1. accepts valid canonical ingredients", () => {
    const result = validateCanonicalIngredient(baseIngredient);
    expect(result.ok).toBe(true);
  });

  it("2. rejects duplicate canonical keys in a set", () => {
    const result = assertUniqueCanonicalKeys(["a", "b", "a"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("duplicate_canonical_key");
  });

  it("3. protein products require a valid ingredient reference", () => {
    const result = validateProteinProduct(
      {
        id: SEED_PRODUCT_IDS.chickenBreastBonelessSkinless,
        canonicalKey: "chicken_breast_boneless_skinless",
        ingredientId: "99999999-9999-4999-8999-999999999999",
        proteinFamily: "chicken",
        displayName: "Boneless Skinless Chicken Breast",
        form: "whole_muscle",
        typicalPurchaseUnit: "lb",
        availabilityClass: "widely_available",
        active: true,
        createdAt: "2026-09-19T00:00:00.000Z",
        updatedAt: "2026-09-19T00:00:00.000Z",
      },
      new Set([baseIngredient.id]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("orphan_protein_product");
  });

  it("4. chicken breast, thighs, and wings remain distinct products", () => {
    const keys = SEED_PROTEIN_PRODUCTS.filter((p) =>
      [
        "chicken_breast_boneless_skinless",
        "chicken_thigh_boneless_skinless",
        "chicken_thigh_bone_in_skin_on",
        "chicken_wings",
        "ground_chicken",
      ].includes(p.canonicalKey),
    ).map((p) => p.canonicalKey);
    expect(new Set(keys).size).toBe(5);
  });

  it("5. alias normalization handles casing and surrounding whitespace", () => {
    expect(normalizeIngredientAlias("  Rib Eye  ")).toBe("rib eye");
  });

  it("6. duplicate normalized aliases are rejected", () => {
    const result = assertUniqueNormalizedAliases(["Ribeye", " ribeye "]);
    expect(result.ok).toBe(false);
  });

  it("7. exact alias resolution returns the ribeye ingredient", () => {
    const store = createSeedCatalogSnapshot();
    const ribeye = resolveIngredientAlias(store, "rib eye");
    const ribeye2 = resolveIngredientAlias(store, "RIBEYE");
    expect(ribeye.kind).toBe("resolved");
    expect(ribeye2.kind).toBe("resolved");
    if (ribeye.kind === "resolved" && ribeye2.kind === "resolved") {
      expect(ribeye.ingredientId).toBe(SEED_INGREDIENT_IDS.ribeyeSteak);
      expect(ribeye2.ingredientId).toBe(SEED_INGREDIENT_IDS.ribeyeSteak);
    }
  });

  it("8. unknown aliases return typed not-found", () => {
    const result = resolveIngredientAlias(createSeedCatalogSnapshot(), "purple unicorn steak");
    expect(result).toEqual({ kind: "not_found", alias: "purple unicorn steak" });
  });

  it("9. a substitution cannot reference the same ingredient on both sides", () => {
    const result = validateIngredientSubstitution({
      id: "55555555-5555-4555-8555-555555555555",
      sourceIngredientId: SEED_INGREDIENT_IDS.codFillet,
      substituteIngredientId: SEED_INGREDIENT_IDS.codFillet,
      compatibility: "equivalent",
      approved: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("self_substitution");
  });

  it("10. substitutions remain directional", () => {
    const service = createProteinCatalogService();
    const fromTilapia = createSeedCatalogSnapshot().substitutions.filter(
      (row) =>
        row.approved && row.sourceIngredientId === SEED_INGREDIENT_IDS.tilapiaFillet,
    );
    const reverse = createSeedCatalogSnapshot().substitutions.filter(
      (row) =>
        row.approved && row.sourceIngredientId === SEED_INGREDIENT_IDS.codFillet,
    );
    expect(fromTilapia).toHaveLength(1);
    expect(reverse).toHaveLength(0);
    expect(service.listProteinProducts).toBeTypeOf("function");
  });

  it("11. unverified nutrition mappings are not represented as verified", () => {
    const unmapped = nutritionMappingStatus(baseIngredient);
    expect(unmapped).toBe("unmapped");
    const mapped = nutritionMappingStatus({
      ...baseIngredient,
      nutritionSourceType: "usda_fdc",
      nutritionSourceId: "171477",
    });
    expect(mapped).toBe("mapped");
    expect(
      CanonicalIngredientSchema.safeParse({
        ...baseIngredient,
        nutritionSourceType: "usda_fdc",
      }).success,
    ).toBe(false);
  });

  it("12. all seeded records pass domain validation and integrity", () => {
    const report = validateCatalogIntegrity();
    expect(report.ok).toBe(true);
    expect(report.structuralIntegrityFailures).toBe(0);
  });
});

describe("CATALOG-001 availability", () => {
  it("13. retailer evidence must have exactly one target", () => {
    const both = validateRetailerEvidence({
      id: "44444444-4444-4444-8444-444444444401",
      ingredientId: SEED_INGREDIENT_IDS.ribeyeSteak,
      proteinProductId: SEED_PRODUCT_IDS.ribeyeSteak,
      retailer: "costco",
      confidence: "likely",
    });
    const neither = validateRetailerEvidence({
      id: "44444444-4444-4444-8444-444444444402",
      retailer: "costco",
      confidence: "likely",
    });
    expect(both.ok).toBe(false);
    expect(neither.ok).toBe(false);
  });

  it("14-15. verified evidence requires source URL and verifiedAt", () => {
    const missingSource = validateRetailerEvidence({
      id: "44444444-4444-4444-8444-444444444403",
      proteinProductId: SEED_PRODUCT_IDS.ribeyeSteak,
      retailer: "walmart",
      confidence: "verified",
      verifiedAt: "2026-03-01T12:00:00.000Z",
    });
    const missingTs = validateRetailerEvidence({
      id: "44444444-4444-4444-8444-444444444404",
      proteinProductId: SEED_PRODUCT_IDS.ribeyeSteak,
      retailer: "walmart",
      confidence: "verified",
      sourceUrl: "https://www.example.com/product/ribeye",
    });
    expect(missingSource.ok).toBe(false);
    expect(missingTs.ok).toBe(false);
  });

  it("16. likely evidence is not exposed as verified", () => {
    expect(isVerifiedConfidence("likely")).toBe(false);
    expect(isVerifiedConfidence("verified")).toBe(true);
  });

  it("17. availability classification does not imply live inventory", () => {
    expect(availabilityImpliesLiveInventory("widely_available")).toBe(false);
    expect(AVAILABILITY_DISCLAIMER).toContain("not live local inventory");
  });

  it("18. retailer values are constrained", () => {
    const result = validateRetailerEvidence({
      id: "44444444-4444-4444-8444-444444444405",
      proteinProductId: SEED_PRODUCT_IDS.ribeyeSteak,
      retailer: "kroger",
      confidence: "likely",
    });
    expect(result.ok).toBe(false);
  });

  it("19. evidence dates serialize as ISO datetimes", () => {
    const seed = createSeedCatalogSnapshot().retailerEvidence.find(
      (row) => row.confidence === "verified",
    );
    expect(seed?.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("20. seeded availability evidence passes validation", () => {
    for (const evidence of createSeedCatalogSnapshot().retailerEvidence) {
      expect(validateRetailerEvidence(evidence).ok).toBe(true);
    }
  });
});

describe("CATALOG-001 service queries", () => {
  const service = createProteinCatalogService();

  it("30. proteins can be filtered by family", () => {
    const result = service.listProteinProducts({ proteinFamily: "beef" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThanOrEqual(10);
    expect(result.value.every((row) => row.proteinFamily === "beef")).toBe(true);
    expect(result.value.map((row) => row.canonicalKey)).toEqual(
      expect.arrayContaining([
        "beef_ribeye_steak",
        "ground_beef_80_20",
        "beef_top_sirloin_steak",
        "beef_flank_steak",
        "beef_chuck_roast",
      ]),
    );
  });

  it("31. proteins can be filtered by availability class", () => {
    const result = service.listProteinProducts({ availabilityClass: "specialty" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.some((row) => row.canonicalKey === "lobster_tail")).toBe(true);
  });

  it("32. inactive products are excluded by default", () => {
    const snapshot = createSeedCatalogSnapshot();
    snapshot.proteinProducts[0]!.active = false;
    const local = createProteinCatalogService(snapshot);
    const result = local.listProteinProducts({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.find((row) => row.id === snapshot.proteinProducts[0]!.id)).toBeUndefined();
  });

  it("33. search returns expected products", () => {
    const result = service.listProteinProducts({ search: "ribeye" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]!.canonicalKey).toBe("beef_ribeye_steak");
  });

  it("34. invalid filters return typed errors", () => {
    const result = service.listProteinProducts({
      proteinFamily: "not-a-family" as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_filters");
  });

  it("35. product details include aliases and retailer evidence", () => {
    const result = service.getProteinProduct("beef_ribeye_steak");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.product.cut).toBe("ribeye");
    expect(result.value.aliases.some((a) => a.normalizedAlias === "rib eye")).toBe(true);
    expect(result.value.retailerEvidence.length).toBeGreaterThan(0);
    expect(result.value.nutritionMappingStatus).toBe("unmapped");
    expect(result.value.availabilityDisclaimer).toBe(AVAILABILITY_DISCLAIMER);
  });

  it("36. read operations do not expose mutation capabilities", () => {
    const keys = Object.keys(service).sort();
    expect(keys).toEqual(
      [
        "getProteinProduct",
        "listFamiliesPresent",
        "listProteinProducts",
        "listRetailerEvidenceForProtein",
        "resolveIngredientAlias",
      ].sort(),
    );
  });

  it("ground chicken remains distinct and without invented fatDescriptor", () => {
    const poultry = service.listProteinProducts({ proteinFamily: "chicken" });
    expect(poultry.ok).toBe(true);
    if (!poultry.ok) return;
    const ground = poultry.value.find((row) => row.canonicalKey === "ground_chicken");
    const breast = poultry.value.find(
      (row) => row.canonicalKey === "chicken_breast_boneless_skinless",
    );
    expect(ground).toBeDefined();
    expect(breast).toBeDefined();
    expect(ground!.id).not.toBe(breast!.id);
    expect(ground!.fatDescriptor).toBeUndefined();
  });

  it("generic ground beef and steak aliases require refinement", () => {
    const groundBeef = service.resolveIngredientAlias("ground beef");
    const steak = service.resolveIngredientAlias("steak");
    expect(groundBeef.kind).toBe("ambiguous");
    expect(steak.kind).toBe("ambiguous");
    if (groundBeef.kind === "ambiguous") {
      expect(groundBeef.candidateIngredientIds).toHaveLength(3);
      expect(groundBeef.reason).toBe("refinement_required");
    }
  });

  it("exact protein lookup does not substitute beef cuts", () => {
    const ribeye = service.getProteinProduct("beef_ribeye_steak");
    const chuck = service.getProteinProduct("beef_chuck_roast");
    expect(ribeye.ok && chuck.ok).toBe(true);
    if (!ribeye.ok || !chuck.ok) return;
    expect(ribeye.value.product.ingredientId).not.toBe(chuck.value.product.ingredientId);
  });
});

describe("CATALOG-001 integrity formatting", () => {
  it("prints the required integrity counters", () => {
    const text = formatCatalogIntegrityReport(validateCatalogIntegrity());
    expect(text).toContain("duplicate canonical ingredient keys = 0");
    expect(text).toContain("structural integrity failures = 0");
    expect(text).toContain("unmapped nutrition records =");
  });
});

describe("alias validation", () => {
  it("rejects mismatched normalizedAlias", () => {
    const result = validateIngredientAlias({
      id: "33333333-3333-4333-8333-333333333333",
      ingredientId: SEED_INGREDIENT_IDS.ribeyeSteak,
      displayAlias: "Ribeye",
      normalizedAlias: "wrong",
    });
    expect(result.ok).toBe(false);
  });
});
