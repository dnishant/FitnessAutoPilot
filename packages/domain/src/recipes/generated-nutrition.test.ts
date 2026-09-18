import { describe, expect, it } from "vitest";
import type { ResolvedRecipe } from "@fitness-autopilot/contracts";
import {
  estimatedCaloriesFromMacros,
  formatRecipePortionDiagnostics,
  ingredientQuantityForServings,
  ingredientScaleFactor,
  macrosForServings,
  recipeNutritionResultFromGenerated,
  scaleMacros,
  validateGeneratedRecipeNutrition,
} from "./generated-nutrition";

const paneerKathiRoll: ResolvedRecipe = {
  recipeId: "paneer-kathi-roll",
  candidateId: "paneer-kathi-roll",
  name: "Paneer Kathi Roll",
  source: { name: "fixture", url: "https://example.com", author: null },
  description: "Spiced paneer wrap with paratha.",
  baseServings: 4,
  ingredients: [
    {
      ingredientId: "paneer",
      name: "paneer",
      quantity: 350,
      unit: "g",
      role: "protein",
      scalingBehavior: "primary_scalable",
    },
    {
      ingredientId: "yogurt",
      name: "Greek yogurt",
      quantity: 80,
      unit: "g",
      role: "sauce",
      scalingBehavior: "secondary_scalable",
    },
    {
      ingredientId: "oil",
      name: "oil",
      quantity: 1.5,
      unit: "tbsp",
      role: "fat",
      scalingBehavior: "secondary_scalable",
    },
    {
      ingredientId: "pepper",
      name: "bell pepper",
      quantity: 1,
      unit: "piece",
      role: "vegetable",
      scalingBehavior: "secondary_scalable",
    },
    {
      ingredientId: "onion",
      name: "onion",
      quantity: 1,
      unit: "piece",
      role: "aromatic",
      scalingBehavior: "secondary_scalable",
    },
    {
      ingredientId: "paratha",
      name: "paratha",
      quantity: 4,
      unit: "paratha",
      role: "carb",
      scalingBehavior: "primary_scalable",
    },
  ],
  instructions: [{ stepNumber: 1, text: "Assemble rolls." }],
  prepTimeMinutes: 20,
  cookTimeMinutes: 15,
  supportedPrepModes: [
    {
      mode: "fresh",
      advanceTasks: [],
      finishTasks: ["Cook and wrap"],
      finishTimeMinutes: 20,
    },
  ],
  mealComponents: [
    {
      componentId: "main",
      name: "Paneer Kathi Roll",
      type: "main",
      required: true,
      purpose: "Main",
      relationship: "intrinsic",
    },
  ],
  flavorProfile: {
    cuisineFamily: "Indian",
    flavorFamilies: ["savory"],
    cookingTechniques: ["saute"],
    textureProfile: [],
  },
  experienceProfile: {
    moistureLevel: "moderate",
    flavorIntensity: "medium",
    textureTags: [],
    mealPrepQuality: "good",
  },
  resolutionMetadata: {
    provider: "fixture",
    model: "test",
    promptVersion: "recipe-resolution-v2",
  },
  nutrition: {
    source: "llm_estimate",
    total: {
      caloriesKcal: 2000,
      proteinGrams: 95,
      carbohydrateGrams: 155,
      fatGrams: 105,
    },
    perServing: {
      caloriesKcal: 500,
      proteinGrams: 23.75,
      carbohydrateGrams: 38.75,
      fatGrams: 26.25,
    },
    confidence: "medium",
  },
  optimization: {
    applied: true,
    changes: [
      {
        type: "cooking_method",
        from: "shallow fry",
        to: "air fry",
        reason: "reduces added oil while preserving crisp texture",
      },
    ],
  },
};

