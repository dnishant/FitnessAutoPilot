import { describe, expect, it } from "vitest";
import {
  CanonicalFoodSchema,
  ResolveRecipeNutritionRequestSchema,
  RecipeNutritionResultSchema,
  FOOD_RESOLUTION_POLICY_VERSION,
} from "./food-resolution";

describe("food-resolution contracts", () => {
  it("accepts a canonical food", () => {
    const parsed = CanonicalFoodSchema.safeParse({
      foodId: "11111111-1111-4111-8111-111111111101",
      canonicalName: "Oil, olive",
      source: { provider: "usda", externalId: "171413", dataType: "SR Legacy" },
      description: "Oil, olive, salad or cooking",
      nutrientsPer100g: {
        caloriesKcal: 884,
        proteinGrams: 0,
        carbohydrateGrams: 0,
        fatGrams: 100,
        fiberGrams: 0,
      },
      measures: [],
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires recipes for resolve request", () => {
    const parsed = ResolveRecipeNutritionRequestSchema.safeParse({ recipes: [] });
    expect(parsed.success).toBe(false);
  });

  it("exposes policy version constant", () => {
    expect(FOOD_RESOLUTION_POLICY_VERSION).toBe("food-resolution-v1");
  });

  it("accepts recipe nutrition result shape", () => {
    const parsed = RecipeNutritionResultSchema.safeParse({
      recipeId: "r1",
      candidateId: "c1",
      recipeName: "Test",
      baseServings: 4,
      ingredients: [],
      mealComponents: [],
      resolutionQuality: {
        status: "complete",
        totalIngredientCount: 0,
        resolvedIngredientCount: 0,
        ambiguousIngredientCount: 0,
        unresolvedIngredientCount: 0,
        highConfidenceCount: 0,
        mediumConfidenceCount: 0,
        directMassConversionCount: 0,
        providerMeasureConversionCount: 0,
        lowConfidenceConversionCount: 0,
        pendingPortioningComponentCount: 0,
      },
      policyVersions: {
        foodResolution: "food-resolution-v1",
        nutritionCalculation: "nutrition-calculation-v1",
        quantityNormalization: "quantity-normalization-v1",
      },
    });
    expect(parsed.success).toBe(true);
  });
});
