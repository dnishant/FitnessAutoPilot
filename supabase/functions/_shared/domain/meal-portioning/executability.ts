import type {
  CompleteMeal,
  CompleteMealComponent,
  IngredientNutrition,
  MealPortionPolicy,
  RecipeNutritionResult,
  ResolvedRecipe,
} from "../../contracts/index.ts";
import { getMealPortionPolicy } from "./policy.ts";
import { isEdibleFoodIdentity } from "../meal-composition/edible-identity.ts";
import { isUnresolvedPlaceholderName } from "../meal-composition/placeholders.ts";
import { buildCoefficientsFromCompleteMeal } from "./coefficients.ts";
import { buildPortionVariables } from "./build-variables.ts";
import { assertCoefficientOwnersMatchIndependentEdibles } from "./canonical-meal-integrity.ts";

/**
 * Generic meal executability (pre-PLAN-010).
 *
 * SELECTED ≠ EXECUTABLE. A candidate may be scheduled only after every required
 * independent nutritional owner has edible identity, trusted nutrition, and a
 * representable quantity/yield basis. Recipe-name / cuisine heuristics are forbidden.
 */

export type MealExecutabilityFailureCode =
  | "COMPLETE_MEAL_MISSING"
  | "MAIN_RECIPE_UNRESOLVED"
  | "REQUIRED_COMPONENT_UNRESOLVED"
  | "EDIBLE_IDENTITY_UNRESOLVED"
  | "AUTHORITATIVE_NUTRITION_UNRESOLVED"
  | "REFERENCE_YIELD_UNRESOLVED"
  | "UNSUPPORTED_PORTION_VARIABLE"
  | "INCOMPLETE_MEAL_NUTRITION";

export type MealExecutabilityFailure = {
  code: MealExecutabilityFailureCode;
  message: string;
  candidateId: string;
  componentId?: string;
};

export type ExecutableMealAssessment = {
  candidateId: string;
  executable: true;
  independentOwnerCount: number;
};

export type MealExecutabilityResult =
  | { ok: true; value: ExecutableMealAssessment }
  | { ok: false; error: MealExecutabilityFailure };

function isPendingMainRecipeId(mainRecipeId: string | undefined, candidateId: string): boolean {
  if (!mainRecipeId) return true;
  return mainRecipeId === `pending-${candidateId}` || mainRecipeId.startsWith("pending-");
}

function isRequiredIndependentOwner(component: CompleteMealComponent): boolean {
  if ((component.nutritionOwnership ?? "independent") === "parent_owned") return false;
  // Selected onto the prescribed CompleteMeal as independent edible ⇒ execution-required.
  // Culinary relationship (recommended vs required_companion) does not waive nutrition.
  if (isUnresolvedPlaceholderName(component.name) || !isEdibleFoodIdentity(component.name)) {
    return false;
  }
  return true;
}

function hasAuthoritativeMainNutrition(
  recipe: ResolvedRecipe | null | undefined,
  nutritionByCandidateId: Record<string, RecipeNutritionResult> | undefined,
  candidateId: string,
): boolean {
  if (recipe?.nutrition?.source === "llm_estimate" && recipe.nutrition.perServing != null) {
    const n = recipe.nutrition.perServing;
    return Number.isFinite(n.caloriesKcal) && n.caloriesKcal >= 0 && Number.isFinite(n.proteinGrams);
  }
  const usda = nutritionByCandidateId?.[candidateId];
  if (
    usda?.nutrition?.perBaseServing &&
    usda.resolutionQuality?.status !== "blocked" &&
    Number.isFinite(usda.nutrition.perBaseServing.caloriesKcal)
  ) {
    return true;
  }
  return false;
}

function mapCoefficientFailure(
  candidateId: string,
  code: string,
  message: string,
  componentId?: string,
): MealExecutabilityFailure {
  switch (code) {
    case "missing_canonical_nutrition":
      return {
        code: "AUTHORITATIVE_NUTRITION_UNRESOLVED",
        message,
        candidateId,
        componentId,
      };
    case "missing_reference_yield":
      return {
        code: "REFERENCE_YIELD_UNRESOLVED",
        message,
        candidateId,
        componentId,
      };
    case "unquantifiable_component":
      return {
        code: "EDIBLE_IDENTITY_UNRESOLVED",
        message,
        candidateId,
        componentId,
      };
    case "incomplete_meal_nutrition":
      return {
        code: "INCOMPLETE_MEAL_NUTRITION",
        message,
        candidateId,
        componentId,
      };
    default:
      return {
        code: "UNSUPPORTED_PORTION_VARIABLE",
        message,
        candidateId,
        componentId,
      };
  }
}

/**
 * Structural gate: can this CompleteMeal enter PLAN-010 as an executable prescription?
 * Does not run the optimizer — only prerequisite identity / nutrition / yield / variable shape.
 */
