import type {
  CandidateRankingRequest,
  ConsumerPlanGenerationStage,
  ConsumerWeeklyPlan,
  CookingPreferences,
  CulinaryDiscoveryCandidate,
  CulinaryDiscoveryRequest,
  MealPreferences,
  NutritionTarget,
  RankedCulinaryCandidate,
  RankedWeeklyStrategy,
  RankedWeeklyStrategyRequest,
  ResolvedRecipe,
  WeeklyMealConceptResult,
} from "@fitness-autopilot/contracts";
import {
  MockMealCompositionProvider,
  composeMealConcepts,
  plan008SimpleCandidateLookup,
  plan008SimpleRankedPools,
  plan008SimpleWeeklyStrategy,
  makeResolvedRecipeFixture,
  plan009SimpleResolvedRecipes,
} from "@fitness-autopilot/domain";
import {
  addDaysIso,
  applyPersonalizedPortionsToMeals,
  buildConsumerMealsFromStrategy,
  createEmptyConsumerPlan,
  humanizePlanGenerationError,
  startOfWeekMonday,
} from "./consumer-plan-view";
import { buildRankedWeeklyStrategyRequestFromPreview } from "./ranked-weekly-strategy-preview";

export type PlanGenerationApis = {
  useLocalMode: boolean;
  nutritionTarget: NutritionTarget | null;
  mealPreferences: MealPreferences | null;
  cookingPreferences: CookingPreferences | null;
  discoverCulinaryCandidates: (
    request: CulinaryDiscoveryRequest,
  ) => Promise<
    | { ok: true; result: { candidates: CulinaryDiscoveryCandidate[] } }
    | { ok: false; error: string; code?: string }
  >;
  rankCulinaryCandidates: (
    request: CandidateRankingRequest,
  ) => Promise<
    | { ok: true; result: { selected: RankedCulinaryCandidate[] } }
    | { ok: false; error: string; code?: string }
  >;
  composeMealConcepts: (input: {
    rankedCandidates: RankedCulinaryCandidate[];
    targetCalories?: number;
    allergies?: string[];
    dietaryRestrictions?: string[];
    dislikes?: string[];
  }) => Promise<
    | { ok: true; concepts: WeeklyMealConceptResult }
    | { ok: false; error: string; code?: string }
  >;
  generateRankedWeeklyStrategy: (
    request: RankedWeeklyStrategyRequest,
  ) => Promise<
    | { ok: true; strategy: RankedWeeklyStrategy }
    | { ok: false; error: string; code?: string }
  >;
  resolveWeeklyRecipes: (input: {
    candidates: CulinaryDiscoveryCandidate[];
    uniqueCandidateIds?: string[];
  }) => Promise<
    | { ok: true; result: { recipesByCandidateId: Record<string, ResolvedRecipe> } }
    | {
        ok: false;
        error: string;
        code?: string;
        result?: { recipesByCandidateId: Record<string, ResolvedRecipe> };
      }
  >;
};

export type GenerationProgressCallback = (stage: ConsumerPlanGenerationStage) => void;

async function buildLocalDemoPlan(
  onProgress?: GenerationProgressCallback,
  nutritionTarget?: NutritionTarget | null,
): Promise<ConsumerWeeklyPlan> {
  const weekStart = startOfWeekMonday();
  onProgress?.("understanding_preferences");
  await delay(280);
  onProgress?.("finding_meals");
  await delay(320);
  const pools = plan008SimpleRankedPools();
  onProgress?.("building_complete_meals");
  const composed = await composeMealConcepts({
    rankedCandidates: [...pools.lunchCandidates, ...pools.dinnerCandidates],
    provider: new MockMealCompositionProvider(),
    providerMeta: { provider: "mock", model: "local-fixture" },
    targetCalories: nutritionTarget?.targetCalories ?? 2250,
  });
  onProgress?.("creating_week");
  await delay(280);
  const strategy = plan008SimpleWeeklyStrategy();
  onProgress?.("finalizing_recipes");
  await delay(280);
  const recipesByCandidateId: Record<string, ResolvedRecipe> = {};
  const lookup = plan008SimpleCandidateLookup();
  const detailed = plan009SimpleResolvedRecipes();
  for (const recipe of detailed) {
    recipesByCandidateId[recipe.candidateId] = recipe;
  }
  for (const id of strategy.uniqueCandidateIds) {
    if (!recipesByCandidateId[id]) {
      const candidate = lookup.get(id);
      if (candidate) {
        recipesByCandidateId[id] = makeResolvedRecipeFixture(candidate);
      }
    }
  }
  const meals = applyPersonalizedPortionsToMeals(
    buildConsumerMealsFromStrategy({
      strategy,
      conceptsByCandidateId: composed.result.conceptsByCandidateId,
      recipesByCandidateId,
    }),
    { nutritionTarget },
  );
  onProgress?.("complete");
  return {
    weekStart,
    weekEnd: addDaysIso(weekStart, 6),
    status: "ready",
    generatedAt: new Date().toISOString(),
    generationStage: "complete",
    strategy,
    conceptsByCandidateId: composed.result.conceptsByCandidateId,
    recipesByCandidateId,
    meals,
  };
}

