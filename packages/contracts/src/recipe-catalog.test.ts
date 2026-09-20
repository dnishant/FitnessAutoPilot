import { describe, expect, it } from "vitest";
import {
  CatalogRecipeSchema,
  RecipeQuantityUnitSchema,
  RecipeSectionSchema,
} from "./recipe-catalog";

describe("recipe-catalog contracts", () => {
  it("accepts controlled sections and units", () => {
    expect(RecipeSectionSchema.parse("breakfast")).toBe("breakfast");
    expect(RecipeSectionSchema.safeParse("lunch").success).toBe(false);
    expect(RecipeQuantityUnitSchema.parse("g")).toBe("g");
    expect(RecipeQuantityUnitSchema.safeParse("pinch").success).toBe(false);
  });

  it("parses a minimal catalog recipe shape", () => {
    const parsed = CatalogRecipeSchema.parse({
      id: "a1000000-0000-4000-a000-000000000001",
      canonicalKey: "egg_avocado_whole_grain_toast",
      section: "breakfast",
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
    });
    expect(parsed.section).toBe("breakfast");
  });
});
