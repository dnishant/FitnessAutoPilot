import type {
  CompleteMeal,
  CompleteMealComponent,
  ComponentNutritionCoefficient,
  IngredientNutrition,
  NutrientsPer100g,
  RecipeNutritionResult,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import { matchDiscreteStapleEstimate } from "./staple-estimates";
import {
  roleStructuralEstimateForComponent,
  roleStructuralNutritionPer100g,
} from "./role-structural-estimates";

export type CoefficientBuildFailure = {
  code:
    | "missing_canonical_nutrition"
    | "missing_reference_yield"
    | "unquantifiable_component"
    | "incomplete_meal_nutrition";
  message: string;
  componentId?: string;
};

export type CoefficientBuildResult =
  | { ok: true; components: ComponentNutritionCoefficient[] }
  | { ok: false; error: CoefficientBuildFailure };

const DISCRETE_NAME =
  /\b(tortilla|tortillas|egg|eggs|pita|pitas|wrap|wraps|bun|buns|slice|slices|piece|pieces)\b/i;

function emptyNutrition(): IngredientNutrition {
  return {
    caloriesKcal: 0,
    proteinGrams: 0,
    carbohydrateGrams: 0,
    fatGrams: 0,
  };
}

function hasMacros(n: IngredientNutrition | NutrientsPer100g | null | undefined): boolean {
  if (!n) return false;
  return (
    Number.isFinite(n.caloriesKcal) &&
    Number.isFinite(n.proteinGrams) &&
    n.caloriesKcal >= 0 &&
    n.proteinGrams >= 0
  );
}

function sumIngredientGrams(
  ingredients: ReadonlyArray<{ quantity?: number; unit?: string }>,
): number | null {
  let total = 0;
  let counted = 0;
  for (const ingredient of ingredients) {
    if (ingredient.quantity == null) continue;
    const unit = (ingredient.unit ?? "g").toLowerCase();
    if (unit === "g" || unit === "gram" || unit === "grams") {
      total += ingredient.quantity;
      counted += 1;
    }
  }
  return counted > 0 ? total : null;
}

function isDiscreteComponent(component: CompleteMealComponent): boolean {
  if (component.role === "garnish") return false;
  return DISCRETE_NAME.test(component.name);
}

function mainRecipeNutrition(
  meal: CompleteMeal,
  nutritionByCandidateId: Record<string, RecipeNutritionResult> | undefined,
  recipesByCandidateId: Record<string, ResolvedRecipe> | undefined,
): {
  baseNutrition: IngredientNutrition;
  baseServings: number;
  referenceYieldGrams?: number;
} | null {
  const result = nutritionByCandidateId?.[meal.candidateId];
  const recipe = recipesByCandidateId?.[meal.candidateId];
  const perServing = result?.nutrition?.perBaseServing;
  if (!perServing || !hasMacros(perServing)) return null;
  if (result.resolutionQuality.status === "blocked") return null;

  const baseServings = result.baseServings ?? recipe?.baseServings ?? 1;
  let referenceYieldGrams: number | undefined;
  if (result.nutrition?.ingredientBreakdown) {
    const grams = result.nutrition.ingredientBreakdown
      .map((row) => row.grams)
      .filter((g): g is number => g != null && g > 0);
    if (grams.length > 0) {
      referenceYieldGrams = grams.reduce((a, b) => a + b, 0) / Math.max(baseServings, 1);
    }
  }
  if (referenceYieldGrams == null && recipe) {
    // Prefer explicit culinary preferred display mass when yield unknown but servings known.
    referenceYieldGrams = undefined;
  }

  return {
    baseNutrition: {
      caloriesKcal: perServing.caloriesKcal,
      proteinGrams: perServing.proteinGrams,
      carbohydrateGrams: perServing.carbohydrateGrams,
      fatGrams: perServing.fatGrams,
      fiberGrams: perServing.fiberGrams,
    },
    baseServings,
    referenceYieldGrams,
  };
}

function coefficientForComponent(
  component: CompleteMealComponent,
  meal: CompleteMeal,
  nutritionByCandidateId: Record<string, RecipeNutritionResult> | undefined,
  recipesByCandidateId: Record<string, ResolvedRecipe> | undefined,
  componentNutritionByKey?: Record<
    string,
    { nutrition: IngredientNutrition; referenceYieldGrams?: number; baseServings?: number }
  >,
): CoefficientBuildResult {
  if (component.role === "garnish") {
    const fixedNutrition =
      component.resolution?.ingredientNutrition ??
      componentNutritionByKey?.[component.normalizedComponentKey]?.nutrition ??
      emptyNutrition();
    if (!hasMacros(fixedNutrition) && fixedNutrition.caloriesKcal === 0) {
      // Zero-cal garnish (herbs) is allowed as fixed.
      return {
        ok: true,
        components: [
          {
            kind: "fixed",
            componentId: component.componentId,
            displayName: component.name,
            role: component.role,
            amount: 8,
            unit: "g",
            nutrition: {
              caloriesKcal: 0,
              proteinGrams: 0,
              carbohydrateGrams: 0,
              fatGrams: 0,
              fiberGrams: 0,
            },
          },
        ],
      };
    }
    return {
      ok: true,
      components: [
        {
          kind: "fixed",
          componentId: component.componentId,
          displayName: component.name,
          role: component.role,
          amount: 8,
          unit: "g",
          nutrition: fixedNutrition,
        },
      ],
    };
  }

  const isMain =
    component.role === "main" ||
    component.source === "main_recipe" ||
    component.componentId === meal.components.find((c) => c.role === "main")?.componentId;

  if (isMain && component.role === "main") {
    const main = mainRecipeNutrition(meal, nutritionByCandidateId, recipesByCandidateId);
    if (!main) {
      return {
        ok: false,
        error: {
          code: "missing_canonical_nutrition",
          message: `Main "${component.name}" lacks trusted PLAN-009 nutrition.`,
          componentId: component.componentId,
        },
      };
    }
    if (main.referenceYieldGrams == null && main.baseServings == null) {
      return {
        ok: false,
        error: {
          code: "missing_reference_yield",
          message: `Main "${component.name}" lacks reference yield metadata.`,
          componentId: component.componentId,
        },
      };
    }
    return {
      ok: true,
      components: [
        {
          kind: "recipe_scale",
          componentId: component.componentId,
          displayName: component.name,
          role: "main",
          baseNutrition: main.baseNutrition,
          referenceYieldGrams: main.referenceYieldGrams,
          baseServings: main.baseServings,
          requiresReferenceYield: true,
        },
      ],
    };
  }

  const definition = component.definition ?? component.resolution?.definition;
  const keyed = componentNutritionByKey?.[component.normalizedComponentKey];

  if (definition?.kind === "recipe_component") {
    const yieldFromIngredients = sumIngredientGrams(definition.ingredients);
    const referenceYieldGrams =
      definition.referenceYieldGrams ?? keyed?.referenceYieldGrams ?? yieldFromIngredients ?? undefined;
    const baseServings = definition.baseServings ?? keyed?.baseServings ?? 1;
    const nutrition =
      keyed?.nutrition ??
      component.resolution?.ingredientNutrition ??
      undefined;
    if (!nutrition || !hasMacros(nutrition)) {
      return {
        ok: false,
        error: {
          code: "missing_canonical_nutrition",
          message: `Compound "${component.name}" lacks trusted nutrition for reference yield.`,
          componentId: component.componentId,
        },
      };
    }
    if (referenceYieldGrams == null && baseServings == null) {
      return {
        ok: false,
        error: {
          code: "missing_reference_yield",
          message: `Compound "${component.name}" lacks baseServings and referenceYieldGrams.`,
          componentId: component.componentId,
        },
      };
    }
    // Scale nutrition to one reference serving when yield is a full batch.
    const perServing =
      definition.referenceYieldGrams != null &&
      yieldFromIngredients != null &&
      definition.baseServings != null &&
      definition.baseServings > 1
        ? scaleNutrition(nutrition, definition.baseServings)
        : nutrition;

    return {
      ok: true,
      components: [
        {
          kind: "recipe_scale",
          componentId: component.componentId,
          displayName: component.name,
          role: component.role,
          baseNutrition: perServing,
          referenceYieldGrams:
            referenceYieldGrams != null && baseServings > 1
              ? referenceYieldGrams / baseServings
              : referenceYieldGrams,
          baseServings: 1,
          requiresReferenceYield: true,
        },
      ],
    };
  }

  if (definition?.kind === "atomic_food" || component.definitionKind === "atomic_food") {
    const food = component.resolution?.foodResolution;
    const per100 =
      food?.status === "resolved" ? food.food.nutrientsPer100g : undefined;
    const unitNutrition = component.resolution?.ingredientNutrition;

    if (isDiscreteComponent(component)) {
      if (unitNutrition && hasMacros(unitNutrition)) {
        return {
          ok: true,
          components: [
            {
              kind: "count",
              componentId: component.componentId,
              displayName: component.name,
              role: component.role,
              nutritionPerUnit: unitNutrition,
              unitLabel: discreteUnitLabel(component.name),
              quantityStep: 1,
            },
          ],
        };
      }
      if (per100 && hasMacros(per100)) {
        // Approximate one piece ≈ staple gram weight when measure unknown — only with trusted per100g.
        const staple = matchDiscreteStapleEstimate(component.name);
        const grams = staple?.approximateGramsPerUnit ?? 30;
        const nutritionPerUnit = scalePer100(per100, grams);
        return {
          ok: true,
          components: [
            {
              kind: "count",
              componentId: component.componentId,
              displayName: component.name,
              role: component.role,
              nutritionPerUnit,
              unitLabel: staple?.unitLabel ?? discreteUnitLabel(component.name),
              quantityStep: 1,
            },
          ],
        };
      }
      if (keyed?.nutrition && hasMacros(keyed.nutrition)) {
        return {
          ok: true,
          components: [
            {
              kind: "count",
              componentId: component.componentId,
              displayName: component.name,
              role: component.role,
              nutritionPerUnit: keyed.nutrition,
              unitLabel: discreteUnitLabel(component.name),
              quantityStep: 1,
            },
          ],
        };
      }
      const stapleEstimate = matchDiscreteStapleEstimate(component.name);
      if (stapleEstimate) {
        return {
          ok: true,
          components: [
            {
              kind: "count",
              componentId: component.componentId,
              displayName: component.name,
              role: component.role,
              nutritionPerUnit: stapleEstimate.nutritionPerUnit,
              unitLabel: stapleEstimate.unitLabel,
              quantityStep: 1,
            },
          ],
        };
      }
      return {
        ok: false,
        error: {
          code: "missing_canonical_nutrition",
          message: `Discrete food "${component.name}" lacks trusted nutrition.`,
          componentId: component.componentId,
        },
      };
    }

    if (per100 && hasMacros(per100)) {
      return {
        ok: true,
        components: [
          {
            kind: "food_grams",
            componentId: component.componentId,
            displayName: component.name,
            role: component.role,
            nutritionPer100g: per100,
          },
        ],
      };
    }

    if (keyed?.nutrition && hasMacros(keyed.nutrition) && keyed.referenceYieldGrams) {
      return {
        ok: true,
        components: [
          {
            kind: "recipe_scale",
            componentId: component.componentId,
            displayName: component.name,
            role: component.role,
            baseNutrition: keyed.nutrition,
            referenceYieldGrams: keyed.referenceYieldGrams,
            baseServings: keyed.baseServings ?? 1,
            requiresReferenceYield: true,
          },
        ],
      };
    }

    return {
      ok: false,
      error: {
        code: "missing_canonical_nutrition",
        message: `Atomic component "${component.name}" lacks trusted nutrition.`,
        componentId: component.componentId,
      },
    };
  }

  // Fallback: keyed nutrition for any role (meal-name agnostic structural path).
  if (keyed?.nutrition && hasMacros(keyed.nutrition)) {
    return {
      ok: true,
      components: [
        {
          kind: "recipe_scale",
          componentId: component.componentId,
          displayName: component.name,
          role: component.role,
          baseNutrition: keyed.nutrition,
          referenceYieldGrams: keyed.referenceYieldGrams,
          baseServings: keyed.baseServings ?? 1,
          requiresReferenceYield: true,
        },
      ],
    };
  }

  // Discrete staples without a resolved definition still get a versioned estimate.
  if (isDiscreteComponent(component)) {
    const stapleEstimate = matchDiscreteStapleEstimate(component.name);
    if (stapleEstimate) {
      return {
        ok: true,
        components: [
          {
            kind: "count",
            componentId: component.componentId,
            displayName: component.name,
            role: component.role,
            nutritionPerUnit: stapleEstimate.nutritionPerUnit,
            unitLabel: stapleEstimate.unitLabel,
            quantityStep: 1,
          },
        ],
      };
    }
  }

  // Last resort for required non-main sides: role-structural-estimate-v1 (never for main
  // or recommended — recommended failures are skipped by the meal builder).
  if (component.role !== "main" && component.relationship !== "recommended") {
    return roleStructuralCoefficient(component);
  }

  return {
    ok: false,
    error: {
      code: "unquantifiable_component",
      message: `Component "${component.name}" cannot be quantified for portioning.`,
      componentId: component.componentId,
    },
  };
}

function roleStructuralCoefficient(component: CompleteMealComponent): CoefficientBuildResult {
  if (isDiscreteComponent(component)) {
    const staple = matchDiscreteStapleEstimate(component.name);
    if (staple) {
      return {
        ok: true,
        components: [
          {
            kind: "count",
            componentId: component.componentId,
            displayName: component.name,
            role: component.role,
            nutritionPerUnit: staple.nutritionPerUnit,
            unitLabel: staple.unitLabel,
            quantityStep: 1,
          },
        ],
      };
    }
  }

  const definition = component.definition ?? component.resolution?.definition;
  let yieldGrams: number | undefined;
  if (definition?.kind === "recipe_component") {
    yieldGrams =
      definition.referenceYieldGrams ??
      definition.ingredients.reduce((acc, ing) => acc + (ing.quantity ?? 0), 0);
    if (!(yieldGrams != null && yieldGrams > 0)) yieldGrams = undefined;
  }
  const estimate = roleStructuralEstimateForComponent({
    role: component.role,
    referenceYieldGrams: yieldGrams,
  });

  if (isDiscreteComponent(component)) {
    // Unknown discrete name: treat one unit ≈ role default yield / typical piece mass.
    const perUnit = roleStructuralEstimateForComponent({
      role: component.role,
      referenceYieldGrams: Math.min(estimate.referenceYieldGrams, 40),
    });
    return {
      ok: true,
      components: [
        {
          kind: "count",
          componentId: component.componentId,
          displayName: component.name,
          role: component.role,
          nutritionPerUnit: perUnit.nutrition,
          unitLabel: discreteUnitLabel(component.name),
          quantityStep: 1,
        },
      ],
    };
  }

  return {
    ok: true,
    components: [
      {
        kind: "food_grams",
        componentId: component.componentId,
        displayName: component.name,
        role: component.role,
        nutritionPer100g: roleStructuralNutritionPer100g(component.role),
        preferredGrams: estimate.referenceYieldGrams,
        minGrams: Math.max(8, Math.round(estimate.referenceYieldGrams * 0.5)),
        maxGrams: Math.round(estimate.referenceYieldGrams * 1.75),
      },
    ],
  };
}

function discreteUnitLabel(name: string): string {
  const lower = name.toLowerCase();
  if (/tortilla/.test(lower)) return "tortilla";
  if (/egg/.test(lower)) return "egg";
  if (/pita/.test(lower)) return "pita";
  if (/wrap/.test(lower)) return "wrap";
  return "piece";
}

function scalePer100(per100: NutrientsPer100g, grams: number): IngredientNutrition {
  const factor = grams / 100;
  return {
    caloriesKcal: per100.caloriesKcal * factor,
    proteinGrams: per100.proteinGrams * factor,
    carbohydrateGrams: per100.carbohydrateGrams * factor,
    fatGrams: per100.fatGrams * factor,
    fiberGrams: per100.fiberGrams != null ? per100.fiberGrams * factor : undefined,
  };
}

function scaleNutrition(nutrition: IngredientNutrition, divisor: number): IngredientNutrition {
  return {
    caloriesKcal: nutrition.caloriesKcal / divisor,
    proteinGrams: nutrition.proteinGrams / divisor,
    carbohydrateGrams: nutrition.carbohydrateGrams / divisor,
    fatGrams: nutrition.fatGrams / divisor,
    fiberGrams: nutrition.fiberGrams != null ? nutrition.fiberGrams / divisor : undefined,
  };
}

/**
 * Build meal-name-agnostic portion coefficients from a CompleteMeal + trusted nutrition.
 * Does not call USDA or Gemini.
 */
export function buildCoefficientsFromCompleteMeal(input: {
  meal: CompleteMeal;
  nutritionByCandidateId?: Record<string, RecipeNutritionResult>;
  recipesByCandidateId?: Record<string, ResolvedRecipe>;
  componentNutritionByKey?: Record<
    string,
    { nutrition: IngredientNutrition; referenceYieldGrams?: number; baseServings?: number }
  >;
}): CoefficientBuildResult {
  const components: ComponentNutritionCoefficient[] = [];
  for (const component of input.meal.components) {
    if (component.relationship === "recommended" && component.role === "garnish") {
      // Soft garnish may be omitted when unquantifiable — try fixed path first.
    }
    const built = coefficientForComponent(
      component,
      input.meal,
      input.nutritionByCandidateId,
      input.recipesByCandidateId,
      input.componentNutritionByKey,
    );
    if (!built.ok) {
      // Recommended sides must not sink an otherwise valid plate.
      if (component.relationship === "recommended") {
        continue;
      }
      // Required non-main sides: last-resort role estimate instead of blocking the meal.
      if (component.role !== "main") {
        const roleBuilt = roleStructuralCoefficient(component);
        if (roleBuilt.ok) {
          components.push(...roleBuilt.components);
          continue;
        }
        continue;
      }
      return built;
    }
    components.push(...built.components);
  }
  if (components.length === 0) {
    return {
      ok: false,
      error: {
        code: "incomplete_meal_nutrition",
        message: `Meal "${input.meal.name}" has no quantifiable components.`,
      },
    };
  }
  if (!components.some((c) => c.role === "main")) {
    return {
      ok: false,
      error: {
        code: "incomplete_meal_nutrition",
        message: `Meal "${input.meal.name}" is missing a main component coefficient.`,
      },
    };
  }
  return { ok: true, components };
}