function buildDiscoveryRequest(
  mealType: "lunch" | "dinner",
  apis: PlanGenerationApis,
): CulinaryDiscoveryRequest {
  const meal = apis.mealPreferences;
  const cooking = apis.cookingPreferences;
  return {
    mealType,
    cuisines: meal?.cuisines.length ? [...meal.cuisines] : undefined,
    proteinPreferences: meal?.proteinPreferences.length
      ? [...meal.proteinPreferences]
      : undefined,
    experiencePreferences: meal?.experiencePreferences.length
      ? [...meal.experiencePreferences]
      : undefined,
    allergies: meal?.allergies ?? [],
    dietaryRestrictions: meal?.dietaryRestrictions ?? [],
    dislikes: meal?.dislikes ?? [],
    cookingPreferences: cooking
      ? {
          cookingStyle: cooking.cookingStyle,
          maxFinishMinutes: cooking.maxFinishMinutes,
        }
      : undefined,
    targetCandidateCount: 16,
  };
}

async function buildRemotePlan(
  apis: PlanGenerationApis,
  onProgress?: GenerationProgressCallback,
): Promise<ConsumerWeeklyPlan> {
  const weekStart = startOfWeekMonday();
  onProgress?.("understanding_preferences");
  await delay(200);

  onProgress?.("finding_meals");
  const [lunchDiscover, dinnerDiscover] = await Promise.all([
    apis.discoverCulinaryCandidates(buildDiscoveryRequest("lunch", apis)),
    apis.discoverCulinaryCandidates(buildDiscoveryRequest("dinner", apis)),
  ]);
  if (!lunchDiscover.ok) {
    throw Object.assign(new Error(lunchDiscover.error), { code: lunchDiscover.code });
  }
  if (!dinnerDiscover.ok) {
    throw Object.assign(new Error(dinnerDiscover.error), { code: dinnerDiscover.code });
  }

  const meal = apis.mealPreferences;
  const cooking = apis.cookingPreferences;
  const varietyLevel = meal?.varietyLevel ?? "balanced";
  const userPreferences = {
    cuisines: meal?.cuisines ?? [],
    proteinPreferences: meal?.proteinPreferences ?? [],
    experiencePreferences: meal?.experiencePreferences ?? [],
    dislikes: meal?.dislikes ?? [],
  };
  const cookingPrefs = cooking
    ? {
        cookingStyle: cooking.cookingStyle,
        maxFinishMinutes: cooking.maxFinishMinutes,
      }
    : undefined;

  const [lunchRanked, dinnerRanked] = await Promise.all([
    apis.rankCulinaryCandidates({
      mealType: "lunch",
      candidates: lunchDiscover.result.candidates,
      userPreferences,
      cookingPreferences: cookingPrefs,
      targetPoolSize: 12,
    }),
    apis.rankCulinaryCandidates({
      mealType: "dinner",
      candidates: dinnerDiscover.result.candidates,
      userPreferences,
      cookingPreferences: cookingPrefs,
      targetPoolSize: 12,
    }),
  ]);
  if (!lunchRanked.ok) {
    throw Object.assign(new Error(lunchRanked.error), { code: lunchRanked.code });
  }
  if (!dinnerRanked.ok) {
    throw Object.assign(new Error(dinnerRanked.error), { code: dinnerRanked.code });
  }

  onProgress?.("building_complete_meals");
  const uniqueRanked = uniqueByCandidateId([
    ...lunchRanked.result.selected,
    ...dinnerRanked.result.selected,
  ]);
  const composed = await apis.composeMealConcepts({
    rankedCandidates: uniqueRanked,
    targetCalories: apis.nutritionTarget?.targetCalories,
    allergies: meal?.allergies ?? [],
    dietaryRestrictions: meal?.dietaryRestrictions ?? [],
    dislikes: meal?.dislikes ?? [],
  });
  if (!composed.ok) {
    throw Object.assign(new Error(composed.error), { code: composed.code });
  }

  onProgress?.("creating_week");
  const rankedRequest = buildRankedWeeklyStrategyRequestFromPreview(
    {
      nutritionTarget: apis.nutritionTarget,
      mealPreferences: apis.mealPreferences,
      cookingPreferences: apis.cookingPreferences,
    },
    lunchRanked.result.selected,
    dinnerRanked.result.selected,
    varietyLevel,
    composed.concepts.conceptsByCandidateId,
  );
  if (!rankedRequest) {
    throw new Error("Could not build weekly planning request.");
  }
  const strategyResult = await apis.generateRankedWeeklyStrategy(rankedRequest);
  if (!strategyResult.ok) {
    throw Object.assign(new Error(strategyResult.error), { code: strategyResult.code });
  }

  onProgress?.("finalizing_recipes");
  const candidateLookup = new Map<string, CulinaryDiscoveryCandidate>();
  for (const ranked of uniqueRanked) {
    candidateLookup.set(ranked.candidate.candidateId, ranked.candidate);
  }
  const selectedCandidates = strategyResult.strategy.uniqueCandidateIds
    .map((id) => candidateLookup.get(id))
    .filter((c): c is CulinaryDiscoveryCandidate => c != null);
  const resolved = await apis.resolveWeeklyRecipes({
    candidates: selectedCandidates,
    uniqueCandidateIds: strategyResult.strategy.uniqueCandidateIds,
  });
  const recipesByCandidateId = resolved.ok
    ? resolved.result.recipesByCandidateId
    : (resolved.result?.recipesByCandidateId ?? {});

  const meals = applyPersonalizedPortionsToMeals(
    buildConsumerMealsFromStrategy({
      strategy: strategyResult.strategy,
      conceptsByCandidateId: composed.concepts.conceptsByCandidateId,
      recipesByCandidateId,
    }),
    { nutritionTarget: apis.nutritionTarget },
  );

  onProgress?.("complete");
  return {
    weekStart,
    weekEnd: addDaysIso(weekStart, 6),
    status: "ready",
    generatedAt: new Date().toISOString(),
    generationStage: "complete",
    strategy: strategyResult.strategy,
    conceptsByCandidateId: composed.concepts.conceptsByCandidateId,
    recipesByCandidateId,
    meals,
  };
}

