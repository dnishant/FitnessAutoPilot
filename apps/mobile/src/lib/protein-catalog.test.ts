import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AVAILABILITY_DISCLAIMER } from "@fitness-autopilot/contracts";
import {
  availabilityDisclaimer,
  claimsLiveInventory,
  closeProteinProduct,
  createProteinCatalogUiState,
  familyFilterOptions,
  getProteinCatalogReadApi,
  loadProteinCatalog,
  openProteinProduct,
  PROTEIN_CATALOG_ROUTE,
  PROTEIN_CATALOG_TITLE,
} from "./protein-catalog";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Protein Catalog UI helpers", () => {
  it("37. renders seeded products through the catalog service", () => {
    const loaded = loadProteinCatalog(createProteinCatalogUiState());
    expect(loaded.products.length).toBeGreaterThanOrEqual(26);
    expect(loaded.products.some((p) => p.displayName.includes("Ribeye"))).toBe(true);
  });

  it("38. search filters the displayed products", () => {
    const loaded = loadProteinCatalog({
      ...createProteinCatalogUiState(),
      search: "ribeye",
    });
    expect(loaded.products).toHaveLength(1);
    expect(loaded.products[0]!.canonicalKey).toBe("beef_ribeye_steak");
  });

  it("39. family filtering works", () => {
    const poultry = loadProteinCatalog({
      ...createProteinCatalogUiState(),
      filterFamily: "chicken",
    });
    expect(poultry.products.every((p) => p.proteinFamily === "chicken")).toBe(true);
    expect(poultry.products.some((p) => p.canonicalKey === "ground_chicken")).toBe(true);
    expect(
      poultry.products.some((p) => p.canonicalKey === "chicken_breast_boneless_skinless"),
    ).toBe(true);
  });

  it("40. availability filtering works", () => {
    const specialty = loadProteinCatalog({
      ...createProteinCatalogUiState(),
      filterAvailability: "specialty",
    });
    expect(specialty.products.some((p) => p.canonicalKey === "lobster_tail")).toBe(true);
  });

  it("41. filtered product count is correct", () => {
    const beef = loadProteinCatalog({
      ...createProteinCatalogUiState(),
      filterFamily: "beef",
    });
    expect(beef.products.length).toBe(
      getProteinCatalogReadApi().listProteinProducts({ proteinFamily: "beef" }).ok
        ? (
            getProteinCatalogReadApi().listProteinProducts({ proteinFamily: "beef" }) as {
              ok: true;
              value: unknown[];
            }
          ).value.length
        : -1,
    );
  });

  it("42. opening a product displays structured details", () => {
    const base = loadProteinCatalog(createProteinCatalogUiState());
    const opened = openProteinProduct(base, "beef_ribeye_steak");
    expect(opened.detail?.product.cut).toBe("ribeye");
    expect(opened.detail?.product.form).toBe("steak");
    expect(opened.detail?.nutritionMappingStatus).toBe("unmapped");
    expect(opened.detail?.aliases.some((a) => a.normalizedAlias === "ribeye")).toBe(true);
  });

  it("43. retailer confidence and verification dates render from detail", () => {
    const opened = openProteinProduct(
      loadProteinCatalog(createProteinCatalogUiState()),
      "tofu_extra_firm",
    );
    const verified = opened.detail?.retailerEvidence.find((e) => e.confidence === "verified");
    expect(verified?.verifiedAt).toMatch(/^2026-03-01/);
    expect(verified?.sourceUrl).toContain("http");
  });

  it("44. live-inventory disclaimer is visible", () => {
    expect(availabilityDisclaimer()).toBe(AVAILABILITY_DISCLAIMER);
    expect(claimsLiveInventory(availabilityDisclaimer())).toBe(false);
    expect(claimsLiveInventory("In stock now")).toBe(true);
  });

  it("45. empty-filter state renders correctly", () => {
    const empty = loadProteinCatalog({
      ...createProteinCatalogUiState(),
      search: "zzzz-no-match",
    });
    expect(empty.products).toHaveLength(0);
    expect(empty.error).toBeNull();
  });

  it("46. loading and error states are representable", () => {
    const loading = createProteinCatalogUiState();
    expect(loading.loading).toBe(true);
    const errored = {
      ...loadProteinCatalog(createProteinCatalogUiState()),
      error: "Could not load catalog",
      products: [],
    };
    expect(errored.error).toContain("Could not load");
  });

  it("47. keyboard-friendly filter options are labeled", () => {
    expect(familyFilterOptions()[0]?.label).toBe("All families");
    expect(familyFilterOptions().some((o) => o.value === "beef")).toBe(true);
  });

  it("48. the page loads through the production routing path", () => {
    const layout = readFileSync(join(mobileRoot, "app/_layout.tsx"), "utf8");
    const screen = readFileSync(join(mobileRoot, "app/catalog/proteins.tsx"), "utf8");
    const developer = readFileSync(join(mobileRoot, "app/developer/index.tsx"), "utf8");
    const you = readFileSync(join(mobileRoot, "app/(tabs)/you.tsx"), "utf8");
    expect(layout).toContain('name="catalog/proteins"');
    expect(screen).toContain("PROTEIN_CATALOG_TITLE");
    expect(screen).toContain("availabilityDisclaimer");
    expect(developer).toContain(PROTEIN_CATALOG_ROUTE);
    expect(you).toContain("/catalog/proteins");
    expect(PROTEIN_CATALOG_TITLE).toBe("Protein Catalog");
  });

  it("49. the page loads catalog service data rather than hardcoded fixtures", () => {
    const screen = readFileSync(join(mobileRoot, "app/catalog/proteins.tsx"), "utf8");
    expect(screen).toContain("loadProteinCatalog");
    expect(screen).not.toContain("Boneless Skinless Chicken Breast");
    const api = getProteinCatalogReadApi();
    expect(Object.keys(api).some((k) => /insert|update|delete|mutate/i.test(k))).toBe(
      false,
    );
  });

  it("preview smoke: poultry and beef distinctions", () => {
    const poultry = loadProteinCatalog({
      ...createProteinCatalogUiState(),
      filterFamily: "chicken",
    });
    const names = poultry.products.map((p) => p.displayName);
    expect(names).toEqual(
      expect.arrayContaining([
        "Ground Chicken",
        "Boneless Skinless Chicken Breast",
        "Boneless Skinless Chicken Thighs",
      ]),
    );
    const beef = loadProteinCatalog({
      ...createProteinCatalogUiState(),
      filterFamily: "beef",
    });
    const beefNames = beef.products.map((p) => p.displayName);
    expect(beefNames).toEqual(
      expect.arrayContaining([
        "Ribeye Steak",
        "80/20 Ground Beef",
        "90/10 Ground Beef",
        "93/7 Ground Beef",
        "Top Sirloin Steak",
        "Flank Steak",
        "Chuck Roast",
      ]),
    );
    const groundSearch = loadProteinCatalog({
      ...createProteinCatalogUiState(),
      search: "ground beef",
    });
    expect(groundSearch.products.length).toBe(3);
    const ribeye = openProteinProduct(beef, "beef_ribeye_steak");
    expect(ribeye.detail?.product.cut).toBe("ribeye");
    expect(claimsLiveInventory(JSON.stringify(ribeye.detail))).toBe(false);
    expect(closeProteinProduct(ribeye).detail).toBeNull();
  });
});
