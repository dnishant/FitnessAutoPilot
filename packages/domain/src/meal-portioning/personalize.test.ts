import { describe, expect, it } from "vitest";
import {
  allocateDailyNutritionBudget,
  applyDiscretePortionAdjustment,
  attachPersonalizedWeeklyPlan,
  blackenedSalmonTacosCompleteMeal,
  buildCoefficientsFromCompleteMeal,
  buildLocalDemoNutritionMaps,
  lemonHerbChickenCompleteMeal,
  personalizeWeeklyNutritionPlan,
  projectPersonalizedPlanToConsumerMeals,
  solveMealPortions,
} from "./index";
import { plan008SimpleWeeklyStrategy } from "../recipes/recipe-resolution-fixtures";
import type {
  CompleteMeal,
  ConsumerMealSlot,
  RankedWeeklyStrategy,
} from "@fitness-autopilot/contracts";

const DAILY = {
  caloriesKcal: 2200,
  proteinGrams: 160,
  carbsGrams: 220,
  fatGrams: 70,
  fiberGrams: 30,
};

function strategyWithMeals(
  lunchCandidateId: string,
  lunchName: string,
  dinnerCandidateId: string,
  dinnerName: string,
): RankedWeeklyStrategy {
  const base = plan008SimpleWeeklyStrategy();
  return {
    ...base,
    uniqueCandidateIds: [lunchCandidateId, dinnerCandidateId],
    days: base.days.map((day) => ({
      ...day,
      lunch: {
        ...day.lunch,
        candidateId: lunchCandidateId,
        name: lunchName,
      },
      dinner: {
        ...day.dinner,
        candidateId: dinnerCandidateId,
        name: dinnerName,
      },
    })),
  };
}

describe("nutrition-allocation-policy-v1", () => {
  it("reserves breakfast/snack capacity and does not assign 100% to lunch+dinner", () => {
    const budget = allocateDailyNutritionBudget(DAILY);
    expect(budget.reservedNutrition.caloriesKcal).toBe(Math.round(2200 * 0.35));
    expect(budget.lunchIntent.targetCaloriesKcal + budget.dinnerIntent.targetCaloriesKcal).toBeLessThan(
      2200,
    );
    expect(
      budget.lunchIntent.targetCaloriesKcal +
        budget.dinnerIntent.targetCaloriesKcal +
        budget.reservedNutrition.caloriesKcal,
    ).toBeGreaterThan(2100);
    expect(budget.allocationPolicyVersion).toBe("nutrition-allocation-policy-v1");
  });
});

