import type {
  Food,
  NutritionMacros,
  Recipe,
  RecipeIngredient,
} from "@fitness-autopilot/contracts";
import { ok, err, type Result } from "@fitness-autopilot/validation";
import { calculateFoodNutrition, sumNutrition } from "../nutrition/food.js";

export type RecipeNutritionLine = {
  ingredient: RecipeIngredient;
  food: Food;
  quantityG: number;
  nutrition: NutritionMacros;
};

export type RecipeNutrition = {
  totals: NutritionMacros;
  lines: RecipeNutritionLine[];
};

export type RecipeNutritionError = {
  code: "invalid_recipe" | "unknown_food" | "invalid_quantity";
  message: string;
};

export function calculateRecipeNutrition(
  recipe: Recipe,
  ingredients: readonly RecipeIngredient[],
  foodsById: ReadonlyMap<string, Food>,
  quantitiesByIngredientId?: ReadonlyMap<string, number>,
): Result<RecipeNutrition, RecipeNutritionError> {
  if (recipe.baseServings <= 0) {
    return err({ code: "invalid_recipe", message: "Recipe servings must be > 0." });
  }
  if (ingredients.length === 0) {
    return err({ code: "invalid_recipe", message: "Recipe has no ingredients." });
  }

  const lines: RecipeNutritionLine[] = [];
  for (const ingredient of ingredients) {
    if (ingredient.recipeId !== recipe.id) {
      return err({
        code: "invalid_recipe",
        message: `Ingredient ${ingredient.id} does not belong to recipe ${recipe.id}.`,
      });
    }
    const food = foodsById.get(ingredient.foodId);
    if (!food) {
      return err({
        code: "unknown_food",
        message: `Unknown food reference: ${ingredient.foodId}`,
      });
    }
    const quantityG =
      quantitiesByIngredientId?.get(ingredient.id) ?? ingredient.baseQuantityG;
    if (!Number.isFinite(quantityG) || quantityG <= 0) {
      return err({
        code: "invalid_quantity",
        message: `Quantity for ingredient ${ingredient.id} must be > 0.`,
      });
    }
    const nutritionResult = calculateFoodNutrition(food, quantityG);
    if (!nutritionResult.ok) {
      return err({
        code: nutritionResult.error.code === "invalid_food" ? "invalid_recipe" : "invalid_quantity",
        message: nutritionResult.error.message,
      });
    }
    lines.push({
      ingredient,
      food,
      quantityG,
      nutrition: nutritionResult.value,
    });
  }

  return ok({
    totals: sumNutrition(lines.map((l) => l.nutrition)),
    lines,
  });
}
