/**
 * Abstract culinary needs must never become PLAN-010 edible components.
 */
import { describe, expect, it } from "vitest";
import type { CompleteMeal, ResolvedRecipe } from "@fitness-autopilot/contracts";
import { buildCoefficientsFromCompleteMeal } from "../meal-portioning/coefficients";
import {
  detectExistingMealRoles,
  isEdibleFoodIdentity,
  looksLikeCulinaryNeedName,
  resolveSelectedCompleteMeals,
  validateCompleteMealStructure,
  MockMealCompositionProvider,
  composeMealConcept,
} from "./index";
import { makeChickenTikkaResolvedRecipe } from "./fixtures";

function recipeWithAbstractNeeds(): ResolvedRecipe {
  return makeChickenTikkaResolvedRecipe({
    recipeId: "recipe-aurora-cod",
    candidateId: "novel-aurora-cod",
    name: "Aurora Pan-Seared Whitefish",
    description: "Crispy whitefish with lemon-wine pan sauce.",
    ingredients: [
      {
        ingredientId: "fish",
        name: "whitefish fillet",
        quantity: 500,
        unit: "g",
        role: "protein",
        scalingBehavior: "primary_scalable",
      },
      {
        ingredientId: "oil",
        name: "olive oil",
        quantity: 20,
        unit: "g",
        role: "fat",
        scalingBehavior: "secondary_scalable",
      },
      {
        ingredientId: "wine",
        name: "white wine",
        quantity: 60,
        unit: "g",
        role: "sauce",
        scalingBehavior: "secondary_scalable",
      },
    ],
    mealComponents: [
      {
        componentId: "main",
        name: "Aurora Pan-Seared Whitefish",
        type: "main",
        required: true,
        purpose: "Main",
        relationship: "intrinsic",
        kind: "edible_component",
      },
      {
        componentId: "component_2",
        name: "Complements seafood with fresh acidity and crunch",
        type: "vegetable_side",
        required: false,
        purpose: "Complements seafood with fresh acidity and crunch",
        relationship: "recommended_side",
      },
      {
        componentId: "component_3",
        name: "Absorbs delicious lemon-wine pan sauce",
        type: "carb_side",
        required: false,
        purpose: "Absorbs delicious lemon-wine pan sauce",
        relationship: "optional",
      },
    ],
    experienceProfile: {
      moistureLevel: "saucy",
      flavorIntensity: "bold",
      textureTags: ["crispy"],
      mealPrepQuality: "good",
    },
    nutrition: {
      source: "llm_estimate",
      total: {
        caloriesKcal: 1600,
        proteinGrams: 140,
        carbohydrateGrams: 20,
        fatGrams: 90,
        fiberGrams: 2,
      },
      perServing: {
        caloriesKcal: 400,
        proteinGrams: 35,
        carbohydrateGrams: 5,
        fatGrams: 22.5,
        fiberGrams: 0.5,
      },
    },
  });
}