describe("arbitrary generated meals", () => {
  it("personalizes Lemon Herb Chicken without meal-name-specific code", () => {
    const { meal, componentNutritionByKey } = lemonHerbChickenCompleteMeal();
    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      componentNutritionByKey,
      nutritionByCandidateId: {
        [meal.candidateId]: {
          recipeId: meal.mainRecipeId,
          candidateId: meal.candidateId,
          recipeName: meal.name,
          baseServings: 1,
          ingredients: [],
          mealComponents: [],
          nutrition: {
            total: meal.components[0]!.resolution?.ingredientNutrition ?? {
              caloriesKcal: 280,
              proteinGrams: 42,
              carbohydrateGrams: 2,
              fatGrams: 11,
            },
            perBaseServing: {
              caloriesKcal: 280,
              proteinGrams: 42,
              carbohydrateGrams: 2,
              fatGrams: 11,
              fiberGrams: 0,
            },
            ingredientBreakdown: [
              {
                ingredientId: "main",
                ingredientName: "Lemon Herb Chicken",
                grams: 175,
                status: "resolved",
              },
            ],
            resolutionQuality: {
              status: "complete",
              totalIngredientCount: 1,
              resolvedIngredientCount: 1,
              ambiguousIngredientCount: 0,
              unresolvedIngredientCount: 0,
              highConfidenceCount: 1,
              mediumConfidenceCount: 0,
              directMassConversionCount: 1,
              providerMeasureConversionCount: 0,
              lowConfidenceConversionCount: 0,
              pendingPortioningComponentCount: 0,
            },
          },
          resolutionQuality: {
            status: "complete",
            totalIngredientCount: 1,
            resolvedIngredientCount: 1,
            ambiguousIngredientCount: 0,
            unresolvedIngredientCount: 0,
            highConfidenceCount: 1,
            mediumConfidenceCount: 0,
            directMassConversionCount: 1,
            providerMeasureConversionCount: 0,
            lowConfidenceConversionCount: 0,
            pendingPortioningComponentCount: 0,
          },
          policyVersions: {
            foodResolution: "food-resolution-v1",
            nutritionCalculation: "nutrition-calculation-v1",
            quantityNormalization: "quantity-normalization-v1",
          },
        },
      },
    });
    expect(coeffs.ok).toBe(true);
    if (!coeffs.ok) return;

    const strategy = strategyWithMeals(
      meal.candidateId,
      meal.name,
      meal.candidateId,
      meal.name,
    );
    const personalized = personalizeWeeklyNutritionPlan({
      generatedPlanId: "plan_arbitrary_a",
      weekStart: "2026-09-14",
      weekEnd: "2026-09-20",
      strategy,
      completeMealsByCandidateId: { [meal.candidateId]: meal },
      componentNutritionByKey,
      nutritionByCandidateId: {
        [meal.candidateId]: {
          recipeId: meal.mainRecipeId,
          candidateId: meal.candidateId,
          recipeName: meal.name,
          baseServings: 1,
          ingredients: [],
          mealComponents: [],
          nutrition: {
            total: {
              caloriesKcal: 280,
              proteinGrams: 42,
              carbohydrateGrams: 2,
              fatGrams: 11,
            },
            perBaseServing: {
              caloriesKcal: 280,
              proteinGrams: 42,
              carbohydrateGrams: 2,
              fatGrams: 11,
              fiberGrams: 0,
            },
            ingredientBreakdown: [
              {
                ingredientId: "main",
                ingredientName: meal.name,
                grams: 175,
                status: "resolved",
              },
            ],
            resolutionQuality: {
              status: "complete",
              totalIngredientCount: 1,
              resolvedIngredientCount: 1,
              ambiguousIngredientCount: 0,
              unresolvedIngredientCount: 0,
              highConfidenceCount: 1,
              mediumConfidenceCount: 0,
              directMassConversionCount: 1,
              providerMeasureConversionCount: 0,
              lowConfidenceConversionCount: 0,
              pendingPortioningComponentCount: 0,
            },
          },
          resolutionQuality: {
            status: "complete",
            totalIngredientCount: 1,
            resolvedIngredientCount: 1,
            ambiguousIngredientCount: 0,
            unresolvedIngredientCount: 0,
            highConfidenceCount: 1,
            mediumConfidenceCount: 0,
            directMassConversionCount: 1,
            providerMeasureConversionCount: 0,
            lowConfidenceConversionCount: 0,
            pendingPortioningComponentCount: 0,
          },
          policyVersions: {
            foodResolution: "food-resolution-v1",
            nutritionCalculation: "nutrition-calculation-v1",
            quantityNormalization: "quantity-normalization-v1",
          },
        },
      },
      dailyTarget: DAILY,
      generatedAt: "2026-09-17T12:00:00.000Z",
    });

    expect(personalized.mealInstanceCount).toBe(12);
    expect(personalized.blockedMealCount).toBe(0);
    const mondayLunch = personalized.days[0]!.meals.find((m) => m.mealType === "lunch");
    expect(mondayLunch?.personalizedPlan?.portions.length).toBeGreaterThanOrEqual(3);
    expect(mondayLunch?.personalizedPlan?.nutrition.caloriesKcal).toBeGreaterThan(0);

    const consumerMeals = projectPersonalizedPlanToConsumerMeals({
      strategy,
      personalizedWeeklyPlan: personalized,
    });
    expect(consumerMeals[0]?.personalizedNutrition?.caloriesKcal).toBeGreaterThan(0);
    expect(consumerMeals[0]?.components.some((c) => c.amount != null)).toBe(true);
  });

  it("keeps tortillas discrete and crema tightly bounded for salmon tacos", () => {
    const { meal, componentNutritionByKey } = blackenedSalmonTacosCompleteMeal();
    const nutritionByCandidateId = {
      [meal.candidateId]: {
        recipeId: meal.mainRecipeId,
        candidateId: meal.candidateId,
        recipeName: meal.name,
        baseServings: 1,
        ingredients: [],
        mealComponents: [],
        nutrition: {
          total: {
            caloriesKcal: 250,
            proteinGrams: 36,
            carbohydrateGrams: 1,
            fatGrams: 11,
          },
          perBaseServing: {
            caloriesKcal: 250,
            proteinGrams: 36,
            carbohydrateGrams: 1,
            fatGrams: 11,
            fiberGrams: 0,
          },
          ingredientBreakdown: [
            {
              ingredientId: "main",
              ingredientName: "Blackened Salmon",
              grams: 160,
              status: "resolved" as const,
            },
          ],
          resolutionQuality: {
            status: "complete" as const,
            totalIngredientCount: 1,
            resolvedIngredientCount: 1,
            ambiguousIngredientCount: 0,
            unresolvedIngredientCount: 0,
            highConfidenceCount: 1,
            mediumConfidenceCount: 0,
            directMassConversionCount: 1,
            providerMeasureConversionCount: 0,
            lowConfidenceConversionCount: 0,
            pendingPortioningComponentCount: 0,
          },
        },
        resolutionQuality: {
          status: "complete" as const,
          totalIngredientCount: 1,
          resolvedIngredientCount: 1,
          ambiguousIngredientCount: 0,
          unresolvedIngredientCount: 0,
          highConfidenceCount: 1,
          mediumConfidenceCount: 0,
          directMassConversionCount: 1,
          providerMeasureConversionCount: 0,
          lowConfidenceConversionCount: 0,
          pendingPortioningComponentCount: 0,
        },
        policyVersions: {
          foodResolution: "food-resolution-v1" as const,
          nutritionCalculation: "nutrition-calculation-v1" as const,
          quantityNormalization: "quantity-normalization-v1" as const,
        },
      },
    };

    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      componentNutritionByKey,
      nutritionByCandidateId,
    });
    expect(coeffs.ok).toBe(true);
    if (!coeffs.ok) return;
    expect(coeffs.components.some((c) => c.kind === "count")).toBe(true);

    const solved = solveMealPortions({
      mealId: "instance-tacos",
      mealName: meal.name,
      sourceCompleteMealId: meal.mealId,
      components: coeffs.components,
      nutritionIntent: {
        targetCaloriesKcal: 650,
        targetProteinGrams: 50,
      },
      generatedAt: "2026-09-17T12:00:00.000Z",
    });
    expect(solved.status).not.toBe("blocked");
    const tortilla = solved.portions.find((p) => /tortilla/i.test(p.displayName));
    expect(tortilla).toBeTruthy();
    expect(Number.isInteger(tortilla!.amount)).toBe(true);
    const crema = solved.portions.find((p) => /crema/i.test(p.displayName));
    expect(crema).toBeTruthy();
    expect(crema!.amount).toBeGreaterThanOrEqual(25);
    expect(crema!.amount).toBeLessThanOrEqual(55);
  });
});

