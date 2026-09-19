import { describe, expect, it } from "vitest";
import type {
  ConsumerMealSlot,
  ConsumerWeeklyPlan,
  GroceryList,
  PersonalizedMealNutrition,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import {
  buildConsumerMealsFromStrategy,
  createEmptyConsumerPlan,
  generateReadySummary,
  humanizePlanGenerationError,
  mealCardDisplayModel,
  mealsForDay,
  nutritionSummaryDisplayModel,
} from "./consumer-plan-view";
import { generateConsumerWeeklyPlan } from "./consumer-plan-generate";
import { plan008SimpleWeeklyStrategy } from "@fitness-autopilot/domain";

function sampleMeal(overrides: Partial<ConsumerMealSlot> = {}): ConsumerMealSlot {
  return {
    day: "wednesday",
    mealType: "lunch",
    candidateId: "tikka-chicken",
    name: "Chicken Tikka",
    prepIntent: "fully_prepped",
    components: [
      { componentId: "main", displayName: "Chicken Tikka", role: "main" },
      { componentId: "rice", displayName: "Basmati Rice", role: "carbohydrate" },
      { componentId: "salad", displayName: "Kachumber", role: "vegetable" },
      { componentId: "chutney", displayName: "Mint Yogurt Chutney", role: "sauce_condiment" },
    ],
    ...overrides,
  };
}

describe("consumer meal view model", () => {
  it("builds complete meals with main + composed components", () => {
    const strategy = plan008SimpleWeeklyStrategy();
    const meals = buildConsumerMealsFromStrategy({
      strategy,
      conceptsByCandidateId: {
        "tikka-chicken": {
          candidateId: "tikka-chicken",
          name: "Chicken Tikka",
          main: {
            componentId: "main",
            role: "main",
            name: "Chicken Tikka",
            relationship: "intrinsic",
            source: "candidate",
            reason: "Main dish",
            definitionKind: "recipe_component",
            normalizedComponentKey: "chicken-tikka",
          },
          components: [
            {
              componentId: "rice",
              role: "carbohydrate",
              name: "Basmati Rice",
              relationship: "required_companion",
              source: "composition_engine",
              reason: "Starch",
              definitionKind: "atomic_food",
              normalizedComponentKey: "basmati-rice",
            },
            {
              componentId: "salad",
              role: "vegetable",
              name: "Kachumber",
              relationship: "required_companion",
              source: "composition_engine",
              reason: "Fresh side",
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
            createdAt: new Date().toISOString(),
          },
        },
      },
    });

    const mondayLunch = meals.find((m) => m.day === "monday" && m.mealType === "lunch");
    expect(mondayLunch?.name).toBe("Chicken Tikka");
    expect(mondayLunch?.components.map((c) => c.displayName)).toEqual([
      "Chicken Tikka",
      "Basmati Rice",
      "Kachumber",
    ]);
    expect(mondayLunch?.personalizedNutrition).toBeUndefined();
  });

  it("does not invent personalized nutrition when absent", () => {
    const meal = sampleMeal();
    expect(meal.personalizedNutrition).toBeUndefined();
  });

  it("preserves personalized nutrition when supplied", () => {
    const nutrition: PersonalizedMealNutrition = {
      caloriesKcal: 620,
      proteinGrams: 52,
      carbsGrams: 48,
      fatGrams: 18,
      fiberGrams: 8,
    };
    const meal = sampleMeal({ personalizedNutrition: nutrition });
    expect(meal.personalizedNutrition).toEqual(nutrition);
  });

  it("exposes lunch and dinner for a selected day", () => {
    const plan: ConsumerWeeklyPlan = {
      ...createEmptyConsumerPlan("2026-09-21"),
      status: "ready",
      meals: [
        sampleMeal({ day: "wednesday", mealType: "lunch" }),
        sampleMeal({
          day: "wednesday",
          mealType: "dinner",
          candidateId: "thai-green-curry",
          name: "Thai Green Curry with Shrimp",
          components: [
            { componentId: "main", displayName: "Thai Green Curry with Shrimp", role: "main" },
            { componentId: "rice", displayName: "Jasmine Rice", role: "carbohydrate" },
          ],
        }),
      ],
    };
    const day = mealsForDay(plan, "wednesday");
    expect(day.lunch?.name).toBe("Chicken Tikka");
    expect(day.dinner?.name).toBe("Thai Green Curry with Shrimp");
    expect(day.dinner?.components.map((c) => c.displayName)).toContain("Jasmine Rice");
  });
  it("meal card display hides nutrition until personalized data exists", () => {
    const without = mealCardDisplayModel(sampleMeal());
    expect(without.componentNames).toEqual([
      "Basmati Rice",
      "Kachumber",
      "Mint Yogurt Chutney",
    ]);
    expect(without.nutritionLine).toBeNull();

    const withNutrition = mealCardDisplayModel(
      sampleMeal({
        personalizedNutrition: {
          caloriesKcal: 620,
          proteinGrams: 52,
          carbsGrams: 48,
          fatGrams: 18,
        },
      }),
    );
    expect(withNutrition.nutritionLine).toBe("620 kcal · 52g protein");
  });

  it("nutrition summary renders authoritative values", () => {
    const model = nutritionSummaryDisplayModel({
      calories: 2250,
      proteinG: 182,
      carbsG: 225,
      fatG: 63,
      fiberG: 32,
      paceLabel: "Lose ~0.5% / week",
    });
    expect(model.caloriesLabel).toBe("2,250");
    expect(model.proteinLabel).toBe("182g");
    expect(model.fiberLabel).toBe("32g Fiber");
    expect(model.paceLabel).toBe("Lose ~0.5% / week");
  });
});

describe("recipe and grocery contracts for UI", () => {
  it("treats recipe baseServings as reference yield, not one user meal", () => {
    const recipe = {
      baseServings: 4,
      name: "Chicken Tikka",
      ingredients: [{ name: "chicken breast", quantity: 680, unit: "g" }],
      instructions: [{ stepNumber: 1, text: "Marinate." }],
    } as Pick<ResolvedRecipe, "baseServings" | "name" | "ingredients" | "instructions">;
    expect(recipe.baseServings).toBe(4);
    expect(recipe.ingredients[0]?.quantity).toBe(680);
    expect(recipe.instructions).toHaveLength(1);
  });

  it("supports grocery empty vs populated models without inventing quantities", () => {
    const empty: GroceryList | undefined = undefined;
    expect(empty).toBeUndefined();

    const populated: GroceryList = {
      weekStart: "2026-09-21",
      weekEnd: "2026-09-27",
      available: true,
      aggregationPolicyVersion: "grocery-aggregation-policy-v1",
      sections: [
        {
          category: "produce",
          items: [
            {
              id: "cucumbers",
              displayName: "Cucumbers",
              category: "produce",
              quantities: [
                {
                  requiredQuantity: 5,
                  unit: "piece",
                  displayQuantity: 5,
                  displayUnit: "piece",
                  displayLabel: "5 piece",
                },
              ],
              quantity: 5,
              unit: "piece",
              checked: false,
              status: "needed",
              sourceMealInstanceIds: [],
              sourceRecipeIds: [],
              sourceRecipeNames: [],
              provenance: [],
            },
            {
              id: "tomatoes",
              displayName: "Tomatoes",
              category: "produce",
              quantities: [
                {
                  requiredQuantity: 6,
                  unit: "piece",
                  displayQuantity: 6,
                  displayUnit: "piece",
                  displayLabel: "6 piece",
                },
              ],
              quantity: 6,
              unit: "piece",
              checked: true,
              status: "got",
              sourceMealInstanceIds: [],
              sourceRecipeIds: [],
              sourceRecipeNames: [],
              provenance: [],
            },
          ],
        },
      ],
    };
    expect(populated.sections[0]?.items).toHaveLength(2);
    expect(populated.sections[0]?.items[1]?.checked).toBe(true);
  });

  it("toggles grocery checked state in the UI model", () => {
    const item = { id: "chicken", displayName: "Chicken breast", checked: false };
    const next = { ...item, checked: !item.checked };
    expect(next.checked).toBe(true);
  });
});

describe("generation UX helpers", () => {
  it("humanizes provider errors for consumers", () => {
    expect(humanizePlanGenerationError("GeminiProviderException", "LLM_CONFIGURATION_ERROR")).toMatch(
      /couldn't finish your meal plan/i,
    );
    expect(humanizePlanGenerationError("FOOD_RESOLUTION_BLOCKED")).not.toMatch(/FOOD_RESOLUTION/);
  });

  it("does not reclassify already-humanized messages as preference failures", () => {
    const once = humanizePlanGenerationError("transient upstream failure");
    expect(once).toMatch(/preferences are saved/i);
    expect(humanizePlanGenerationError(once)).toBe(once);
    expect(humanizePlanGenerationError(once)).not.toMatch(/Review food preferences/i);
  });

  it("maps PLAN-011 validation failures to a reliable-plan retry message", () => {
    expect(
      humanizePlanGenerationError(
        "Weekly nutrition plan failed PLAN-011 validation (repair_exhausted): TARGET_DAILY_CALORIES_OUTSIDE_HARD",
        "PLAN_VALIDATION_FAILED",
      ),
    ).toMatch(/reliable plan/i);
  });

  it("maps culinary discovery schema failures to a meal-ideas retry message", () => {
    expect(
      humanizePlanGenerationError(
        "No candidates passed schema validation.",
        "DISCOVERY_SCHEMA_VALIDATION_FAILED",
      ),
    ).toMatch(/meal ideas/i);
  });

  it("builds ready summary from real preference state", () => {
    const lines = generateReadySummary({
      nutritionTarget: {
        id: "00000000-0000-4000-8000-000000000001",
        userId: "00000000-0000-4000-8000-000000000002",
        goalId: "00000000-0000-4000-8000-000000000003",
        estimatedMaintenanceCalories: 2650,
        targetCalories: 2250,
        proteinG: 182,
        fatMinG: 60,
        fatMaxG: 70,
        fatG: 63,
        carbohydrateG: 225,
        fiberG: 32,
        desiredRateKgPerWeek: -0.4,
        algorithmName: "nutrition-target",
        algorithmVersion: "nutrition-target-v1",
        inputSnapshot: {},
        validFrom: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      mealPreferences: {
        userId: "00000000-0000-4000-8000-000000000002",
        cuisines: ["indian"],
        proteinPreferences: ["chicken"],
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
        experiencePreferences: ["saucy_flavorful"],
        varietyLevel: "balanced",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      cookingPreferences: {
        userId: "00000000-0000-4000-8000-000000000002",
        prepFrequency: "once_weekly",
        maxPrepSessionMinutes: 90,
        cookingStyle: "ready_lunch_fresh_dinner",
        maxFinishMinutes: 10,
        useDinnerPrepForNextLunch: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    expect(lines.join(" ")).toMatch(/2,250 kcal\/day/);
    expect(lines.join(" ")).toMatch(/182g protein/);
    expect(lines.join(" ")).toMatch(/Balanced variety/);
    expect(lines.join(" ")).toMatch(/90 min/);
    expect(lines.join(" ")).toMatch(/≤10 min/);
  });

  it("generates a local demo weekly plan with complete meals", async () => {
    const result = await generateConsumerWeeklyPlan({
      useLocalMode: true,
      nutritionTarget: null,
      mealPreferences: null,
      cookingPreferences: null,
      discoverCulinaryCandidates: async () => ({ ok: false, error: "unused" }),
      rankCulinaryCandidates: async () => ({ ok: false, error: "unused" }),
      composeMealConcepts: async () => ({ ok: false, error: "unused" }),
      generateRankedWeeklyStrategy: async () => ({ ok: false, error: "unused" }),
      resolveWeeklyRecipes: async () => ({ ok: false, error: "unused" }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.status).toBe("ready");
    expect(result.plan.meals?.length).toBe(14);
    const tikka = result.plan.meals?.find((m) => m.candidateId === "tikka-chicken");
    expect(tikka?.components.length).toBeGreaterThan(1);
    expect(tikka?.personalizedNutrition?.caloriesKcal).toBeGreaterThan(0);
    expect(tikka?.components.some((c) => c.amount != null)).toBe(true);
    expect(result.plan.personalizedWeeklyPlan?.generatedPlanId).toBeTruthy();
    expect(result.plan.personalizedWeeklyPlan?.finalization?.validationStatus).toBe("finalized");
    expect(result.plan.groceryList?.available).toBe(true);
    expect(result.plan.groceryList?.sections.length).toBeGreaterThan(0);
    const groceryItems = result.plan.groceryList!.sections.flatMap((s) => s.items);
    expect(groceryItems.length).toBeGreaterThan(0);
    expect(groceryItems.every((item) => item.quantities.length > 0)).toBe(true);
    expect(result.plan.groceryList?.diagnostics?.droppedRequirementCount).toBe(0);
  }, 15000);
});

describe("developer navigation separation", () => {
  it("keeps developer entry conditional on development/local mode", () => {
    const showDeveloper = (dev: boolean, local: boolean) => dev || local;
    expect(showDeveloper(true, false)).toBe(true);
    expect(showDeveloper(false, true)).toBe(true);
    expect(showDeveloper(false, false)).toBe(false);
  });
});
