import type {
  CompleteMeal,
  CompleteMealComponent,
  IngredientNutrition,
  MealComponentRole,
} from "../../contracts/index.ts";

/**
 * Test/local helpers for building CompleteMeal structures with trusted nutrition.
 * Meal-name agnostic — roles + structural metadata only.
 * Not used as a production fallback when solving fails.
 */

export type TrustedComponentSpec = {
  componentId: string;
  name: string;
  role: MealComponentRole;
  relationship?: CompleteMealComponent["relationship"];
  source?: CompleteMealComponent["source"];
  definitionKind?: CompleteMealComponent["definitionKind"];
  nutrition: IngredientNutrition;
  referenceYieldGrams?: number;
  baseServings?: number;
  nutritionPer100g?: {
    caloriesKcal: number;
    proteinGrams: number;
    carbohydrateGrams: number;
    fatGrams: number;
    fiberGrams?: number | null;
  };
  discrete?: boolean;
  ingredients?: Array<{ name: string; quantity: number; unit: string }>;
};

export function buildCompleteMealFromSpecs(input: {
  mealId: string;
  candidateId: string;
  name: string;
  components: TrustedComponentSpec[];
  createdAt?: string;
}): {
  meal: CompleteMeal;
  componentNutritionByKey: Record<
    string,
    { nutrition: IngredientNutrition; referenceYieldGrams?: number; baseServings?: number }
  >;
} {
  const createdAt = input.createdAt ?? "2026-09-17T12:00:00.000Z";
  const componentNutritionByKey: Record<
    string,
    { nutrition: IngredientNutrition; referenceYieldGrams?: number; baseServings?: number }
  > = {};

  const components: CompleteMealComponent[] = input.components.map((spec) => {
    const key = `${spec.role}:${spec.name.toLowerCase()}`;
    componentNutritionByKey[key] = {
      nutrition: spec.nutrition,
      referenceYieldGrams: spec.referenceYieldGrams,
      baseServings: spec.baseServings ?? 1,
    };

    const definitionKind =
      spec.definitionKind ??
      (spec.discrete || spec.nutritionPer100g ? "atomic_food" : "recipe_component");

    const component: CompleteMealComponent = {
      componentId: spec.componentId,
      role: spec.role,
      name: spec.name,
      relationship: spec.relationship ?? (spec.role === "main" ? "intrinsic" : "required_companion"),
      source:
        spec.source ??
        (spec.role === "main" ? "main_recipe" : "composition_engine"),
      reason: `${spec.role} component`,
      quantityMode: "solver_determined",
      definitionKind,
      normalizedComponentKey: key,
    };

    if (definitionKind === "recipe_component") {
      component.definition = {
        kind: "recipe_component",
        name: spec.name,
        baseServings: spec.baseServings ?? 1,
        referenceYieldGrams: spec.referenceYieldGrams,
        ingredients:
          spec.ingredients ??
          [
            { name: "primary", quantity: spec.referenceYieldGrams ?? 100, unit: "g" },
            { name: "seasoning", quantity: 5, unit: "g" },
          ],
      };
      component.resolution = {
        status: "component_recipe_resolved",
        definition: component.definition,
        ingredientNutrition: spec.nutrition,
      };
    } else if (spec.nutritionPer100g) {
      component.definition = {
        kind: "atomic_food",
        name: spec.name,
        measurementState: "cooked",
      };
      component.resolution = {
        status: "canonical_food_resolved",
        definition: component.definition,
        foodResolution: {
          status: "resolved",
          food: {
            foodId: "00000000-0000-4000-8000-000000000099",
            canonicalName: spec.name,
            source: { provider: "usda", externalId: `test:${spec.componentId}` },
            description: spec.name,
            nutrientsPer100g: spec.nutritionPer100g,
            measures: [],
            createdAt,
            updatedAt: createdAt,
          },
          confidence: "high",
          matchReason: "test fixture",
          resolutionMethod: "builtin",
        },
        ingredientNutrition: spec.nutrition,
      };
    }

    return component;
  });

  return {
    meal: {
      mealId: input.mealId,
      candidateId: input.candidateId,
      mainRecipeId: input.candidateId,
      name: input.name,
      components,
      compositionProfile: {
        hasPrimaryProtein: components.some((c) => c.role === "main"),
        hasMeaningfulCarbohydrate: components.some((c) => c.role === "carbohydrate"),
        hasMeaningfulVegetableOrFruit: components.some(
          (c) => c.role === "vegetable" || c.role === "fruit",
        ),
        hasMeaningfulFiberSource: components.some(
          (c) => c.role === "vegetable" || c.role === "legume",
        ),
        hasSauceOrMoistureComponent: components.some((c) => c.role === "sauce_condiment"),
        addedComponentRoles: components
          .filter((c) => c.source === "composition_engine")
          .map((c) => c.role),
      },
      metadata: {
        promptVersion: "meal-composition-v2",
        policyVersion: "meal-composition-v1",
        createdAt,
      },
    },
    componentNutritionByKey,
  };
}

