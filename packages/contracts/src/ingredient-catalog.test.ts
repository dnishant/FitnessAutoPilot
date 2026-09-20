import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_DISCLAIMER,
  CanonicalIngredientSchema,
  ProteinProductSchema,
  RetailerAvailabilityEvidenceSchema,
} from "./ingredient-catalog";

describe("ingredient-catalog contracts", () => {
  it("parses a valid protein product", () => {
    const parsed = ProteinProductSchema.safeParse({
      id: "c2000000-0000-4000-a000-000000000010",
      canonicalKey: "beef_ribeye_steak",
      ingredientId: "c1000000-0000-4000-a000-000000000010",
      proteinFamily: "beef",
      displayName: "Ribeye Steak",
      cut: "ribeye",
      form: "steak",
      typicalPurchaseUnit: "lb",
      availabilityClass: "commonly_available",
      active: true,
      createdAt: "2026-09-19T00:00:00.000Z",
      updatedAt: "2026-09-19T00:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects partial nutrition mapping", () => {
    const parsed = CanonicalIngredientSchema.safeParse({
      id: "c1000000-0000-4000-a000-000000000010",
      canonicalKey: "beef_ribeye_steak",
      displayName: "Ribeye steak",
      category: "protein",
      availabilityClass: "commonly_available",
      nutritionSourceType: "usda_fdc",
      createdAt: "2026-09-19T00:00:00.000Z",
      updatedAt: "2026-09-19T00:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects verified evidence without source", () => {
    const parsed = RetailerAvailabilityEvidenceSchema.safeParse({
      id: "c4000000-0000-4000-a000-000000000099",
      proteinProductId: "c2000000-0000-4000-a000-000000000010",
      retailer: "costco",
      confidence: "verified",
      verifiedAt: "2026-03-01T12:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("exports the live-inventory disclaimer", () => {
    expect(AVAILABILITY_DISCLAIMER).toMatch(/not live local inventory/);
  });
});
