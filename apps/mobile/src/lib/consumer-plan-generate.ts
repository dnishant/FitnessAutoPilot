import type {
  CandidateRankingRequest,
  CompleteMeal,
  ConsumerPlanGenerationStage,
  ConsumerWeeklyPlan,
  CookingPreferences,
  CulinaryDiscoveryCandidate,
  CulinaryDiscoveryRequest,
  MealConcept,
  MealPreferences,
  NutritionTarget,
  RankedCulinaryCandidate,
  RankedWeeklyStrategy,
  RankedWeeklyStrategyRequest,
  RecipeNutritionResult,
  ResolvedRecipe,
  WeeklyMealCompositionResult,
  WeeklyMealConceptResult,
} from "@fitness-autopilot/contracts";
import {
  MockComponentRecipeProvider,
  MockMealCompositionProvider,
  attachPersonalizedWeeklyPlan,
  buildLocalDemoNutritionMaps,
  composeMealConcepts,
  personalizeWeeklyNutritionPlan,
  plan008SimpleCandidateLookup,
  plan008SimpleRankedPools,
  plan008SimpleWeeklyStrategy,
  makeResolvedRecipeFixture,
  plan009SimpleResolvedRecipes,
  resolveSelectedCompleteMeals,
} from "@fitness-autopilot/domain";
import {
  addDaysIso,
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
  resolveSelectedCompleteMeals?: (input: {
    mealConcepts: MealConcept[];
    selectedCandidateIds: string[];
    recipes: ResolvedRecipe[];
    targetCalories?: number;
  }) => Promise<
    | { ok: true; result: WeeklyMealCompositionResult }
    | { ok: false; error: string; code?: string; result?: WeeklyMealCompositionResult }
  >;
  resolveRecipeNutrition?: (input: {
    recipes: ResolvedRecipe[];
    uniqueCandidateIds?: string[];
  }) => Promise<
    | { ok: true; result: { recipesByCandidateId: Record<string, RecipeNutritionResult> } }
    | {
        ok: false;
        error: string;
        code?: string;
        result?: { recipesByCandidateId: Record<string, RecipeNutritionResult> };
      }
  >;
};

export type GenerationProgressCallback = (stage: ConsumerPlanGenerationStage) => void;

