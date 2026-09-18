import { describe, expect, it } from "vitest";
import type {
  CompleteMeal,
  CulinaryDiscoveryCandidate,
  RankedWeeklyStrategy,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import {
  assessMealExecutability,
  assessWeeklyPlanExecutability,
  buildCompleteMealFromSpecs,
  lemonHerbChickenCompleteMeal,
  makeResolvedRecipeFixture,
  MAX_EXECUTABLE_REPLACEMENT_ROUNDS,
  recordExecutabilityFailures,
  replaceFailedCandidatesInStrategy,
} from "../index";
import { makeRankedCandidate } from "../planning/ranked-weekly-strategy-fixtures";
import { plan008SimpleWeeklyStrategy } from "../recipes/recipe-resolution-fixtures";

function syntheticCandidate(id: string, name: string): CulinaryDiscoveryCandidate {
  return {
    candidateId: id,
    name,
    cuisineFamily: "Testlandia",
    regionalStyle: null,
    flavorFamilies: ["savory"],
    primaryProtein: "protein",
    dishFormat: "plate",
    textureTags: ["tender"],
    cookingTechniques: ["roast"],
    experienceTags: ["comforting"],
    whyItIsInteresting: "synthetic test candidate",
    fitnessAdaptability: "easy",
    fitnessAdaptabilityReason: "portion scalable",
    mealPrepAdaptability: "component_prepped",
    noveltyReason: "unseen synthetic structure",
    discoveryConfidence: "medium",
    source: { name: "Synthetic", url: "https://example.test/recipe" },
  };
}

function mainOnlyMeal(candidateId: string, name: string): CompleteMeal {
  const { meal } = buildCompleteMealFromSpecs({
    mealId: `meal-${candidateId}`,
    candidateId,
    name,
    components: [
      {
        componentId: "main",
        name,
        role: "main",
        nutrition: {
          caloriesKcal: 400,
          proteinGrams: 35,
          carbohydrateGrams: 20,
          fatGrams: 18,
        },
        referenceYieldGrams: 220,
        baseServings: 1,
      },
    ],
  });
  return meal;
}

function recipeFor(candidate: CulinaryDiscoveryCandidate): ResolvedRecipe {
  return makeResolvedRecipeFixture(candidate);
}

describe("generic meal executability gate", () => {
  it("Test A — arbitrary main with no recipe fails executability", () => {
    const meal = mainOnlyMeal("cand-x-nebula", "Zesty Nebula Protein Plate");
    const result = assessMealExecutability({
      candidateId: "cand-x-nebula",
      completeMeal: meal,
      recipe: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MAIN_RECIPE_UNRESOLVED");
  });

  it("Test C — required compound side unresolved fails", () => {
    const candidate = syntheticCandidate("cand-side-fail", "Orbital Bean Stew");
    const { meal, componentNutritionByKey } = buildCompleteMealFromSpecs({
      mealId: "meal-side-fail",
      candidateId: candidate.candidateId,
      name: candidate.name,
      components: [
        {
          componentId: "main",
          name: candidate.name,
          role: "main",
          nutrition: {
            caloriesKcal: 380,
            proteinGrams: 28,
            carbohydrateGrams: 40,
            fatGrams: 12,
          },
          referenceYieldGrams: 300,
        },
        {
          componentId: "side",
          name: "Crystal Herb Flatbread",
          role: "carbohydrate",
          relationship: "required_companion",
          nutrition: {
            caloriesKcal: 0,
            proteinGrams: 0,
            carbohydrateGrams: 0,
            fatGrams: 0,
          },
          referenceYieldGrams: 80,
        },
      ],
    });
    // Force required side into unresolved state without trusted nutrition key.
    meal.components = meal.components.map((c) =>
      c.componentId === "side"
        ? {
            ...c,
            resolution: { status: "unresolved", note: "synthetic unresolved side" },
            definition: undefined,
          }
        : c,
    );
    const keyed = { ...componentNutritionByKey };
    delete keyed["carbohydrate:crystal herb flatbread"];

    const result = assessMealExecutability({
      candidateId: candidate.candidateId,
      completeMeal: meal,
      recipe: recipeFor(candidate),
      componentNutritionByKey: keyed,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect([
      "REQUIRED_COMPONENT_UNRESOLVED",
      "AUTHORITATIVE_NUTRITION_UNRESOLVED",
      "EDIBLE_IDENTITY_UNRESOLVED",
      "INCOMPLETE_MEAL_NUTRITION",
    ]).toContain(result.error.code);
  });

  it("Test D — missing authoritative nutrition fails", () => {
    const candidate = syntheticCandidate("cand-no-nutrition", "Quartz Millet Bowl");
    const meal = mainOnlyMeal(candidate.candidateId, candidate.name);
    const recipe = {
      ...recipeFor(candidate),
      nutrition: undefined,
    };
    const result = assessMealExecutability({
      candidateId: candidate.candidateId,
      completeMeal: meal,
      recipe,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AUTHORITATIVE_NUTRITION_UNRESOLVED");
  });

  it("Test E — required companion without trusted nutrition/yield basis fails", () => {
    const candidate = syntheticCandidate("cand-no-yield", "Prism Lentil Bake");
    const { meal, componentNutritionByKey } = buildCompleteMealFromSpecs({
      mealId: "meal-no-yield",
      candidateId: candidate.candidateId,
      name: candidate.name,
      components: [
        {
          componentId: "main",
          name: candidate.name,
          role: "main",
          nutrition: {
            caloriesKcal: 420,
            proteinGrams: 30,
            carbohydrateGrams: 45,
            fatGrams: 14,
          },
          referenceYieldGrams: 280,
        },
        {
          componentId: "veg",
          name: "Charred Aurora Greens",
          role: "vegetable",
          relationship: "required_companion",
          nutrition: {
            caloriesKcal: 60,
            proteinGrams: 3,
            carbohydrateGrams: 8,
            fatGrams: 2,
          },
          referenceYieldGrams: 120,
        },
      ],
    });
    meal.components = meal.components.map((c) => {
      if (c.componentId !== "veg") return c;
      return {
        ...c,
        definition: undefined,
        resolution: { status: "unresolved", note: "missing yield and nutrition" },
      };
    });
    const keyed = { ...componentNutritionByKey };
    delete keyed["vegetable:charred aurora greens"];

    const result = assessMealExecutability({
      candidateId: candidate.candidateId,
      completeMeal: meal,
      recipe: recipeFor(candidate),
      componentNutritionByKey: keyed,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect([
      "REQUIRED_COMPONENT_UNRESOLVED",
      "AUTHORITATIVE_NUTRITION_UNRESOLVED",
      "REFERENCE_YIELD_UNRESOLVED",
      "INCOMPLETE_MEAL_NUTRITION",
    ]).toContain(result.error.code);
  });

  it("Test F — culinary need / purpose text is not executable", () => {
    const candidate = syntheticCandidate("cand-need", "Ion Grilled Fish");
    const { meal } = buildCompleteMealFromSpecs({
      mealId: "meal-need",
      candidateId: candidate.candidateId,
      name: candidate.name,
      components: [
        {
          componentId: "main",
          name: candidate.name,
          role: "main",
          nutrition: {
            caloriesKcal: 350,
            proteinGrams: 40,
            carbohydrateGrams: 5,
            fatGrams: 16,
          },
          referenceYieldGrams: 200,
        },
        {
          componentId: "need",
          name: "Absorbs delicious lemon-wine pan sauce",
          role: "carbohydrate",
          relationship: "required_companion",
          nutrition: {
            caloriesKcal: 100,
            proteinGrams: 2,
            carbohydrateGrams: 20,
            fatGrams: 1,
          },
          referenceYieldGrams: 80,
        },
      ],
    });
    const result = assessMealExecutability({
      candidateId: candidate.candidateId,
      completeMeal: meal,
      recipe: recipeFor(candidate),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("EDIBLE_IDENTITY_UNRESOLVED");
  });

  it("Test G — recommended non-edible need is omitted; main remains executable", () => {
    const candidate = syntheticCandidate("cand-optional", "Comet Chicken Skillet");
    const { meal, componentNutritionByKey } = buildCompleteMealFromSpecs({
      mealId: "meal-optional",
      candidateId: candidate.candidateId,
      name: candidate.name,
      components: [
        {
          componentId: "main",
          name: candidate.name,
          role: "main",
          nutrition: {
            caloriesKcal: 410,
            proteinGrams: 36,
            carbohydrateGrams: 18,
            fatGrams: 20,
          },
          referenceYieldGrams: 240,
        },
        {
          componentId: "extra",
          name: "Something fresh for contrast",
          role: "vegetable",
          relationship: "recommended",
          nutrition: {
            caloriesKcal: 0,
            proteinGrams: 0,
            carbohydrateGrams: 0,
            fatGrams: 0,
          },
        },
      ],
    });
    const result = assessMealExecutability({
      candidateId: candidate.candidateId,
      completeMeal: meal,
      recipe: recipeFor(candidate),
      componentNutritionByKey,
    });
    expect(result.ok).toBe(true);
  });

  it("selected edible companion without nutrition makes meal non-executable", () => {
    const candidate = syntheticCandidate("cand-selected-side", "Nova Paneer Scramble");
    const { meal, componentNutritionByKey } = buildCompleteMealFromSpecs({
      mealId: "meal-selected-side",
      candidateId: candidate.candidateId,
      name: candidate.name,
      components: [
        {
          componentId: "main",
          name: candidate.name,
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
            caloriesKcal: 0,
            proteinGrams: 0,
            carbohydrateGrams: 0,
            fatGrams: 0,
          },
        },
      ],
    });
    meal.components = meal.components.map((c) =>
      c.componentId === "added-0-carbohydrate"
        ? {
            ...c,
            definition: undefined,
            resolution: { status: "unresolved", note: "selected but unresolved" },
            nutritionOwnership: "independent",
          }
        : c,
    );
    const keyed = { ...componentNutritionByKey };
    delete keyed["carbohydrate:whole wheat roti"];

    const result = assessMealExecutability({
      candidateId: candidate.candidateId,
      completeMeal: meal,
      recipe: recipeFor(candidate),
      componentNutritionByKey: keyed,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect([
      "AUTHORITATIVE_NUTRITION_UNRESOLVED",
      "REQUIRED_COMPONENT_UNRESOLVED",
      "INCOMPLETE_MEAL_NUTRITION",
      "EDIBLE_IDENTITY_UNRESOLVED",
    ]).toContain(result.error.code);
  });

  it("executable lemon-herb fixture passes the same gate", () => {
    const { meal, componentNutritionByKey } = lemonHerbChickenCompleteMeal();
    const candidate = syntheticCandidate(meal.candidateId, meal.name);
    const result = assessMealExecutability({
      candidateId: meal.candidateId,
      completeMeal: meal,
      recipe: recipeFor(candidate),
      componentNutritionByKey,
    });
    expect(result.ok).toBe(true);
  });
});

describe("bounded candidate replacement", () => {
  it("Test B — failed candidate A is replaced by ranked candidate B", () => {
    const a = syntheticCandidate("cand-a-fail", "Candidate A Unresolved");
    const b = syntheticCandidate("cand-b-ok", "Candidate B Executable");
    const c = syntheticCandidate("cand-c-dinner", "Candidate C Dinner");
    const lunchPool = [makeRankedCandidate(a, 1), makeRankedCandidate(b, 2)];
    const dinnerPool = [makeRankedCandidate(c, 1)];

    const base = plan008SimpleWeeklyStrategy();
    const strategy: RankedWeeklyStrategy = {
      ...base,
      uniqueCandidateIds: [a.candidateId, c.candidateId],
      days: base.days.map((day) => ({
        ...day,
        lunch: {
          ...day.lunch,
          candidateId: a.candidateId,
          name: a.name,
        },
        dinner: {
          ...day.dinner,
          candidateId: c.candidateId,
          name: c.name,
        },
      })),
    };

    const failed = new Set<string>();
    const replaced = replaceFailedCandidatesInStrategy({
      strategy,
      failures: [
        {
          code: "MAIN_RECIPE_UNRESOLVED",
          message: "A has no recipe",
          candidateId: a.candidateId,
        },
      ],
      lunchPool,
      dinnerPool,
      failedCandidateIds: failed,
    });

    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.replacements).toHaveLength(1);
    expect(replaced.replacements[0]!.replacementCandidateId).toBe(b.candidateId);
    expect(replaced.strategy.days.every((d) => d.lunch.candidateId === b.candidateId)).toBe(
      true,
    );
    expect(replaced.failedCandidateIds.has(a.candidateId)).toBe(true);
  });

  it("Test H — repeated candidate failure recovers coherently across slots", () => {
    const a = syntheticCandidate("cand-repeat-fail", "Echo Stew");
    const b = syntheticCandidate("cand-repeat-ok", "Stable Stew");
    const lunchPool = [makeRankedCandidate(a, 1), makeRankedCandidate(b, 2)];
    const base = plan008SimpleWeeklyStrategy();
    const strategy: RankedWeeklyStrategy = {
      ...base,
      uniqueCandidateIds: [a.candidateId],
      days: base.days.map((day) => ({
        ...day,
        lunch: { ...day.lunch, candidateId: a.candidateId, name: a.name },
        dinner: { ...day.dinner, candidateId: a.candidateId, name: a.name },
      })),
    };

    // Dinner pool must also contain B for dinner-slot replacement.
    const dinnerPool = [makeRankedCandidate(a, 1), makeRankedCandidate(b, 2)];
    const replaced = replaceFailedCandidatesInStrategy({
      strategy,
      failures: [
        {
          code: "MAIN_RECIPE_UNRESOLVED",
          message: "unresolved",
          candidateId: a.candidateId,
        },
      ],
      lunchPool,
      dinnerPool,
      failedCandidateIds: new Set(),
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    const lunchIds = new Set(replaced.strategy.days.map((d) => d.lunch.candidateId));
    const dinnerIds = new Set(replaced.strategy.days.map((d) => d.dinner.candidateId));
    expect(lunchIds.has(a.candidateId)).toBe(false);
    expect(dinnerIds.has(a.candidateId)).toBe(false);
    expect(lunchIds.has(b.candidateId)).toBe(true);
    expect(dinnerIds.has(b.candidateId)).toBe(true);
  });

  it("Test I — exhausted replacements return typed failure", () => {
    const a = syntheticCandidate("cand-only", "Lone Unresolved Dish");
    const lunchPool = [makeRankedCandidate(a, 1)];
    const dinnerPool = [makeRankedCandidate(a, 1)];
    const base = plan008SimpleWeeklyStrategy();
    const strategy: RankedWeeklyStrategy = {
      ...base,
      uniqueCandidateIds: [a.candidateId],
      days: base.days.map((day) => ({
        ...day,
        lunch: { ...day.lunch, candidateId: a.candidateId, name: a.name },
        dinner: { ...day.dinner, candidateId: a.candidateId, name: a.name },
      })),
    };

    const replaced = replaceFailedCandidatesInStrategy({
      strategy,
      failures: [
        {
          code: "MAIN_RECIPE_UNRESOLVED",
          message: "no recipe",
          candidateId: a.candidateId,
        },
      ],
      lunchPool,
      dinnerPool,
      failedCandidateIds: new Set([a.candidateId]),
    });
    expect(replaced.ok).toBe(false);
    if (replaced.ok) return;
    expect(replaced.code).toBe("EXECUTABLE_REPLACEMENT_EXHAUSTED");
  });

  it("never reselects a candidate already marked failed", () => {
    const a = syntheticCandidate("cand-fail-1", "Fail One");
    const b = syntheticCandidate("cand-fail-2", "Fail Two");
    const c = syntheticCandidate("cand-ok-3", "Ok Three");
    const lunchPool = [
      makeRankedCandidate(a, 1),
      makeRankedCandidate(b, 2),
      makeRankedCandidate(c, 3),
    ];
    const base = plan008SimpleWeeklyStrategy();
    const strategy: RankedWeeklyStrategy = {
      ...base,
      uniqueCandidateIds: [a.candidateId],
      days: base.days.map((day) => ({
        ...day,
        lunch: { ...day.lunch, candidateId: a.candidateId, name: a.name },
      })),
    };
    const failed = recordExecutabilityFailures(new Set(), [
      { code: "MAIN_RECIPE_UNRESOLVED", message: "x", candidateId: b.candidateId },
    ]);
    const replaced = replaceFailedCandidatesInStrategy({
      strategy,
      failures: [
        { code: "MAIN_RECIPE_UNRESOLVED", message: "a", candidateId: a.candidateId },
      ],
      lunchPool,
      dinnerPool: lunchPool,
      failedCandidateIds: failed,
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.replacements[0]!.replacementCandidateId).toBe(c.candidateId);
    expect(MAX_EXECUTABLE_REPLACEMENT_ROUNDS).toBeGreaterThan(0);
  });
});

describe("novel synthetic candidates share one gate", () => {
  it("three unseen structures fail different prerequisites via the same assessor", () => {
    const cases = [
      {
        id: "novel-void-main",
        name: "Voidfire Tempeh Lattice",
        mutate: (meal: CompleteMeal) => meal,
        recipe: null as ResolvedRecipe | null,
        expectCode: "MAIN_RECIPE_UNRESOLVED",
      },
      {
        id: "novel-purpose-side",
        name: "Glacial Kelp Medallions",
        mutate: (meal: CompleteMeal) => {
          meal.components.push({
            componentId: "purpose",
            role: "vegetable",
            name: "Provides fresh acidity and crunch",
            relationship: "required_companion",
            source: "composition_engine",
            reason: "synthetic need",
            quantityMode: "solver_determined",
            definitionKind: "atomic_food",
            normalizedComponentKey: "vegetable:provides fresh acidity and crunch",
            nutritionOwnership: "independent",
          });
          return meal;
        },
        recipe: "with" as const,
        expectCode: "EDIBLE_IDENTITY_UNRESOLVED",
      },
      {
        id: "novel-no-macros",
        name: "Sapphire Farro Crown",
        mutate: (meal: CompleteMeal) => meal,
        recipe: "no-nutrition" as const,
        expectCode: "AUTHORITATIVE_NUTRITION_UNRESOLVED",
      },
    ] as const;

    for (const testCase of cases) {
      const candidate = syntheticCandidate(testCase.id, testCase.name);
      let meal = mainOnlyMeal(candidate.candidateId, candidate.name);
      meal = testCase.mutate(meal);
      let recipe: ResolvedRecipe | null = null;
      if (testCase.recipe === "with") recipe = recipeFor(candidate);
      if (testCase.recipe === "no-nutrition") {
        recipe = { ...recipeFor(candidate), nutrition: undefined };
      }
      const result = assessMealExecutability({
        candidateId: candidate.candidateId,
        completeMeal: meal,
        recipe,
      });
      expect(result.ok, testCase.id).toBe(false);
      if (!result.ok) {
        expect(result.error.code, testCase.id).toBe(testCase.expectCode);
      }
    }
  });

  it("weekly assessment separates executable from failed unique candidates", () => {
    const ok = syntheticCandidate("weekly-ok", "Weekly Ok Dish");
    const bad = syntheticCandidate("weekly-bad", "Weekly Bad Dish");
    const okMeal = mainOnlyMeal(ok.candidateId, ok.name);
    const badMeal = mainOnlyMeal(bad.candidateId, bad.name);
    const assessment = assessWeeklyPlanExecutability({
      uniqueCandidateIds: [ok.candidateId, bad.candidateId],
      completeMealsByCandidateId: {
        [ok.candidateId]: okMeal,
        [bad.candidateId]: badMeal,
      },
      recipesByCandidateId: {
        [ok.candidateId]: recipeFor(ok),
      },
    });
    expect(assessment.executableCandidateIds).toEqual([ok.candidateId]);
    expect(assessment.failures).toHaveLength(1);
    expect(assessment.failures[0]!.code).toBe("MAIN_RECIPE_UNRESOLVED");
  });
});
