import type {
  IngredientNutritionBreakdown,
  MealComponent,
  MealComponentNutrition,
  RecipeNutrition,
  RecipeNutritionResolutionQuality,
  RecipeNutritionResult,
  ResolvedNutritionIngredient,
  ResolvedRecipe,
  WeeklyRecipeNutritionResult,
} from "@fitness-autopilot/contracts";
import {
  DEFAULT_FOOD_RESOLUTION_CONCURRENCY,
  FOOD_RESOLUTION_POLICY_VERSION,
  NUTRITION_CALCULATION_POLICY_VERSION,
  QUANTITY_NORMALIZATION_POLICY_VERSION,
} from "@fitness-autopilot/contracts";
import { mapWithConcurrency } from "../recipes/recipe-resolution";
import {
  emptyDiagnostics,
  type MutableDiagnostics,
  FoodResolutionMemoryCache,
} from "./caches";
import type { FoodResolver } from "./food-resolver";
import { calculateNutritionForGrams, scaleNutrition, sumIngredientNutrition } from "./nutrition-arithmetic";
import { defaultQuantityNormalizer, type QuantityNormalizer } from "./quantity-normalizer";

export type ResolveRecipeNutritionOptions = {
  resolver: FoodResolver;
  quantityNormalizer?: QuantityNormalizer;
  diagnostics?: MutableDiagnostics;
};

function classifyMealComponent(component: MealComponent): MealComponentNutrition {
  if (component.relationship === "intrinsic") {
    return {
      mealComponent: component,
      status: "intrinsic_covered",
      note: "Intrinsic component nutrition is covered by recipe ingredients.",
    };
  }
  // recommended_side / optional without a recipe quantity — do not invent portions.
  return {
    mealComponent: component,
    status: "pending_portioning",
    note: "No base quantity supplied; portion solver (PLAN-010) owns serving size.",
  };
}

function buildQuality(
  ingredients: readonly ResolvedNutritionIngredient[],
  mealComponents: readonly MealComponentNutrition[],
): RecipeNutritionResolutionQuality {
  let resolvedIngredientCount = 0;
  let ambiguousIngredientCount = 0;
  let unresolvedIngredientCount = 0;
  let highConfidenceCount = 0;
  let mediumConfidenceCount = 0;
  let directMassConversionCount = 0;
  let providerMeasureConversionCount = 0;
  let lowConfidenceConversionCount = 0;
  let blocked = false;
  let partial = false;

  for (const row of ingredients) {
    if (row.foodResolution.status === "resolved" && row.nutrition && row.normalizedQuantity) {
      resolvedIngredientCount += 1;
      if (row.foodResolution.confidence === "high") highConfidenceCount += 1;
      else mediumConfidenceCount += 1;
      if (row.normalizedQuantity.method === "direct_mass") directMassConversionCount += 1;
      if (row.normalizedQuantity.method === "provider_measure") {
        providerMeasureConversionCount += 1;
      }
      if (row.normalizedQuantity.confidence === "low") lowConfidenceConversionCount += 1;
    } else if (row.foodResolution.status === "ambiguous") {
      ambiguousIngredientCount += 1;
      blocked = true;
    } else if (row.quantityStatus === "pending_portioning") {
      unresolvedIngredientCount += 1;
      partial = true;
    } else {
      unresolvedIngredientCount += 1;
      blocked = true;
    }
  }

  const pendingPortioningComponentCount = mealComponents.filter(
    (c) => c.status === "pending_portioning",
  ).length;
  if (pendingPortioningComponentCount > 0) partial = true;

  let status: RecipeNutritionResolutionQuality["status"] = "complete";
  if (blocked) status = "blocked";
  else if (partial) status = "partial";

  return {
    status,
    totalIngredientCount: ingredients.length,
    resolvedIngredientCount,
    ambiguousIngredientCount,
    unresolvedIngredientCount,
    highConfidenceCount,
    mediumConfidenceCount,
    directMassConversionCount,
    providerMeasureConversionCount,
    lowConfidenceConversionCount,
    pendingPortioningComponentCount,
  };
}

