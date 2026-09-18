import { describe, expect, it } from "vitest";
import type { ConsumerMealSlot } from "@fitness-autopilot/contracts";
import {
  assertCoefficientOwnersMatchIndependentEdibles,
  assertConsumerMealNutritionIntegrity,
  buildCoefficientsFromCompleteMeal,
  buildCompleteMealFromSpecs,
  fillMissingMealNutritionFromRecipes,
  listIndependentEdibleOwners,
  makeResolvedRecipeFixture,
} from "../index";
import type { CulinaryDiscoveryCandidate } from "@fitness-autopilot/contracts";

function candidate(id: string, name: string): CulinaryDiscoveryCandidate {
  return {
    candidateId: id,
    name,
    cuisineFamily: "Synthetic",
    regionalStyle: null,
    primaryProtein: "protein",
    dishFormat: "plate",
    flavorFamilies: ["savory"],
    cookingTechniques: ["roast"],
    textureTags: ["tender"],
    experienceTags: ["warming"],
    whyItIsInteresting: "novel structural fixture",
    fitnessAdaptability: "easy",
    fitnessAdaptabilityReason: "scalable",
    mealPrepAdaptability: "component_prepped",
    noveltyReason: "unseen structure",
    discoveryConfidence: "medium",
    source: { name: "Synthetic", url: "https://example.test/x" },
  };
}

