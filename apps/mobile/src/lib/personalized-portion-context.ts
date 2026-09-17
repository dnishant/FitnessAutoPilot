import type {
  CompleteMeal,
  CulinaryDiscoveryCandidate,
  MealConcept,
  RecipeNutritionResult,
  ResolvedRecipe,
  WeeklyMealCompositionResult,
} from "@fitness-autopilot/contracts";
import {
  resolvedRecipeFromComponentDefinition,
  resolveSelectedCompleteMeals,
  type ComponentBaseNutrition,
} from "@fitness-autopilot/domain";
import type { PersonalizedPortionSolveContext } from "./consumer-plan-view";

export type PortionContextApis = {
  resolveSelectedCompleteMeals?: (input: {
    concepts: Record<string, MealConcept>;
    selectedCandidateIds: string[];
    recipesByCandidateId: Record<string, ResolvedRecipe>;
    candidatesById?: Record<string, CulinaryDiscoveryCandidate>;
    resolveAddedComponents?: boolean;
  }) => Promise<
    | { ok: true; result: WeeklyMealCompositionResult }
    | { ok: false; error: string; code?: string }
  >;
  resolveRecipeNutritionBatch?: (input: {
    recipes: ResolvedRecipe[];
  }) => Promise<
    | { ok: true; recipesByCandidateId: Record<string, RecipeNutritionResult> }
    | { ok: false; error: string; code?: string }
  >;
};

/**
 * Build PLAN-010 solve inputs for all selected meals:
 * CompleteMeal (selected resolution) + PLAN-009 main/side nutrition.
 */
export async function buildPersonalizedPortionContext(input: {
  conceptsByCandidateId: Record<string, MealConcept>;
  selectedCandidateIds: readonly string[];
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  candidatesById?: Record<string, CulinaryDiscoveryCandidate>;
  apis: PortionContextApis;
  /** When true, attempt local selected resolution without Edge/USDA. */
  useLocalCompleteMeals?: boolean;
}): Promise<PersonalizedPortionSolveContext> {
  const selectedCandidateIds = [...input.selectedCandidateIds];
  let completeMealsByCandidateId: Record<string, CompleteMeal> = {};

  if (input.apis.resolveSelectedCompleteMeals) {
    const selected = await input.apis.resolveSelectedCompleteMeals({
      concepts: input.conceptsByCandidateId,
      selectedCandidateIds,
      recipesByCandidateId: input.recipesByCandidateId,
      candidatesById: input.candidatesById,
      resolveAddedComponents: true,
    });
    if (selected.ok) {
      completeMealsByCandidateId = selected.result.mealsByCandidateId;
    }
  } else if (input.useLocalCompleteMeals) {
    const local = await resolveSelectedCompleteMeals({
      concepts: input.conceptsByCandidateId,
      selectedCandidateIds,
      recipesByCandidateId: input.recipesByCandidateId,
      candidatesById: input.candidatesById,
      resolveAddedComponents: false,
    });
    completeMealsByCandidateId = local.result.mealsByCandidateId;
  }

  const mainNutritionByCandidateId: Record<string, RecipeNutritionResult> = {};
  const componentNutritionById: Record<string, ComponentBaseNutrition> = {};

  if (input.apis.resolveRecipeNutritionBatch) {
    const mainRecipes = selectedCandidateIds
      .map((id) => input.recipesByCandidateId[id])
      .filter((r): r is ResolvedRecipe => Boolean(r));

    const sideRecipes: ResolvedRecipe[] = [];
    for (const meal of Object.values(completeMealsByCandidateId)) {
      for (const component of meal.components) {
        const definition =
          component.definition?.kind === "recipe_component"
            ? component.definition
            : component.resolution?.definition?.kind === "recipe_component"
              ? component.resolution.definition
              : null;
        if (!definition) continue;
        const adapted = resolvedRecipeFromComponentDefinition({
          component,
          definition,
        });
        if (adapted) sideRecipes.push(adapted);
      }
    }

    const nutrition = await input.apis.resolveRecipeNutritionBatch({
      recipes: [...mainRecipes, ...sideRecipes],
    });
    if (nutrition.ok) {
      for (const id of selectedCandidateIds) {
        const row = nutrition.recipesByCandidateId[id];
        if (row) mainNutritionByCandidateId[id] = row;
      }
      for (const [id, row] of Object.entries(nutrition.recipesByCandidateId)) {
        if (selectedCandidateIds.includes(id)) continue;
        const perServing = row.nutrition?.perBaseServing;
        if (!perServing) continue;
        componentNutritionById[id] = {
          baseNutrition: perServing,
          baseServings: 1,
        };
      }
    }
  }

  return {
    completeMealsByCandidateId,
    mainNutritionByCandidateId,
    componentNutritionById,
  };
}
