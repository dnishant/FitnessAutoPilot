import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_PRODUCT_IDS } from "@fitness-autopilot/domain";
import {
  closeRecipeVersion,
  createRecipeCatalogUiState,
  kitchenTestLabel,
  loadRecipeCatalog,
  openRecipeVersion,
  RECIPE_CATALOG_ROUTE,
  RECIPE_CATALOG_TITLE,
  resolveProteinName,
  sectionLabel,
  statusLabel,
} from "./recipe-catalog";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Recipe Catalog UI helpers", () => {
  it("50-55. sections, search, cuisine, protein filters and counts", () => {
    let state = createRecipeCatalogUiState();
    state = loadRecipeCatalog(state);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.items.length).toBe(1);
    expect(state.items[0]!.version.title).toContain("Egg");

    state = loadRecipeCatalog({ ...state, section: "meal", loading: true });
    expect(state.items.length).toBe(1);
    expect(state.items[0]!.version.title).toContain("Kheema");

    state = loadRecipeCatalog({
      ...state,
      section: "meal",
      filterProteinProductId: SEED_PRODUCT_IDS.groundChicken,
      loading: true,
    });
    expect(state.items.length).toBe(1);

    state = loadRecipeCatalog({
      ...state,
      section: "meal",
      filterCuisine: "mexican",
      loading: true,
    });
    expect(state.items.length).toBe(0);

    state = loadRecipeCatalog({
      ...state,
      section: "snack",
      filterCuisine: "all",
      filterProteinProductId: "all",
      search: "yogurt",
      loading: true,
    });
    expect(state.items.length).toBe(1);
  });

  it("56-60. details via service; ground chicken; lifecycle distinct", () => {
    let state = loadRecipeCatalog({
      ...createRecipeCatalogUiState(),
      section: "meal",
    });
    const versionId = state.items[0]!.version.id;
    state = openRecipeVersion(state, versionId);
    expect(state.detail).not.toBeNull();
    expect(state.detail!.components.length).toBeGreaterThan(1);
    expect(state.detail!.steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      state.detail!.ingredients.some(
        (i) => i.proteinProductId === SEED_PRODUCT_IDS.groundChicken,
      ),
    ).toBe(true);
    expect(resolveProteinName(SEED_PRODUCT_IDS.groundChicken)).toMatch(/Ground chicken/i);
    expect(state.detail!.structureValidated).toBe(true);
    expect(state.detail!.kitchenTested).toBe(false);
    expect(statusLabel(state.detail!.version.status)).toBe("Published");
    expect(kitchenTestLabel(state.detail!.version.kitchenTestStatus)).toContain(
      "Not kitchen tested",
    );
    state = closeRecipeVersion(state);
    expect(state.detail).toBeNull();
  });

  it("61-66. loading/empty/error markers; route registration; no hardcoded recipes in screen", () => {
    const loading = createRecipeCatalogUiState();
    expect(loading.loading).toBe(true);

    const empty = loadRecipeCatalog({
      ...createRecipeCatalogUiState(),
      section: "meal",
      search: "zzzz-no-match",
    });
    expect(empty.items.length).toBe(0);

    expect(sectionLabel("breakfast")).toBe("Breakfast");
    expect(RECIPE_CATALOG_ROUTE).toBe("/catalog/recipes");
    expect(RECIPE_CATALOG_TITLE).toBe("Recipe Catalog");

    const screen = readFileSync(join(mobileRoot, "app/catalog/recipes.tsx"), "utf8");
    const layout = readFileSync(join(mobileRoot, "app/_layout.tsx"), "utf8");
    const developer = readFileSync(join(mobileRoot, "app/developer/index.tsx"), "utf8");
    const you = readFileSync(join(mobileRoot, "app/(tabs)/you.tsx"), "utf8");
    expect(layout).toContain('name="catalog/recipes"');
    expect(developer).toContain(RECIPE_CATALOG_ROUTE);
    expect(you).toContain("/catalog/recipes");
    expect(screen).not.toContain("Egg, Avocado and Whole-Grain Toast");
    expect(screen).not.toContain("Ground Chicken Kheema Bowl");
    expect(screen).toContain("loadRecipeCatalog");
    expect(screen).toContain("Loading recipes");
    expect(screen).toContain("No matching recipes");
    expect(screen).toContain("Could not load catalog");
  });
});