function newGeneratedPlanId(): string {
  return `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultDailyTarget(nutritionTarget: NutritionTarget | null) {
  if (nutritionTarget) return nutritionTarget;
  return {
    caloriesKcal: 2200,
    proteinGrams: 160,
    carbsGrams: 220,
    fatGrams: 70,
    fiberGrams: 30,
  };
}

function completeMealsByCandidateId(
  result: WeeklyMealCompositionResult,
): Record<string, CompleteMeal> {
  const out: Record<string, CompleteMeal> = {};
  for (const meal of Object.values(result.mealsByCandidateId)) {
    out[meal.candidateId] = meal;
  }
  return out;
}

async function resolveCompleteMealsLocally(input: {
  conceptsByCandidateId: Record<string, MealConcept>;
  selectedCandidateIds: string[];
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  targetCalories?: number;
}): Promise<WeeklyMealCompositionResult> {
  const resolved = await resolveSelectedCompleteMeals({
    concepts: input.conceptsByCandidateId,
    selectedCandidateIds: input.selectedCandidateIds,
    recipesByCandidateId: input.recipesByCandidateId,
    componentRecipeProvider: new MockComponentRecipeProvider(),
    resolveAddedComponents: true,
    targetCalories: input.targetCalories,
  });
  return resolved.result;
}

async function personalizeGeneratedPlan(input: {
  generatedPlanId: string;
  weekStart: string;
  weekEnd: string;
  strategy: RankedWeeklyStrategy;
  conceptsByCandidateId: Record<string, MealConcept>;
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  completeMeals: Record<string, CompleteMeal>;
  nutritionByCandidateId?: Record<string, RecipeNutritionResult>;
  componentNutritionByKey?: ReturnType<
    typeof buildLocalDemoNutritionMaps
  >["componentNutritionByKey"];
  nutritionTarget: NutritionTarget | null;
  generatedAt: string;
}): Promise<ConsumerWeeklyPlan> {
  const personalizedWeeklyPlan = personalizeWeeklyNutritionPlan({
    generatedPlanId: input.generatedPlanId,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    strategy: input.strategy,
    completeMealsByCandidateId: input.completeMeals,
    recipesByCandidateId: input.recipesByCandidateId,
    nutritionByCandidateId: input.nutritionByCandidateId,
    componentNutritionByKey: input.componentNutritionByKey,
    dailyTarget: defaultDailyTarget(input.nutritionTarget),
    nutritionTargetId: input.nutritionTarget?.id,
    nutritionTargetAlgorithmVersion: input.nutritionTarget?.algorithmVersion,
    generatedAt: input.generatedAt,
  });

  const base: ConsumerWeeklyPlan = {
    generatedPlanId: input.generatedPlanId,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    status: "ready",
    generatedAt: input.generatedAt,
    generationStage: "complete",
    strategy: input.strategy,
    conceptsByCandidateId: input.conceptsByCandidateId,
    recipesByCandidateId: input.recipesByCandidateId,
    meals: buildConsumerMealsFromStrategy({
      strategy: input.strategy,
      conceptsByCandidateId: input.conceptsByCandidateId,
      recipesByCandidateId: input.recipesByCandidateId,
    }),
  };

  return attachPersonalizedWeeklyPlan(
    base,
    personalizedWeeklyPlan,
    input.conceptsByCandidateId,
    input.recipesByCandidateId,
  );
}

async function buildLocalDemoPlan(
  apis: PlanGenerationApis,
  onProgress?: GenerationProgressCallback,
): Promise<ConsumerWeeklyPlan> {
  const weekStart = startOfWeekMonday();
  const weekEnd = addDaysIso(weekStart, 6);
  const generatedPlanId = newGeneratedPlanId();
  const generatedAt = new Date().toISOString();

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
    targetCalories: apis.nutritionTarget?.targetCalories ?? 2250,
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

  const completeResult = await resolveCompleteMealsLocally({
    conceptsByCandidateId: composed.result.conceptsByCandidateId,
    selectedCandidateIds: strategy.uniqueCandidateIds,
    recipesByCandidateId,
    targetCalories: apis.nutritionTarget?.targetCalories,
  });
  const completeMeals = completeMealsByCandidateId(completeResult);

  onProgress?.("personalizing_portions");
  const demoNutrition = buildLocalDemoNutritionMaps({
    completeMealsByCandidateId: completeMeals,
    recipesByCandidateId,
  });

  return personalizeGeneratedPlan({
    generatedPlanId,
    weekStart,
    weekEnd,
    strategy,
    conceptsByCandidateId: composed.result.conceptsByCandidateId,
    recipesByCandidateId,
    completeMeals,
    nutritionByCandidateId: demoNutrition.nutritionByCandidateId,
    componentNutritionByKey: demoNutrition.componentNutritionByKey,
    nutritionTarget: apis.nutritionTarget,
    generatedAt,
  });
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
  const weekEnd = addDaysIso(weekStart, 6);
  const generatedPlanId = newGeneratedPlanId();
  const generatedAt = new Date().toISOString();

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

  // Selected-only complete meal resolution (discarded candidates are not resolved).
  let completeMeals: Record<string, CompleteMeal> = {};
  if (apis.resolveSelectedCompleteMeals) {
    const selected = await apis.resolveSelectedCompleteMeals({
      mealConcepts: Object.values(composed.concepts.conceptsByCandidateId),
      selectedCandidateIds: strategyResult.strategy.uniqueCandidateIds,
      recipes: Object.values(recipesByCandidateId),
      targetCalories: apis.nutritionTarget?.targetCalories,
    });
    if (selected.ok) {
      completeMeals = completeMealsByCandidateId(selected.result);
    } else if (selected.result) {
      completeMeals = completeMealsByCandidateId(selected.result);
    }
  }
  if (Object.keys(completeMeals).length === 0) {
    const local = await resolveCompleteMealsLocally({
      conceptsByCandidateId: composed.concepts.conceptsByCandidateId,
      selectedCandidateIds: strategyResult.strategy.uniqueCandidateIds,
      recipesByCandidateId,
      targetCalories: apis.nutritionTarget?.targetCalories,
    });
    completeMeals = completeMealsByCandidateId(local);
  }

  onProgress?.("personalizing_portions");
  let nutritionByCandidateId: Record<string, RecipeNutritionResult> | undefined;

  if (apis.resolveRecipeNutrition && Object.keys(recipesByCandidateId).length > 0) {
    const nutrition = await apis.resolveRecipeNutrition({
      recipes: Object.values(recipesByCandidateId),
      uniqueCandidateIds: strategyResult.strategy.uniqueCandidateIds,
    });
    if (nutrition.ok) {
      nutritionByCandidateId = nutrition.result.recipesByCandidateId;
    } else if (nutrition.result?.recipesByCandidateId) {
      nutritionByCandidateId = nutrition.result.recipesByCandidateId;
    }
  }

  // Prefer ingredient nutrition already on CompleteMeal components; fill remaining
  // compound-side coefficients with structural role maps so PLAN-010 can run on
  // arbitrary generated plates when USDA has not yet batched component recipes.
  const structural = buildLocalDemoNutritionMaps({
    completeMealsByCandidateId: completeMeals,
    recipesByCandidateId,
  });
  const componentNutritionByKey = { ...structural.componentNutritionByKey };
  for (const meal of Object.values(completeMeals)) {
    for (const component of meal.components) {
      const nutrition = component.resolution?.ingredientNutrition;
      if (!nutrition) continue;
      const definition = component.definition ?? component.resolution?.definition;
      const yieldGrams =
        definition?.kind === "recipe_component"
          ? definition.referenceYieldGrams ??
            definition.ingredients.reduce((acc, ing) => acc + (ing.quantity ?? 0), 0)
          : undefined;
      componentNutritionByKey[component.normalizedComponentKey] = {
        nutrition,
        referenceYieldGrams: yieldGrams && yieldGrams > 0 ? yieldGrams : undefined,
        baseServings:
          definition?.kind === "recipe_component" ? definition.baseServings ?? 1 : 1,
      };
    }
  }
  if (!nutritionByCandidateId || Object.keys(nutritionByCandidateId).length === 0) {
    nutritionByCandidateId = structural.nutritionByCandidateId;
  }

  return personalizeGeneratedPlan({
    generatedPlanId,
    weekStart,
    weekEnd,
    strategy: strategyResult.strategy,
    conceptsByCandidateId: composed.concepts.conceptsByCandidateId,
    recipesByCandidateId,
    completeMeals,
    nutritionByCandidateId,
    componentNutritionByKey,
    nutritionTarget: apis.nutritionTarget,
    generatedAt,
  });
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
      ? await buildLocalDemoPlan(apis, onProgress)
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