export async function resolveRecipeNutrition(
  recipe: ResolvedRecipe,
  options: ResolveRecipeNutritionOptions,
): Promise<RecipeNutritionResult> {
  const normalizer = options.quantityNormalizer ?? defaultQuantityNormalizer;
  const ingredients: ResolvedNutritionIngredient[] = [];

  for (const ingredient of recipe.ingredients) {
    const foodResolution = await options.resolver.resolve(ingredient);

    if (foodResolution.status !== "resolved") {
      ingredients.push({
        recipeIngredient: ingredient,
        foodResolution,
        normalizedQuantity: null,
        nutrition: null,
        quantityStatus: "skipped",
      });
      continue;
    }

    const normalized = normalizer.toGrams(ingredient.quantity, ingredient.unit, {
      food: foodResolution.food,
      measurementState: ingredient.measurementState,
      ingredientName: ingredient.name,
    });

    if (!normalized.ok) {
      ingredients.push({
        recipeIngredient: ingredient,
        foodResolution,
        normalizedQuantity: null,
        nutrition: null,
        quantityStatus: "conversion_failed",
      });
      continue;
    }

    const nutrition = calculateNutritionForGrams(
      foodResolution.food.nutrientsPer100g,
      normalized.value.grams,
    );

    ingredients.push({
      recipeIngredient: ingredient,
      foodResolution,
      normalizedQuantity: normalized.value,
      nutrition,
      quantityStatus: "normalized",
    });
  }

  const mealComponents = recipe.mealComponents.map(classifyMealComponent);
  const resolutionQuality = buildQuality(ingredients, mealComponents);

  const breakdown: IngredientNutritionBreakdown[] = ingredients.map((row) => {
    if (row.foodResolution.status === "ambiguous") {
      return {
        ingredientId: row.recipeIngredient.ingredientId,
        ingredientName: row.recipeIngredient.name,
        status: "ambiguous",
      };
    }
    if (row.foodResolution.status === "not_found") {
      return {
        ingredientId: row.recipeIngredient.ingredientId,
        ingredientName: row.recipeIngredient.name,
        status: "not_found",
      };
    }
    if (row.quantityStatus === "conversion_failed") {
      return {
        ingredientId: row.recipeIngredient.ingredientId,
        ingredientName: row.recipeIngredient.name,
        foodId: row.foodResolution.status === "resolved" ? row.foodResolution.food.foodId : undefined,
        foodDescription:
          row.foodResolution.status === "resolved" ? row.foodResolution.food.description : undefined,
        status: "conversion_failed",
      };
    }
    if (row.foodResolution.status === "resolved" && row.nutrition && row.normalizedQuantity) {
      return {
        ingredientId: row.recipeIngredient.ingredientId,
        ingredientName: row.recipeIngredient.name,
        foodId: row.foodResolution.food.foodId,
        foodDescription: row.foodResolution.food.description,
        grams: row.normalizedQuantity.grams,
        nutrition: row.nutrition,
        status: "resolved",
      };
    }
    return {
      ingredientId: row.recipeIngredient.ingredientId,
      ingredientName: row.recipeIngredient.name,
      status: "pending_portioning",
    };
  });

  let nutrition: RecipeNutrition | undefined;
  const parts = ingredients
    .map((i) => i.nutrition)
    .filter((n): n is NonNullable<typeof n> => n != null);

  if (resolutionQuality.status !== "blocked" && parts.length > 0) {
    const total = sumIngredientNutrition(parts);
    nutrition = {
      total,
      perBaseServing: scaleNutrition(total, recipe.baseServings),
      ingredientBreakdown: breakdown,
      resolutionQuality,
    };
  } else if (parts.length > 0 || breakdown.length > 0) {
    // Blocked/incomplete: expose breakdown without presenting totals as authoritative.
    nutrition = {
      total: sumIngredientNutrition(parts),
      perBaseServing:
        parts.length > 0
          ? scaleNutrition(sumIngredientNutrition(parts), recipe.baseServings)
          : {
              caloriesKcal: 0,
              proteinGrams: 0,
              carbohydrateGrams: 0,
              fatGrams: 0,
            },
      ingredientBreakdown: breakdown,
      resolutionQuality,
    };
  }

  return {
    recipeId: recipe.recipeId,
    candidateId: recipe.candidateId,
    recipeName: recipe.name,
    baseServings: recipe.baseServings,
    ingredients,
    mealComponents,
    nutrition,
    resolutionQuality,
    policyVersions: {
      foodResolution: FOOD_RESOLUTION_POLICY_VERSION,
      nutritionCalculation: NUTRITION_CALCULATION_POLICY_VERSION,
      quantityNormalization: QUANTITY_NORMALIZATION_POLICY_VERSION,
    },
  };
}

export type ResolveWeeklyRecipeNutritionInput = {
  recipes: ResolvedRecipe[];
  uniqueCandidateIds?: string[];
  resolver: FoodResolver;
  quantityNormalizer?: QuantityNormalizer;
  concurrency?: number;
  /** Weekly slot count for diagnostics (defaults to recipes.length). */
  slotCount?: number;
};

/**
 * Resolve nutrition for unique PLAN-008 recipes (not per weekly slot).
 */
export async function resolveWeeklyRecipeNutrition(
  input: ResolveWeeklyRecipeNutritionInput,
): Promise<WeeklyRecipeNutritionResult> {
  const concurrency = input.concurrency ?? DEFAULT_FOOD_RESOLUTION_CONCURRENCY;
  const diagnostics = emptyDiagnostics();
  // Share diagnostics + inflight across recipes via resolver if supported.
  const ids =
    input.uniqueCandidateIds ??
    [...new Set(input.recipes.map((r) => r.candidateId))];
  const byId = new Map(input.recipes.map((r) => [r.candidateId, r]));
  const selected = ids
    .map((id) => byId.get(id))
    .filter((r): r is ResolvedRecipe => r != null);

  const results = await mapWithConcurrency(selected, concurrency, async (recipe) =>
    resolveRecipeNutrition(recipe, {
      resolver: input.resolver,
      quantityNormalizer: input.quantityNormalizer,
      diagnostics,
    }),
  );

  const recipesByCandidateId: Record<string, RecipeNutritionResult> = {};
  let completeCount = 0;
  let partialCount = 0;
  let blockedCount = 0;
  for (const result of results) {
    recipesByCandidateId[result.candidateId] = result;
    if (result.resolutionQuality.status === "complete") completeCount += 1;
    else if (result.resolutionQuality.status === "partial") partialCount += 1;
    else blockedCount += 1;
  }

  // Merge resolver diagnostics if available.
  const resolverDiag = input.resolver.getDiagnostics?.();
  const merged = resolverDiag ?? diagnostics;

  return {
    recipesByCandidateId,
    uniqueCandidateIds: selected.map((r) => r.candidateId),
    recipeCount: selected.length,
    slotCount: input.slotCount ?? input.recipes.length,
    diagnostics: merged,
    completeCount,
    partialCount,
    blockedCount,
  };
}

export function createSharedFoodResolutionContext(): {
  cache: FoodResolutionMemoryCache;
  diagnostics: MutableDiagnostics;
  inflight: Map<string, Promise<import("@fitness-autopilot/contracts").FoodResolutionResult>>;
} {
  return {
    cache: new FoodResolutionMemoryCache(),
    diagnostics: emptyDiagnostics(),
    inflight: new Map(),
  };
}
