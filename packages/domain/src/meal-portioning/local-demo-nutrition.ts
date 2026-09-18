import type {
  CompleteMeal,
  IngredientNutrition,
  RecipeNutrition,
  RecipeNutritionResult,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import { isEdibleFoodIdentity } from "../meal-composition/edible-identity";
import { isUnresolvedPlaceholderName } from "../meal-composition/placeholders";
import {
  defaultRoleYieldGrams,
  roleStructuralNutritionForGrams,
} from "./role-structural-estimates";

/**
 * Local-planner / offline demo nutrition only.
 * Meal-name agnostic role coefficients — NOT a production substitute.
 *
 * WARNING: `main` uses lean-chicken macros (~42.5g protein / 170g).
 * Never use this for remote Generate My Plan — it inflates protein on
 * rice/veg/yogurt dishes (e.g. curd rice showing ~50g protein).
 */

function nutritionForGrams(
  role: Parameters<typeof roleStructuralNutritionForGrams>[0],
  grams: number,
): IngredientNutrition {
  return roleStructuralNutritionForGrams(role, grams);
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
    const mainYield = defaultRoleYieldGrams("main");
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
      if ((component.nutritionOwnership ?? "independent") === "parent_owned") continue;
      if (!isEdibleFoodIdentity(component.name) || isUnresolvedPlaceholderName(component.name)) {
        continue;
      }
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
      yieldGrams = yieldGrams ?? defaultRoleYieldGrams(component.role);
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