describe("regeneration isolation", () => {
  it("keeps Plan A and Plan B prescriptions tied to distinct generatedPlanIds", () => {
    const a = lemonHerbChickenCompleteMeal();
    const b = blackenedSalmonTacosCompleteMeal();
    const nutritionFor = (
      meal: typeof a.meal,
      perServing: {
        caloriesKcal: number;
        proteinGrams: number;
        carbohydrateGrams: number;
        fatGrams: number;
      },
      grams: number,
    ) => ({
      [meal.candidateId]: {
        recipeId: meal.mainRecipeId,
        candidateId: meal.candidateId,
        recipeName: meal.name,
        baseServings: 1,
        ingredients: [],
        mealComponents: [],
        nutrition: {
          total: perServing,
          perBaseServing: { ...perServing, fiberGrams: 0 },
          ingredientBreakdown: [
            {
              ingredientId: "main",
              ingredientName: meal.name,
              grams,
              status: "resolved" as const,
            },
          ],
          resolutionQuality: {
            status: "complete" as const,
            totalIngredientCount: 1,
            resolvedIngredientCount: 1,
            ambiguousIngredientCount: 0,
            unresolvedIngredientCount: 0,
            highConfidenceCount: 1,
            mediumConfidenceCount: 0,
            directMassConversionCount: 1,
            providerMeasureConversionCount: 0,
            lowConfidenceConversionCount: 0,
            pendingPortioningComponentCount: 0,
          },
        },
        resolutionQuality: {
          status: "complete" as const,
          totalIngredientCount: 1,
          resolvedIngredientCount: 1,
          ambiguousIngredientCount: 0,
          unresolvedIngredientCount: 0,
          highConfidenceCount: 1,
          mediumConfidenceCount: 0,
          directMassConversionCount: 1,
          providerMeasureConversionCount: 0,
          lowConfidenceConversionCount: 0,
          pendingPortioningComponentCount: 0,
        },
        policyVersions: {
          foodResolution: "food-resolution-v1" as const,
          nutritionCalculation: "nutrition-calculation-v1" as const,
          quantityNormalization: "quantity-normalization-v1" as const,
        },
      },
    });

    const strategyA = strategyWithMeals(
      a.meal.candidateId,
      a.meal.name,
      a.meal.candidateId,
      a.meal.name,
    );
    const strategyB = strategyWithMeals(
      b.meal.candidateId,
      b.meal.name,
      b.meal.candidateId,
      b.meal.name,
    );

    const planA = personalizeWeeklyNutritionPlan({
      generatedPlanId: "plan_A",
      weekStart: "2026-09-14",
      weekEnd: "2026-09-20",
      strategy: strategyA,
      completeMealsByCandidateId: { [a.meal.candidateId]: a.meal },
      componentNutritionByKey: a.componentNutritionByKey,
      nutritionByCandidateId: nutritionFor(a.meal, {
        caloriesKcal: 280,
        proteinGrams: 42,
        carbohydrateGrams: 2,
        fatGrams: 11,
      }, 175),
      dailyTarget: DAILY,
      generatedAt: "2026-09-17T12:00:00.000Z",
    });
    const planB = personalizeWeeklyNutritionPlan({
      generatedPlanId: "plan_B",
      weekStart: "2026-09-21",
      weekEnd: "2026-09-27",
      strategy: strategyB,
      completeMealsByCandidateId: { [b.meal.candidateId]: b.meal },
      componentNutritionByKey: b.componentNutritionByKey,
      nutritionByCandidateId: nutritionFor(b.meal, {
        caloriesKcal: 250,
        proteinGrams: 36,
        carbohydrateGrams: 1,
        fatGrams: 11,
      }, 160),
      dailyTarget: DAILY,
      generatedAt: "2026-09-18T12:00:00.000Z",
    });

    expect(planA.generatedPlanId).toBe("plan_A");
    expect(planB.generatedPlanId).toBe("plan_B");
    expect(planA.days[0]!.meals[0]!.mealInstanceId).toContain("plan_A");
    expect(planB.days[0]!.meals[0]!.mealInstanceId).toContain("plan_B");
    expect(planA.days[0]!.meals[0]!.candidateId).toBe(a.meal.candidateId);
    expect(planB.days[0]!.meals[0]!.candidateId).toBe(b.meal.candidateId);
    expect(planB.days[0]!.meals[0]!.candidateId).not.toBe(a.meal.candidateId);

    // Historical Plan A unchanged after Plan B generation
    expect(planA.days[0]!.meals[0]!.mealName).toBe("Lemon Herb Chicken");
  });
});

