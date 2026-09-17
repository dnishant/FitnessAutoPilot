import { describe, expect, it } from "vitest";
import type { CompleteMeal, RecipeNutritionResult } from "@fitness-autopilot/contracts";
import {
  buildSolveMealPortionsRequestFromCompleteMeal,
  chickenTikkaCompleteMealRequest,
  DEVELOPER_TEST_INTENT_600,
  solveMealPortions,
} from "./index";

function tikkaCompleteMeal(): CompleteMeal {
  return {
    mealId: "complete-tikka",
    candidateId: "tikka-chicken",
    mainRecipeId: "rr_tikka",
    name: "Chicken Tikka",
    components: [
      {
        componentId: "main",
        role: "main",
        name: "Chicken Tikka",
        relationship: "intrinsic",
        source: "main_recipe",
        reason: "Main",
        quantityMode: "recipe_defined",
        definitionKind: "recipe_component",
        normalizedComponentKey: "chicken-tikka",
      },
      {
        componentId: "rice",
        role: "carbohydrate",
        name: "Basmati Rice",
        relationship: "required_companion",
        source: "composition_engine",
        reason: "Starch",
        quantityMode: "solver_determined",
        definitionKind: "atomic_food",
        normalizedComponentKey: "basmati-rice",
        resolution: {
          status: "canonical_food_resolved",
          foodResolution: {
            status: "resolved",
            food: {
              foodId: "00000000-0000-4000-8000-000000000101",
              canonicalName: "Rice, basmati, cooked",
              source: { provider: "usda", externalId: "test-rice" },
              description: "Basmati rice cooked",
              nutrientsPer100g: {
                caloriesKcal: 130,
                proteinGrams: 2.7,
                carbohydrateGrams: 28.2,
                fatGrams: 0.3,
                fiberGrams: 0.4,
              },
              measures: [],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            resolutionMethod: "deterministic",
            confidence: "high",
            matchReason: "test fixture",
          },
        },
      },
      {
        componentId: "kachumber",
        role: "vegetable",
        name: "Kachumber",
        relationship: "required_companion",
        source: "composition_engine",
        reason: "Fresh side",
        quantityMode: "solver_determined",
        definitionKind: "recipe_component",
        normalizedComponentKey: "kachumber",
      },
    ],
    compositionProfile: {
      hasPrimaryProtein: true,
      hasMeaningfulCarbohydrate: true,
      hasMeaningfulVegetableOrFruit: true,
      hasMeaningfulFiberSource: true,
      hasSauceOrMoistureComponent: false,
      addedComponentRoles: ["carbohydrate", "vegetable"],
    },
    metadata: {
      promptVersion: "meal-composition-v2",
      policyVersion: "meal-composition-v1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function tikkaMainNutrition(): RecipeNutritionResult {
  const quality = {
    status: "complete" as const,
    totalIngredientCount: 4,
    resolvedIngredientCount: 4,
    ambiguousIngredientCount: 0,
    unresolvedIngredientCount: 0,
    highConfidenceCount: 4,
    mediumConfidenceCount: 0,
    directMassConversionCount: 4,
    providerMeasureConversionCount: 0,
    lowConfidenceConversionCount: 0,
    pendingPortioningComponentCount: 0,
  };
  return {
    recipeId: "rr_tikka",
    candidateId: "tikka-chicken",
    recipeName: "Chicken Tikka",
    baseServings: 4,
    ingredients: [],
    mealComponents: [],
    nutrition: {
      total: {
        caloriesKcal: 1060,
        proteinGrams: 152,
        carbohydrateGrams: 14,
        fatGrams: 42,
        fiberGrams: 0.8,
      },
      perBaseServing: {
        caloriesKcal: 265,
        proteinGrams: 38,
        carbohydrateGrams: 3.5,
        fatGrams: 10.5,
        fiberGrams: 0.2,
      },
      ingredientBreakdown: [],
      resolutionQuality: quality,
    },
    resolutionQuality: quality,
    policyVersions: {
      foodResolution: "food-resolution-v1",
      nutritionCalculation: "nutrition-calculation-v1",
      quantityNormalization: "quantity-normalization-v1",
    },
  };
}

describe("buildSolveMealPortionsRequestFromCompleteMeal", () => {
  it("builds coefficients for every plate component when nutrition is trusted", () => {
    const built = buildSolveMealPortionsRequestFromCompleteMeal({
      mealId: "meal-1",
      completeMeal: tikkaCompleteMeal(),
      nutritionIntent: DEVELOPER_TEST_INTENT_600,
      mainNutrition: tikkaMainNutrition(),
      componentNutritionById: {
        kachumber: {
          baseNutrition: {
            caloriesKcal: 28,
            proteinGrams: 1.2,
            carbohydrateGrams: 5.5,
            fatGrams: 0.3,
            fiberGrams: 1.8,
          },
          baseServings: 1,
          referenceYieldGrams: 120,
        },
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.components).toHaveLength(3);
    expect(built.request.components.map((c) => c.kind).sort()).toEqual([
      "food_grams",
      "recipe_scale",
      "recipe_scale",
    ]);

    const plan = solveMealPortions(built.request);
    expect(plan.status === "solved" || plan.status === "best_feasible").toBe(true);
    expect(plan.portions).toHaveLength(3);
    expect(plan.nutrition.caloriesKcal).toBeGreaterThan(200);
  });

  it("fails closed when a side lacks trusted nutrition (no inventing)", () => {
    const built = buildSolveMealPortionsRequestFromCompleteMeal({
      mealId: "meal-1",
      completeMeal: tikkaCompleteMeal(),
      nutritionIntent: DEVELOPER_TEST_INTENT_600,
      mainNutrition: tikkaMainNutrition(),
      // kachumber missing — must not invent
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.missingComponentIds).toContain("kachumber");
  });

  it("fixture path still solves the same meal family", () => {
    const plan = solveMealPortions(chickenTikkaCompleteMealRequest(DEVELOPER_TEST_INTENT_600));
    expect(plan.portions.length).toBeGreaterThanOrEqual(3);
  });
});
