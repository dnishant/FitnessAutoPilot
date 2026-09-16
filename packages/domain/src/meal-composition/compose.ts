import type {
  CompleteMeal,
  ComposeMealsRequest,
  MealCompositionFailure,
  MealCompositionRequest,
  RankedCulinaryCandidate,
  WeeklyMealCompositionResult,
  WeeklyMealConceptResult,
} from "@fitness-autopilot/contracts";
import {
  DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
  MEAL_COMPOSITION_POLICY_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import type { FoodResolver } from "../food-resolution/food-resolver";
import { candidateFromResolvedRecipe } from "./candidate-role-detection";
import {
  composeMealConcept,
  composeMealConcepts,
  type ComposeMealConceptOptions,
} from "./concept";
import type { ComponentRecipeProvider } from "./component-recipe";
import type { MealCompositionProvider } from "./provider";
import { resolveSelectedCompleteMeals } from "./selected-resolution";
import type { MealCompositionError } from "./validate";

export {
  DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
  MEAL_COMPOSITION_POLICY_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
};
export { buildMealCompositionPrompt, buildComponentRecipePrompt } from "./prompt";
export type { MealCompositionProvider } from "./provider";
export {
  detectExistingMealRoles,
  missingRolesFromProfile,
} from "./role-detection";
export {
  validateMealCompositionProposal,
  mealCompositionError,
  stripCompositionNutrition,
  type MealCompositionError,
  type MealCompositionErrorCode,
} from "./validate";
export {
  buildNormalizedComponentKey,
  normalizeComponentName,
  looksLikeCompoundComponent,
  namesLikelyEquivalent,
  mapPlan008TypeToRole,
} from "./component-identity";
export { buildComponentDefinition, resolveAddedComponent } from "./component-resolution";
export {
  composeMealConcept,
  composeMealConcepts,
  uniqueRankedCandidates,
} from "./concept";
export { resolveSelectedCompleteMeals } from "./selected-resolution";
export {
  summarizeMealConceptRepertoire,
  classifyCompositionComplexity,
  formatComponentReuseForPrompt,
} from "./repertoire";
export {
  detectExistingCandidateRoles,
  detectRolesForCompositionRequest,
  candidateFromResolvedRecipe,
} from "./candidate-role-detection";
export {
  MockComponentRecipeProvider,
  type ComponentRecipeProvider,
} from "./component-recipe";

/**
 * Compose one complete meal concept. When `resolveAddedComponents` is true and a
 * recipe is present, also resolve selected-only component details for that meal.
 */
export async function composeCompleteMeal(
  request: MealCompositionRequest,
  options: ComposeMealConceptOptions & {
    foodResolver?: FoodResolver | null;
    resolveAddedComponents?: boolean;
    componentRecipeProvider?: ComponentRecipeProvider;
  },
): Promise<Result<CompleteMeal, MealCompositionError>> {
  const conceptResult = await composeMealConcept(request, options);
  if (!conceptResult.ok) return conceptResult;

  const resolved = await resolveSelectedCompleteMeals({
    concepts: [conceptResult.value],
    selectedCandidateIds: [conceptResult.value.candidateId],
    recipesByCandidateId: request.recipe
      ? { [request.recipe.candidateId]: request.recipe }
      : undefined,
    componentRecipeProvider: options.componentRecipeProvider,
    foodResolver: options.foodResolver,
    resolveAddedComponents: options.resolveAddedComponents === true,
    slotCount: 1,
  });
  const meal = resolved.result.mealsByCandidateId[conceptResult.value.candidateId];
  if (!meal) {
    return err({
      code: "COMPONENT_RESOLUTION_FAILED",
      message: "Selected meal resolution produced no complete meal.",
      candidateId: conceptResult.value.candidateId,
    });
  }
  return ok(meal);
}

export type ComposeWeeklyMealsInput = {
  rankedCandidates?: ComposeMealsRequest["rankedCandidates"];
  recipes?: ComposeMealsRequest["recipes"];
  uniqueCandidateIds?: ComposeMealsRequest["uniqueCandidateIds"];
  selectedCandidateIds?: ComposeMealsRequest["selectedCandidateIds"];
  mealType?: ComposeMealsRequest["mealType"];
  allergies?: ComposeMealsRequest["allergies"];
  dietaryRestrictions?: ComposeMealsRequest["dietaryRestrictions"];
  dislikes?: ComposeMealsRequest["dislikes"];
  cookingStyleHint?: ComposeMealsRequest["cookingStyleHint"];
  targetCalories?: ComposeMealsRequest["targetCalories"];
  concurrency?: ComposeMealsRequest["concurrency"];
  resolveAddedComponents?: ComposeMealsRequest["resolveAddedComponents"];
  slotCount?: ComposeMealsRequest["slotCount"];
  provider: MealCompositionProvider;
  foodResolver?: FoodResolver | null;
  providerMeta?: { provider?: string; model?: string };
  componentRecipeProvider?: ComponentRecipeProvider;
};

export async function composeWeeklyMeals(
  input: ComposeWeeklyMealsInput,
): Promise<{
  result: WeeklyMealCompositionResult;
  concepts?: WeeklyMealConceptResult;
  failures: MealCompositionFailure[];
}> {
  const rankedFromRecipes: RankedCulinaryCandidate[] = (input.recipes ?? []).map((recipe, index) => ({
    candidate: candidateFromResolvedRecipe(recipe),
    score: Math.max(40, 92 - index * 3),
    baseScore: Math.max(40, 92 - index * 3),
    scoreBreakdown: {
      userPreferenceFit: 0.7,
      culinaryInterest: 0.7,
      sourceQuality: 0.7,
      prepFit: 0.7,
      fitnessAdaptability: 0.7,
      novelty: 0.7,
      repetitionPenalty: 0,
      similarityPenalty: 0,
    },
    rank: index + 1,
    decision: "selected",
    reasons: ["Derived from resolved recipe for composition."],
  }));
  const ranked = input.rankedCandidates ?? rankedFromRecipes;
  const recipesByCandidateId = Object.fromEntries(
    (input.recipes ?? []).map((recipe) => [recipe.candidateId, recipe]),
  );
  const conceptOutcome = await composeMealConcepts({
    rankedCandidates: ranked,
    uniqueCandidateIds: input.uniqueCandidateIds,
    mealType: input.mealType,
    allergies: input.allergies,
    dietaryRestrictions: input.dietaryRestrictions,
    dislikes: input.dislikes,
    cookingStyleHint: input.cookingStyleHint,
    targetCalories: input.targetCalories,
    concurrency: input.concurrency ?? DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
    slotCount: input.slotCount,
    recipesByCandidateId,
    provider: input.provider,
    providerMeta: input.providerMeta,
  });

  const selectedCandidateIds =
    input.selectedCandidateIds && input.selectedCandidateIds.length > 0
      ? input.selectedCandidateIds
      : conceptOutcome.result.uniqueCandidateIds;

  const detailed = await resolveSelectedCompleteMeals({
    concepts: conceptOutcome.result.conceptsByCandidateId,
    selectedCandidateIds,
    recipesByCandidateId,
    componentRecipeProvider: input.componentRecipeProvider,
    foodResolver: input.foodResolver,
    resolveAddedComponents: input.resolveAddedComponents === true,
    concurrency: input.concurrency,
    slotCount: input.slotCount,
    targetCalories: input.targetCalories,
  });

  const mergedDiagnostics = {
    ...detailed.result.diagnostics,
    rankedCandidates: conceptOutcome.result.diagnostics.rankedCandidates,
    uniqueCandidatesComposed: conceptOutcome.result.diagnostics.uniqueCandidatesComposed,
    compositionProviderCalls: conceptOutcome.result.diagnostics.compositionProviderCalls,
    mealsAlreadyComplete: conceptOutcome.result.diagnostics.mealsAlreadyComplete,
    mealsWithAddedComponents: conceptOutcome.result.diagnostics.mealsWithAddedComponents,
    totalAddedComponents: conceptOutcome.result.diagnostics.totalAddedComponents,
    uniqueAddedComponents: conceptOutcome.result.diagnostics.uniqueAddedComponents,
    atomicComponents:
      detailed.result.diagnostics.atomicComponents ||
      conceptOutcome.result.diagnostics.atomicComponents,
    recipeComponents:
      detailed.result.diagnostics.recipeComponents ||
      conceptOutcome.result.diagnostics.recipeComponents,
  };

  return {
    result: {
      ...detailed.result,
      diagnostics: mergedDiagnostics,
      fiberTarget: detailed.result.fiberTarget ?? conceptOutcome.result.fiberTarget,
    },
    concepts: conceptOutcome.result,
    failures: [...conceptOutcome.failures, ...detailed.failures],
  };
}
