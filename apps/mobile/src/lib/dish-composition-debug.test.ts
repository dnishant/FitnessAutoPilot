import { describe, expect, it } from "vitest";
import type { ConsumerMealSlot, ConsumerWeeklyPlan } from "@fitness-autopilot/contracts";
import { buildDishCompositionDebug } from "./dish-composition-debug";

describe("buildDishCompositionDebug", () => {
  it("flags missing llm nutrition and structural chicken-like main macros", () => {
    const meal: ConsumerMealSlot = {
      mealInstanceId: "plan1:monday:lunch",
      day: "monday",
      mealType: "lunch",
      candidateId: "curd-rice",
      name: "Curd Rice",
      prepIntent: "fully_prepped",
      components: [
        {
          componentId: "main",
          displayName: "Curd Rice",
          role: "main",
          amount: 1.15,
          unit: "servings",
          nutrition: {
            caloriesKcal: 323,
            proteinGrams: 48.9,
            carbsGrams: 3.9,
            fatGrams: 13.7,
          },
        },
      ],
      personalizedNutrition: {
        caloriesKcal: 323,
        proteinGrams: 48.9,
        carbsGrams: 3.9,
        fatGrams: 13.7,
      },
      personalizationStatus: "best_feasible",
    };

    const weeklyPlan = {
      weekStart: "2026-09-14",
      weekEnd: "2026-09-20",
      status: "ready",
      generatedPlanId: "plan1",
      recipesByCandidateId: {
        "curd-rice": {
          recipeId: "r1",
          candidateId: "curd-rice",
          name: "Curd Rice",
          source: { name: "test", url: "https://example.com", author: null },
          description: "Rice with yogurt",
          baseServings: 4,
          ingredients: [
            {
              ingredientId: "rice",
              name: "rice",
              quantity: 1,
              unit: "cup",
              role: "carb",
              scalingBehavior: "primary_scalable",
            },
          ],
          instructions: [{ stepNumber: 1, text: "Mix" }],
          prepTimeMinutes: 10,
          cookTimeMinutes: 20,
          supportedPrepModes: [
            {
              mode: "fully_prepped",
              advanceTasks: [],
              finishTasks: ["Serve"],
              finishTimeMinutes: 5,
            },
          ],
          mealComponents: [
            {
              componentId: "main",
              name: "Curd Rice",
              type: "main",
              required: true,
              purpose: "Main",
              relationship: "intrinsic",
            },
          ],
          flavorProfile: {
            cuisineFamily: "Indian",
            flavorFamilies: ["savory"],
            cookingTechniques: ["temper"],
            textureProfile: [],
          },
          experienceProfile: {
            moistureLevel: "saucy",
            flavorIntensity: "mild",
            textureTags: [],
            mealPrepQuality: "excellent",
          },
          resolutionMetadata: {
            provider: "test",
            model: "test",
            promptVersion: "recipe-resolution-v2",
          },
          // nutrition intentionally missing — triggers chicken fallback path
        },
      },
      personalizedWeeklyPlan: {
        generatedPlanId: "plan1",
        weekStart: "2026-09-14",
        weekEnd: "2026-09-20",
        days: [
          {
            day: "monday",
            meals: [
              {
                mealInstanceId: "plan1:monday:lunch",
                day: "monday",
                mealType: "lunch",
                candidateId: "curd-rice",
                mealName: "Curd Rice",
                nutritionIntent: { targetCaloriesKcal: 600 },
                status: "best_feasible",
                personalizedPlan: {
                  mealId: "plan1:monday:lunch",
                  portions: [
                    {
                      componentId: "main",
                      displayName: "Curd Rice",
                      role: "main",
                      amount: 1.15,
                      unit: "servings",
                      personalServings: 1.15,
                      internalScale: 1.15,
                      nutrition: {
                        caloriesKcal: 323,
                        proteinGrams: 48.9,
                        carbohydrateGrams: 3.9,
                        fatGrams: 13.7,
                        fiberGrams: 0.4,
                      },
                    },
                  ],
                  nutrition: {
                    caloriesKcal: 323,
                    proteinGrams: 48.9,
                    carbsGrams: 3.9,
                    fatGrams: 13.7,
                  },
                  intent: { targetCaloriesKcal: 600 },
                  status: "best_feasible",
                  diagnostics: {
                    status: "best_feasible",
                    variables: [],
                    policyVersion: "meal-portion-policy-v1",
                    solverVersion: "meal-portion-solver-v1",
                  },
                  policyVersion: "meal-portion-policy-v1",
                  solverVersion: "meal-portion-solver-v1",
                  generatedAt: new Date().toISOString(),
                },
              },
            ],
            dailyTarget: { caloriesKcal: 2000, proteinGrams: 160 },
            reservedBreakfastSnack: { caloriesKcal: 700, proteinGrams: 56 },
            lunchIntent: { targetCaloriesKcal: 600 },
            dinnerIntent: { targetCaloriesKcal: 700 },
            allocationPolicyVersion: "nutrition-allocation-policy-v1",
          },
        ],
        dailyTarget: { caloriesKcal: 2000, proteinGrams: 160 },
        allocationPolicyVersion: "nutrition-allocation-policy-v1",
        mealPortionPolicyVersion: "meal-portion-policy-v1",
        mealPortionSolverVersion: "meal-portion-solver-v1",
        weeklyPersonalizationVersion: "weekly-nutrition-personalization-v1",
        generatedAt: new Date().toISOString(),
        diagnostics: {
          mealInstanceCount: 1,
          solvedMealCount: 0,
          bestFeasibleMealCount: 1,
          blockedMealCount: 0,
          totalSolveTimeMs: 1,
        },
      },
    } as unknown as ConsumerWeeklyPlan;

    const debug = buildDishCompositionDebug({ meal, weeklyPlan });
    expect(debug.diagnosis.recipeHasLlmNutrition).toBe(false);
    expect(debug.diagnosis.nutritionSource).toBe("missing_on_recipe");
    expect(debug.diagnosis.suspectedStructuralMainFallback).toBe(true);
    expect(debug.solverPortions?.[0]?.nutrition.proteinGrams).toBe(48.9);
    expect(debug.recipe?.ingredients[0]?.name).toBe("rice");
  });
});