describe("repeated meals", () => {
  it("reuses identical intent prescriptions and allows different instance ids", () => {
    const { meal, componentNutritionByKey } = lemonHerbChickenCompleteMeal();
    const strategy = strategyWithMeals(
      meal.candidateId,
      meal.name,
      meal.candidateId,
      meal.name,
    );
    const nutritionByCandidateId = {
      [meal.candidateId]: {
        recipeId: meal.mainRecipeId,
        candidateId: meal.candidateId,
        recipeName: meal.name,
        baseServings: 1,
        ingredients: [],
        mealComponents: [],
        nutrition: {
          total: {
            caloriesKcal: 280,
            proteinGrams: 42,
            carbohydrateGrams: 2,
            fatGrams: 11,
          },
          perBaseServing: {
            caloriesKcal: 280,
            proteinGrams: 42,
            carbohydrateGrams: 2,
            fatGrams: 11,
            fiberGrams: 0,
          },
          ingredientBreakdown: [
            {
              ingredientId: "main",
              ingredientName: meal.name,
              grams: 175,
              status: "resolved" as const,
            },
          ],
          resolutionQuality: {
            status: "complete" as const,
            totalIngredientCount: 1,
            resolvedIngredientCount: 1,
            ambiguousIngredientCount: 0,
            unresolvedIngredientCount: 0,
            highConfidenceCount: 1,
            mediumConfidenceCount: 0,
            directMassConversionCount: 1,
            providerMeasureConversionCount: 0,
            lowConfidenceConversionCount: 0,
            pendingPortioningComponentCount: 0,
          },
        },
        resolutionQuality: {
          status: "complete" as const,
          totalIngredientCount: 1,
          resolvedIngredientCount: 1,
          ambiguousIngredientCount: 0,
          unresolvedIngredientCount: 0,
          highConfidenceCount: 1,
          mediumConfidenceCount: 0,
          directMassConversionCount: 1,
          providerMeasureConversionCount: 0,
          lowConfidenceConversionCount: 0,
          pendingPortioningComponentCount: 0,
        },
        policyVersions: {
          foodResolution: "food-resolution-v1" as const,
          nutritionCalculation: "nutrition-calculation-v1" as const,
          quantityNormalization: "quantity-normalization-v1" as const,
        },
      },
    };

    const personalized = personalizeWeeklyNutritionPlan({
      generatedPlanId: "plan_repeat",
      weekStart: "2026-09-14",
      weekEnd: "2026-09-20",
      strategy,
      completeMealsByCandidateId: { [meal.candidateId]: meal },
      componentNutritionByKey,
      nutritionByCandidateId,
      dailyTarget: DAILY,
      generatedAt: "2026-09-17T12:00:00.000Z",
    });

    const mondayLunch = personalized.days[0]!.meals.find((m) => m.mealType === "lunch")!;
    const wednesdayLunch = personalized.days[2]!.meals.find((m) => m.mealType === "lunch")!;
    expect(mondayLunch.candidateId).toBe(wednesdayLunch.candidateId);
    expect(mondayLunch.mealInstanceId).not.toBe(wednesdayLunch.mealInstanceId);
    expect(mondayLunch.personalizedPlan?.nutrition.caloriesKcal).toBe(
      wednesdayLunch.personalizedPlan?.nutrition.caloriesKcal,
    );
  });
});

