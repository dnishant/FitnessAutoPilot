import type {
  CulinaryDiscoveryCandidate,
  MealConcept,
  RankedCulinaryCandidate,
  RankedWeeklyStrategy,
  RankedWeeklyStrategyRequest,
  ResolvedRecipe,
  WeeklyMealCompositionResult,
  WeeklyMealConceptResult,
} from "../../contracts/index.ts";
import { composeMealConcepts } from "../meal-composition/concept.ts";
import type { ComponentRecipeProvider } from "../meal-composition/component-recipe.ts";
import type { MealCompositionProvider } from "../meal-composition/provider.ts";
import { resolveSelectedCompleteMeals } from "../meal-composition/selected-resolution.ts";
import type { RecipeResolver } from "../recipes/recipe-resolution.ts";
import { resolveUniqueCandidates } from "../recipes/recipe-resolution.ts";
import { uniqueRankedCandidates } from "../meal-composition/concept.ts";

export type MealPlanningPipelineDiagnostics = {
  rankedCandidates: number;
  uniqueCandidatesComposed: number;
  compositionProviderCalls: number;
  weeklyCandidatesSelected: number;
  uniqueMainRecipesResolved: number;
  uniqueComponentRecipesResolved: number;
  uniqueComponentsInSelectedWeek: number;
  reusedComponentsInSelectedWeek: number;
  candidateTrace: Array<{
    candidateId: string;
    name: string;
    composed: boolean;
    selected: boolean;
    providerCalled: boolean;
    componentNames: string[];
  }>;
};

export function collectUniqueRankedRepertoire(
  lunchCandidates: readonly RankedCulinaryCandidate[],
  dinnerCandidates: readonly RankedCulinaryCandidate[],
): RankedCulinaryCandidate[] {
  return uniqueRankedCandidates([...lunchCandidates, ...dinnerCandidates]);
}

export function attachMealConceptsToWeeklyRequest(
  request: RankedWeeklyStrategyRequest,
  concepts: Record<string, MealConcept> | WeeklyMealConceptResult,
): RankedWeeklyStrategyRequest {
  const mealConceptsByCandidateId =
    "conceptsByCandidateId" in concepts ? concepts.conceptsByCandidateId : concepts;
  return {
    ...request,
    mealConceptsByCandidateId,
  };
}

export async function composeRankedRepertoireForWeeklyStrategy(input: {
  request: RankedWeeklyStrategyRequest;
  provider: MealCompositionProvider;
  providerMeta?: { provider?: string; model?: string };
  concurrency?: number;
  targetCalories?: number;
}): Promise<{
  request: RankedWeeklyStrategyRequest;
  concepts: WeeklyMealConceptResult;
  diagnostics: Pick<
    MealPlanningPipelineDiagnostics,
    "rankedCandidates" | "uniqueCandidatesComposed" | "compositionProviderCalls"
  >;
}> {
  const ranked = collectUniqueRankedRepertoire(
    input.request.lunchCandidates,
    input.request.dinnerCandidates,
  );
  const composed = await composeMealConcepts({
    rankedCandidates: ranked,
    mealType: "dinner",
    allergies: input.request.foodPreferences.allergies,
    dietaryRestrictions: input.request.foodPreferences.dietaryRestrictions,
    dislikes: input.request.foodPreferences.dislikes,
    targetCalories: input.targetCalories ?? input.request.nutrition.targetCaloriesPerDay,
    concurrency: input.concurrency,
    provider: input.provider,
    providerMeta: input.providerMeta,
  });
  return {
    request: attachMealConceptsToWeeklyRequest(input.request, composed.result),
    concepts: composed.result,
    diagnostics: {
      rankedCandidates: ranked.length,
      uniqueCandidatesComposed: composed.result.diagnostics.uniqueCandidatesComposed ?? 0,
      compositionProviderCalls: composed.result.diagnostics.compositionProviderCalls,
    },
  };
}

export async function resolveSelectedPipelineMeals(input: {
  strategy: RankedWeeklyStrategy;
  concepts: Record<string, MealConcept> | WeeklyMealConceptResult;
  candidatesById: Map<string, CulinaryDiscoveryCandidate> | ReadonlyMap<string, CulinaryDiscoveryCandidate>;
  recipeResolver?: RecipeResolver;
  componentRecipeProvider?: ComponentRecipeProvider;
  resolveAddedComponents?: boolean;
}): Promise<{
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  completeMeals: WeeklyMealCompositionResult;
  uniqueMainRecipesResolved: number;
  uniqueComponentRecipesResolved: number;
}> {
  const conceptsById =
    "conceptsByCandidateId" in input.concepts
      ? input.concepts.conceptsByCandidateId
      : input.concepts;
  const selectedCandidateIds = [...input.strategy.uniqueCandidateIds];
  let recipesByCandidateId: Record<string, ResolvedRecipe> = {};
  if (input.recipeResolver) {
    const selectedCandidates = selectedCandidateIds
      .map((id) => input.candidatesById.get(id))
      .filter((c): c is CulinaryDiscoveryCandidate => c != null);
    const resolved = await resolveUniqueCandidates({
      candidates: selectedCandidates,
      uniqueCandidateIds: selectedCandidateIds,
      resolver: input.recipeResolver,
    });
    if (resolved.ok) {
      recipesByCandidateId = resolved.value.recipesByCandidateId;
    }
  }
  const complete = await resolveSelectedCompleteMeals({
    concepts: conceptsById,
    selectedCandidateIds,
    recipesByCandidateId,
    candidatesById: input.candidatesById,
    componentRecipeProvider: input.componentRecipeProvider,
    resolveAddedComponents: input.resolveAddedComponents === true,
  });
  return {
    recipesByCandidateId,
    completeMeals: complete.result,
    uniqueMainRecipesResolved: complete.uniqueMainRecipesResolved,
    uniqueComponentRecipesResolved: complete.uniqueComponentRecipesResolved,
  };
}

export function pipelineDiagnostics(input: {
  rankedCandidates: number;
  concepts: WeeklyMealConceptResult;
  selectedCandidateIds: readonly string[];
  uniqueMainRecipesResolved: number;
  uniqueComponentRecipesResolved: number;
}): MealPlanningPipelineDiagnostics {
  const selected = new Set(input.selectedCandidateIds);
  const selectedConcepts = Object.values(input.concepts.conceptsByCandidateId).filter((c) =>
    selected.has(c.candidateId),
  );
  return {
    rankedCandidates: input.rankedCandidates,
    uniqueCandidatesComposed: input.concepts.diagnostics.uniqueCandidatesComposed ?? 0,
    compositionProviderCalls: input.concepts.diagnostics.compositionProviderCalls,
    weeklyCandidatesSelected: selected.size,
    uniqueMainRecipesResolved: input.uniqueMainRecipesResolved,
    uniqueComponentRecipesResolved: input.uniqueComponentRecipesResolved,
    uniqueComponentsInSelectedWeek:
      completeUniqueSideCount(selectedConcepts),
    reusedComponentsInSelectedWeek:
      input.concepts.componentReuse.filter(
        (entry) =>
          entry.usedByCandidateIds.filter((id) => selected.has(id)).length > 1,
      ).length,
    candidateTrace: (input.concepts.candidateTrace ?? []).map((row) => ({
      ...row,
      selected: selected.has(row.candidateId),
    })),
  };
}

function completeUniqueSideCount(concepts: MealConcept[]): number {
  const keys = new Set<string>();
  for (const concept of concepts) {
    for (const component of concept.components) {
      keys.add(component.normalizedComponentKey);
    }
  }
  return keys.size;
}
