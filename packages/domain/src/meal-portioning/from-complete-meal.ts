import type {
  CompleteMeal,
  CompleteMealComponent,
  ComponentNutritionCoefficient,
  ComponentRecipeDefinition,
  IngredientNutrition,
  MealNutritionIntent,
  NutrientsPer100g,
  RecipeNutritionResult,
  SolveMealPortionsRequest,
} from "@fitness-autopilot/contracts";
import {
  MEAL_PORTION_POLICY_VERSION,
  NUTRITION_CALCULATION_POLICY_VERSION,
} from "@fitness-autopilot/contracts";
import type { FoodResolver } from "../food-resolution/food-resolver";
import {
  calculateNutritionForGrams,
  scaleNutrition,
  sumIngredientNutrition,
} from "../food-resolution/nutrition-arithmetic";
import { defaultQuantityNormalizer } from "../food-resolution/quantity-normalizer";
import { hasRequiredMacros } from "./nutrition";

export type ComponentBaseNutrition = {
  baseNutrition: IngredientNutrition;
  baseServings: number;
  referenceYieldGrams?: number;
};

export type BuildSolveRequestFromCompleteMealInput = {
  mealId: string;
  mealName?: string;
  completeMeal: CompleteMeal;
  nutritionIntent: MealNutritionIntent;
  /** PLAN-009 result for the main dish recipe. */
  mainNutrition?: RecipeNutritionResult | null;
  /**
   * Optional PLAN-009-style per-serving nutrition for compound side components,
   * keyed by componentId or normalizedComponentKey.
   */
  componentNutritionById?: Record<string, ComponentBaseNutrition>;
  nutritionSourceVersion?: string;
};

export type BuildSolveRequestFailure = {
  ok: false;
  reason: string;
  missingComponentIds: string[];
};

export type BuildSolveRequestSuccess = {
  ok: true;
  request: SolveMealPortionsRequest;
};

/**
 * Build a PLAN-010 solve request from a CompleteMeal + trusted PLAN-009 nutrition.
 * Never invents USDA values — components without authoritative nutrition are reported missing.
 */
export function buildSolveMealPortionsRequestFromCompleteMeal(
  input: BuildSolveRequestFromCompleteMealInput,
): BuildSolveRequestSuccess | BuildSolveRequestFailure {
  const coefficients: ComponentNutritionCoefficient[] = [];
  const missingComponentIds: string[] = [];

  for (const component of input.completeMeal.components) {
    const built = coefficientForComponent(component, input);
    if (!built.ok) {
      missingComponentIds.push(component.componentId);
      continue;
    }
    coefficients.push(built.coefficient);
  }

  if (coefficients.length === 0) {
    return {
      ok: false,
      reason: "No plate components have trusted nutrition coefficients.",
      missingComponentIds,
    };
  }

  // Require every plate component to be quantifiable — partial plates invent nothing.
  if (missingComponentIds.length > 0) {
    return {
      ok: false,
      reason: `Missing trusted nutrition for: ${missingComponentIds.join(", ")}`,
      missingComponentIds,
    };
  }

  return {
    ok: true,
    request: {
      mealId: input.mealId,
      mealName: input.mealName ?? input.completeMeal.name,
      sourceCompleteMealId: input.completeMeal.mealId,
      components: coefficients,
      nutritionIntent: input.nutritionIntent,
      policyVersion: MEAL_PORTION_POLICY_VERSION,
      nutritionSourceVersion:
        input.nutritionSourceVersion ?? NUTRITION_CALCULATION_POLICY_VERSION,
    },
  };
}

/**
 * Resolve compound side nutrition from a structured component recipe + FoodResolver.
 * Returns per-serving base nutrition (batch ÷ baseServings).
 */
export async function resolveCompoundComponentBaseNutrition(
  definition: ComponentRecipeDefinition,
  foodResolver: FoodResolver,
): Promise<ComponentBaseNutrition | null> {
  const parts: IngredientNutrition[] = [];
  let yieldGrams = 0;
  let yieldCounted = 0;

  for (const [index, ingredient] of definition.ingredients.entries()) {
    if (ingredient.quantity == null || !ingredient.unit) {
      return null;
    }
    const foodResolution = await foodResolver.resolve({
      ingredientId: `compound-${index}-${ingredient.name}`,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      role: ingredient.role === "protein" ? "protein" : "other",
      scalingBehavior: "primary_scalable",
      preparation: ingredient.preparation ?? undefined,
    });
    if (foodResolution.status !== "resolved") {
      return null;
    }
    const normalized = defaultQuantityNormalizer.toGrams(
      ingredient.quantity,
      ingredient.unit,
      {
        food: foodResolution.food,
        ingredientName: ingredient.name,
      },
    );
    if (!normalized.ok) {
      return null;
    }
    parts.push(
      calculateNutritionForGrams(foodResolution.food.nutrientsPer100g, normalized.value.grams),
    );
    yieldGrams += normalized.value.grams;
    yieldCounted += 1;
  }

  if (parts.length === 0) return null;
  const batchTotal = sumIngredientNutrition(parts);
  const baseServings = definition.baseServings ?? 1;
  if (!(baseServings > 0)) return null;
  const baseNutrition = scaleNutrition(batchTotal, baseServings);
  if (!hasRequiredMacros(baseNutrition)) return null;

  const referenceYieldGrams =
    definition.referenceYieldGrams != null
      ? definition.referenceYieldGrams / baseServings
      : yieldCounted > 0
        ? yieldGrams / baseServings
        : undefined;

  return {
    baseNutrition,
    baseServings: 1,
    referenceYieldGrams,
  };
}