/** Arbitrary generated meal A — never used as a production fixture fallback. */
export function lemonHerbChickenCompleteMeal() {
  return buildCompleteMealFromSpecs({
    mealId: "complete-lemon-herb-chicken",
    candidateId: "cand-lemon-herb-chicken",
    name: "Lemon Herb Chicken",
    components: [
      {
        componentId: "main",
        name: "Lemon Herb Chicken",
        role: "main",
        nutrition: {
          caloriesKcal: 280,
          proteinGrams: 42,
          carbohydrateGrams: 2,
          fatGrams: 11,
          fiberGrams: 0,
        },
        referenceYieldGrams: 175,
        baseServings: 1,
      },
      {
        componentId: "couscous",
        name: "Herbed Couscous",
        role: "carbohydrate",
        nutrition: {
          caloriesKcal: 180,
          proteinGrams: 6,
          carbohydrateGrams: 36,
          fatGrams: 1.5,
          fiberGrams: 2.2,
        },
        referenceYieldGrams: 180,
        nutritionPer100g: {
          caloriesKcal: 100,
          proteinGrams: 3.3,
          carbohydrateGrams: 20,
          fatGrams: 0.8,
          fiberGrams: 1.2,
        },
      },
      {
        componentId: "salad",
        name: "Tomato Cucumber Salad",
        role: "vegetable",
        nutrition: {
          caloriesKcal: 35,
          proteinGrams: 1.5,
          carbohydrateGrams: 7,
          fatGrams: 0.4,
          fiberGrams: 2,
        },
        referenceYieldGrams: 140,
      },
      {
        componentId: "sauce",
        name: "Yogurt Herb Sauce",
        role: "sauce_condiment",
        nutrition: {
          caloriesKcal: 40,
          proteinGrams: 3,
          carbohydrateGrams: 3,
          fatGrams: 2,
          fiberGrams: 0.2,
        },
        referenceYieldGrams: 40,
      },
    ],
  });
}

/** Arbitrary generated meal B — discrete tortillas + tight crema bounds. */
export function blackenedSalmonTacosCompleteMeal() {
  return buildCompleteMealFromSpecs({
    mealId: "complete-blackened-salmon-tacos",
    candidateId: "cand-blackened-salmon-tacos",
    name: "Blackened Salmon Tacos",
    components: [
      {
        componentId: "main",
        name: "Blackened Salmon",
        role: "main",
        nutrition: {
          caloriesKcal: 250,
          proteinGrams: 36,
          carbohydrateGrams: 1,
          fatGrams: 11,
          fiberGrams: 0,
        },
        referenceYieldGrams: 160,
        baseServings: 1,
      },
      {
        componentId: "tortillas",
        name: "Corn Tortillas",
        role: "carbohydrate",
        discrete: true,
        nutrition: {
          caloriesKcal: 50,
          proteinGrams: 1.2,
          carbohydrateGrams: 10.5,
          fatGrams: 0.6,
          fiberGrams: 1.4,
        },
        nutritionPer100g: {
          caloriesKcal: 218,
          proteinGrams: 5.7,
          carbohydrateGrams: 44.6,
          fatGrams: 2.9,
          fiberGrams: 6.3,
        },
      },
      {
        componentId: "slaw",
        name: "Cabbage Slaw",
        role: "vegetable",
        nutrition: {
          caloriesKcal: 45,
          proteinGrams: 1.5,
          carbohydrateGrams: 8,
          fatGrams: 1.2,
          fiberGrams: 2.5,
        },
        referenceYieldGrams: 120,
      },
      {
        componentId: "crema",
        name: "Avocado Crema",
        role: "sauce_condiment",
        nutrition: {
          caloriesKcal: 55,
          proteinGrams: 1,
          carbohydrateGrams: 3,
          fatGrams: 4.5,
          fiberGrams: 1.5,
        },
        referenceYieldGrams: 40,
      },
    ],
  });
}