describe("consumer projection", () => {
  it("attaches personalized weekly plan without inventing blocked portions", () => {
    const { meal, componentNutritionByKey } = lemonHerbChickenCompleteMeal();
    const strategy = strategyWithMeals(
      meal.candidateId,
      meal.name,
      meal.candidateId,
      meal.name,
    );
    const demo = buildLocalDemoNutritionMaps({
      completeMealsByCandidateId: { [meal.candidateId]: meal },
      recipesByCandidateId: {},
    });
    const personalized = personalizeWeeklyNutritionPlan({
      generatedPlanId: "plan_proj",
      weekStart: "2026-09-14",
      weekEnd: "2026-09-20",
      strategy,
      completeMealsByCandidateId: { [meal.candidateId]: meal },
      componentNutritionByKey: {
        ...demo.componentNutritionByKey,
        ...componentNutritionByKey,
      },
      nutritionByCandidateId: demo.nutritionByCandidateId,
      dailyTarget: DAILY,
      generatedAt: "2026-09-17T12:00:00.000Z",
    });

    const attached = attachPersonalizedWeeklyPlan(
      {
        weekStart: "2026-09-14",
        weekEnd: "2026-09-20",
        status: "ready",
        strategy,
      },
      personalized,
    );
    expect(attached.personalizedWeeklyPlan?.generatedPlanId).toBe("plan_proj");
    expect(attached.meals?.[0]?.personalizedNutrition).toBeTruthy();
  });
});