export function assessMealExecutability(input: {
  candidateId: string;
  completeMeal?: CompleteMeal | null;
  recipe?: ResolvedRecipe | null;
  nutritionByCandidateId?: Record<string, RecipeNutritionResult>;
  componentNutritionByKey?: Record<
    string,
    { nutrition: IngredientNutrition; referenceYieldGrams?: number; baseServings?: number }
  >;
  policy?: MealPortionPolicy;
}): MealExecutabilityResult {
  const candidateId = input.candidateId;
  const meal = input.completeMeal;
  if (!meal) {
    return {
      ok: false,
      error: {
        code: "COMPLETE_MEAL_MISSING",
        message: `No CompleteMeal for candidate ${candidateId}.`,
        candidateId,
      },
    };
  }

  const recipe = input.recipe ?? null;
  if (!recipe || isPendingMainRecipeId(meal.mainRecipeId, candidateId)) {
    return {
      ok: false,
      error: {
        code: "MAIN_RECIPE_UNRESOLVED",
        message: `Main recipe unresolved for candidate ${candidateId}; SELECTED ≠ EXECUTABLE.`,
        candidateId,
      },
    };
  }

  if (!hasAuthoritativeMainNutrition(recipe, input.nutritionByCandidateId, candidateId)) {
    return {
      ok: false,
      error: {
        code: "AUTHORITATIVE_NUTRITION_UNRESOLVED",
        message: `Main for candidate ${candidateId} lacks authoritative nutrition on a resolved recipe.`,
        candidateId,
      },
    };
  }

  for (const component of meal.components) {
    if (!isRequiredIndependentOwner(component)) continue;

    if (isUnresolvedPlaceholderName(component.name) || !isEdibleFoodIdentity(component.name)) {
      return {
        ok: false,
        error: {
          code: "EDIBLE_IDENTITY_UNRESOLVED",
          message: `Required component "${component.name}" is not an edible food identity.`,
          candidateId,
          componentId: component.componentId,
        },
      };
    }

    // Required companions must be resolved when they claim a recipe/component identity.
    if (
      component.role !== "main" &&
      component.source === "composition_engine" &&
      component.definitionKind === "recipe_component" &&
      component.resolution?.status === "unresolved"
    ) {
      return {
        ok: false,
        error: {
          code: "REQUIRED_COMPONENT_UNRESOLVED",
          message: `Required component "${component.name}" remains unresolved.`,
          candidateId,
          componentId: component.componentId,
        },
      };
    }
  }

  const coefficients = buildCoefficientsFromCompleteMeal({
    meal,
    nutritionByCandidateId: input.nutritionByCandidateId,
    recipesByCandidateId: { [candidateId]: recipe },
    componentNutritionByKey: input.componentNutritionByKey,
  });
  if (!coefficients.ok) {
    return {
      ok: false,
      error: mapCoefficientFailure(
        candidateId,
        coefficients.error.code,
        coefficients.error.message,
        coefficients.error.componentId,
      ),
    };
  }

  const ownership = assertCoefficientOwnersMatchIndependentEdibles({
    meal,
    coefficients: coefficients.components,
  });
  if (!ownership.ok) {
    return {
      ok: false,
      error: {
        code: "INCOMPLETE_MEAL_NUTRITION",
        message: ownership.error.message,
        candidateId,
        componentId: ownership.error.componentId,
      },
    };
  }

  const variables = buildPortionVariables(
    coefficients.components,
    input.policy ?? getMealPortionPolicy(),
  );
  if (!variables.ok) {
    const code =
      variables.error.code === "missing_reference_yield"
        ? "REFERENCE_YIELD_UNRESOLVED"
        : variables.error.code === "missing_canonical_nutrition"
          ? "AUTHORITATIVE_NUTRITION_UNRESOLVED"
          : "UNSUPPORTED_PORTION_VARIABLE";
    return {
      ok: false,
      error: {
        code,
        message: variables.error.message,
        candidateId,
        componentId: variables.error.componentId,
      },
    };
  }

  return {
    ok: true,
    value: {
      candidateId,
      executable: true,
      independentOwnerCount: coefficients.components.length,
    },
  };
}

/**
 * Assess every unique candidate that appears on a weekly strategy.
 */
export function assessWeeklyPlanExecutability(input: {
  uniqueCandidateIds: readonly string[];
  completeMealsByCandidateId: Record<string, CompleteMeal>;
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  nutritionByCandidateId?: Record<string, RecipeNutritionResult>;
  componentNutritionByKey?: Record<
    string,
    { nutrition: IngredientNutrition; referenceYieldGrams?: number; baseServings?: number }
  >;
}): {
  executableCandidateIds: string[];
  failures: MealExecutabilityFailure[];
} {
  const executableCandidateIds: string[] = [];
  const failures: MealExecutabilityFailure[] = [];
  for (const candidateId of input.uniqueCandidateIds) {
    const result = assessMealExecutability({
      candidateId,
      completeMeal: input.completeMealsByCandidateId[candidateId],
      recipe: input.recipesByCandidateId[candidateId],
      nutritionByCandidateId: input.nutritionByCandidateId,
      componentNutritionByKey: input.componentNutritionByKey,
    });
    if (result.ok) {
      executableCandidateIds.push(candidateId);
    } else {
      failures.push(result.error);
    }
  }
  return { executableCandidateIds, failures };
}

/** Structural PLAN-010 block reasons that should never appear on an active plan. */
export const STRUCTURAL_PORTION_BLOCK_REASONS = new Set([
  "missing_reference_yield",
  "missing_canonical_nutrition",
  "unquantifiable_component",
] as const);

export function isStructuralPortionBlockReason(reason: string | undefined): boolean {
  if (!reason) return false;
  return STRUCTURAL_PORTION_BLOCK_REASONS.has(
    reason as "missing_reference_yield" | "missing_canonical_nutrition" | "unquantifiable_component",
  );
}