describe("canonical meal integrity — structural matrix", () => {
  it("A — single composite owner", () => {
    const { meal, componentNutritionByKey } = buildCompleteMealFromSpecs({
      mealId: "m-a",
      candidateId: "cand-a",
      name: "Umbral Millet Stew",
      components: [
        {
          componentId: "main",
          name: "Umbral Millet Stew",
          role: "main",
          nutrition: {
            caloriesKcal: 500,
            proteinGrams: 28,
            carbohydrateGrams: 60,
            fatGrams: 16,
          },
          referenceYieldGrams: 400,
        },
      ],
    });
    // Mark as standalone composite with parent-owned child that must not count.
    meal.mealUnderstanding = {
      mealForm: "complete_composite",
      isStandaloneMeal: true,
      dishSummary: "complete stew",
      howItIsEaten: "as one bowl",
      existingComponents: [{ name: "Umbral Millet Stew", integration: "integrated_in_dish" }],
      satisfiedNeeds: ["protein_structure", "carbohydrate_accompaniment"],
      missingNeeds: [],
      additionsRecommended: false,
      confidence: "high",
    };
    meal.components.push({
      componentId: "child",
      role: "carbohydrate",
      name: "millet grains",
      relationship: "intrinsic",
      source: "existing_recipe_component",
      reason: "intrinsic",
      quantityMode: "recipe_defined",
      definitionKind: "atomic_food",
      normalizedComponentKey: "carbohydrate:millet grains",
      nutritionOwnership: "parent_owned",
    });
    const owners = listIndependentEdibleOwners(meal);
    expect(owners).toHaveLength(1);
    expect(owners[0]!.role).toBe("main");

    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      recipesByCandidateId: {
        [meal.candidateId]: makeResolvedRecipeFixture(candidate(meal.candidateId, meal.name)),
      },
      componentNutritionByKey,
    });
    expect(coeffs.ok).toBe(true);
    if (!coeffs.ok) return;
    expect(assertCoefficientOwnersMatchIndependentEdibles({ meal, coefficients: coeffs.components }).ok).toBe(
      true,
    );
  });

  it("B — multiple independent components", () => {
    const { meal, componentNutritionByKey } = buildCompleteMealFromSpecs({
      mealId: "m-b",
      candidateId: "cand-b",
      name: "Zephyr Spiced Protein",
      components: [
        {
          componentId: "main",
          name: "Zephyr Spiced Protein",
          role: "main",
          nutrition: {
            caloriesKcal: 320,
            proteinGrams: 40,
            carbohydrateGrams: 6,
            fatGrams: 14,
          },
          referenceYieldGrams: 200,
        },
        {
          componentId: "c1",
          name: "Basmati Rice",
          role: "carbohydrate",
          nutrition: {
            caloriesKcal: 200,
            proteinGrams: 4,
            carbohydrateGrams: 44,
            fatGrams: 1,
          },
          referenceYieldGrams: 150,
        },
        {
          componentId: "c2",
          name: "Kachumber",
          role: "vegetable",
          nutrition: {
            caloriesKcal: 40,
            proteinGrams: 1,
            carbohydrateGrams: 8,
            fatGrams: 0,
          },
          referenceYieldGrams: 100,
          nutritionPer100g: {
            caloriesKcal: 40,
            proteinGrams: 1,
            carbohydrateGrams: 8,
            fatGrams: 0,
          },
        },
        {
          componentId: "c3",
          name: "Mint Yogurt Chutney",
          role: "sauce_condiment",
          nutrition: {
            caloriesKcal: 60,
            proteinGrams: 3,
            carbohydrateGrams: 4,
            fatGrams: 3,
          },
          referenceYieldGrams: 40,
        },
      ],
    });
    expect(listIndependentEdibleOwners(meal)).toHaveLength(4);
    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      recipesByCandidateId: {
        [meal.candidateId]: makeResolvedRecipeFixture(candidate(meal.candidateId, meal.name)),
      },
      componentNutritionByKey,
    });
    expect(coeffs.ok).toBe(true);
    if (!coeffs.ok) return;
    expect(coeffs.components).toHaveLength(4);
    expect(assertCoefficientOwnersMatchIndependentEdibles({ meal, coefficients: coeffs.components }).ok).toBe(
      true,
    );
  });

  it("C — parent-owned children do not get coefficients", () => {
    const { meal, componentNutritionByKey } = buildCompleteMealFromSpecs({
      mealId: "m-c",
      candidateId: "cand-c",
      name: "Cascade Fish Bowl",
      components: [
        {
          componentId: "main",
          name: "Cascade Fish Bowl",
          role: "main",
          nutrition: {
            caloriesKcal: 620,
            proteinGrams: 42,
            carbohydrateGrams: 55,
            fatGrams: 22,
          },
          referenceYieldGrams: 500,
        },
      ],
    });
    meal.components.push({
      componentId: "rice",
      role: "carbohydrate",
      name: "bowl rice",
      relationship: "intrinsic",
      source: "existing_recipe_component",
      reason: "intrinsic",
      quantityMode: "recipe_defined",
      definitionKind: "atomic_food",
      normalizedComponentKey: "carbohydrate:bowl rice",
      nutritionOwnership: "parent_owned",
    });
    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      recipesByCandidateId: {
        [meal.candidateId]: makeResolvedRecipeFixture(candidate(meal.candidateId, meal.name)),
      },
      componentNutritionByKey,
    });
    expect(coeffs.ok).toBe(true);
    if (!coeffs.ok) return;
    expect(coeffs.components.every((c) => c.componentId !== "rice")).toBe(true);
  });

  it("D/E — selected edible companion must have owner; unselected option absent from meal", () => {
    const { meal, componentNutritionByKey } = buildCompleteMealFromSpecs({
      mealId: "m-d",
      candidateId: "cand-d",
      name: "Ember Paneer Hash",
      components: [
        {
          componentId: "main",
          name: "Ember Paneer Hash",
          role: "main",
          nutrition: {
            caloriesKcal: 255,
            proteinGrams: 17,
            carbohydrateGrams: 4.5,
            fatGrams: 18.8,
          },
          referenceYieldGrams: 180,
        },
        {
          componentId: "added-0-carbohydrate",
          name: "Whole Wheat Roti",
          role: "carbohydrate",
          relationship: "recommended",
          source: "composition_engine",
          nutrition: {
            caloriesKcal: 120,
            proteinGrams: 4,
            carbohydrateGrams: 22,
            fatGrams: 2,
          },
          referenceYieldGrams: 50,
          discrete: true,
          nutritionPer100g: {
            caloriesKcal: 240,
            proteinGrams: 8,
            carbohydrateGrams: 44,
            fatGrams: 4,
          },
        },
      ],
    });
    // Pav was considered but never selected onto CompleteMeal.
    expect(meal.components.every((c) => !/pav/i.test(c.name))).toBe(true);
    expect(listIndependentEdibleOwners(meal).map((c) => c.name)).toEqual([
      "Ember Paneer Hash",
      "Whole Wheat Roti",
    ]);

    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      recipesByCandidateId: {
        [meal.candidateId]: makeResolvedRecipeFixture(candidate(meal.candidateId, meal.name)),
      },
      componentNutritionByKey,
    });
    expect(coeffs.ok).toBe(true);
    if (!coeffs.ok) return;
    expect(coeffs.components.some((c) => c.displayName === "Whole Wheat Roti")).toBe(true);
    expect(assertCoefficientOwnersMatchIndependentEdibles({ meal, coefficients: coeffs.components }).ok).toBe(
      true,
    );
  });

  it("F — culinary need never becomes independent owner", () => {
    const { meal } = buildCompleteMealFromSpecs({
      mealId: "m-f",
      candidateId: "cand-f",
      name: "Ion Grilled Fish",
      components: [
        {
          componentId: "main",
          name: "Ion Grilled Fish",
          role: "main",
          nutrition: {
            caloriesKcal: 300,
            proteinGrams: 35,
            carbohydrateGrams: 2,
            fatGrams: 16,
          },
          referenceYieldGrams: 180,
        },
      ],
    });
    meal.components.push({
      componentId: "need",
      role: "vegetable",
      name: "Provides fresh acidity and crunch",
      relationship: "recommended",
      source: "composition_engine",
      reason: "need",
      quantityMode: "solver_determined",
      definitionKind: "atomic_food",
      normalizedComponentKey: "vegetable:provides fresh acidity and crunch",
      nutritionOwnership: "independent",
    });
    expect(listIndependentEdibleOwners(meal).every((c) => c.componentId !== "need")).toBe(true);
  });

  it("K/L — unresolved selected side fails coefficients and ownership bijection", () => {
    const { meal, componentNutritionByKey } = buildCompleteMealFromSpecs({
      mealId: "m-k",
      candidateId: "cand-k",
      name: "Prism Lentil Cake",
      components: [
        {
          componentId: "main",
          name: "Prism Lentil Cake",
          role: "main",
          nutrition: {
            caloriesKcal: 380,
            proteinGrams: 22,
            carbohydrateGrams: 40,
            fatGrams: 12,
          },
          referenceYieldGrams: 250,
        },
        {
          componentId: "side",
          name: "Charred Aurora Greens",
          role: "vegetable",
          relationship: "required_companion",
          nutrition: {
            caloriesKcal: 50,
            proteinGrams: 2,
            carbohydrateGrams: 6,
            fatGrams: 2,
          },
          referenceYieldGrams: 100,
        },
      ],
    });
    meal.components = meal.components.map((c) =>
      c.componentId === "side"
        ? {
            ...c,
            definition: undefined,
            resolution: { status: "unresolved" as const, note: "missing" },
          }
        : c,
    );
    const keyed = { ...componentNutritionByKey };
    delete keyed["vegetable:charred aurora greens"];
    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      recipesByCandidateId: {
        [meal.candidateId]: makeResolvedRecipeFixture(candidate(meal.candidateId, meal.name)),
      },
      componentNutritionByKey: keyed,
    });
    expect(coeffs.ok).toBe(false);
  });

  it("O — UI-only component with LLM personalized nutrition fails integrity", () => {
    const slot: ConsumerMealSlot = {
      day: "monday",
      mealType: "lunch",
      candidateId: "cand-o",
      name: "Ember Paneer Hash",
      prepIntent: "fresh",
      components: [
        { componentId: "main", displayName: "Ember Paneer Hash", role: "main" },
        { componentId: "roti", displayName: "Whole Wheat Roti", role: "carbohydrate" },
      ],
      personalizedNutrition: {
        caloriesKcal: 255,
        proteinGrams: 17,
        carbsGrams: 4.5,
        fatGrams: 18.8,
      },
      personalizationStatus: "best_feasible",
      personalizationMessage:
        "Macros from recipe.nutrition (llm_estimate); portion solver did not personalize this plate.",
    };
    const result = assertConsumerMealNutritionIntegrity(slot);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("LLM_ESTIMATE_AS_PERSONALIZED");
  });

  it("P — fillMissingMealNutritionFromRecipes is a no-op (no LLM personalized fill)", () => {
    const slot: ConsumerMealSlot = {
      day: "monday",
      mealType: "lunch",
      candidateId: "cand-p",
      name: "Voidfire Tempeh",
      prepIntent: "fresh",
      components: [{ componentId: "main", displayName: "Voidfire Tempeh", role: "main" }],
      personalizationStatus: "blocked",
    };
    const recipe = makeResolvedRecipeFixture(candidate("cand-p", "Voidfire Tempeh"));
    const filled = fillMissingMealNutritionFromRecipes([slot], { "cand-p": recipe });
    expect(filled[0]!.personalizedNutrition).toBeUndefined();
    expect(filled[0]!.personalizationStatus).toBe("blocked");
  });
});