describe("discrete-staple-estimate-v1", () => {
  it("portions tortillas with a versioned estimate when USDA nutrition is missing", () => {
    const meal: CompleteMeal = {
      mealId: "complete-tortilla-estimate",
      candidateId: "cand-tortilla-estimate",
      name: "Tacos de Guisado",
      mainRecipeId: "recipe-guisado",
      components: [
        {
          componentId: "main",
          role: "main",
          name: "Beef Guisado",
          relationship: "intrinsic",
          source: "main_recipe",
          reason: "main",
          quantityMode: "solver_determined",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:beef guisado",
          definition: {
            kind: "recipe_component",
            name: "Beef Guisado",
            baseServings: 1,
            referenceYieldGrams: 180,
            ingredients: [{ name: "beef", quantity: 180, unit: "g" }],
          },
          resolution: {
            status: "component_recipe_resolved",
            definition: {
              kind: "recipe_component",
              name: "Beef Guisado",
              baseServings: 1,
              referenceYieldGrams: 180,
              ingredients: [{ name: "beef", quantity: 180, unit: "g" }],
            },
            ingredientNutrition: {
              caloriesKcal: 280,
              proteinGrams: 32,
              carbohydrateGrams: 8,
              fatGrams: 14,
            },
          },
        },
        {
          componentId: "tortillas",
          role: "carbohydrate",
          name: "Warm Corn Tortillas",
          relationship: "required_companion",
          source: "composition_engine",
          reason: "taco vehicle",
          quantityMode: "solver_determined",
          definitionKind: "atomic_food",
          normalizedComponentKey: "carbohydrate:warm corn tortillas",
          definition: {
            kind: "atomic_food",
            name: "Warm Corn Tortillas",
            measurementState: "cooked",
          },
          resolution: {
            status: "unresolved",
            definition: {
              kind: "atomic_food",
              name: "Warm Corn Tortillas",
              measurementState: "cooked",
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
      metadata: {
        promptVersion: "meal-composition-v2",
        policyVersion: "meal-composition-v1",
        createdAt: "2026-09-17T12:00:00.000Z",
      },
    };

    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      nutritionByCandidateId: {
        [meal.candidateId]: {
          recipeId: meal.mainRecipeId,
          candidateId: meal.candidateId,
          recipeName: meal.name,
          baseServings: 1,
          ingredients: [],
          mealComponents: [],
          nutrition: {
            total: {
              caloriesKcal: 280,
              proteinGrams: 32,
              carbohydrateGrams: 8,
              fatGrams: 14,
            },
            perBaseServing: {
              caloriesKcal: 280,
              proteinGrams: 32,
              carbohydrateGrams: 8,
              fatGrams: 14,
              fiberGrams: 0,
            },
            ingredientBreakdown: [
              {
                ingredientId: "main",
                ingredientName: "Beef Guisado",
                grams: 180,
                status: "resolved",
              },
            ],
            resolutionQuality: {
              status: "complete",
              totalIngredientCount: 1,
              resolvedIngredientCount: 1,
              ambiguousIngredientCount: 0,
              unresolvedIngredientCount: 0,
              highConfidenceCount: 1,
              mediumConfidenceCount: 0,
              directMassConversionCount: 1,
              providerMeasureConversionCount: 0,
              lowConfidenceConversionCount: 0,
              pendingPortioningComponentCount: 0,
            },
          },
          resolutionQuality: {
            status: "complete",
            totalIngredientCount: 1,
            resolvedIngredientCount: 1,
            ambiguousIngredientCount: 0,
            unresolvedIngredientCount: 0,
            highConfidenceCount: 1,
            mediumConfidenceCount: 0,
            directMassConversionCount: 1,
            providerMeasureConversionCount: 0,
            lowConfidenceConversionCount: 0,
            pendingPortioningComponentCount: 0,
          },
          policyVersions: {
            foodResolution: "food-resolution-v1",
            nutritionCalculation: "nutrition-calculation-v1",
            quantityNormalization: "quantity-normalization-v1",
          },
        },
      },
    });
    expect(coeffs.ok).toBe(true);
    if (!coeffs.ok) return;
    const tortillaCoeff = coeffs.components.find((c) => c.kind === "count");
    expect(tortillaCoeff).toBeTruthy();
    if (tortillaCoeff?.kind !== "count") return;
    expect(tortillaCoeff.unitLabel).toBe("tortilla");
    expect(tortillaCoeff.nutritionPerUnit.caloriesKcal).toBe(65);

    const solved = solveMealPortions({
      mealId: "instance-estimate",
      mealName: meal.name,
      sourceCompleteMealId: meal.mealId,
      components: coeffs.components,
      nutritionIntent: {
        targetCaloriesKcal: 650,
        targetProteinGrams: 45,
      },
      generatedAt: "2026-09-17T12:00:00.000Z",
    });
    expect(solved.status).not.toBe("blocked");
    const tortilla = solved.portions.find((p) => /tortilla/i.test(p.displayName));
    expect(tortilla).toBeTruthy();
    expect(Number.isInteger(tortilla!.amount)).toBe(true);
  });

  it("fails when a selected independent companion cannot be quantified", () => {
    const meal: CompleteMeal = {
      mealId: "complete-skip-recommended",
      candidateId: "cand-skip-recommended",
      name: "Chicken Plate",
      mainRecipeId: "recipe-chicken",
      components: [
        {
          componentId: "main",
          role: "main",
          name: "Roasted Chicken",
          relationship: "intrinsic",
          source: "main_recipe",
          reason: "main",
          quantityMode: "solver_determined",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:roasted chicken",
          definition: {
            kind: "recipe_component",
            name: "Roasted Chicken",
            baseServings: 1,
            referenceYieldGrams: 170,
            ingredients: [{ name: "chicken", quantity: 170, unit: "g" }],
          },
          resolution: {
            status: "component_recipe_resolved",
            definition: {
              kind: "recipe_component",
              name: "Roasted Chicken",
              baseServings: 1,
              referenceYieldGrams: 170,
              ingredients: [{ name: "chicken", quantity: 170, unit: "g" }],
            },
            ingredientNutrition: {
              caloriesKcal: 260,
              proteinGrams: 40,
              carbohydrateGrams: 0,
              fatGrams: 10,
            },
          },
        },
        {
          componentId: "mystery",
          role: "carbohydrate",
          name: "Mystery Flatbread Disk",
          relationship: "recommended",
          source: "composition_engine",
          reason: "optional",
          quantityMode: "solver_determined",
          definitionKind: "atomic_food",
          normalizedComponentKey: "carbohydrate:mystery flatbread disk",
          nutritionOwnership: "independent",
          definition: {
            kind: "atomic_food",
            name: "Mystery Flatbread Disk",
            measurementState: "cooked",
          },
          resolution: {
            status: "unresolved",
            definition: {
              kind: "atomic_food",
              name: "Mystery Flatbread Disk",
              measurementState: "cooked",
            },
          },
        },
      ],
      compositionProfile: {
        hasPrimaryProtein: true,
        hasMeaningfulCarbohydrate: false,
        hasMeaningfulVegetableOrFruit: false,
        hasMeaningfulFiberSource: false,
        hasSauceOrMoistureComponent: false,
        addedComponentRoles: ["carbohydrate"],
      },
      metadata: {
        promptVersion: "meal-composition-v2",
        policyVersion: "meal-composition-v1",
        createdAt: "2026-09-17T12:00:00.000Z",
      },
    };

    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      nutritionByCandidateId: {
        [meal.candidateId]: {
          recipeId: meal.mainRecipeId,
          candidateId: meal.candidateId,
          recipeName: meal.name,
          baseServings: 1,
          ingredients: [],
          mealComponents: [],
          nutrition: {
            total: {
              caloriesKcal: 260,
              proteinGrams: 40,
              carbohydrateGrams: 0,
              fatGrams: 10,
            },
            perBaseServing: {
              caloriesKcal: 260,
              proteinGrams: 40,
              carbohydrateGrams: 0,
              fatGrams: 10,
              fiberGrams: 0,
            },
            ingredientBreakdown: [
              {
                ingredientId: "main",
                ingredientName: "Roasted Chicken",
                grams: 170,
                status: "resolved",
              },
            ],
            resolutionQuality: {
              status: "complete",
              totalIngredientCount: 1,
              resolvedIngredientCount: 1,
              ambiguousIngredientCount: 0,
              unresolvedIngredientCount: 0,
              highConfidenceCount: 1,
              mediumConfidenceCount: 0,
              directMassConversionCount: 1,
              providerMeasureConversionCount: 0,
              lowConfidenceConversionCount: 0,
              pendingPortioningComponentCount: 0,
            },
          },
          resolutionQuality: {
            status: "complete",
            totalIngredientCount: 1,
            resolvedIngredientCount: 1,
            ambiguousIngredientCount: 0,
            unresolvedIngredientCount: 0,
            highConfidenceCount: 1,
            mediumConfidenceCount: 0,
            directMassConversionCount: 1,
            providerMeasureConversionCount: 0,
            lowConfidenceConversionCount: 0,
            pendingPortioningComponentCount: 0,
          },
          policyVersions: {
            foodResolution: "food-resolution-v1",
            nutritionCalculation: "nutrition-calculation-v1",
            quantityNormalization: "quantity-normalization-v1",
          },
        },
      },
    });
    // Selected independent edible on the plate must be quantified — no soft skip.
    expect(coeffs.ok).toBe(false);
  });

  it("recomputes meal nutrition when the user adjusts a discrete count", () => {
    const meal: ConsumerMealSlot = {
      day: "monday",
      mealType: "lunch",
      candidateId: "cand",
      name: "Tacos",
      prepIntent: "fresh",
      components: [
        {
          componentId: "main",
          displayName: "Filling",
          role: "main",
          amount: 180,
          unit: "g",
          nutrition: {
            caloriesKcal: 300,
            proteinGrams: 30,
            carbsGrams: 10,
            fatGrams: 12,
          },
        },
        {
          componentId: "tortillas",
          displayName: "Corn Tortillas",
          role: "carbohydrate",
          amount: 2,
          unit: "tortilla",
          adjustableDiscrete: true,
          minAmount: 1,
          maxAmount: 4,
          quantityStep: 1,
          usedStapleEstimate: true,
          nutrition: {
            caloriesKcal: 130,
            proteinGrams: 3.2,
            carbsGrams: 27,
            fatGrams: 1.8,
            fiberGrams: 3.6,
          },
        },
      ],
      personalizedNutrition: {
        caloriesKcal: 430,
        proteinGrams: 33.2,
        carbsGrams: 37,
        fatGrams: 13.8,
        fiberGrams: 3.6,
      },
    };

    const adjusted = applyDiscretePortionAdjustment({
      meal,
      componentId: "tortillas",
      amount: 3,
    });
    expect(adjusted).toBeTruthy();
    expect(adjusted!.components.find((c) => c.componentId === "tortillas")!.amount).toBe(3);
    expect(adjusted!.personalizedNutrition!.caloriesKcal).toBe(Math.round(300 + 130 * 1.5));
  });

  it("blocks required sides without USDA, staple match, or keyed nutrition (no silent role-structural macros)", () => {
    const meal: CompleteMeal = {
      mealId: "complete-role-estimate",
      candidateId: "cand-role-estimate",
      name: "Chicken with Mystery Side",
      mainRecipeId: "recipe-chicken",
      components: [
        {
          componentId: "main",
          role: "main",
          name: "Roasted Chicken",
          relationship: "intrinsic",
          source: "main_recipe",
          reason: "main",
          quantityMode: "solver_determined",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:roasted chicken",
          nutritionOwnership: "independent",
          definition: {
            kind: "recipe_component",
            name: "Roasted Chicken",
            baseServings: 1,
            referenceYieldGrams: 170,
            ingredients: [{ name: "chicken", quantity: 170, unit: "g" }],
          },
          resolution: {
            status: "component_recipe_resolved",
            definition: {
              kind: "recipe_component",
              name: "Roasted Chicken",
              baseServings: 1,
              referenceYieldGrams: 170,
              ingredients: [{ name: "chicken", quantity: 170, unit: "g" }],
            },
            ingredientNutrition: {
              caloriesKcal: 260,
              proteinGrams: 40,
              carbohydrateGrams: 0,
              fatGrams: 10,
            },
          },
        },
        {
          componentId: "mystery",
          role: "vegetable",
          name: "Garden Relish Medley",
          relationship: "required_companion",
          source: "composition_engine",
          reason: "veg",
          quantityMode: "solver_determined",
          definitionKind: "recipe_component",
          normalizedComponentKey: "vegetable:garden relish medley",
          nutritionOwnership: "independent",
          definition: {
            kind: "recipe_component",
            name: "Garden Relish Medley",
            ingredients: [{ name: "unknown greens", quantity: 100, unit: "g" }],
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
    };

    const coeffs = buildCoefficientsFromCompleteMeal({
      meal,
      recipesByCandidateId: {
        [meal.candidateId]: {
          candidateId: meal.candidateId,
          recipeId: meal.mainRecipeId,
          baseServings: 1,
          nutrition: {
            source: "llm_estimate",
            total: {
              caloriesKcal: 260,
              proteinGrams: 40,
              carbohydrateGrams: 0,
              fatGrams: 10,
            },
            perServing: {
              caloriesKcal: 260,
              proteinGrams: 40,
              carbohydrateGrams: 0,
              fatGrams: 10,
              fiberGrams: 0,
            },
          },
        } as import("@fitness-autopilot/contracts").ResolvedRecipe,
      },
    });
    expect(coeffs.ok).toBe(false);
    if (coeffs.ok) return;
    expect(coeffs.error.code).toMatch(/missing_canonical_nutrition|unquantifiable_component/);
  });
});