export async function generateConsumerWeeklyPlan(
  apis: PlanGenerationApis,
  onProgress?: GenerationProgressCallback,
): Promise<
  | { ok: true; plan: ConsumerWeeklyPlan }
  | { ok: false; error: string; code?: string; plan: ConsumerWeeklyPlan }
> {
  const weekStart = startOfWeekMonday();
  try {
    const plan = apis.useLocalMode
      ? await buildLocalDemoPlan(onProgress, apis.nutritionTarget)
      : await buildRemotePlan(apis, onProgress);
    return { ok: true, plan };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plan generation failed";
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : undefined;
    return {
      ok: false,
      error: humanizePlanGenerationError(message, code),
      code,
      plan: {
        ...createEmptyConsumerPlan(weekStart),
        status: "failed",
        errorMessage: humanizePlanGenerationError(message, code),
        generationStage: undefined,
      },
    };
  }
}

function uniqueByCandidateId(
  ranked: RankedCulinaryCandidate[],
): RankedCulinaryCandidate[] {
  const seen = new Set<string>();
  const out: RankedCulinaryCandidate[] = [];
  for (const item of ranked) {
    if (seen.has(item.candidate.candidateId)) continue;
    seen.add(item.candidate.candidateId);
    out.push(item);
  }
  return out;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { createEmptyConsumerPlan };