function coefficientForComponent(
  component: CompleteMealComponent,
  input: BuildSolveRequestFromCompleteMealInput,
):
  | { ok: true; coefficient: ComponentNutritionCoefficient }
  | { ok: false } {
  if (isMainComponent(component)) {
    return mainCoefficient(component, input.mainNutrition);
  }

  const fromMap = lookupComponentNutrition(component, input.componentNutritionById);
  if (fromMap) {
    return {
      ok: true,
      coefficient: {
        kind: "recipe_scale",
        componentId: component.componentId,
        displayName: component.name,
        role: component.role,
        baseNutrition: fromMap.baseNutrition,
        baseServings: fromMap.baseServings,
        referenceYieldGrams: fromMap.referenceYieldGrams,
        requiresReferenceYield: fromMap.referenceYieldGrams != null,
      },
    };
  }

  const atomic = atomicFoodCoefficient(component);
  if (atomic) return { ok: true, coefficient: atomic };

  return { ok: false };
}

function isMainComponent(component: CompleteMealComponent): boolean {
  return (
    component.role === "main" ||
    component.relationship === "intrinsic" ||
    component.source === "main_recipe"
  );
}

function mainCoefficient(
  component: CompleteMealComponent,
  mainNutrition: RecipeNutritionResult | null | undefined,
):
  | { ok: true; coefficient: ComponentNutritionCoefficient }
  | { ok: false } {
  const perServing = mainNutrition?.nutrition?.perBaseServing;
  if (!perServing || !hasRequiredMacros(perServing)) {
    return { ok: false };
  }

  const referenceYieldGrams = estimateReferenceYieldGrams(mainNutrition);
  return {
    ok: true,
    coefficient: {
      kind: "recipe_scale",
      componentId: component.componentId,
      displayName: component.name,
      role: component.role === "main" ? "main" : component.role,
      baseNutrition: perServing,
      baseServings: 1,
      referenceYieldGrams,
      requiresReferenceYield: referenceYieldGrams != null,
    },
  };
}

function estimateReferenceYieldGrams(
  mainNutrition: RecipeNutritionResult | null | undefined,
): number | undefined {
  if (!mainNutrition) return undefined;
  let total = 0;
  let counted = 0;
  for (const row of mainNutrition.ingredients) {
    const grams = row.normalizedQuantity?.grams;
    if (grams != null && grams > 0 && row.quantityStatus === "normalized") {
      total += grams;
      counted += 1;
    }
  }
  if (counted === 0 || !(total > 0)) return undefined;
  const perServing = total / Math.max(mainNutrition.baseServings, 1);
  return perServing > 0 ? perServing : undefined;
}

function lookupComponentNutrition(
  component: CompleteMealComponent,
  map: Record<string, ComponentBaseNutrition> | undefined,
): ComponentBaseNutrition | undefined {
  if (!map) return undefined;
  return map[component.componentId] ?? map[component.normalizedComponentKey] ?? undefined;
}

function atomicFoodCoefficient(
  component: CompleteMealComponent,
): ComponentNutritionCoefficient | null {
  const resolution = component.resolution;
  if (resolution?.status !== "canonical_food_resolved") return null;
  const foodResolution = resolution.foodResolution;
  if (!foodResolution || foodResolution.status !== "resolved") return null;
  const nutrients = foodResolution.food.nutrientsPer100g;
  if (!hasRequiredNutrientsPer100g(nutrients)) return null;

  const discrete = discreteCountCoefficient(component, nutrients);
  if (discrete) return discrete;

  return {
    kind: "food_grams",
    componentId: component.componentId,
    displayName: component.name,
    role: component.role,
    nutritionPer100g: {
      caloriesKcal: nutrients.caloriesKcal,
      proteinGrams: nutrients.proteinGrams,
      carbohydrateGrams: nutrients.carbohydrateGrams,
      fatGrams: nutrients.fatGrams,
      fiberGrams: nutrients.fiberGrams ?? null,
    },
  };
}

function discreteCountCoefficient(
  component: CompleteMealComponent,
  nutrients: NutrientsPer100g,
): ComponentNutritionCoefficient | null {
  const name = component.name.toLowerCase();
  const isTortilla = /tortilla|taco shell/.test(name);
  const isEgg = /\beggs?\b/.test(name);
  if (!isTortilla && !isEgg) return null;

  const gramsPerUnit = isEgg ? 50 : 30;
  const nutritionPerUnit: IngredientNutrition = {
    caloriesKcal: (nutrients.caloriesKcal * gramsPerUnit) / 100,
    proteinGrams: (nutrients.proteinGrams * gramsPerUnit) / 100,
    carbohydrateGrams: (nutrients.carbohydrateGrams * gramsPerUnit) / 100,
    fatGrams: (nutrients.fatGrams * gramsPerUnit) / 100,
  };
  if (nutrients.fiberGrams != null) {
    nutritionPerUnit.fiberGrams = (nutrients.fiberGrams * gramsPerUnit) / 100;
  }
  if (!hasRequiredMacros(nutritionPerUnit)) return null;

  return {
    kind: "count",
    componentId: component.componentId,
    displayName: component.name,
    role: component.role,
    nutritionPerUnit,
    unitLabel: isEgg ? "eggs" : "tortillas",
    quantityStep: 1,
  };
}

function hasRequiredNutrientsPer100g(nutrients: NutrientsPer100g): boolean {
  return (
    Number.isFinite(nutrients.caloriesKcal) &&
    Number.isFinite(nutrients.proteinGrams) &&
    Number.isFinite(nutrients.carbohydrateGrams) &&
    Number.isFinite(nutrients.fatGrams)
  );
}
