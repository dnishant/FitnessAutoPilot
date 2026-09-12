import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECIPE_DISCOVERY_MAX_RESULTS,
  MAX_RECIPE_DISCOVERY_MAX_RESULTS,
  RecipeDiscoveryCandidateSchema,
  RecipeDiscoveryRequestSchema,
} from "./recipe-discovery";

describe("RecipeDiscoveryRequestSchema", () => {
  it("parses a valid discovery request", () => {
    const parsed = RecipeDiscoveryRequestSchema.safeParse({
      mealType: "dinner",
      cuisines: ["indian"],
      proteins: ["chicken"],
      highProteinPreferred: true,
      allergies: ["Peanuts"],
      dietaryRestrictions: ["dairy-free"],
      dislikes: ["olives"],
      maxResults: 20,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects maxResults above the safe upper bound", () => {
    const parsed = RecipeDiscoveryRequestSchema.safeParse({
      maxResults: MAX_RECIPE_DISCOVERY_MAX_RESULTS + 1,
    });
    expect(parsed.success).toBe(false);
  });

  it("allows omitting maxResults (default applied in domain)", () => {
    const parsed = RecipeDiscoveryRequestSchema.safeParse({
      mealType: "lunch",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.maxResults).toBeUndefined();
      expect(DEFAULT_RECIPE_DISCOVERY_MAX_RESULTS).toBe(30);
    }
  });

  it("rejects invalid mealType", () => {
    const parsed = RecipeDiscoveryRequestSchema.safeParse({
      mealType: "brunch",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("RecipeDiscoveryCandidateSchema", () => {
  it("accepts a normalized candidate with source attribution", () => {
    const parsed = RecipeDiscoveryCandidateSchema.safeParse({
      provider: "edamam",
      externalId: "b79327d05b8e5b838ad6cfd9576b30b6",
      name: "Chicken Curry",
      sourceName: "BBC Good Food",
      sourceUrl: "https://www.bbcgoodfood.com/recipes/chicken-curry",
      imageUrl: "https://www.edamam.com/web-img/abc.jpg",
      cuisineLabels: ["indian"],
      mealTypeLabels: ["lunch/dinner"],
      dishTypeLabels: ["main course"],
      ingredientLines: ["chicken", "spices"],
      servings: 4,
      caloriesPerServing: 450,
      proteinGramsPerServing: 35,
      carbsGramsPerServing: 20,
      fatGramsPerServing: 18,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts missing optional nutrition and attribution fields", () => {
    const parsed = RecipeDiscoveryCandidateSchema.safeParse({
      provider: "edamam",
      externalId: "abc123",
      name: "Simple Bowl",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cuisineLabels).toEqual([]);
      expect(parsed.data.ingredientLines).toEqual([]);
    }
  });
});
