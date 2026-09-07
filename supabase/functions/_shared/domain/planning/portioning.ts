import type {
  Food,
  NutritionMacros,
  Recipe,
  RecipeIngredient,
} from "../../contracts/index.ts";
import { ok, err, type Result } from "../../validation/index.ts";
import { roundGrams } from "../common/rounding.js";
import { calculateRecipeNutrition } from "../recipes/nutrition.js";

export const PortioningPolicy = {
  calorieToleranceFraction: 0.08,
  /** Undershoot tolerance relative to meal protein target. */
  proteinUndershootFraction: 0.12,
  /**
   * Protein overshoot is allowed without an upper bound in v1.
   * Fitness meals often exceed meal protein shares when using high-protein recipes.
   */
  defaultMinMultiplier: 0.5,
  defaultMaxMultiplier: 2.0,
} as const;

export type PortioningFailureReason =
  | "protein_target_unreachable"
  | "calorie_target_unreachable"
  | "ingredient_bound_violation"
  | "dietary_restriction_violation"
  | "invalid_recipe";

export type PortioningError = {
  code: PortioningFailureReason;
  message: string;
};

export type PortionedRecipe = {
  recipe: Recipe;
  quantitiesByIngredientId: Map<string, number>;
  nutrition: NutritionMacros;
  lines: Array<{
    recipeIngredientId: string;
    foodId: string;
    foodName: string;
    role: RecipeIngredient["role"];
    quantityG: number;
    nutrition: NutritionMacros;
  }>;
};

export type PortionRecipeInput = {
  recipe: Recipe;
  ingredients: readonly RecipeIngredient[];
  foodsById: ReadonlyMap<string, Food>;
  mealCalorieTarget: number;
  mealProteinTarget: number;
  prohibitedAllergens?: readonly string[];
  prohibitedFoodNameSubstrings?: readonly string[];
};

