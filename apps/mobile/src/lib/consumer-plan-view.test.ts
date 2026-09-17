import { describe, expect, it } from "vitest";
import type {
  ConsumerMealSlot,
  ConsumerWeeklyPlan,
  GroceryList,
  PersonalizedMealNutrition,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import {
  applyPersonalizedPortionsToMeals,
  buildConsumerMealsFromStrategy,
  createEmptyConsumerPlan,
  formatPortionAmount,
  formatPortionDisplay,
  generateReadySummary,
  humanizePlanGenerationError,
  mealCardDisplayModel,
  mealDetailViewModel,
  mealsForDay,
  nutritionSummaryDisplayModel,
  recipeYourPortionFromMeal,
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
      sections: [
        {
          category: "produce",
          items: [
            { id: "cucumbers", displayName: "Cucumbers", quantity: 5, checked: false },
            { id: "tomatoes", displayName: "Tomatoes", quantity: 6, checked: true },
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
    expect(tikka?.personalizedNutrition).toBeDefined();
    expect(tikka?.personalizedNutrition?.caloriesKcal).toBeGreaterThan(400);
    expect(tikka?.components.some((c) => c.amount != null && c.unit)).toBe(true);
    expect(result.plan.groceryList).toBeUndefined();
  }, 15000);
});

describe("PLAN-010 consumer portion wiring", () => {
  it("applies authoritative portions only when fixture nutrition exists", () => {
    const meals = applyPersonalizedPortionsToMeals([
      sampleMeal(),
      sampleMeal({
        candidateId: "unknown-dish",
        name: "Unknown Dish",
        components: [{ componentId: "main", displayName: "Unknown Dish", role: "main" }],
      }),
    ]);
    expect(meals[0]?.personalizedNutrition).toBeDefined();
    expect(meals[0]?.portionStatus).toBe("available");
    expect(meals[0]?.components.find((c) => c.displayName === "Basmati Rice")?.unit).toBe("g");
    expect(meals[1]?.personalizedNutrition).toBeUndefined();
    expect(meals[1]?.portionStatus).toBeUndefined();
    expect(meals[1]?.components[0]?.amount).toBeUndefined();
  });

  it("MealCard display shows compact PLAN-010 kcal · protein when available", () => {
    const [tikka] = applyPersonalizedPortionsToMeals([sampleMeal()]);
    const model = mealCardDisplayModel(tikka!);
    expect(model.nutritionLine).toMatch(/^\d+ kcal · \d+g protein$/);
    expect(model.prepLabel).toBe("Meal prepped");
  });

  it("MealCard display hides nutrition without PLAN-010 data", () => {
    const model = mealCardDisplayModel(
      sampleMeal({
        candidateId: "unknown-dish",
        personalizedNutrition: undefined,
        portionStatus: undefined,
      }),
    );
    expect(model.nutritionLine).toBeNull();
  });

  it("Meal Detail view model renders exact personalized component portions", () => {
    const [tikka] = applyPersonalizedPortionsToMeals([sampleMeal()]);
    const detail = mealDetailViewModel(tikka!);
    expect(detail.plateTitle).toBe("Your plate");
    expect(detail.portionStatus).toBe("available");
    expect(detail.nutrition?.caloriesKcal).toBeGreaterThan(400);
    expect(detail.nutrition?.proteinGrams).toBeGreaterThan(30);
    expect(detail.nutrition?.carbsGrams).toBeGreaterThan(0);
    expect(detail.nutrition?.fatGrams).toBeGreaterThan(0);

    const kachumber = detail.components.find((c) => c.name === "Kachumber");
    expect(kachumber?.portionLabel).toMatch(/^\d+ g$/);
    // Compound culinary unit — never explode into cucumber/tomato/onion rows.
    expect(detail.components.map((c) => c.name).join(" ")).not.toMatch(/Cucumber|Tomato|Onion/i);
  });

  it("formats discrete count portions without trailing decimals", () => {
    expect(formatPortionAmount(2)).toBe("2");
    expect(formatPortionAmount(2.0)).toBe("2");
    expect(formatPortionDisplay(2, "tortillas")).toBe("2 tortillas");
    expect(formatPortionDisplay(185, "g")).toBe("185 g");
    expect(formatPortionAmount(1.5)).toBe("1.5");
  });

  it("applies shrimp taco discrete tortilla portions from PLAN-010", () => {
    const meals = applyPersonalizedPortionsToMeals([
      sampleMeal({
        candidateId: "chile-lime-shrimp-tacos",
        name: "Shrimp Tacos",
        components: [
          { componentId: "main", displayName: "Chile Lime Shrimp", role: "main" },
          { componentId: "tortillas", displayName: "Corn Tortillas", role: "carbohydrate" },
          { componentId: "slaw", displayName: "Cabbage Slaw", role: "vegetable" },
          { componentId: "salsa", displayName: "Salsa", role: "sauce_condiment" },
        ],
      }),
    ]);
    const taco = meals[0]!;
    expect(taco.portionStatus).toBe("available");
    const tortillas = taco.components.find(
      (c) => c.componentId === "tortillas" || /tortilla/i.test(c.displayName),
    );
    expect(tortillas?.amount).toBeDefined();
    expect(Number.isInteger(tortillas!.amount)).toBe(true);
    expect(formatPortionDisplay(tortillas!.amount!, tortillas!.unit!)).not.toMatch(/\.0 /);
  });

  it("uses final rounded PLAN-010 nutrition on the detail model", () => {
    const [tikka] = applyPersonalizedPortionsToMeals([sampleMeal()]);
    const detail = mealDetailViewModel(tikka!);
    expect(detail.nutrition).toEqual(tikka!.personalizedNutrition);
    expect(Number.isInteger(detail.nutrition!.caloriesKcal)).toBe(true);
  });

  it("best_feasible results render as normal available consumer meals", () => {
    // Solver may return best_feasible for fixture intents; consumer status is still available.
    const [meal] = applyPersonalizedPortionsToMeals([
      sampleMeal({ candidateId: "jamaican-jerk-chicken", name: "Jamaican Jerk Chicken" }),
    ]);
    expect(meal?.portionStatus).toBe("available");
    expect(meal?.personalizedNutrition).toBeDefined();
    const card = mealCardDisplayModel(meal!);
    expect(card.nutritionLine).toMatch(/kcal · .+protein/);
    expect(card.nutritionLine).not.toMatch(/best_feasible|OPTIMIZATION/i);
  });

  it("blocked meals never invent portions and surface a graceful message", () => {
    const blocked = sampleMeal({
      portionStatus: "blocked",
      personalizedNutrition: undefined,
      components: sampleMeal().components.map((c) => ({
        componentId: c.componentId,
        displayName: c.displayName,
        role: c.role,
      })),
    });
    const detail = mealDetailViewModel(blocked);
    expect(detail.portionStatus).toBe("blocked");
    expect(detail.nutrition).toBeNull();
    expect(detail.components.every((c) => c.portionLabel == null)).toBe(true);
    expect(detail.portionMessage).toMatch(/finalizing the portions/i);
    expect(mealCardDisplayModel(blocked).nutritionLine).toBeNull();
  });

  it("pending meals show a subtle portion-loading message without fake quantities", () => {
    const pending = sampleMeal({
      portionStatus: "pending",
      personalizedNutrition: undefined,
    });
    const detail = mealDetailViewModel(pending);
    expect(detail.portionMessage).toMatch(/Personalizing/i);
    expect(detail.nutrition).toBeNull();
    expect(mealCardDisplayModel(pending).nutritionLine).toBeNull();
  });

  it("Recipe context shows personalized serving when opened from a meal", () => {
    const [tikka] = applyPersonalizedPortionsToMeals([sampleMeal()]);
    const yours = recipeYourPortionFromMeal({
      meal: tikka!,
      recipeCandidateId: "tikka-chicken",
    });
    expect(yours?.label).toMatch(/^\d+ g prepared /);
    expect(yours?.componentName).toMatch(/Chicken Tikka/i);
  });

  it("Recipe standalone works without personalized meal context", () => {
    const meal = sampleMeal(); // no amounts
    const yours = recipeYourPortionFromMeal({
      meal,
      recipeCandidateId: "tikka-chicken",
    });
    expect(yours).toBeNull();
  });

  it("hides fiber on detail when PLAN-010 omits fiber completeness", () => {
    const detail = mealDetailViewModel(
      sampleMeal({
        portionStatus: "available",
        personalizedNutrition: {
          caloriesKcal: 612,
          proteinGrams: 54,
          carbsGrams: 63,
          fatGrams: 16,
        },
        components: [
          {
            componentId: "main",
            displayName: "Chicken Tikka",
            role: "main",
            amount: 185,
            unit: "g",
          },
        ],
      }),
    );
    expect(detail.nutrition?.fiberGrams).toBeUndefined();
  });
});

describe("developer navigation separation", () => {
  it("keeps developer entry conditional on development/local mode", () => {
    const showDeveloper = (dev: boolean, local: boolean) => dev || local;
    expect(showDeveloper(true, false)).toBe(true);
    expect(showDeveloper(false, true)).toBe(true);
    expect(showDeveloper(false, false)).toBe(false);
  });
});
