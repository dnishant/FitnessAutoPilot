import type {
  DietaryPreference,
  Food,
  MealType,
  Recipe,
  RecipeIngredient,
  UserProfile,
} from "@fitness-autopilot/contracts";
import { ok, err, type Result } from "@fitness-autopilot/validation";
import type { NutritionTargetCalculation } from "../nutrition/target";
import { portionRecipe, type PortionedRecipe } from "./portioning";

export const PlannerPolicy = {
  mealCalorieShares: {
    breakfast: 0.25,
    lunch: 0.35,
    snack: 0.1,
    dinner: 0.3,
  } satisfies Record<MealType, number>,
  mealProteinShares: {
    breakfast: 0.25,
    lunch: 0.35,
    snack: 0.1,
    dinner: 0.3,
  } satisfies Record<MealType, number>,
  /** Include snack when daily calories are at/above this threshold. */
  includeSnackAtOrAboveCalories: 1800,
  dailyCalorieToleranceFraction: 0.08,
  /** Daily protein may not undershoot by more than this fraction; overshoot is allowed in v1. */
  dailyProteinUndershootFraction: 0.15,
} as const;

export type CatalogRecipe = {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
};

export type PlannedMeal = {
  mealType: MealType;
  calorieTarget: number;
  proteinTarget: number;
  portioned: PortionedRecipe;
};

export type OneDayPlanResult = {
  meals: PlannedMeal[];
  plannedCalories: number;
  plannedProteinG: number;
};

export type PlannerError = {
  code:
    | "empty_catalog"
    | "no_eligible_recipe"
    | "daily_tolerance_violation"
    | "portioning_failed";
  message: string;
  mealType?: MealType;
};

function dietaryCompatible(
  preference: DietaryPreference,
  dietaryTags: readonly string[],
): boolean {
  const tags = new Set(dietaryTags.map((t) => t.toLowerCase()));
  switch (preference) {
    case "vegan":
      return tags.has("vegan");
    case "vegetarian":
      return tags.has("vegetarian") || tags.has("vegan");
    case "pescatarian":
      return (
        tags.has("pescatarian") ||
        tags.has("vegetarian") ||
        tags.has("vegan") ||
        tags.has("omnivore")
      );
    case "halal":
      return tags.has("halal") || tags.has("vegetarian") || tags.has("vegan");
    case "omnivore":
    case "none":
      return true;
    default:
      return true;
  }
}

function scoreRecipe(
  recipe: Recipe,
  ingredients: readonly RecipeIngredient[],
  foodsById: ReadonlyMap<string, Food>,
  profile: UserProfile,
  mealType: MealType,
): number {
  let score = 0;
  if (recipe.mealTypes.includes(mealType)) {
    score += 10;
  }
  for (const cuisine of profile.cuisinePreferences) {
    if (recipe.cuisineTags.some((t) => t.toLowerCase() === cuisine.toLowerCase())) {
      score += 3;
    }
  }
  for (const preferred of profile.preferredFoods) {
    for (const ingredient of ingredients) {
      const food = foodsById.get(ingredient.foodId);
      if (food && food.name.toLowerCase().includes(preferred.toLowerCase())) {
        score += 2;
      }
    }
  }
  // Prefer shorter prep for lower skill
  if (profile.cookingSkill === "beginner" && recipe.prepMinutes + recipe.cookMinutes <= 25) {
    score += 2;
  }
  if (
    profile.maxMealPrepMinutes > 0 &&
    recipe.prepMinutes + recipe.cookMinutes <= profile.maxMealPrepMinutes
  ) {
    score += 1;
  }
  return score;
}