describe("edible identity vs culinary needs", () => {
  it("rejects purpose-sentence names as edible food", () => {
    expect(looksLikeCulinaryNeedName("Absorbs delicious lemon-wine pan sauce")).toBe(true);
    expect(isEdibleFoodIdentity("Absorbs delicious lemon-wine pan sauce")).toBe(false);
    expect(isEdibleFoodIdentity("Complements seafood with fresh acidity and crunch")).toBe(false);
    expect(isEdibleFoodIdentity("Roasted Rosemary Potatoes")).toBe(true);
    expect(isEdibleFoodIdentity("Sautéed Garlic Spinach")).toBe(true);
    expect(isEdibleFoodIdentity("Basmati Rice")).toBe(true);
  });

  it("A: abstract carb need does not enter CompleteMeal or coefficients", async () => {
    const recipe = recipeWithAbstractNeeds();
    const detected = detectExistingMealRoles(recipe);
    expect(detected.culinaryNeeds.length).toBeGreaterThanOrEqual(2);
    expect(
      detected.existingComponents.every((c) => isEdibleFoodIdentity(c.name) || c.role === "main"),
    ).toBe(true);
    expect(
      detected.existingComponents.some((c) => /absorbs|complements/i.test(c.name)),
    ).toBe(false);

    const provider = new MockMealCompositionProvider({
      "novel-aurora-cod": {
        mealName: "Aurora Pan-Seared Whitefish plate",
        mealUnderstanding: {
          mealForm: "main_only",
          isStandaloneMeal: false,
          dishSummary: "Saucy whitefish needing companions",
          howItIsEaten: "With starch and greens",
          existingComponents: [{ name: recipe.name, role: "main", integration: "integrated_in_dish" }],
          satisfiedNeeds: ["protein_structure"],
          missingNeeds: ["carbohydrate_accompaniment", "fresh_vegetable_accompaniment"],
          additionsRecommended: true,
          confidence: "high",
        },
        alreadySatisfiedRoles: ["main"],
        missingRoles: ["carbohydrate", "vegetable"],
        addedComponents: [
          {
            name: "Roasted Rosemary Potatoes",
            role: "carbohydrate",
            relationship: "required_companion",
            reason: "Absorbs pan sauce",
            culinaryReason: "Starch for the lemon-wine sauce",
            satisfiesMissingNeed: "carbohydrate_accompaniment",
            definitionKind: "recipe_component",
          },
          {
            name: "Sautéed Garlic Spinach",
            role: "vegetable",
            relationship: "recommended",
            reason: "Fresh greens",
            culinaryReason: "Fresh contrast",
            satisfiesMissingNeed: "fresh_vegetable_accompaniment",
            definitionKind: "recipe_component",
          },
        ],
        compositionSummary: "Fish with potatoes and spinach",
      },
    });

    const composed = await composeMealConcept(
      {
        mealType: "dinner",
        recipe,
        candidate: {
          candidateId: recipe.candidateId,
          name: recipe.name,
          source: { name: "test", url: "https://example.com" },
          cuisineFamily: "italian",
          dishFormat: "pan-fried fish",
          flavorFamilies: ["savory"],
          cookingTechniques: ["pan fry"],
          textureTags: ["crispy"],
          experienceTags: ["saucy"],
          whyItIsInteresting: recipe.description,
          fitnessAdaptability: "moderate",
          fitnessAdaptabilityReason: "test",
          mealPrepAdaptability: "component_prepped",
          noveltyReason: "test",
          discoveryConfidence: "high",
        },
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
      },
      { provider },
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;

    const resolved = await resolveSelectedCompleteMeals({
      concepts: [composed.value],
      selectedCandidateIds: [recipe.candidateId],
      recipesByCandidateId: { [recipe.candidateId]: recipe },
    });
    const meal = resolved.result.mealsByCandidateId[recipe.candidateId];
    expect(meal).toBeDefined();
    if (!meal) return;

    const names = meal.components.map((c) => c.name);
    expect(names.some((n) => /absorbs|complements/i.test(n))).toBe(false);
    expect(names).toEqual(
      expect.arrayContaining([
        "Aurora Pan-Seared Whitefish",
        "Roasted Rosemary Potatoes",
        "Sautéed Garlic Spinach",
      ]),
    );
    expect(meal.components).toHaveLength(3);

    const structure = validateCompleteMealStructure(meal);
    expect(structure.ok).toBe(true);

    const keyed: Record<
      string,
      { nutrition: { caloriesKcal: number; proteinGrams: number; carbohydrateGrams: number; fatGrams: number; fiberGrams: number }; referenceYieldGrams: number; baseServings: number }
    > = {};
    for (const component of meal.components) {
      if (component.role === "main") continue;
      keyed[component.normalizedComponentKey] = {
        nutrition: {
          caloriesKcal: component.role === "carbohydrate" ? 180 : 60,
          proteinGrams: 4,
          carbohydrateGrams: component.role === "carbohydrate" ? 30 : 4,
          fatGrams: component.role === "carbohydrate" ? 5 : 3,
          fiberGrams: component.role === "carbohydrate" ? 3 : 2,
        },
        referenceYieldGrams: component.role === "carbohydrate" ? 200 : 120,
        baseServings: 1,
      };
    }

    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      recipesByCandidateId: { [recipe.candidateId]: recipe },
      componentNutritionByKey: keyed,
    });
    expect(coeffs.ok).toBe(true);
    if (!coeffs.ok) return;
    expect(coeffs.components).toHaveLength(3);
    expect(coeffs.components.every((c) => isEdibleFoodIdentity(c.displayName))).toBe(true);
  });

  it("B: abstract recommendation on complete meal never reaches nutrition", () => {
    const meal: CompleteMeal = {
      mealId: "meal-complete",
      candidateId: "x",
      mainRecipeId: "r",
      name: "Complete Pasta",
      components: [
        {
          componentId: "main",
          role: "main",
          name: "Complete Pasta",
          relationship: "intrinsic",
          source: "main_recipe",
          reason: "Main",
          quantityMode: "recipe_defined",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:pasta",
          nutritionOwnership: "independent",
        },
        {
          componentId: "need",
          role: "vegetable",
          name: "Provides a fresh acidic crunch",
          relationship: "recommended",
          source: "existing_recipe_component",
          reason: "optional freshness",
          quantityMode: "solver_determined",
          definitionKind: "atomic_food",
          normalizedComponentKey: "vegetable:provides a fresh",
          nutritionOwnership: "independent",
        },
      ],
      compositionProfile: {
        hasPrimaryProtein: true,
        hasMeaningfulCarbohydrate: true,
        hasMeaningfulVegetableOrFruit: true,
        hasMeaningfulFiberSource: true,
        hasSauceOrMoistureComponent: true,
        addedComponentRoles: [],
      },
      metadata: {
        promptVersion: "meal-composition-v3",
        policyVersion: "meal-composition-v2",
        createdAt: new Date().toISOString(),
      },
    };
    expect(validateCompleteMealStructure(meal).ok).toBe(false);
    expect(buildCoefficientsFromCompleteMeal({ meal }).ok).toBe(false);
  });

  it("C: one edible food can satisfy multiple needs without cloning food", async () => {
    const recipe = makeChickenTikkaResolvedRecipe({
      recipeId: "recipe-nebula",
      candidateId: "novel-nebula-grill",
      name: "Nebula Charred Halloumi",
      mealComponents: [
        {
          componentId: "main",
          name: "Nebula Charred Halloumi",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
        {
          componentId: "n1",
          name: "Adds freshness",
          type: "vegetable_side",
          required: false,
          purpose: "Adds freshness",
          relationship: "recommended_side",
          kind: "culinary_need",
        },
        {
          componentId: "n2",
          name: "Provides acidity",
          type: "vegetable_side",
          required: false,
          purpose: "Provides acidity",
          relationship: "optional",
          kind: "culinary_need",
        },
      ],
    });
    const detected = detectExistingMealRoles(recipe);
    expect(detected.culinaryNeeds).toHaveLength(2);
    expect(detected.existingComponents.filter((c) => c.role !== "main")).toHaveLength(0);

    const provider = new MockMealCompositionProvider({
      "novel-nebula-grill": {
        mealName: "Nebula plate",
        mealUnderstanding: {
          mealForm: "main_only",
          isStandaloneMeal: false,
          dishSummary: "Grill needing one salad",
          howItIsEaten: "With salad",
          existingComponents: [{ name: recipe.name, role: "main", integration: "integrated_in_dish" }],
          satisfiedNeeds: ["protein_structure"],
          missingNeeds: ["fresh_vegetable_accompaniment"],
          additionsRecommended: true,
          confidence: "high",
        },
        alreadySatisfiedRoles: ["main"],
        missingRoles: ["vegetable", "carbohydrate"],
        addedComponents: [
          {
            name: "Tomato-Cucumber-Lemon Salad",
            role: "vegetable",
            relationship: "required_companion",
            reason: "Fresh acidic salad",
            culinaryReason: "One salad covers freshness and acidity",
            satisfiesMissingNeed: "fresh_vegetable_accompaniment",
            definitionKind: "recipe_component",
          },
          {
            name: "basmati rice",
            role: "carbohydrate",
            relationship: "required_companion",
            reason: "starch",
            culinaryReason: "starch",
            satisfiesMissingNeed: "carbohydrate_accompaniment",
            definitionKind: "atomic_food",
          },
        ],
        compositionSummary: "Halloumi with one salad and rice",
      },
    });

    const composed = await composeMealConcept(
      {
        mealType: "lunch",
        recipe,
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
      },
      { provider },
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    const veg = composed.value.components.filter((c) => c.role === "vegetable");
    expect(veg).toHaveLength(1);
    expect(veg[0]!.name).toBe("Tomato-Cucumber-Lemon Salad");
  });

  it("E: optional unused need leaves no component", () => {
    const recipe = makeChickenTikkaResolvedRecipe({
      recipeId: "recipe-optional",
      candidateId: "novel-optional-bread",
      name: "Already Complete Stew",
      ingredients: [
        {
          ingredientId: "beef",
          name: "beef",
          quantity: 400,
          unit: "g",
          role: "protein",
          scalingBehavior: "primary_scalable",
        },
        {
          ingredientId: "potato",
          name: "potato",
          quantity: 300,
          unit: "g",
          role: "carbohydrate",
          scalingBehavior: "primary_scalable",
        },
        {
          ingredientId: "carrot",
          name: "carrot",
          quantity: 200,
          unit: "g",
          role: "vegetable",
          scalingBehavior: "secondary_scalable",
        },
      ],
      mealComponents: [
        {
          componentId: "main",
          name: "Already Complete Stew",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
        {
          componentId: "bread-need",
          name: "Something to mop up the gravy",
          type: "carb_side",
          required: false,
          purpose: "Optional bread accompaniment",
          relationship: "optional",
        },
      ],
    });
    const detected = detectExistingMealRoles(recipe);
    expect(detected.culinaryNeeds.some((n) => /mop|gravy|bread/i.test(n.purpose))).toBe(true);
    expect(detected.existingComponents.every((c) => !/mop|Something to/i.test(c.name))).toBe(true);
  });

  it("F: concrete existing edible side is retained", () => {
    const recipe = makeChickenTikkaResolvedRecipe({
      recipeId: "recipe-concrete",
      candidateId: "novel-concrete-salad",
      name: "Grill Plate",
      mealComponents: [
        {
          componentId: "main",
          name: "Grill Plate",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
        {
          componentId: "salad",
          name: "Lemon-Dressed Arugula Salad",
          type: "vegetable_side",
          required: false,
          purpose: "Fresh salad companion",
          relationship: "recommended_side",
          kind: "edible_component",
        },
      ],
    });
    const detected = detectExistingMealRoles(recipe);
    expect(detected.culinaryNeeds).toHaveLength(0);
    expect(detected.existingComponents.some((c) => c.name === "Lemon-Dressed Arugula Salad")).toBe(
      true,
    );
  });
});
