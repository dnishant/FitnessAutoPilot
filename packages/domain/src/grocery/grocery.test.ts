import { describe, expect, it } from "vitest";
import type {
  CompleteMeal,
  PersonalizedWeeklyNutritionPlan,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import { GroceryListSchema } from "@fitness-autopilot/contracts";
import {
  aggregateIngredientRequirements,
  deriveGroceryList,
  formatGroceryDisplay,
  toCompatibleBasis,
} from "./index";
import type { IngredientRequirement } from "./types";

const CHICKEN_FOOD_ID = "11111111-1111-4111-8111-111111111111";
const SPINACH_FOOD_ID = "22222222-2222-4222-8222-222222222222";

function req(partial: Partial<IngredientRequirement> & Pick<IngredientRequirement, "requirementId" | "displayName" | "quantity" | "unit" | "identityKey">): IngredientRequirement {
  return {
    canonicalFoodId: null,
    sourceMealInstanceId: "meal-1",
    sourceMealInstanceIds: ["meal-1"],
    ...partial,
  };
}

function baseRecipe(overrides: Partial<ResolvedRecipe> = {}): ResolvedRecipe {
  return {
    recipeId: "rr_tikka",
    candidateId: "tikka-chicken",
    name: "Chicken Tikka",
    source: { name: "fixture", url: null, author: null },
    description: "Test recipe",
    baseServings: 4,
    ingredients: [
      {
        ingredientId: "chicken",
        name: "chicken breast",
        quantity: 800,
        unit: "g",
        role: "protein",
        scalingBehavior: "primary_scalable",
        measurementState: "raw",
      },
      {
        ingredientId: "yogurt",
        name: "yogurt",
        quantity: 200,
        unit: "g",
        role: "sauce",
        scalingBehavior: "ratio_bound",
      },
      {
        ingredientId: "cumin",
        name: "cumin",
        quantity: 1,
        unit: "tsp",
        role: "seasoning",
        scalingBehavior: "fixed",
      },
      {
        ingredientId: "water",
        name: "water",
        quantity: 100,
        unit: "ml",
        role: "other",
        scalingBehavior: "fixed",
      },
    ],
    instructions: [{ stepNumber: 1, text: "Cook" }],
    prepTimeMinutes: 15,
    cookTimeMinutes: 20,
    supportedPrepModes: [
      {
        mode: "quick_fresh_finish",
        advanceTasks: [],
        finishTasks: ["Cook"],
        finishTimeMinutes: 20,
      },
    ],
    mealComponents: [
      {
        componentId: "main",
        name: "Chicken Tikka",
        type: "main",
        required: true,
        purpose: "main",
        relationship: "intrinsic",
      },
    ],
    flavorProfile: {
      cuisineFamily: "Indian",
      flavorFamilies: ["savory"],
      cookingTechniques: ["grill"],
      textureProfile: [],
    },
    experienceProfile: {
      moistureLevel: "moderate",
      flavorIntensity: "bold",
      textureTags: [],
      mealPrepQuality: "good",
    },
    resolutionMetadata: {
      provider: "fixture",
      model: "test",
      promptVersion: "recipe-resolution-v2",
    },
    ...overrides,
  };
}

function completeMealWithSides(): CompleteMeal {
  return {
    mealId: "complete-tikka",
    candidateId: "tikka-chicken",
    mainRecipeId: "rr_tikka",
    name: "Chicken Tikka Plate",
    components: [
      {
        componentId: "main",
        role: "main",
        name: "Chicken Tikka",
        relationship: "intrinsic",
        source: "main_recipe",
        reason: "main",
        quantityMode: "solver_determined",
        definitionKind: "recipe_component",
        normalizedComponentKey: "main:chicken tikka",
        nutritionOwnership: "independent",
      },
      {
        componentId: "rice",
        role: "carbohydrate",
        name: "Basmati Rice",
        relationship: "required_companion",
        source: "composition_engine",
        reason: "carb",
        quantityMode: "solver_determined",
        definitionKind: "atomic_food",
        normalizedComponentKey: "carbohydrate:basmati rice",
        nutritionOwnership: "independent",
        definition: {
          kind: "atomic_food",
          name: "Basmati Rice",
          measurementState: "cooked",
        },
      },
      {
        componentId: "chutney",
        role: "sauce_condiment",
        name: "Mint Yogurt Chutney",
        relationship: "required_companion",
        source: "composition_engine",
        reason: "sauce",
        quantityMode: "solver_determined",
        definitionKind: "recipe_component",
        normalizedComponentKey: "sauce:chutney",
        nutritionOwnership: "independent",
        definition: {
          kind: "recipe_component",
          name: "Mint Yogurt Chutney",
          baseServings: 1,
          ingredients: [
            { name: "plain yogurt", quantity: 120, unit: "g" },
            { name: "mint leaves", quantity: 20, unit: "g" },
            { name: "cumin", quantity: 0.5, unit: "tsp" },
          ],
        },
      },
      {
        componentId: "pav",
        role: "carbohydrate",
        name: "Pav",
        relationship: "recommended",
        source: "composition_engine",
        reason: "unselected alternative — must not appear in portions",
        quantityMode: "solver_determined",
        definitionKind: "atomic_food",
        normalizedComponentKey: "carbohydrate:pav",
        nutritionOwnership: "independent",
        definition: { kind: "atomic_food", name: "Pav", measurementState: "as_purchased" },
      },
    ],
    compositionProfile: {
      hasPrimaryProtein: true,
      hasMeaningfulCarbohydrate: true,
      hasMeaningfulVegetableOrFruit: false,
      hasMeaningfulFiberSource: false,
      hasSauceOrMoistureComponent: true,
      addedComponentRoles: ["carbohydrate", "sauce_condiment"],
    },
    metadata: {
      promptVersion: "meal-composition-v2",
      policyVersion: "meal-composition-v1",
      createdAt: "2026-09-18T00:00:00.000Z",
    },
  };
}

function finalizedPlan(input: {
  meals: PersonalizedWeeklyNutritionPlan["days"][0]["meals"];
}): PersonalizedWeeklyNutritionPlan {
  return {
    generatedPlanId: "plan_test_012",
    weekStart: "2026-09-14",
    weekEnd: "2026-09-20",
    dailyTarget: {
      caloriesKcal: 2200,
      proteinGrams: 160,
      carbsGrams: 220,
      fatGrams: 70,
      fiberGrams: 30,
    },
    allocationPolicyVersion: "nutrition-allocation-policy-v1",
    portionPolicyVersion: "meal-portion-policy-v1",
    personalizationVersion: "weekly-nutrition-personalization-v1",
    days: [
      {
        day: "monday",
        budget: {
          target: {
            caloriesKcal: 2200,
            proteinGrams: 160,
            carbsGrams: 220,
            fatGrams: 70,
            fiberGrams: 30,
          },
          reservedNutrition: {
            caloriesKcal: 660,
            proteinGrams: 48,
          },
          lunchIntent: { targetCaloriesKcal: 770, targetProteinGrams: 56 },
          dinnerIntent: { targetCaloriesKcal: 770, targetProteinGrams: 56 },
          allocationPolicyVersion: "nutrition-allocation-policy-v1",
        },
        meals: input.meals,
        reservedNutrition: { caloriesKcal: 660, proteinGrams: 48 },
        status: "solved",
      },
    ],
    status: "solved",
    mealInstanceCount: input.meals.length,
    solvedMealCount: input.meals.length,
    bestFeasibleMealCount: 0,
    blockedMealCount: 0,
    generatedAt: "2026-09-18T00:00:00.000Z",
    finalization: {
      finalizedAt: "2026-09-18T00:00:00.000Z",
      validationPolicyVersion: "nutrition-validation-policy-v1",
      validationStatus: "finalized",
      repairAttempts: 0,
    },
  };
}

function mealInstance(input: {
  mealInstanceId: string;
  day?: PersonalizedWeeklyNutritionPlan["days"][0]["day"];
  portions: PersonalizedWeeklyNutritionPlan["days"][0]["meals"][0]["personalizedPlan"] extends infer P
    ? P extends { portions: infer Portions }
      ? Portions
      : never
    : never;
}): PersonalizedWeeklyNutritionPlan["days"][0]["meals"][0] {
  return {
    mealInstanceId: input.mealInstanceId,
    day: input.day ?? "monday",
    mealType: "lunch",
    candidateId: "tikka-chicken",
    completeMealId: "complete-tikka",
    mealName: "Chicken Tikka",
    nutritionIntent: { targetCaloriesKcal: 700, targetProteinGrams: 50 },
    status: "solved",
    personalizedPlan: {
      mealId: input.mealInstanceId,
      mealName: "Chicken Tikka",
      sourceCompleteMealId: "complete-tikka",
      portions: input.portions,
      nutrition: {
        caloriesKcal: 700,
        proteinGrams: 50,
        carbsGrams: 60,
        fatGrams: 20,
      },
      intent: { targetCaloriesKcal: 700, targetProteinGrams: 50 },
      status: "solved",
      diagnostics: {
        status: "solved",
        variables: [],
        policyVersion: "meal-portion-policy-v1",
        solverVersion: "meal-portion-solver-v1",
      },
      policyVersion: "meal-portion-policy-v1",
      solverVersion: "meal-portion-solver-v1",
      generatedAt: "2026-09-18T00:00:00.000Z",
    },
  };
}

describe("PLAN-012 grocery units", () => {
  it("aggregates compatible mass units", () => {
    const a = toCompatibleBasis(500, "g");
    const b = toCompatibleBasis(0.5, "kg");
    expect(a.ok && a.family === "mass" && a.grams).toBe(500);
    expect(b.ok && b.family === "mass" && b.grams).toBe(500);
  });

  it("aggregates tsp + tbsp as volume without inventing grams", () => {
    const a = toCompatibleBasis(1, "tsp");
    const b = toCompatibleBasis(1, "tbsp");
    expect(a.ok && a.family === "volume").toBe(true);
    expect(b.ok && b.family === "volume" && b.teaspoons).toBe(3);
  });

  it("formats display separately from required quantity", () => {
    const display = formatGroceryDisplay({ quantity: 1360.78, unit: "g" });
    expect(display.displayUnit).toBe("lb");
    expect(display.displayLabel.startsWith("~")).toBe(true);
  });

  it("does not round tiny spice amounts to zero", () => {
    const display = formatGroceryDisplay({ quantity: 0.5, unit: "tsp" });
    expect(display.displayQuantity).toBeGreaterThan(0);
  });
});

describe("PLAN-012 aggregateIngredientRequirements", () => {
  it("aggregates same ingredient across recipes (§53)", () => {
    const { items } = aggregateIngredientRequirements([
      req({
        requirementId: "a",
        identityKey: `food:${CHICKEN_FOOD_ID}|raw`,
        canonicalFoodId: CHICKEN_FOOD_ID,
        displayName: "chicken breast",
        quantity: 750,
        unit: "g",
        measurementState: "raw",
      }),
      req({
        requirementId: "b",
        identityKey: `food:${CHICKEN_FOOD_ID}|raw`,
        canonicalFoodId: CHICKEN_FOOD_ID,
        displayName: "chicken breast",
        quantity: 600,
        unit: "g",
        measurementState: "raw",
        sourceMealInstanceId: "meal-2",
        sourceMealInstanceIds: ["meal-2"],
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(1350);
    expect(items[0]!.unit).toBe("g");
  });

  it("preserves incompatible units without fabricating conversion (§54)", () => {
    const { items, reconciliation } = aggregateIngredientRequirements([
      req({
        requirementId: "a",
        identityKey: `food:${SPINACH_FOOD_ID}|raw`,
        canonicalFoodId: SPINACH_FOOD_ID,
        displayName: "spinach",
        quantity: 100,
        unit: "g",
      }),
      req({
        requirementId: "b",
        identityKey: `food:${SPINACH_FOOD_ID}|raw`,
        canonicalFoodId: SPINACH_FOOD_ID,
        displayName: "spinach",
        quantity: 2,
        unit: "cups",
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.quantities.length).toBeGreaterThanOrEqual(2);
    expect(reconciliation.incompatibleQuantityLineCount).toBeGreaterThanOrEqual(0);
    const units = items[0]!.quantities.map((q) => q.unit);
    expect(units).toContain("g");
  });

  it("aggregates spice tsp quantities (§61)", () => {
    const key = "name:cumin|unknown";
    const { items } = aggregateIngredientRequirements([
      req({ requirementId: "1", identityKey: key, displayName: "cumin", quantity: 0.5, unit: "tsp" }),
      req({ requirementId: "2", identityKey: key, displayName: "cumin", quantity: 1, unit: "tsp" }),
      req({ requirementId: "3", identityKey: key, displayName: "cumin", quantity: 0.25, unit: "tsp" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.quantities[0]!.requiredQuantity).toBeCloseTo(1.75, 5);
    expect(items[0]!.quantities[0]!.unit).toBe("tsp");
  });

  it("excludes non-purchased water via policy", () => {
    const { items, reconciliation } = aggregateIngredientRequirements([
      req({
        requirementId: "w",
        identityKey: "name:water|unknown",
        displayName: "water",
        quantity: 200,
        unit: "ml",
        excludedAsNonPurchased: true,
      }),
      req({
        requirementId: "s",
        identityKey: "name:salt|unknown",
        displayName: "salt",
        quantity: 1,
        unit: "tsp",
      }),
    ]);
    expect(items.map((i) => i.displayName)).toEqual(["salt"]);
    expect(reconciliation.excludedNonPurchasedCount).toBe(1);
  });
});

describe("PLAN-012 deriveGroceryList", () => {
  it("aggregates repeated recipe demand before expanding (§52)", () => {
    const recipe = baseRecipe();
    const meals = [
      mealInstance({
        mealInstanceId: "plan:monday:lunch",
        portions: [
          {
            componentId: "main",
            displayName: "Chicken Tikka",
            role: "main",
            amount: 2.5,
            unit: "servings",
            personalServings: 2.5,
            nutrition: {
              caloriesKcal: 500,
              proteinGrams: 40,
              carbohydrateGrams: 10,
              fatGrams: 20,
            },
          },
        ],
      }),
      mealInstance({
        mealInstanceId: "plan:wednesday:lunch",
        day: "wednesday",
        portions: [
          {
            componentId: "main",
            displayName: "Chicken Tikka",
            role: "main",
            amount: 1,
            unit: "servings",
            personalServings: 1,
            nutrition: {
              caloriesKcal: 200,
              proteinGrams: 16,
              carbohydrateGrams: 4,
              fatGrams: 8,
            },
          },
        ],
      }),
    ];

    // Multi-day plan helper — flatten into one day for simplicity by overriding days.
    const plan = finalizedPlan({ meals });
    plan.days = [
      { ...plan.days[0]!, day: "monday", meals: [meals[0]!] },
      { ...plan.days[0]!, day: "wednesday", meals: [meals[1]!] },
    ];

    const result = deriveGroceryList({
      personalizedWeeklyPlan: plan,
      recipesByCandidateId: { "tikka-chicken": recipe },
      completeMealsByCandidateId: { "tikka-chicken": completeMealWithSides() },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const chicken = result.groceryList.sections
      .flatMap((s) => s.items)
      .find((i) => /chicken/i.test(i.displayName));
    expect(chicken).toBeTruthy();
    // 3.5 servings / 4 baseServings * 800g = 700g
    expect(chicken!.quantity).toBeCloseTo(700, 5);

    const water = result.groceryList.sections
      .flatMap((s) => s.items)
      .find((i) => /^water$/i.test(i.displayName));
    expect(water).toBeUndefined();

    const cumin = result.groceryList.sections
      .flatMap((s) => s.items)
      .find((i) => /cumin/i.test(i.displayName));
    expect(cumin).toBeTruthy();

    expect(GroceryListSchema.safeParse(result.groceryList).success).toBe(true);
    expect(result.groceryList.diagnostics?.droppedRequirementCount).toBe(0);
  });

  it("includes selected sides and excludes unselected alternatives (§56)", () => {
    const recipe = baseRecipe();
    const plan = finalizedPlan({
      meals: [
        mealInstance({
          mealInstanceId: "plan:monday:lunch",
          portions: [
            {
              componentId: "main",
              displayName: "Chicken Tikka",
              role: "main",
              amount: 1,
              unit: "servings",
              personalServings: 1,
              nutrition: {
                caloriesKcal: 265,
                proteinGrams: 38,
                carbohydrateGrams: 3,
                fatGrams: 10,
              },
            },
            {
              componentId: "rice",
              displayName: "Basmati Rice",
              role: "carbohydrate",
              amount: 180,
              unit: "g",
              nutrition: {
                caloriesKcal: 230,
                proteinGrams: 5,
                carbohydrateGrams: 50,
                fatGrams: 1,
              },
            },
            {
              componentId: "chutney",
              displayName: "Mint Yogurt Chutney",
              role: "sauce_condiment",
              amount: 1,
              unit: "servings",
              personalServings: 1,
              nutrition: {
                caloriesKcal: 45,
                proteinGrams: 3,
                carbohydrateGrams: 3,
                fatGrams: 2,
              },
            },
            // Pav intentionally absent — unselected
          ],
        }),
      ],
    });

    const result = deriveGroceryList({
      personalizedWeeklyPlan: plan,
      recipesByCandidateId: { "tikka-chicken": recipe },
      completeMealsByCandidateId: { "tikka-chicken": completeMealWithSides() },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.groceryList.sections.flatMap((s) => s.items.map((i) => i.displayName));
    expect(names.some((n) => /basmati|rice/i.test(n))).toBe(true);
    expect(names.some((n) => /mint|yogurt/i.test(n))).toBe(true);
    expect(names.some((n) => /^pav$/i.test(n))).toBe(false);
  });

  it("supports fixed atomic foods (§60)", () => {
    const bananaMeal: CompleteMeal = {
      ...completeMealWithSides(),
      mealId: "complete-banana",
      candidateId: "banana-snack",
      name: "Banana",
      components: [
        {
          componentId: "banana",
          role: "fruit",
          name: "Banana",
          relationship: "intrinsic",
          source: "composition_engine",
          reason: "fruit",
          quantityMode: "solver_determined",
          definitionKind: "atomic_food",
          normalizedComponentKey: "fruit:banana",
          nutritionOwnership: "independent",
          definition: { kind: "atomic_food", name: "Banana", measurementState: "as_purchased" },
        },
      ],
    };

    const bananaRecipe = baseRecipe({
      recipeId: "rr_banana",
      candidateId: "banana-snack",
      name: "Banana",
      baseServings: 1,
      ingredients: [
        {
          ingredientId: "banana",
          name: "banana",
          quantity: 1,
          unit: "piece",
          role: "other",
          scalingBehavior: "fixed",
        },
      ],
    });

    const meals = [1, 2, 3, 4].map((n) =>
      mealInstance({
        mealInstanceId: `plan:day${n}:lunch`,
        portions: [
          {
            componentId: "banana",
            displayName: "Banana",
            role: "fruit",
            amount: 1,
            unit: "piece",
            nutrition: {
              caloriesKcal: 90,
              proteinGrams: 1,
              carbohydrateGrams: 23,
              fatGrams: 0.3,
            },
          },
        ],
      }),
    );
    for (const m of meals) {
      m.candidateId = "banana-snack";
      m.completeMealId = "complete-banana";
      m.mealName = "Banana";
    }

    const plan = finalizedPlan({ meals: [meals[0]!] });
    plan.days = meals.map((m, i) => ({
      ...plan.days[0]!,
      day: (["monday", "tuesday", "wednesday", "thursday"] as const)[i]!,
      meals: [m],
    }));

    const result = deriveGroceryList({
      personalizedWeeklyPlan: plan,
      recipesByCandidateId: { "banana-snack": bananaRecipe },
      completeMealsByCandidateId: { "banana-snack": bananaMeal },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const banana = result.groceryList.sections
      .flatMap((s) => s.items)
      .find((i) => /banana/i.test(i.displayName));
    expect(banana?.quantity).toBe(4);
  });

  it("is deterministic / idempotent (§33)", () => {
    const recipe = baseRecipe();
    const plan = finalizedPlan({
      meals: [
        mealInstance({
          mealInstanceId: "plan:monday:lunch",
          portions: [
            {
              componentId: "main",
              displayName: "Chicken Tikka",
              role: "main",
              amount: 1.2,
              unit: "servings",
              personalServings: 1.2,
              nutrition: {
                caloriesKcal: 300,
                proteinGrams: 40,
                carbohydrateGrams: 5,
                fatGrams: 12,
              },
            },
          ],
        }),
      ],
    });
    const input = {
      personalizedWeeklyPlan: plan,
      recipesByCandidateId: { "tikka-chicken": recipe },
      completeMealsByCandidateId: { "tikka-chicken": completeMealWithSides() },
    };
    const a = deriveGroceryList(input);
    const b = deriveGroceryList(input);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.groceryList).toEqual(b.groceryList);
  });

  it("rejects non-finalized plans", () => {
    const plan = finalizedPlan({ meals: [] });
    delete plan.finalization;
    const result = deriveGroceryList({
      personalizedWeeklyPlan: plan,
      recipesByCandidateId: {},
      completeMealsByCandidateId: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MISSING_FINALIZED_PLAN");
  });
});
