import { describe, expect, it } from "vitest";
import {
  MEAL_PORTION_POLICY_VERSION,
  MealNutritionIntentSchema,
  PersonalizedMealPlanSchema,
  SolveMealPortionsRequestSchema,
} from "./meal-portioning";

describe("PLAN-010 meal portioning contracts", () => {
  it("accepts a calorie+protein developer test intent", () => {
    const parsed = MealNutritionIntentSchema.parse({
      targetCaloriesKcal: 600,
      targetProteinGrams: 50,
      isDeveloperTestIntent: true,
      label: "Developer test intent",
    });
    expect(parsed.targetCaloriesKcal).toBe(600);
    expect(parsed.isDeveloperTestIntent).toBe(true);
  });

  it("rejects non-positive calorie targets", () => {
    expect(
      MealNutritionIntentSchema.safeParse({ targetCaloriesKcal: 0 }).success,
    ).toBe(false);
  });

  it("accepts a solved personalized meal plan snapshot", () => {
    const plan = PersonalizedMealPlanSchema.parse({
      mealId: "meal-tikka",
      mealName: "Chicken Tikka Complete Meal",
      portions: [
        {
          componentId: "main",
          displayName: "Chicken Tikka",
          role: "main",
          amount: 185,
          unit: "g",
          internalScale: 1.08,
          nutrition: {
            caloriesKcal: 280,
            proteinGrams: 40,
            carbohydrateGrams: 4,
            fatGrams: 10,
          },
        },
      ],
      nutrition: {
        caloriesKcal: 612,
        proteinGrams: 54,
        carbsGrams: 63,
        fatGrams: 16,
        fiberGrams: 7,
      },
      intent: {
        targetCaloriesKcal: 600,
        targetProteinGrams: 50,
        isDeveloperTestIntent: true,
      },
      status: "best_feasible",
      diagnostics: {
        status: "best_feasible",
        variables: [],
        calorieDeviationKcal: 12,
        proteinDeviationGrams: 4,
        policyVersion: MEAL_PORTION_POLICY_VERSION,
        solverVersion: "meal-portion-solver-v1",
      },
      policyVersion: MEAL_PORTION_POLICY_VERSION,
      solverVersion: "meal-portion-solver-v1",
      generatedAt: "2026-09-17T00:00:00.000Z",
    });
    expect(plan.status).toBe("best_feasible");
  });

  it("accepts a solve request with mixed component kinds", () => {
    const req = SolveMealPortionsRequestSchema.parse({
      mealId: "meal-tikka",
      components: [
        {
          kind: "recipe_scale",
          componentId: "main",
          displayName: "Chicken Tikka",
          role: "main",
          baseNutrition: {
            caloriesKcal: 250,
            proteinGrams: 36,
            carbohydrateGrams: 3,
            fatGrams: 9,
          },
          referenceYieldGrams: 170,
          baseServings: 1,
        },
        {
          kind: "food_grams",
          componentId: "rice",
          displayName: "Basmati Rice",
          role: "carbohydrate",
          nutritionPer100g: {
            caloriesKcal: 130,
            proteinGrams: 2.7,
            carbohydrateGrams: 28,
            fatGrams: 0.3,
            fiberGrams: 0.4,
          },
          preferredGrams: 180,
        },
      ],
      nutritionIntent: { targetCaloriesKcal: 600, targetProteinGrams: 45 },
    });
    expect(req.components).toHaveLength(2);
  });
});