function recipeUsesDislikedOrAllergen(
  ingredients: readonly RecipeIngredient[],
  foodsById: ReadonlyMap<string, Food>,
  allergies: readonly string[],
  dislikedFoods: readonly string[],
): boolean {
  const allergySet = new Set(allergies.map((a) => a.toLowerCase()));
  for (const ingredient of ingredients) {
    const food = foodsById.get(ingredient.foodId);
    if (!food) {
      return true;
    }
    for (const tag of food.allergenTags) {
      if (allergySet.has(tag.toLowerCase())) {
        return true;
      }
    }
    for (const disliked of dislikedFoods) {
      if (disliked && food.name.toLowerCase().includes(disliked.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

function withinTolerance(actual: number, target: number, fraction: number): boolean {
  if (target === 0) {
    return actual === 0;
  }
  return Math.abs(actual - target) / target <= fraction;
}

export function planOneDay(args: {
  profile: UserProfile;
  nutritionTarget: Pick<
    NutritionTargetCalculation,
    "targetCalories" | "proteinG"
  >;
  catalog: readonly CatalogRecipe[];
  foodsById: ReadonlyMap<string, Food>;
}): Result<OneDayPlanResult, PlannerError> {
  const { profile, nutritionTarget, catalog, foodsById } = args;
  if (catalog.length === 0) {
    return err({ code: "empty_catalog", message: "Recipe catalog is empty." });
  }

  const mealTypes: MealType[] =
    nutritionTarget.targetCalories >= PlannerPolicy.includeSnackAtOrAboveCalories
      ? ["breakfast", "lunch", "snack", "dinner"]
      : ["breakfast", "lunch", "dinner"];

  // Renormalize shares when snack omitted
  const shareSum = mealTypes.reduce(
    (sum, mt) => sum + PlannerPolicy.mealCalorieShares[mt],
    0,
  );

  const meals: PlannedMeal[] = [];

  for (const mealType of mealTypes) {
    const calorieTarget = Math.round(
      (nutritionTarget.targetCalories * PlannerPolicy.mealCalorieShares[mealType]) /
        shareSum,
    );
    const proteinTarget =
      Math.round(
        ((nutritionTarget.proteinG * PlannerPolicy.mealProteinShares[mealType]) /
          shareSum) *
          10,
      ) / 10;

    const candidates = catalog
      .filter(({ recipe, ingredients }) => {
        if (recipe.status !== "active") {
          return false;
        }
        if (!recipe.mealTypes.includes(mealType)) {
          return false;
        }
        if (!dietaryCompatible(profile.dietaryPreference, recipe.dietaryTags)) {
          return false;
        }
        if (
          recipeUsesDislikedOrAllergen(
            ingredients,
            foodsById,
            profile.allergies,
            profile.dislikedFoods,
          )
        ) {
          return false;
        }
        return true;
      })
      .map((entry) => ({
        ...entry,
        score: scoreRecipe(entry.recipe, entry.ingredients, foodsById, profile, mealType),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // Deterministic tie-break
        return a.recipe.recipeKey.localeCompare(b.recipe.recipeKey);
      });

    if (candidates.length === 0) {
      return err({
        code: "no_eligible_recipe",
        message: `No eligible recipe for ${mealType}`,
        mealType,
      });
    }

    let chosen: PortionedRecipe | null = null;
    let lastError = "";
    for (const candidate of candidates) {
      const portioned = portionRecipe({
        recipe: candidate.recipe,
        ingredients: candidate.ingredients,
        foodsById,
        mealCalorieTarget: calorieTarget,
        mealProteinTarget: proteinTarget,
        prohibitedAllergens: profile.allergies,
        prohibitedFoodNameSubstrings: profile.dislikedFoods,
      });
      if (portioned.ok) {
        chosen = portioned.value;
        break;
      }
      lastError = portioned.error.message;
    }

    if (!chosen) {
      return err({
        code: "portioning_failed",
        message: `Could not portion any recipe for ${mealType}: ${lastError}`,
        mealType,
      });
    }

    meals.push({
      mealType,
      calorieTarget,
      proteinTarget,
      portioned: chosen,
    });
  }

  const plannedCalories = meals.reduce(
    (sum, m) => sum + m.portioned.nutrition.caloriesKcal,
    0,
  );
  const plannedProteinG =
    Math.round(
      meals.reduce((sum, m) => sum + m.portioned.nutrition.proteinG, 0) * 10,
    ) / 10;

  if (
    !withinTolerance(
      plannedCalories,
      nutritionTarget.targetCalories,
      PlannerPolicy.dailyCalorieToleranceFraction,
    )
  ) {
    return err({
      code: "daily_tolerance_violation",
      message: `Daily calories ${plannedCalories} outside tolerance of ${nutritionTarget.targetCalories}`,
    });
  }
  const proteinFloor =
    nutritionTarget.proteinG * (1 - PlannerPolicy.dailyProteinUndershootFraction);
  if (plannedProteinG < proteinFloor) {
    return err({
      code: "daily_tolerance_violation",
      message: `Daily protein ${plannedProteinG} below floor of ${proteinFloor} (target ${nutritionTarget.proteinG})`,
    });
  }

  return ok({ meals, plannedCalories, plannedProteinG });
}
