import type {
  CompleteMeal,
  CompleteMealComponent,
  ComponentRecipeIngredient,
  IngredientNutrition,
  ResolvedRecipeIngredient,
} from "@fitness-autopilot/contracts";
import type { FoodResolver } from "../food-resolution/food-resolver";
import {
  calculateNutritionForGrams,
  sumIngredientNutrition,
} from "../food-resolution/nutrition-arithmetic";
import { defaultQuantityNormalizer } from "../food-resolution/quantity-normalizer";
import { matchDiscreteStapleEstimate } from "./staple-estimates";

export type ComponentNutritionEntry = {
  nutrition: IngredientNutrition;
  referenceYieldGrams?: number;
  baseServings?: number;
  source: "complete_meal_resolution" | "food_resolution" | "recipe_component_sum";
};

/**
 * Sync extract of trusted component nutrition already present on CompleteMeal
 * resolutions (after PLAN-009 / selected-resolution enrichment).
 */
export function buildComponentNutritionByKeyFromCompleteMeals(
  completeMealsByCandidateId: Record<string, CompleteMeal>,
): Record<string, ComponentNutritionEntry> {
  const out: Record<string, ComponentNutritionEntry> = {};
  for (const meal of Object.values(completeMealsByCandidateId)) {
    for (const component of meal.components) {
      if (component.role === "main") continue;
      const nutrition = component.resolution?.ingredientNutrition;
      if (!nutrition) {
        const food = component.resolution?.foodResolution;
        if (food?.status === "resolved") {
          const staple = matchDiscreteStapleEstimate(component.name);
          const grams = staple?.approximateGramsPerUnit ?? 100;
          const derived = calculateNutritionForGrams(food.food.nutrientsPer100g, grams);
          const definition = component.definition ?? component.resolution?.definition;
          out[component.normalizedComponentKey] = {
            nutrition: derived,
            referenceYieldGrams:
              definition?.kind === "recipe_component"
                ? definition.referenceYieldGrams
                : grams,
            baseServings: 1,
            source: "food_resolution",
          };
        }
        continue;
      }
      const definition = component.definition ?? component.resolution?.definition;
      let yieldGrams: number | undefined;
      if (definition?.kind === "recipe_component") {
        yieldGrams =
          definition.referenceYieldGrams ??
          definition.ingredients.reduce((acc, ing) => acc + (ing.quantity ?? 0), 0);
        if (!(yieldGrams > 0)) yieldGrams = undefined;
      }
      out[component.normalizedComponentKey] = {
        nutrition,
        referenceYieldGrams: yieldGrams,
        baseServings:
          definition?.kind === "recipe_component" ? definition.baseServings ?? 1 : 1,
        source: "complete_meal_resolution",
      };
    }
  }
  return out;
}

function toResolvedIngredient(
  ingredient: ComponentRecipeIngredient,
  index: number,
): ResolvedRecipeIngredient | null {
  if (ingredient.quantity == null || !(ingredient.quantity > 0) || !ingredient.unit) {
    return null;
  }
  return {
    ingredientId: `comp-ing-${index}`,
    name: ingredient.name,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    preparation: ingredient.preparation ?? undefined,
    measurementState: "cooked",
    role: "other",
    scalingBehavior: "primary_scalable",
  };
}

/**
 * Enrich CompleteMeal side components with PLAN-009 food resolution when a
 * FoodResolver is available. Does not invent macros — only USDA/provider arithmetic.
 */
export async function resolveCompleteMealNutrition(input: {
  completeMealsByCandidateId: Record<string, CompleteMeal>;
  foodResolver?: FoodResolver | null;
}): Promise<{
  completeMealsByCandidateId: Record<string, CompleteMeal>;
  componentNutritionByKey: Record<string, ComponentNutritionEntry>;
}> {
  const resolver = input.foodResolver ?? null;
  const nextMeals: Record<string, CompleteMeal> = {};

  for (const [candidateId, meal] of Object.entries(input.completeMealsByCandidateId)) {
    if (!resolver) {
      nextMeals[candidateId] = meal;
      continue;
    }
    const components: CompleteMealComponent[] = [];
    for (const component of meal.components) {
      components.push(await enrichComponentNutrition(component, resolver));
    }
    nextMeals[candidateId] = { ...meal, components };
  }

  return {
    completeMealsByCandidateId: nextMeals,
    componentNutritionByKey: buildComponentNutritionByKeyFromCompleteMeals(nextMeals),
  };
}