describe("generated recipe nutrition helpers", () => {
  it("scales macros by personalServings (not × baseServings)", () => {
    const perServing = { caloriesKcal: 500, proteinGrams: 24, carbohydrateGrams: 39, fatGrams: 26 };
    expect(scaleMacros(perServing, 1).caloriesKcal).toBe(500);
    expect(scaleMacros(perServing, 1.2).caloriesKcal).toBe(600);
    expect(scaleMacros(perServing, 0.5).caloriesKcal).toBe(250);

    const meal = macrosForServings(paneerKathiRoll, 1.2);
    expect(meal.caloriesKcal).toBe(600);
    expect(meal.proteinGrams).toBeCloseTo(28.5, 5);
  });

  it("scales ingredients as personalServings / baseServings", () => {
    expect(ingredientScaleFactor(4, 1.2)).toBeCloseTo(0.3, 10);
    const paneer = ingredientQuantityForServings(
      { name: "paneer", quantity: 350, unit: "g" },
      4,
      1.2,
    );
    expect(paneer.calculatedQuantity).toBeCloseTo(105, 5);
    expect(paneer.discrete).toBe(false);

    const paratha = ingredientQuantityForServings(
      { name: "paratha", quantity: 4, unit: "paratha" },
      4,
      1.2,
    );
    expect(paratha.calculatedQuantity).toBeCloseTo(1.2, 5);
    expect(paratha.discrete).toBe(true);
  });

  it("rejects calorie/macro inconsistency", () => {
    const result = validateGeneratedRecipeNutrition({
      baseServings: 4,
      nutrition: {
        source: "llm_estimate",
        total: {
          caloriesKcal: 500,
          proteinGrams: 100,
          carbohydrateGrams: 100,
          fatGrams: 100,
        },
        perServing: {
          caloriesKcal: 125,
          proteinGrams: 25,
          carbohydrateGrams: 25,
          fatGrams: 25,
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CALORIE_MACRO_INCONSISTENCY");
    }
    // Derived energy for 100/100/100 ≈ 1700 kcal — far from 500.
    expect(estimatedCaloriesFromMacros({
      caloriesKcal: 500,
      proteinGrams: 100,
      carbohydrateGrams: 100,
      fatGrams: 100,
    })).toBe(1700);
  });

  it("stores full-dish nutrition including bread/oil carbs and fat", () => {
    const validated = validateGeneratedRecipeNutrition({
      baseServings: paneerKathiRoll.baseServings,
      nutrition: paneerKathiRoll.nutrition,
      ingredients: paneerKathiRoll.ingredients,
    });
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value.total.carbohydrateGrams).toBeGreaterThan(100);
      expect(validated.value.total.fatGrams).toBeGreaterThan(50);
      expect(validated.value.perServing.caloriesKcal).toBe(500);
    }

    const bridged = recipeNutritionResultFromGenerated(paneerKathiRoll);
    expect(bridged).not.toBeNull();
    expect(bridged!.nutrition.perBaseServing.caloriesKcal).toBe(500);
    expect(bridged!.resolutionQuality.status).toBe("complete");
  });

  it("flags implausible near-zero carbs when paratha is present", () => {
    const result = validateGeneratedRecipeNutrition({
      baseServings: 4,
      ingredients: paneerKathiRoll.ingredients,
      nutrition: {
        source: "llm_estimate",
        total: {
          caloriesKcal: 200,
          proteinGrams: 40,
          carbohydrateGrams: 5,
          fatGrams: 2,
        },
        perServing: {
          caloriesKcal: 50,
          proteinGrams: 10,
          carbohydrateGrams: 1.25,
          fatGrams: 0.5,
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("IMPLAUSIBLE_MACROS");
    }
  });

  it("formats diagnostics without multiplying by batch size", () => {
    const text = formatRecipePortionDiagnostics({
      recipeName: "Paneer Kathi Roll",
      baseServings: 4,
      nutrition: paneerKathiRoll.nutrition!,
      personalServings: 1.2,
    });
    expect(text).toContain("1.2 servings");
    expect(text).toContain("600 kcal");
    expect(text).not.toContain("4.8 servings");
  });
});