function multipliers(ingredient: RecipeIngredient): { min: number; max: number } {
  return {
    min: ingredient.minMultiplier ?? PortioningPolicy.defaultMinMultiplier,
    max: ingredient.maxMultiplier ?? PortioningPolicy.defaultMaxMultiplier,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function withinCalorieTolerance(actual: number, target: number): boolean {
  if (target === 0) {
    return actual === 0;
  }
  return Math.abs(actual - target) / target <= PortioningPolicy.calorieToleranceFraction;
}

function proteinAcceptable(actual: number, target: number): boolean {
  if (target === 0) {
    return actual >= 0;
  }
  const min = target * (1 - PortioningPolicy.proteinUndershootFraction);
  return actual >= min;
}

function pickPrimary(
  ingredients: readonly RecipeIngredient[],
  role: RecipeIngredient["role"],
): RecipeIngredient | undefined {
  return ingredients.find((i) => i.role === role && i.scalable);
}

function setScaledQuantity(
  quantities: Map<string, number>,
  ingredient: RecipeIngredient,
  desiredG: number,
): void {
  const { min, max } = multipliers(ingredient);
  const clamped = clamp(
    desiredG,
    ingredient.baseQuantityG * min,
    ingredient.baseQuantityG * max,
  );
  quantities.set(ingredient.id, roundGrams(clamped));
}

/**
 * Deterministic heuristic portioning:
 * 1) start from base recipe quantities
 * 2) scale primary protein toward protein target (never scale down when calories are short)
 * 3) scale primary carbohydrate toward calorie target
 * 4) optionally scale primary fat if calories still short/long
 * 5) validate ingredient bounds and meal tolerances
 */
export function portionRecipe(
  input: PortionRecipeInput,
): Result<PortionedRecipe, PortioningError> {
  const {
    recipe,
    ingredients,
    foodsById,
    mealCalorieTarget,
    mealProteinTarget,
    prohibitedAllergens = [],
    prohibitedFoodNameSubstrings = [],
  } = input;

  if (
    !Number.isFinite(mealCalorieTarget) ||
    mealCalorieTarget <= 0 ||
    !Number.isFinite(mealProteinTarget) ||
    mealProteinTarget < 0
  ) {
    return err({ code: "invalid_recipe", message: "Meal targets must be finite and valid." });
  }

  const allergenSet = new Set(prohibitedAllergens.map((a) => a.toLowerCase()));
  const dislikeNeedles = prohibitedFoodNameSubstrings.map((s) => s.toLowerCase());

  for (const ingredient of ingredients) {
    const food = foodsById.get(ingredient.foodId);
    if (!food) {
      return err({
        code: "invalid_recipe",
        message: `Unknown food ${ingredient.foodId}`,
      });
    }
    for (const tag of food.allergenTags) {
      if (allergenSet.has(tag.toLowerCase())) {
        return err({
          code: "dietary_restriction_violation",
          message: `Recipe contains allergen tag: ${tag}`,
        });
      }
    }
    const name = food.name.toLowerCase();
    for (const needle of dislikeNeedles) {
      if (needle && name.includes(needle)) {
        return err({
          code: "dietary_restriction_violation",
          message: `Recipe contains disliked food: ${food.name}`,
        });
      }
    }
  }

  const quantities = new Map<string, number>();
  for (const ingredient of ingredients) {
    quantities.set(ingredient.id, ingredient.baseQuantityG);
  }

  const base = calculateRecipeNutrition(recipe, ingredients, foodsById, quantities);
  if (!base.ok) {
    return err({ code: "invalid_recipe", message: base.error.message });
  }

  const proteinIngredient = pickPrimary(ingredients, "protein");
  if (proteinIngredient) {
    const food = foodsById.get(proteinIngredient.foodId);
    if (!food) {
      return err({ code: "invalid_recipe", message: "Missing protein food." });
    }
    const proteinFromThis =
      (proteinIngredient.baseQuantityG / 100) * food.proteinGPer100g;
    const otherProtein = base.value.totals.proteinG - proteinFromThis;
    const neededFromThis = Math.max(0, mealProteinTarget - otherProtein);
    let desiredG =
      food.proteinGPer100g > 0
        ? (neededFromThis / food.proteinGPer100g) * 100
        : proteinIngredient.baseQuantityG;

    // Do not scale protein down when the meal still needs more calories.
    if (
      base.value.totals.caloriesKcal < mealCalorieTarget &&
      desiredG < proteinIngredient.baseQuantityG
    ) {
      desiredG = proteinIngredient.baseQuantityG;
    }

    setScaledQuantity(quantities, proteinIngredient, desiredG);
  }

  let current = calculateRecipeNutrition(recipe, ingredients, foodsById, quantities);
  if (!current.ok) {
    return err({ code: "invalid_recipe", message: current.error.message });
  }

  const carbIngredient = pickPrimary(ingredients, "carbohydrate");
  if (carbIngredient) {
    const food = foodsById.get(carbIngredient.foodId);
    if (!food) {
      return err({ code: "invalid_recipe", message: "Missing carb food." });
    }
    const currentQty = quantities.get(carbIngredient.id) ?? carbIngredient.baseQuantityG;
    const caloriesFromThis = (currentQty / 100) * food.caloriesPer100g;
    const otherCalories = current.value.totals.caloriesKcal - caloriesFromThis;
    const neededFromThis = Math.max(0, mealCalorieTarget - otherCalories);
    const desiredG =
      food.caloriesPer100g > 0 ? (neededFromThis / food.caloriesPer100g) * 100 : currentQty;
    setScaledQuantity(quantities, carbIngredient, desiredG);
  }

  current = calculateRecipeNutrition(recipe, ingredients, foodsById, quantities);
  if (!current.ok) {
    return err({ code: "invalid_recipe", message: current.error.message });
  }

  const fatIngredient = pickPrimary(ingredients, "fat");
  if (fatIngredient && !withinCalorieTolerance(current.value.totals.caloriesKcal, mealCalorieTarget)) {
    const food = foodsById.get(fatIngredient.foodId);
    if (!food) {
      return err({ code: "invalid_recipe", message: "Missing fat food." });
    }
    const currentQty = quantities.get(fatIngredient.id) ?? fatIngredient.baseQuantityG;
    const caloriesFromThis = (currentQty / 100) * food.caloriesPer100g;
    const otherCalories = current.value.totals.caloriesKcal - caloriesFromThis;
    const neededFromThis = Math.max(0, mealCalorieTarget - otherCalories);
    const desiredG =
      food.caloriesPer100g > 0 ? (neededFromThis / food.caloriesPer100g) * 100 : currentQty;
    setScaledQuantity(quantities, fatIngredient, desiredG);
  }

  // If still short on calories, push remaining scalable carbs/fats toward max.
  current = calculateRecipeNutrition(recipe, ingredients, foodsById, quantities);
  if (!current.ok) {
    return err({ code: "invalid_recipe", message: current.error.message });
  }
  if (current.value.totals.caloriesKcal < mealCalorieTarget * (1 - PortioningPolicy.calorieToleranceFraction)) {
    for (const ingredient of ingredients) {
      if (!ingredient.scalable) continue;
      if (ingredient.role !== "carbohydrate" && ingredient.role !== "fat") continue;
      const { max } = multipliers(ingredient);
      quantities.set(ingredient.id, roundGrams(ingredient.baseQuantityG * max));
    }
  }

  const finalResult = calculateRecipeNutrition(recipe, ingredients, foodsById, quantities);
  if (!finalResult.ok) {
    return err({ code: "invalid_recipe", message: finalResult.error.message });
  }

  for (const ingredient of ingredients) {
    const qty = quantities.get(ingredient.id);
    if (qty === undefined || qty <= 0) {
      return err({
        code: "ingredient_bound_violation",
        message: `Invalid quantity for ${ingredient.id}`,
      });
    }
    if (ingredient.scalable) {
      const { min, max } = multipliers(ingredient);
      const lo = ingredient.baseQuantityG * min;
      const hi = ingredient.baseQuantityG * max;
      if (qty < lo - 0.5 || qty > hi + 0.5) {
        return err({
          code: "ingredient_bound_violation",
          message: `Ingredient ${ingredient.id} quantity ${qty}g outside [${lo}, ${hi}]`,
        });
      }
    }
  }

  const { totals } = finalResult.value;
  if (!proteinAcceptable(totals.proteinG, mealProteinTarget)) {
    return err({
      code: "protein_target_unreachable",
      message: `Protein ${totals.proteinG}g not within tolerance of ${mealProteinTarget}g`,
    });
  }
  if (!withinCalorieTolerance(totals.caloriesKcal, mealCalorieTarget)) {
    return err({
      code: "calorie_target_unreachable",
      message: `Calories ${totals.caloriesKcal} not within tolerance of ${mealCalorieTarget}`,
    });
  }

  return ok({
    recipe,
    quantitiesByIngredientId: quantities,
    nutrition: totals,
    lines: finalResult.value.lines.map((line) => ({
      recipeIngredientId: line.ingredient.id,
      foodId: line.food.id,
      foodName: line.food.name,
      role: line.ingredient.role,
      quantityG: roundGrams(line.quantityG),
      nutrition: line.nutrition,
    })),
  });
}
