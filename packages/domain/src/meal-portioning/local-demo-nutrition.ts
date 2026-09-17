import type {
  CompleteMeal,
  IngredientNutrition,
  RecipeNutrition,
  RecipeNutritionResult,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import type { MealComponentRole } from "@fitness-autopilot/contracts";

/**
 * Local-planner / offline demo nutrition only.
 * Meal-name agnostic role coefficients — NOT a production USDA substitute.
 * Production Generate My Plan must use resolve-recipe-nutrition.
 */

const ROLE_PER_100G: Record<
  MealComponentRole,
  {
    caloriesKcal: number;
    proteinGrams: number;
    carbohydrateGrams: number;
    fatGrams: number;
    fiberGrams: number;
  }
> = {
  main: {
    caloriesKcal: 165,
    proteinGrams: 25,
    carbohydrateGrams: 2,
    fatGrams: 7,
    fiberGrams: 0.2,
  },
  carbohydrate: {
    caloriesKcal: 130,
    proteinGrams: 2.7,
    carbohydrateGrams: 28,
    fatGrams: 0.3,
    fiberGrams: 0.4,
  },
  vegetable: {
    caloriesKcal: 30,
    proteinGrams: 1.2,
    carbohydrateGrams: 5.5,
    fatGrams: 0.3,
    fiberGrams: 1.8,
  },
  fruit: {
    caloriesKcal: 50,
    proteinGrams: 0.6,
    carbohydrateGrams: 12,
    fatGrams: 0.2,
    fiberGrams: 2,
  },
  legume: {
    caloriesKcal: 120,
    proteinGrams: 8,
    carbohydrateGrams: 18,
    fatGrams: 1.5,
    fiberGrams: 6,
  },
  sauce_condiment: {
    caloriesKcal: 90,
    proteinGrams: 3,
    carbohydrateGrams: 5,
    fatGrams: 6,
    fiberGrams: 0.5,
  },
  fat: {
    caloriesKcal: 884,
    proteinGrams: 0,
    carbohydrateGrams: 0,
    fatGrams: 100,
    fiberGrams: 0,
  },
  garnish: {
    caloriesKcal: 20,
    proteinGrams: 1,
    carbohydrateGrams: 3,
    fatGrams: 0.5,
    fiberGrams: 1,
  },
};

function nutritionForGrams(
  role: MealComponentRole,
  grams: number,
): IngredientNutrition {
  const per100 = ROLE_PER_100G[role] ?? ROLE_PER_100G.vegetable;
  const f = grams / 100;
  return {
    caloriesKcal: per100.caloriesKcal * f,
    proteinGrams: per100.proteinGrams * f,
    carbohydrateGrams: per100.carbohydrateGrams * f,
    fatGrams: per100.fatGrams * f,
    fiberGrams: per100.fiberGrams * f,
  };
}

export function buildLocalDemoNutritionMaps(input: {
  completeMealsByCandidateId: Record<string, CompleteMeal>;
  recipesByCandidateId: Record<string, ResolvedRecipe>;
}): {
  nutritionByCandidateId: Record<string, RecipeNutritionResult>;
  componentNutritionByKey: Record<
    string,
    { nutrition: IngredientNutrition; referenceYieldGrams?: number; baseServings?: number }
  >;
  nutritionSourceVersion: "local-demo-nutrition-v1";
} {
  const nutritionByCandidateId: Record<string, RecipeNutritionResult> = {};
  const componentNutritionByKey: Record<
    string,
    { nutrition: IngredientNutrition; referenceYieldGrams?: number; baseServings?: number }
  > = {};

  for (const meal of Object.values(input.completeMealsByCandidateId)) {
    const recipe = input.recipesByCandidateId[meal.candidateId];
    const baseServings = recipe?.baseServings ?? 4;
    const mainYield = 170;
    const perServing = nutritionForGrams("main", mainYield);
    const total: IngredientNutrition = {
      caloriesKcal: perServing.caloriesKcal * baseServings,
      proteinGrams: perServing.proteinGrams * baseServings,
      carbohydrateGrams: perServing.carbohydrateGrams * baseServings,
      fatGrams: perServing.fatGrams * baseServings,
      fiberGrams: (perServing.fiberGrams ?? 0) * baseServings,
    };
    const nutrition: RecipeNutrition = {
      total,
      perBaseServing: perServing,
      ingredientBreakdown: [],
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
    };
    nutritionByCandidateId[meal.candidateId] = {
      recipeId: recipe?.recipeId ?? meal.mainRecipeId,
      candidateId: meal.candidateId,
      recipeName: meal.name,
      baseServings,
      ingredients: [],
      mealComponents: [],
      nutrition,
      resolutionQuality: nutrition.resolutionQuality,
      policyVersions: {
        foodResolution: "food-resolution-v1",
        nutritionCalculation: "nutrition-calculation-v1",
        quantityNormalization: "quantity-normalization-v1",
      },
    };

    for (const component of meal.components) {
      if (component.role === "main") continue;
      const definition = component.definition ?? component.resolution?.definition;
      let yieldGrams =
        definition?.kind === "recipe_component"
          ? definition.referenceYieldGrams
          : undefined;
      if (yieldGrams == null && definition?.kind === "recipe_component") {
        const sum = definition.ingredients.reduce(
          (acc, ing) => acc + (ing.quantity ?? 0),
          0,
        );
        if (sum > 0) yieldGrams = sum;
      }
      yieldGrams =
        yieldGrams ??
        (component.role === "carbohydrate"
          ? 180
          : component.role === "sauce_condiment"
            ? 40
            : component.role === "garnish"
              ? 8
              : 120);
      const nutritionRow = nutritionForGrams(component.role, yieldGrams);
      componentNutritionByKey[component.normalizedComponentKey] = {
        nutrition: nutritionRow,
        referenceYieldGrams: yieldGrams,
        baseServings: 1,
      };
    }
  }

  return {
    nutritionByCandidateId,
    componentNutritionByKey,
    nutritionSourceVersion: "local-demo-nutrition-v1",
  };
}
