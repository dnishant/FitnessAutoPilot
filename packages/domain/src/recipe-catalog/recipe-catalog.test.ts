import { describe, expect, it } from "vitest";
import {
  SEED_INGREDIENT_IDS,
  SEED_PRODUCT_IDS,
} from "../ingredient-catalog/seed";
import {
  assertCanMutateVersion,
  assertValidStatusTransition,
  canTransitionRecipeVersionStatus,
  createInMemoryRecipeCatalogStore,
  createRecipeCatalogService,
  createRecipeVersionFromExisting,
  createSeedRecipeCatalogSnapshot,
  formatRecipeCatalogIntegrityReport,
  kitchenTestFromPublication,
  listRecipes,
  parseRecipeSection,
  resolveRecipeIngredientUsage,
  retireRecipeVersion,
  SEED_RECIPE_IDS,
  SEED_VERSION_IDS,
  validateRecipeCatalogIntegrity,
  validateRecipeVersionGraph,
  type RecipeVersionGraph,
} from "./index";

describe("RECIPE-001 recipe catalog domain", () => {
  const store = createInMemoryRecipeCatalogStore();
  const service = createRecipeCatalogService(store);

  it("1-2. recipe section accepts breakfast/meal/snack and rejects invalid", () => {
    expect(parseRecipeSection("breakfast").ok).toBe(true);
    expect(parseRecipeSection("meal").ok).toBe(true);
    expect(parseRecipeSection("snack").ok).toBe(true);
    const bad = parseRecipeSection("lunch");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("INVALID_RECIPE_SECTION");
  });

  it("3-6. canonical keys unique; version numbers unique per recipe; positive", () => {
    const snapshot = createSeedRecipeCatalogSnapshot();
    const keys = snapshot.graphs.map((g) => g.recipe.canonicalKey);
    expect(new Set(keys).size).toBe(keys.length);
    const pairs = snapshot.graphs.map((g) => `${g.version.recipeId}:${g.version.version}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(snapshot.graphs.every((g) => g.version.version >= 1)).toBe(true);
    // Different recipes may each have version 1
    expect(snapshot.graphs.filter((g) => g.version.version === 1).length).toBe(3);
  });

  it("7-9. published immutable; revision creates new version; retire preserves identity", () => {
    const mutate = assertCanMutateVersion("published");
    expect(mutate.ok).toBe(false);
    if (!mutate.ok) expect(mutate.error.code).toBe("IMMUTABLE_PUBLISHED_VERSION");

    const revised = createRecipeVersionFromExisting(
      store,
      SEED_VERSION_IDS.eggAvocadoToastV1,
    );
    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    expect(revised.value.newVersionId).not.toBe(SEED_VERSION_IDS.eggAvocadoToastV1);
    const newGraph = revised.value.store.recipeSnapshot.graphs.find(
      (g) => g.version.id === revised.value.newVersionId,
    );
    expect(newGraph?.version.version).toBe(2);
    expect(newGraph?.version.status).toBe("draft");

    const retired = retireRecipeVersion(
      revised.value.store,
      revised.value.newVersionId,
    );
    expect(retired.ok).toBe(true);
    if (!retired.ok) return;
    const stillThere = retired.value.recipeSnapshot.graphs.find(
      (g) => g.version.id === revised.value.newVersionId,
    );
    expect(stillThere?.version.status).toBe("retired");
    expect(stillThere?.version.id).toBe(revised.value.newVersionId);
  });

  it("10-12. current published pointer; invalid transitions; kitchen test independent", () => {
    const breakfast = store.recipeSnapshot.graphs.find(
      (g) => g.recipe.id === SEED_RECIPE_IDS.eggAvocadoToast,
    )!;
    expect(breakfast.recipe.currentPublishedVersionId).toBe(breakfast.version.id);
    expect(breakfast.version.status).toBe("published");

    expect(canTransitionRecipeVersionStatus("published", "draft")).toBe(false);
    expect(assertValidStatusTransition("published", "retired").ok).toBe(true);
    expect(assertValidStatusTransition("retired", "published").ok).toBe(false);

    expect(kitchenTestFromPublication("published")).toBeNull();
    expect(breakfast.version.kitchenTestStatus).toBe("not_tested");
    expect(breakfast.version.status).toBe("published");
  });

  it("13-18. catalog linkage and exact protein products", () => {
    const kheema = store.recipeSnapshot.graphs.find(
      (g) => g.recipe.canonicalKey === "ground_chicken_kheema_bowl",
    )!;
    const proteinIng = kheema.ingredients.find((i) => i.proteinProductId)!;
    expect(proteinIng.canonicalIngredientId).toBe(SEED_INGREDIENT_IDS.groundChicken);
    expect(proteinIng.proteinProductId).toBe(SEED_PRODUCT_IDS.groundChicken);
    expect(proteinIng.proteinProductId).not.toBe(
      SEED_PRODUCT_IDS.chickenBreastBonelessSkinless,
    );

    const badPair = {
      ...kheema,
      ingredients: kheema.ingredients.map((i) =>
        i.id === proteinIng.id
          ? {
              ...i,
              proteinProductId: SEED_PRODUCT_IDS.chickenBreastBonelessSkinless,
            }
          : i,
      ),
    };
    const refs = {
      canonicalIngredientIds: new Set(
        store.ingredientSnapshot.ingredients.map((i) => i.id),
      ),
      proteinProductIngredient: new Map(
        store.ingredientSnapshot.proteinProducts.map((p) => [p.id, p.ingredientId]),
      ),
    };
    const result = validateRecipeVersionGraph(badPair, refs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_PROTEIN_INGREDIENT_PAIR");

    const missing = {
      ...kheema,
      ingredients: [
        {
          ...proteinIng,
          canonicalIngredientId: "00000000-0000-4000-a000-000000000099",
          proteinProductId: undefined,
        },
      ],
    };
    const missingResult = validateRecipeVersionGraph(missing as RecipeVersionGraph, refs);
    expect(missingResult.ok).toBe(false);
  });

  it("19-26. components, steps, meal suitability, section distinctness", () => {
    const kheema = store.recipeSnapshot.graphs.find(
      (g) => g.recipe.canonicalKey === "ground_chicken_kheema_bowl",
    )!;
    const orders = kheema.components.map((c) => c.displayOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    const stepOrders = kheema.steps.map((s) => s.order);
    expect(stepOrders).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(kheema.version.lunchSuitability).toBe("preferred");
    expect(kheema.version.dinnerSuitability).toBe("preferred");

    const breakfast = store.recipeSnapshot.graphs.find(
      (g) => g.recipe.section === "breakfast",
    )!;
    const snack = store.recipeSnapshot.graphs.find((g) => g.recipe.section === "snack")!;
    expect(breakfast.recipe.section).not.toBe("meal");
    expect(snack.recipe.section).not.toBe("meal");
    expect(breakfast.version.lunchSuitability).toBeUndefined();
  });

  it("27-34. ingredient accounting reconciliation", () => {
    const breakfast = store.recipeSnapshot.graphs.find(
      (g) => g.recipe.section === "breakfast",
    )!;
    const ok = resolveRecipeIngredientUsage(
      breakfast.ingredients,
      breakfast.steps,
      breakfast.usages,
    );
    expect(ok.ok && ok.value.ok).toBe(true);

    const missingLink = resolveRecipeIngredientUsage(
      breakfast.ingredients,
      breakfast.steps,
      [],
    );
    expect(missingLink.ok && !missingLink.value.ok).toBe(true);

    const duplicated = resolveRecipeIngredientUsage(
      breakfast.ingredients,
      breakfast.steps,
      [
        ...breakfast.usages,
        {
          id: "a6000000-0000-4000-a000-000000009999",
          recipeStepId: breakfast.steps[0]!.id,
          recipeIngredientId: breakfast.ingredients[0]!.id,
          quantity: breakfast.ingredients[0]!.quantity,
          unit: breakfast.ingredients[0]!.unit,
        },
      ],
    );
    expect(duplicated.ok && duplicated.value.duplicatedIngredientIds.length > 0).toBe(true);

    const splitOk = resolveRecipeIngredientUsage(
      [
        {
          id: "a4000000-0000-4000-a000-000000009001",
          recipeVersionId: breakfast.version.id,
          canonicalIngredientId: SEED_INGREDIENT_IDS.kosherSalt,
          quantity: 2,
          unit: "g",
          optional: false,
          displayOrder: 0,
        },
      ],
      breakfast.steps,
      [
        {
          id: "a6000000-0000-4000-a000-000000009001",
          recipeStepId: breakfast.steps[0]!.id,
          recipeIngredientId: "a4000000-0000-4000-a000-000000009001",
          quantity: 1,
          unit: "g",
        },
        {
          id: "a6000000-0000-4000-a000-000000009002",
          recipeStepId: breakfast.steps[1]!.id,
          recipeIngredientId: "a4000000-0000-4000-a000-000000009001",
          quantity: 1,
          unit: "g",
        },
      ],
    );
    expect(splitOk.ok && splitOk.value.ok).toBe(true);

    const splitBad = resolveRecipeIngredientUsage(
      [
        {
          id: "a4000000-0000-4000-a000-000000009002",
          recipeVersionId: breakfast.version.id,
          canonicalIngredientId: SEED_INGREDIENT_IDS.kosherSalt,
          quantity: 2,
          unit: "g",
          optional: false,
          displayOrder: 0,
        },
      ],
      breakfast.steps,
      [
        {
          id: "a6000000-0000-4000-a000-000000009003",
          recipeStepId: breakfast.steps[0]!.id,
          recipeIngredientId: "a4000000-0000-4000-a000-000000009002",
          quantity: 1,
          unit: "g",
        },
      ],
    );
    expect(splitBad.ok && splitBad.value.unaccountedIngredientIds.length > 0).toBe(true);

    const incompatible = resolveRecipeIngredientUsage(
      [
        {
          id: "a4000000-0000-4000-a000-000000009003",
          recipeVersionId: breakfast.version.id,
          canonicalIngredientId: SEED_INGREDIENT_IDS.oliveOil,
          quantity: 5,
          unit: "ml",
          optional: false,
          displayOrder: 0,
        },
      ],
      breakfast.steps,
      [
        {
          id: "a6000000-0000-4000-a000-000000009004",
          recipeStepId: breakfast.steps[0]!.id,
          recipeIngredientId: "a4000000-0000-4000-a000-000000009003",
          quantity: 5,
          unit: "g",
        },
      ],
    );
    expect(
      incompatible.ok && incompatible.value.incompatibleUnitIngredientIds.length > 0,
    ).toBe(true);
  });

  it("35-40. scaling, storage, provenance", () => {
    for (const graph of store.recipeSnapshot.graphs) {
      expect(graph.scaling.minimumServings).toBeLessThanOrEqual(graph.scaling.maximumServings);
      expect(graph.scaling.servingIncrement).toBeGreaterThan(0);
      expect(graph.storage.recipeVersionId).toBe(graph.version.id);
      expect(graph.storage.freezingSupported === false || graph.storage.notes).toBeTruthy();
      expect(graph.provenance.recipeVersionId).toBe(graph.version.id);
      if (graph.provenance.type === "generated_draft") {
        expect(graph.version.kitchenTestStatus).not.toBe("passed");
      }
    }
  });

  it("service list/get filters and excludes unpublished from consumer queries", () => {
    const listed = listRecipes(store, { section: "meal", publishedOnly: true });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.length).toBe(1);
    expect(listed.value[0]!.version.title).toContain("Kheema");

    const byProtein = listRecipes(store, {
      section: "meal",
      proteinProductId: SEED_PRODUCT_IDS.groundChicken,
    });
    expect(byProtein.ok && byProtein.value.length).toBe(1);

    const search = listRecipes(store, { search: "avocado" });
    expect(search.ok && search.value.length).toBe(1);

    const detail = service.getRecipeVersion(SEED_VERSION_IDS.groundChickenKheemaBowlV1);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.value.kitchenTested).toBe(false);
    expect(detail.value.structureValidated).toBe(true);
    expect(
      detail.value.ingredients.some(
        (i) => i.proteinProductId === SEED_PRODUCT_IDS.groundChicken,
      ),
    ).toBe(true);
  });

  it("integrity report is clean for seed", () => {
    const report = validateRecipeCatalogIntegrity();
    expect(report.ok).toBe(true);
    expect(report.structuralIntegrityFailures).toBe(0);
    expect(formatRecipeCatalogIntegrityReport(report)).toContain(
      "structural integrity failures = 0",
    );
  });
});