async function enrichComponentNutrition(
  component: CompleteMealComponent,
  resolver: FoodResolver,
): Promise<CompleteMealComponent> {
  if (component.role === "main") return component;
  if (component.resolution?.ingredientNutrition) return component;

  const definition = component.definition ?? component.resolution?.definition;

  if (definition?.kind === "recipe_component" && definition.ingredients.length > 0) {
    const parts: IngredientNutrition[] = [];
    let gramsTotal = 0;
    for (let i = 0; i < definition.ingredients.length; i += 1) {
      const recipeIng = toResolvedIngredient(definition.ingredients[i]!, i);
      if (!recipeIng) continue;
      const foodResolution = await resolver.resolve(recipeIng);
      if (foodResolution.status !== "resolved") continue;
      const normalized = defaultQuantityNormalizer.toGrams(
        recipeIng.quantity,
        recipeIng.unit,
        {
          food: foodResolution.food,
          measurementState: recipeIng.measurementState,
          ingredientName: recipeIng.name,
        },
      );
      if (!normalized.ok) continue;
      parts.push(
        calculateNutritionForGrams(foodResolution.food.nutrientsPer100g, normalized.value.grams),
      );
      gramsTotal += normalized.value.grams;
    }
    if (parts.length === 0) return component;
    const ingredientNutrition = sumIngredientNutrition(parts);
    const baseServings = definition.baseServings ?? 1;
    const perServing =
      baseServings > 1
        ? {
            caloriesKcal: ingredientNutrition.caloriesKcal / baseServings,
            proteinGrams: ingredientNutrition.proteinGrams / baseServings,
            carbohydrateGrams: ingredientNutrition.carbohydrateGrams / baseServings,
            fatGrams: ingredientNutrition.fatGrams / baseServings,
            fiberGrams:
              ingredientNutrition.fiberGrams != null
                ? ingredientNutrition.fiberGrams / baseServings
                : undefined,
          }
        : ingredientNutrition;
    const nextDefinition = {
      ...definition,
      referenceYieldGrams:
        definition.referenceYieldGrams ??
        (gramsTotal > 0 ? gramsTotal / Math.max(baseServings, 1) : undefined),
    };
    return {
      ...component,
      definition: nextDefinition,
      resolution: {
        status: "component_recipe_resolved",
        definition: nextDefinition,
        ingredientNutrition: perServing,
        note: "Compound side nutrition summed from PLAN-009 ingredient resolution.",
      },
    };
  }

  if (
    (definition?.kind === "atomic_food" || component.definitionKind === "atomic_food") &&
    component.resolution?.foodResolution?.status !== "resolved"
  ) {
    const measurementState =
      definition?.kind === "atomic_food" ? definition.measurementState ?? "cooked" : "cooked";
    const atomicDefinition =
      definition?.kind === "atomic_food"
        ? definition
        : {
            kind: "atomic_food" as const,
            name: component.name,
            measurementState,
          };
    const foodResolution = await resolver.resolve({
      ingredientId: component.componentId,
      name: component.name,
      quantity: 100,
      unit: "g",
      role: component.role === "carbohydrate" ? "carbohydrate" : "other",
      scalingBehavior: "primary_scalable",
      measurementState,
    });
    if (foodResolution.status === "resolved") {
      const staple = matchDiscreteStapleEstimate(component.name);
      const grams = staple?.approximateGramsPerUnit ?? 100;
      const ingredientNutrition = calculateNutritionForGrams(
        foodResolution.food.nutrientsPer100g,
        grams,
      );
      return {
        ...component,
        definition: atomicDefinition,
        resolution: {
          status: "canonical_food_resolved",
          definition: atomicDefinition,
          foodResolution,
          ingredientNutrition,
          note: "Atomic side nutrition from PLAN-009 food resolution.",
        },
      };
    }
  }

  if (component.resolution?.foodResolution?.status === "resolved") {
    const food = component.resolution.foodResolution.food;
    const staple = matchDiscreteStapleEstimate(component.name);
    const grams = staple?.approximateGramsPerUnit ?? 100;
    return {
      ...component,
      resolution: {
        ...component.resolution,
        ingredientNutrition: calculateNutritionForGrams(food.nutrientsPer100g, grams),
        note:
          component.resolution.note ??
          "Atomic side nutrition derived from resolved nutrientsPer100g.",
      },
    };
  }

  return component;
}