describe("novel unseen meal structures", () => {
  const novels = [
    {
      id: "novel-1",
      name: "Cobalt Ginger Tofu Lattice",
      sides: ["Sesame Cucumber Ribbons"],
    },
    {
      id: "novel-2",
      name: "Amber Duck Confit Flakes",
      sides: ["Buckwheat Crepe", "Pickled Quince Slaw"],
    },
    {
      id: "novel-3",
      name: "Verdant Chickpea Steam Pot",
      sides: [] as string[],
    },
    {
      id: "novel-4",
      name: "Saffron Clam Broth Plate",
      sides: ["Grilled Sourdough Heel"],
    },
    {
      id: "novel-5",
      name: "Obsidian Black Bean Tamale Cake",
      sides: ["Charred Corn Relish", "Lime Crema"],
    },
  ] as const;

  for (const novel of novels) {
    it(`${novel.id} — independent owners match coefficients`, () => {
      const components = [
        {
          componentId: "main",
          name: novel.name,
          role: "main" as const,
          nutrition: {
            caloriesKcal: 400,
            proteinGrams: 30,
            carbohydrateGrams: 20,
            fatGrams: 18,
          },
          referenceYieldGrams: 220,
        },
        ...novel.sides.map((side, i) => ({
          componentId: `side-${i}`,
          name: side,
          role: (i === 0 && /crepe|bread|heel|tamale/i.test(side)
            ? "carbohydrate"
            : /crema|relish|sauce/i.test(side)
              ? "sauce_condiment"
              : "vegetable") as "carbohydrate" | "vegetable" | "sauce_condiment",
          nutrition: {
            caloriesKcal: 80 + i * 10,
            proteinGrams: 2,
            carbohydrateGrams: 12,
            fatGrams: 2,
          },
          referenceYieldGrams: 80,
          nutritionPer100g: {
            caloriesKcal: 100,
            proteinGrams: 2,
            carbohydrateGrams: 15,
            fatGrams: 2,
          },
        })),
      ];
      const { meal, componentNutritionByKey } = buildCompleteMealFromSpecs({
        mealId: `meal-${novel.id}`,
        candidateId: novel.id,
        name: novel.name,
        components,
      });
      const owners = listIndependentEdibleOwners(meal);
      expect(owners).toHaveLength(1 + novel.sides.length);
      const coeffs = buildCoefficientsFromCompleteMeal({
        meal,
        recipesByCandidateId: {
          [novel.id]: makeResolvedRecipeFixture(candidate(novel.id, novel.name)),
        },
        componentNutritionByKey,
      });
      expect(coeffs.ok).toBe(true);
      if (!coeffs.ok) return;
      expect(
        assertCoefficientOwnersMatchIndependentEdibles({ meal, coefficients: coeffs.components }).ok,
      ).toBe(true);
    });
  }
});
