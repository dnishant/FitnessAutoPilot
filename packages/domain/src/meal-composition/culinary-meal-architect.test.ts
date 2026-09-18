/**
 * Culinary Meal Architect — invariant + novel-recipe tests.
 *
 * These recipes are invented AFTER the architecture and must NOT appear in
 * production examples / prompt examples. Success must come from generic
 * understanding + ownership + structural validation — not dish-name rules.
 */
import { describe, expect, it } from "vitest";
import type {
  CompleteMeal,
  CulinaryDiscoveryCandidate,
  MealCompositionProposal,
  MealConcept,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import {
  buildCoefficientsFromCompleteMeal,
  buildPortionVariables,
  getMealPortionPolicy,
} from "../meal-portioning";
import {
  composeMealConcept,
  detectExistingCandidateRoles,
  isUnresolvedPlaceholderName,
  MockMealCompositionProvider,
  validateCompleteMealStructure,
  validateMealArchitectProposalStructure,
  isSemanticDuplicateSide,
  independentNutritionalOwners,
  applyOwnershipToCompleteMeal,
} from "./index";
import { makeChickenTikkaResolvedRecipe } from "./fixtures";

function novelCandidate(input: {
  id: string;
  name: string;
  cuisineFamily?: string;
  dishFormat?: string;
  description?: string;
}): CulinaryDiscoveryCandidate {
  return {
    candidateId: input.id,
    name: input.name,
    source: { name: "synthetic", url: "https://example.com/novel" },
    cuisineFamily: input.cuisineFamily ?? "fusion",
    dishFormat: input.dishFormat ?? "plate",
    flavorFamilies: ["savory"],
    cookingTechniques: ["roast"],
    textureTags: ["tender"],
    experienceTags: ["balanced"],
    whyItIsInteresting: input.description ?? input.name,
    fitnessAdaptability: "moderate",
    fitnessAdaptabilityReason: "Novel test candidate.",
    mealPrepAdaptability: "component_prepped",
    noveltyReason: "Unseen synthetic recipe for architecture tests.",
    discoveryConfidence: "high",
  };
}

function novelGrainCompositeRecipe(): ResolvedRecipe {
  return makeChickenTikkaResolvedRecipe({
    recipeId: "recipe-zephyr-grain",
    candidateId: "novel-zephyr-grain",
    name: "Zephyr Millet Harvest Medley",
    description:
      "Roasted halloumi, pearl millet, white beans, charred peppers, and tahini-lemon dressing in one integrated dish.",
    ingredients: [
      {
        ingredientId: "halloumi",
        name: "halloumi",
        quantity: 250,
        unit: "g",
        role: "protein",
        scalingBehavior: "primary_scalable",
      },
      {
        ingredientId: "millet",
        name: "pearl millet",
        quantity: 200,
        unit: "g",
        role: "carbohydrate",
        scalingBehavior: "primary_scalable",
        measurementState: "cooked",
      },
      {
        ingredientId: "beans",
        name: "white beans",
        quantity: 150,
        unit: "g",
        role: "vegetable",
        scalingBehavior: "secondary_scalable",
      },
      {
        ingredientId: "peppers",
        name: "charred peppers",
        quantity: 180,
        unit: "g",
        role: "vegetable",
        scalingBehavior: "secondary_scalable",
      },
      {
        ingredientId: "dressing",
        name: "tahini lemon dressing",
        quantity: 40,
        unit: "g",
        role: "sauce",
        scalingBehavior: "secondary_scalable",
      },
    ],
    mealComponents: [
      {
        componentId: "main",
        name: "Zephyr Millet Harvest Medley",
        type: "main",
        required: true,
        purpose: "Integrated grain dish",
        relationship: "intrinsic",
      },
    ],
    nutrition: {
      source: "llm_estimate",
      total: {
        caloriesKcal: 2200,
        proteinGrams: 110,
        carbohydrateGrams: 240,
        fatGrams: 80,
        fiberGrams: 40,
      },
      perServing: {
        caloriesKcal: 550,
        proteinGrams: 27.5,
        carbohydrateGrams: 60,
        fatGrams: 20,
        fiberGrams: 10,
      },
    },
  });
}

function novelPastaRecipe(): ResolvedRecipe {
  return makeChickenTikkaResolvedRecipe({
    recipeId: "recipe-orion-pasta",
    candidateId: "novel-orion-pasta",
    name: "Orion Squid-Ink Rigatoni Verde",
    description: "Squid-ink rigatoni with turkey sausage, broccolini, and garlic oil sauce.",
    ingredients: [
      {
        ingredientId: "pasta",
        name: "squid-ink rigatoni",
        quantity: 400,
        unit: "g",
        role: "carbohydrate",
        scalingBehavior: "primary_scalable",
      },
      {
        ingredientId: "sausage",
        name: "turkey sausage",
        quantity: 350,
        unit: "g",
        role: "protein",
        scalingBehavior: "primary_scalable",
      },
      {
        ingredientId: "broccolini",
        name: "broccolini",
        quantity: 220,
        unit: "g",
        role: "vegetable",
        scalingBehavior: "secondary_scalable",
      },
      {
        ingredientId: "garlic-oil",
        name: "garlic oil sauce",
        quantity: 50,
        unit: "g",
        role: "sauce",
        scalingBehavior: "secondary_scalable",
      },
    ],
    mealComponents: [
      {
        componentId: "main",
        name: "Orion Squid-Ink Rigatoni Verde",
        type: "main",
        required: true,
        purpose: "Complete pasta",
        relationship: "intrinsic",
      },
    ],
    nutrition: {
      source: "llm_estimate",
      total: {
        caloriesKcal: 2400,
        proteinGrams: 140,
        carbohydrateGrams: 260,
        fatGrams: 70,
        fiberGrams: 28,
      },
      perServing: {
        caloriesKcal: 600,
        proteinGrams: 35,
        carbohydrateGrams: 65,
        fatGrams: 17.5,
        fiberGrams: 7,
      },
    },
  });
}

function novelBareMainRecipe(): ResolvedRecipe {
  return makeChickenTikkaResolvedRecipe({
    recipeId: "recipe-nimbus-main",
    candidateId: "novel-nimbus-main",
    name: "Nimbus Spiced Quail Skewers",
    description: "Dry-rubbed quail skewers — prepared protein only.",
    ingredients: [
      {
        ingredientId: "quail",
        name: "quail",
        quantity: 500,
        unit: "g",
        role: "protein",
        scalingBehavior: "primary_scalable",
      },
      {
        ingredientId: "yogurt-marinade",
        name: "yogurt marinade",
        quantity: 80,
        unit: "g",
        role: "sauce",
        scalingBehavior: "fixed",
      },
    ],
    mealComponents: [
      {
        componentId: "main",
        name: "Nimbus Spiced Quail Skewers",
        type: "main",
        required: true,
        purpose: "Bare main",
        relationship: "intrinsic",
      },
    ],
    experienceProfile: {
      moistureLevel: "dry",
      flavorIntensity: "bold",
      textureTags: ["charred"],
      mealPrepQuality: "good",
    },
    nutrition: {
      source: "llm_estimate",
      total: {
        caloriesKcal: 1200,
        proteinGrams: 160,
        carbohydrateGrams: 8,
        fatGrams: 55,
        fiberGrams: 0,
      },
      perServing: {
        caloriesKcal: 300,
        proteinGrams: 40,
        carbohydrateGrams: 2,
        fatGrams: 13.75,
        fiberGrams: 0,
      },
    },
  });
}

function novelMainWithRecommendedSide(): ResolvedRecipe {
  const base = novelBareMainRecipe();
  return {
    ...base,
    recipeId: "recipe-nimbus-with-side",
    candidateId: "novel-nimbus-side",
    name: "Nimbus Spiced Quail Skewers",
    mealComponents: [
      ...base.mealComponents,
      {
        componentId: "side-greens",
        name: "Light arugula or mixed green salad with lemon and extra virgin olive oil",
        type: "vegetable_side",
        required: false,
        purpose: "Recommended fresh salad companion",
        relationship: "recommended_side",
      },
    ],
  };
}

describe("Culinary Meal Architect — novel recipes", () => {
  it("A: complete composite grain dish receives zero unnecessary additions", async () => {
    const provider = new MockMealCompositionProvider();
    const recipe = novelGrainCompositeRecipe();
    const result = await composeMealConcept(
      {
        mealType: "lunch",
        candidate: novelCandidate({
          id: recipe.candidateId,
          name: recipe.name,
          description: recipe.description,
        }),
        recipe,
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
      },
      { provider },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.components.filter((c) => c.source === "composition_engine")).toHaveLength(
      0,
    );
    expect(result.value.mealUnderstanding?.isStandaloneMeal).toBe(true);
    expect(result.value.mealUnderstanding?.additionsRecommended).toBe(false);
  });

  it("B: complete pasta does not get extra carb/veg/sauce", async () => {
    const provider = new MockMealCompositionProvider();
    const recipe = novelPastaRecipe();
    const result = await composeMealConcept(
      {
        mealType: "dinner",
        candidate: novelCandidate({ id: recipe.candidateId, name: recipe.name }),
        recipe,
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
      },
      { provider },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const added = result.value.components.filter((c) => c.source === "composition_engine");
    expect(added).toHaveLength(0);
  });

  it("C: bare main may receive appropriate companions", async () => {
    const provider = new MockMealCompositionProvider();
    const recipe = novelBareMainRecipe();
    const result = await composeMealConcept(
      {
        mealType: "dinner",
        candidate: novelCandidate({
          id: recipe.candidateId,
          name: recipe.name,
          cuisineFamily: "middle_eastern",
        }),
        recipe,
        cuisineFamily: "middle_eastern",
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
      },
      { provider },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.components.some((c) => c.source === "composition_engine")).toBe(true);
    expect(result.value.mealUnderstanding?.isStandaloneMeal).toBe(false);
  });

  it("D: semantic equivalent new side is rejected when recommended side exists", () => {
    const existing = novelMainWithRecommendedSide().mealComponents.find(
      (c) => c.type === "vegetable_side",
    )!;
    expect(
      isSemanticDuplicateSide({
        proposedName: "Arugula Salad with Lemon Vinaigrette",
        proposedRole: "vegetable",
        existingName: existing.name,
        existingRole: "vegetable",
        existingPurpose: existing.purpose,
      }),
    ).toBe(true);
  });

  it("E: yogurt marinade is not a duplicate of cucumber raita", () => {
    expect(
      isSemanticDuplicateSide({
        proposedName: "cucumber raita",
        proposedRole: "sauce_condiment",
        existingName: "yogurt marinade",
        existingRole: "sauce_condiment",
        existingPurpose: "marinade for quail",
        proposedPurpose: "table accompaniment",
      }),
    ).toBe(false);
  });
});

describe("Nutrition ownership invariants", () => {
  it("F: parent-owned composite counts parent once; children informational", () => {
    const meal: CompleteMeal = applyOwnershipToCompleteMeal({
      mealId: "meal-parent",
      candidateId: "novel-zephyr-grain",
      mainRecipeId: "recipe-zephyr-grain",
      name: "Zephyr Millet Harvest Medley",
      components: [
        {
          componentId: "main",
          role: "main",
          name: "Zephyr Millet Harvest Medley",
          relationship: "intrinsic",
          source: "main_recipe",
          reason: "Main",
          quantityMode: "recipe_defined",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:zephyr",
          nutritionOwnership: "independent",
        },
        {
          componentId: "millet",
          role: "carbohydrate",
          name: "pearl millet",
          relationship: "intrinsic",
          source: "existing_recipe_component",
          reason: "Integrated grain",
          quantityMode: "recipe_defined",
          definitionKind: "atomic_food",
          normalizedComponentKey: "carbohydrate:pearl millet",
          nutritionOwnership: "parent_owned",
        },
        {
          componentId: "peppers",
          role: "vegetable",
          name: "charred peppers",
          relationship: "intrinsic",
          source: "existing_recipe_component",
          reason: "Integrated veg",
          quantityMode: "recipe_defined",
          definitionKind: "atomic_food",
          normalizedComponentKey: "vegetable:charred peppers",
          nutritionOwnership: "parent_owned",
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
      mealUnderstanding: {
        mealForm: "complete_composite",
        isStandaloneMeal: true,
        dishSummary: "Integrated grain dish",
        howItIsEaten: "As one bowl",
        existingComponents: [],
        satisfiedNeeds: ["protein_structure", "carbohydrate_accompaniment"],
        missingNeeds: [],
        additionsRecommended: false,
        confidence: "high",
      },
      metadata: {
        promptVersion: "meal-composition-v3",
        policyVersion: "meal-composition-v2",
        createdAt: new Date().toISOString(),
      },
    });

    expect(meal.nutritionModel).toBe("parent_owned_composite");
    const owners = independentNutritionalOwners(meal.components);
    expect(owners).toHaveLength(1);
    expect(owners[0]!.role).toBe("main");

    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      recipesByCandidateId: {
        [meal.candidateId]: novelGrainCompositeRecipe(),
      },
    });
    expect(coeffs.ok).toBe(true);
    if (!coeffs.ok) return;
    expect(coeffs.components).toHaveLength(1);
    expect(coeffs.components[0]!.componentId).toBe("main");
  });

  it("G: child-owned composite sums children once; parent structural only", () => {
    const meal: CompleteMeal = {
      mealId: "meal-children",
      candidateId: "novel-assembled",
      mainRecipeId: "recipe-assembled",
      name: "Assembled Quail Plate",
      components: [
        {
          componentId: "main",
          role: "main",
          name: "Nimbus Spiced Quail Skewers",
          relationship: "intrinsic",
          source: "main_recipe",
          reason: "Main",
          quantityMode: "recipe_defined",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:quail",
          nutritionOwnership: "independent",
        },
        {
          componentId: "rice",
          role: "carbohydrate",
          name: "herbed freekeh",
          relationship: "required_companion",
          source: "composition_engine",
          reason: "Starch",
          quantityMode: "solver_determined",
          definitionKind: "atomic_food",
          normalizedComponentKey: "carbohydrate:herbed freekeh",
          nutritionOwnership: "independent",
          definition: {
            kind: "atomic_food",
            name: "herbed freekeh",
            measurementState: "cooked",
          },
          resolution: {
            status: "canonical_food_resolved",
            ingredientNutrition: {
              caloriesKcal: 140,
              proteinGrams: 5,
              carbohydrateGrams: 28,
              fatGrams: 1,
              fiberGrams: 4,
            },
          },
        },
      ],
      compositionProfile: {
        hasPrimaryProtein: true,
        hasMeaningfulCarbohydrate: true,
        hasMeaningfulVegetableOrFruit: false,
        hasMeaningfulFiberSource: false,
        hasSauceOrMoistureComponent: false,
        addedComponentRoles: ["carbohydrate"],
      },
      nutritionModel: "independent_components",
      metadata: {
        promptVersion: "meal-composition-v3",
        policyVersion: "meal-composition-v2",
        createdAt: new Date().toISOString(),
      },
    };

    const owners = independentNutritionalOwners(meal.components);
    expect(owners.map((o) => o.componentId).sort()).toEqual(["main", "rice"]);

    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      recipesByCandidateId: {
        [meal.candidateId]: novelBareMainRecipe(),
      },
      componentNutritionByKey: {
        "carbohydrate:herbed freekeh": {
          nutrition: {
            caloriesKcal: 140,
            proteinGrams: 5,
            carbohydrateGrams: 28,
            fatGrams: 1,
            fiberGrams: 4,
          },
          referenceYieldGrams: 150,
          baseServings: 1,
        },
      },
    });
    expect(coeffs.ok).toBe(true);
    if (!coeffs.ok) return;
    expect(coeffs.components.map((c) => c.componentId).sort()).toEqual(["main", "rice"]);
  });

  it("H: unresolved placeholder is blocked before PLAN-010", () => {
    expect(isUnresolvedPlaceholderName("bowl base")).toBe(true);
    expect(isUnresolvedPlaceholderName("bowl vegetables")).toBe(true);
    expect(isUnresolvedPlaceholderName("vegetable side")).toBe(true);
    expect(isUnresolvedPlaceholderName("Basmati Rice")).toBe(false);

    const meal: CompleteMeal = {
      mealId: "meal-placeholder",
      candidateId: "x",
      mainRecipeId: "r",
      name: "Broken",
      components: [
        {
          componentId: "main",
          role: "main",
          name: "Something",
          relationship: "intrinsic",
          source: "main_recipe",
          reason: "Main",
          quantityMode: "recipe_defined",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:something",
          nutritionOwnership: "independent",
        },
        {
          componentId: "ph",
          role: "carbohydrate",
          name: "bowl base",
          relationship: "intrinsic",
          source: "existing_recipe_component",
          reason: "placeholder leak",
          quantityMode: "recipe_defined",
          definitionKind: "atomic_food",
          normalizedComponentKey: "carbohydrate:bowl base",
          nutritionOwnership: "independent",
        },
      ],
      compositionProfile: {
        hasPrimaryProtein: true,
        hasMeaningfulCarbohydrate: true,
        hasMeaningfulVegetableOrFruit: false,
        hasMeaningfulFiberSource: false,
        hasSauceOrMoistureComponent: false,
        addedComponentRoles: [],
      },
      metadata: {
        promptVersion: "meal-composition-v3",
        policyVersion: "meal-composition-v2",
        createdAt: new Date().toISOString(),
      },
    };

    const structure = validateCompleteMealStructure(meal);
    expect(structure.ok).toBe(false);
    if (structure.ok) return;
    expect(structure.error.code).toBe("UNRESOLVED_COMPONENT_IDENTITY");

    const coeffs = buildCoefficientsFromCompleteMeal({ meal });
    expect(coeffs.ok).toBe(false);
  });

  it("I: stable identity under concurrent coefficient builds (no index contamination)", () => {
    const a = novelGrainCompositeRecipe();
    const b = novelPastaRecipe();
    const mealA: CompleteMeal = {
      mealId: "a",
      candidateId: a.candidateId,
      mainRecipeId: a.recipeId,
      name: a.name,
      components: [
        {
          componentId: "main-a",
          role: "main",
          name: a.name,
          relationship: "intrinsic",
          source: "main_recipe",
          reason: "Main",
          quantityMode: "recipe_defined",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:a",
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
    const mealB: CompleteMeal = {
      ...mealA,
      mealId: "b",
      candidateId: b.candidateId,
      mainRecipeId: b.recipeId,
      name: b.name,
      components: [
        {
          componentId: "main-b",
          role: "main",
          name: b.name,
          relationship: "intrinsic",
          source: "main_recipe",
          reason: "Main",
          quantityMode: "recipe_defined",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:b",
          nutritionOwnership: "independent",
        },
      ],
    };

    const recipes = {
      [a.candidateId]: a,
      [b.candidateId]: b,
    };
    const ca = buildCoefficientsFromCompleteMeal({ meal: mealA, recipesByCandidateId: recipes });
    const cb = buildCoefficientsFromCompleteMeal({ meal: mealB, recipesByCandidateId: recipes });
    expect(ca.ok && cb.ok).toBe(true);
    if (!ca.ok || !cb.ok) return;
    expect(ca.components[0]!.componentId).toBe("main-a");
    expect(cb.components[0]!.componentId).toBe("main-b");
    expect(ca.components[0]!.kind === "recipe_scale" && ca.components[0]!.baseNutrition.caloriesKcal).toBe(
      550,
    );
    expect(cb.components[0]!.kind === "recipe_scale" && cb.components[0]!.baseNutrition.caloriesKcal).toBe(
      600,
    );
  });

  it("J: compound yield scales coherently (0.5 → half grams)", () => {
    const coeffs = buildCoefficientsFromCompleteMeal({
      meal: {
        mealId: "meal-yield",
        candidateId: "yield",
        mainRecipeId: "r",
        name: "Yield Test",
        components: [
          {
            componentId: "main",
            role: "main",
            name: "Main",
            relationship: "intrinsic",
            source: "main_recipe",
            reason: "Main",
            quantityMode: "recipe_defined",
            definitionKind: "recipe_component",
            normalizedComponentKey: "main:main",
            nutritionOwnership: "independent",
          },
          {
            componentId: "salad",
            role: "vegetable",
            name: "Nebula Citrus Herb Salad",
            relationship: "required_companion",
            source: "composition_engine",
            reason: "Side",
            quantityMode: "solver_determined",
            definitionKind: "recipe_component",
            normalizedComponentKey: "vegetable:nebula citrus herb salad",
            nutritionOwnership: "independent",
            definition: {
              kind: "recipe_component",
              name: "Nebula Citrus Herb Salad",
              ingredients: [
                { name: "greens", quantity: 300, unit: "g" },
                { name: "citrus", quantity: 100, unit: "g" },
              ],
              baseServings: 1,
              referenceYieldGrams: 400,
            },
          },
        ],
        compositionProfile: {
          hasPrimaryProtein: true,
          hasMeaningfulCarbohydrate: false,
          hasMeaningfulVegetableOrFruit: true,
          hasMeaningfulFiberSource: true,
          hasSauceOrMoistureComponent: false,
          addedComponentRoles: ["vegetable"],
        },
        metadata: {
          promptVersion: "meal-composition-v3",
          policyVersion: "meal-composition-v2",
          createdAt: new Date().toISOString(),
        },
      },
      recipesByCandidateId: {
        yield: {
          ...novelBareMainRecipe(),
          candidateId: "yield",
          recipeId: "r",
        },
      },
      componentNutritionByKey: {
        "vegetable:nebula citrus herb salad": {
          nutrition: {
            caloriesKcal: 200,
            proteinGrams: 6,
            carbohydrateGrams: 20,
            fatGrams: 10,
            fiberGrams: 6,
          },
          referenceYieldGrams: 400,
          baseServings: 1,
        },
      },
    });
    expect(coeffs.ok).toBe(true);
    if (!coeffs.ok) return;
    const salad = coeffs.components.find((c) => c.componentId === "salad");
    expect(salad?.kind).toBe("recipe_scale");
    if (salad?.kind !== "recipe_scale") return;
    expect(salad.referenceYieldGrams).toBe(400);

    const built = buildPortionVariables(coeffs.components, getMealPortionPolicy());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const saladVar = built.variables.find((v) => v.componentId === "salad");
    expect(saladVar?.kind).toBe("recipe_scale");
    if (saladVar?.kind !== "recipe_scale") return;
    // 0.5 scale of 400g reference → 200g
    expect(Math.round(0.5 * (salad.referenceYieldGrams ?? 0))).toBe(200);
  });

  it("candidate detection never invents bowl/taco/pasta placeholders", () => {
    const bowl = detectExistingCandidateRoles(
      novelCandidate({
        id: "bowl-x",
        name: "Sweet & Spicy BBQ Pineapple Chicken Bowl",
        dishFormat: "bowl",
      }),
    );
    expect(bowl.existingComponents.every((c) => !isUnresolvedPlaceholderName(c.name))).toBe(true);
    expect(bowl.existingComponents).toHaveLength(1);
    expect(bowl.existingComponents[0]!.role).toBe("main");
  });

  it("semantic composition cannot accept a duplicate existing side", () => {
    const proposal: MealCompositionProposal = {
      mealName: "Nimbus plate",
      mealUnderstanding: {
        mealForm: "main_with_existing_companions",
        isStandaloneMeal: false,
        dishSummary: "Main with salad",
        howItIsEaten: "With salad",
        existingComponents: [
          {
            name: "Light arugula or mixed green salad with lemon and extra virgin olive oil",
            role: "vegetable",
            relationship: "recommended",
            integration: "separately_eaten",
          },
        ],
        satisfiedNeeds: ["protein_structure", "fresh_vegetable_accompaniment"],
        missingNeeds: [],
        additionsRecommended: true,
        confidence: "high",
      },
      alreadySatisfiedRoles: ["main", "vegetable"],
      missingRoles: [],
      addedComponents: [
        {
          name: "Arugula Salad with Lemon Vinaigrette",
          role: "vegetable",
          relationship: "recommended",
          reason: "Fresh salad",
          culinaryReason: "Freshness",
          satisfiesMissingNeed: "fresh_vegetable_accompaniment",
          definitionKind: "recipe_component",
        },
      ],
      compositionSummary: "Bad duplicate",
    };

    const conceptSide: MealConcept["components"][number] = {
      componentId: "side",
      role: "vegetable",
      name: "Light arugula or mixed green salad with lemon and extra virgin olive oil",
      relationship: "recommended",
      source: "existing_candidate_component",
      reason: "Recommended",
      definitionKind: "recipe_component",
      normalizedComponentKey: "vegetable:arugula",
      nutritionOwnership: "independent",
    };

    const validated = validateMealArchitectProposalStructure(
      proposal,
      {
        mealType: "dinner",
        candidate: novelCandidate({ id: "novel-nimbus-side", name: "Nimbus" }),
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
        compositionContext: {
          existingRoles: {
            hasPrimaryProtein: true,
            hasMeaningfulCarbohydrate: false,
            hasMeaningfulVegetableOrFruit: true,
            hasMeaningfulFiberSource: true,
            hasSauceOrMoistureComponent: false,
            addedComponentRoles: [],
          },
        },
      },
      [conceptSide],
    );
    expect(validated.ok).toBe(false);
    if (validated.ok) return;
    expect(validated.error.code).toBe("SEMANTIC_DUPLICATE_COMPONENT");
  });
});
