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
  MAX_EXECUTABLE_REPLACEMENT_ROUNDS,
  MAX_GROCERY_COMPLEXITY_REPAIR_ROUNDS,
  assessWeeklyPlanExecutability,
  assertWeeklyConsumerPlanIntegrity,
  attachPersonalizedWeeklyPlan,
  buildComponentNutritionByKeyFromCompleteMeals,
  buildLocalDemoNutritionMaps,
  buildNutritionMapsFromGeneratedRecipes,
  buildV1WeeklyStrategy,
  composeMealConcepts,
  deriveGroceryList,
  finalizeWeeklyNutritionPlan,
  formatValidationReportForDiagnostics,
  isStructuralPortionBlockReason,
  metricsFromResolvedRecipes,
  plan008SimpleCandidateLookup,
  plan008SimpleRankedPools,
  plan008SimpleWeeklyStrategy,
  makeResolvedRecipeFixture,
  plan009SimpleResolvedRecipes,
  recordExecutabilityFailures,
  repairStrategyForGroceryComplexity,
  replaceFailedCandidatesInStrategy,
  resolveSelectedCompleteMeals,
  type PersonalizeWeeklyNutritionPlanInput,
} from "@fitness-autopilot/domain";
import {
  addDaysIso,
  buildConsumerMealsFromStrategy,
  createEmptyConsumerPlan,
  formatPlanGenerationFailureDetail,
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

async function personalizeAndFinalizeGeneratedPlan(input: {
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
  onProgress?: GenerationProgressCallback;
}): Promise<ConsumerWeeklyPlan> {
  const personalizeInput: PersonalizeWeeklyNutritionPlanInput = {
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
  };

  // Remove debug instrumentation
  input.onProgress?.("personalizing_portions");
  input.onProgress?.("finalizing_plan");

  const finalized = finalizeWeeklyNutritionPlan({
    personalizeInput,
    generationContext: {
      generatedPlanId: input.generatedPlanId,
      completeMealsByCandidateId: input.completeMeals,
      validatedAt: input.generatedAt,
    },
  });

  if (!finalized.ok) {
    if (typeof console !== "undefined") {
      console.warn(
        "[PLAN-011] finalization failed:\n" +
          formatValidationReportForDiagnostics(finalized.report),
      );
    }
    throw Object.assign(
      new Error(
        `Weekly nutrition plan failed PLAN-011 validation (${finalized.status}): ` +
          finalized.reasons.map((r) => r.ruleId).join(", "),
      ),
      { code: "PLAN_VALIDATION_FAILED", validationReport: finalized.report },
    );
  }

  const groceryResult = deriveGroceryList({
    personalizedWeeklyPlan: finalized.personalizedWeeklyPlan,
    recipesByCandidateId: input.recipesByCandidateId,
    completeMealsByCandidateId: input.completeMeals,
    nutritionByCandidateId: input.nutritionByCandidateId,
    generatedAt: input.generatedAt,
  });

  if (!groceryResult.ok && typeof console !== "undefined") {
    console.warn(
      `[PLAN-012] grocery derivation failed (${groceryResult.code}): ${groceryResult.message}`,
    );
  } else if (groceryResult.ok && typeof console !== "undefined" && groceryResult.issues.length > 0) {
    console.warn(
      `[PLAN-012] grocery derivation completed with ${groceryResult.issues.length} issue(s)`,
    );
  }

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
    coreRepertoire: input.strategy.coreRepertoire,
    flexibleDay: input.strategy.flexibleDay ?? "sunday",
    meals: buildConsumerMealsFromStrategy({
      strategy: input.strategy,
      conceptsByCandidateId: input.conceptsByCandidateId,
      recipesByCandidateId: input.recipesByCandidateId,
    }),
    validationReport: finalized.report,
    groceryList: groceryResult.ok ? groceryResult.groceryList : undefined,
  };

  return attachPersonalizedWeeklyPlan(
    base,
    finalized.personalizedWeeklyPlan,
    input.conceptsByCandidateId,
    input.recipesByCandidateId,
  );
}

function assertReadyPlanIntegrity(plan: ConsumerWeeklyPlan): ConsumerWeeklyPlan {
  if (plan.status === "ready" && !plan.personalizedWeeklyPlan?.finalization) {
    throw Object.assign(
      new Error("Refusing to activate weekly plan without PLAN-011 finalization metadata."),
      { code: "PLAN_VALIDATION_FAILED" },
    );
  }
  const integrity = assertWeeklyConsumerPlanIntegrity(plan.meals ?? []);
  if (!integrity.ok) {
    throw Object.assign(
      new Error(
        `Refusing to activate weekly plan with canonical meal integrity failures: ` +
          integrity.failures.map((f) => f.code).join(", "),
      ),
      { code: "CANONICAL_MEAL_INTEGRITY_FAILED" },
    );
  }
  return plan;
}

/** True when at least one selected recipe carries llm_estimate macros. */
export function recipesHaveGeneratedNutrition(
  recipesByCandidateId: Record<string, ResolvedRecipe>,
  candidateIds?: readonly string[],
): boolean {
  const ids = candidateIds ?? Object.keys(recipesByCandidateId);
  return ids.some((id) => {
    const nutrition = recipesByCandidateId[id]?.nutrition;
    return nutrition?.source === "llm_estimate" && nutrition.perServing != null;
  });
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

  // Prefer LLM-generated recipe.nutrition; fall back to structural demo maps.
  let nutritionByCandidateId = buildNutritionMapsFromGeneratedRecipes(recipesByCandidateId);
  const demoNutrition = buildLocalDemoNutritionMaps({
    completeMealsByCandidateId: completeMeals,
    recipesByCandidateId,
  });
  if (Object.keys(nutritionByCandidateId).length === 0) {
    nutritionByCandidateId = demoNutrition.nutritionByCandidateId;
  }

  return assertReadyPlanIntegrity(
    await personalizeAndFinalizeGeneratedPlan({
      generatedPlanId,
      weekStart,
      weekEnd,
      strategy,
      conceptsByCandidateId: composed.result.conceptsByCandidateId,
      recipesByCandidateId,
      completeMeals,
      nutritionByCandidateId,
      componentNutritionByKey: demoNutrition.componentNutritionByKey,
      nutritionTarget: apis.nutritionTarget,
      generatedAt,
      onProgress,
    }),
  );
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
    targetCandidateCount: 12,
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
      targetPoolSize: 10,
    }),
    apis.rankCulinaryCandidates({
      mealType: "dinner",
      candidates: dinnerDiscover.result.candidates,
      userPreferences,
      cookingPreferences: cookingPrefs,
      targetPoolSize: 10,
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
  // V1: deterministic four-meal repertoire + 12-slot assignment (not LLM top-N scheduling).
  const v1Strategy = buildV1WeeklyStrategy({
    lunchPool: lunchRanked.result.selected,
    dinnerPool: dinnerRanked.result.selected,
    conceptsByCandidateId: composed.concepts.conceptsByCandidateId,
    varietyLevel,
    cookingStyle: cooking?.cookingStyle,
  });
  if (!v1Strategy.ok) {
    throw Object.assign(new Error(v1Strategy.error.message), {
      code: v1Strategy.error.code,
    });
  }
  // Keep ranked request builder available for diagnostics / fallback tooling.
  void buildRankedWeeklyStrategyRequestFromPreview;
  void apis.generateRankedWeeklyStrategy;

  onProgress?.("finalizing_recipes");
  const candidateLookup = new Map<string, CulinaryDiscoveryCandidate>();
  for (const ranked of uniqueRanked) {
    candidateLookup.set(ranked.candidate.candidateId, ranked.candidate);
  }

  let strategy = v1Strategy.value.strategy;
  let recipesByCandidateId: Record<string, ResolvedRecipe> = {};
  let completeMeals: Record<string, CompleteMeal> = {};
  let nutritionByCandidateId: Record<
    string,
    import("@fitness-autopilot/contracts").RecipeNutritionResult
  > = {};
  let componentNutritionByKey: Record<
    string,
    {
      nutrition: import("@fitness-autopilot/contracts").IngredientNutrition;
      referenceYieldGrams?: number;
      baseServings?: number;
    }
  > = {};

  const failedCandidateIds = new Set<string>();
  let lastFailures: ReturnType<typeof assessWeeklyPlanExecutability>["failures"] = [];

  for (let round = 0; round <= MAX_EXECUTABLE_REPLACEMENT_ROUNDS; round += 1) {
    const missingIds = strategy.uniqueCandidateIds.filter((id) => !recipesByCandidateId[id]);
    if (missingIds.length > 0) {
      const toResolve = missingIds
        .map((id) => candidateLookup.get(id))
        .filter((c): c is CulinaryDiscoveryCandidate => c != null);
      const resolved = await apis.resolveWeeklyRecipes({
        candidates: toResolve,
        uniqueCandidateIds: missingIds,
      });
      const partial = resolved.ok
        ? resolved.result.recipesByCandidateId
        : (resolved.result?.recipesByCandidateId ?? {});
      recipesByCandidateId = { ...recipesByCandidateId, ...partial };
    }

    if (
      Object.keys(recipesByCandidateId).length > 0 &&
      !recipesHaveGeneratedNutrition(recipesByCandidateId, strategy.uniqueCandidateIds)
    ) {
      // Mark selected IDs without llm_estimate as failed for replacement rather than
      // publishing a ready plan with unknown nutrition.
      for (const id of strategy.uniqueCandidateIds) {
        const nutrition = recipesByCandidateId[id]?.nutrition;
        if (!(nutrition?.source === "llm_estimate" && nutrition.perServing != null)) {
          failedCandidateIds.add(id);
        }
      }
    }

    completeMeals = await resolveCompleteMealsForStrategy({
      apis,
      conceptsByCandidateId: composed.concepts.conceptsByCandidateId,
      selectedCandidateIds: strategy.uniqueCandidateIds,
      recipesByCandidateId,
      targetCalories: apis.nutritionTarget?.targetCalories,
    });

    nutritionByCandidateId = buildNutritionMapsFromGeneratedRecipes(recipesByCandidateId);
    if (apis.resolveRecipeNutrition && Object.keys(recipesByCandidateId).length > 0) {
      try {
        const nutrition = await apis.resolveRecipeNutrition({
          recipes: Object.values(recipesByCandidateId),
          uniqueCandidateIds: strategy.uniqueCandidateIds,
        });
        const usdaMap =
          nutrition.ok || nutrition.result?.recipesByCandidateId
            ? nutrition.result?.recipesByCandidateId ??
              (nutrition.ok ? nutrition.result.recipesByCandidateId : undefined)
            : undefined;
        if (usdaMap) {
          for (const [candidateId, result] of Object.entries(usdaMap)) {
            if (!nutritionByCandidateId[candidateId]) {
              nutritionByCandidateId[candidateId] = result;
            }
          }
        }
      } catch {
        // USDA is non-blocking verification only.
      }
    }

    const fromMeals = buildComponentNutritionByKeyFromCompleteMeals(completeMeals);
    componentNutritionByKey = {};
    for (const [key, entry] of Object.entries(fromMeals)) {
      componentNutritionByKey[key] = {
        nutrition: entry.nutrition,
        referenceYieldGrams: entry.referenceYieldGrams,
        baseServings: entry.baseServings,
      };
    }

    const assessment = assessWeeklyPlanExecutability({
      uniqueCandidateIds: strategy.uniqueCandidateIds,
      completeMealsByCandidateId: completeMeals,
      recipesByCandidateId,
      nutritionByCandidateId,
      componentNutritionByKey,
    });
    lastFailures = assessment.failures;

    if (assessment.failures.length === 0) {
      break;
    }

    const nextFailed = recordExecutabilityFailures(failedCandidateIds, assessment.failures);
    for (const id of nextFailed) failedCandidateIds.add(id);

    if (round === MAX_EXECUTABLE_REPLACEMENT_ROUNDS) {
      throw Object.assign(
        new Error(
          `Weekly plan is not executable after ${MAX_EXECUTABLE_REPLACEMENT_ROUNDS} replacement rounds. ` +
            assessment.failures.map((f) => `${f.candidateId}:${f.code}`).join("; "),
        ),
        { code: "EXECUTABLE_REPLACEMENT_EXHAUSTED" },
      );
    }

    const replacement = replaceFailedCandidatesInStrategy({
      strategy,
      failures: assessment.failures,
      lunchPool: lunchRanked.result.selected,
      dinnerPool: dinnerRanked.result.selected,
      failedCandidateIds,
      conceptsByCandidateId: composed.concepts.conceptsByCandidateId,
    });

    if (!replacement.ok || replacement.replacements.length === 0) {
      throw Object.assign(
        new Error(
          replacement.ok === false
            ? replacement.message
            : "No ranked replacements available for non-executable selected candidates.",
        ),
        { code: "EXECUTABLE_REPLACEMENT_EXHAUSTED" },
      );
    }

    strategy = replacement.strategy;
    for (const id of replacement.failedCandidateIds) failedCandidateIds.add(id);
    onProgress?.("finalizing_recipes");
  }

  if (lastFailures.length > 0) {
    throw Object.assign(
      new Error(
        `Non-executable candidates remain: ${lastFailures.map((f) => f.candidateId).join(", ")}`,
      ),
      { code: "EXECUTABLE_REPLACEMENT_EXHAUSTED" },
    );
  }

  // Stage B: exact grocery complexity gate + bounded repertoire repair.
  for (let groceryRound = 0; groceryRound <= MAX_GROCERY_COMPLEXITY_REPAIR_ROUNDS; groceryRound += 1) {
    const groceryMetrics = metricsFromResolvedRecipes({
      strategy,
      recipesByCandidateId,
      varietyLevel,
    });
    if (groceryMetrics.band !== "excessive") break;

    if (groceryRound === MAX_GROCERY_COMPLEXITY_REPAIR_ROUNDS) {
      throw Object.assign(
        new Error(
          `Weekly grocery complexity remains excessive after ${MAX_GROCERY_COMPLEXITY_REPAIR_ROUNDS} repair rounds ` +
            `(weighted=${groceryMetrics.weightedComplexity}, unique=${groceryMetrics.uniqueCanonicalIngredients}).`,
        ),
        { code: "GROCERY_COMPLEXITY_REPAIR_EXHAUSTED", metrics: groceryMetrics },
      );
    }

    const repaired = repairStrategyForGroceryComplexity({
      strategy,
      metrics: groceryMetrics,
      lunchPool: lunchRanked.result.selected,
      dinnerPool: dinnerRanked.result.selected,
      conceptsByCandidateId: composed.concepts.conceptsByCandidateId,
      excludedCandidateIds: failedCandidateIds,
    });
    if (!repaired.ok || !repaired.repaired) {
      throw Object.assign(
        new Error(
          repaired.ok
            ? "Grocery complexity is excessive and no lower-burden replacements were available."
            : repaired.message,
        ),
        { code: "GROCERY_COMPLEXITY_REPAIR_EXHAUSTED", metrics: groceryMetrics },
      );
    }

    strategy = repaired.strategy;
    for (const rep of repaired.replacements) {
      failedCandidateIds.add(rep.failedCandidateId);
    }

    // Resolve any newly introduced core meals before the next complexity check.
    const missingIds = strategy.uniqueCandidateIds.filter((id) => !recipesByCandidateId[id]);
    if (missingIds.length > 0) {
      const toResolve = missingIds
        .map((id) => candidateLookup.get(id))
        .filter((c): c is CulinaryDiscoveryCandidate => c != null);
      const resolved = await apis.resolveWeeklyRecipes({
        candidates: toResolve,
        uniqueCandidateIds: missingIds,
      });
      const partial = resolved.ok
        ? resolved.result.recipesByCandidateId
        : (resolved.result?.recipesByCandidateId ?? {});
      recipesByCandidateId = { ...recipesByCandidateId, ...partial };
      completeMeals = await resolveCompleteMealsForStrategy({
        apis,
        conceptsByCandidateId: composed.concepts.conceptsByCandidateId,
        selectedCandidateIds: strategy.uniqueCandidateIds,
        recipesByCandidateId,
        targetCalories: apis.nutritionTarget?.targetCalories,
      });
      nutritionByCandidateId = buildNutritionMapsFromGeneratedRecipes(recipesByCandidateId);
    }
    onProgress?.("creating_week");
  }

  if (Object.keys(nutritionByCandidateId).length === 0) {
    console.warn(
      "[consumer-plan-generate] No recipe.nutrition (llm_estimate) on resolved recipes; " +
        "skipping structural chicken fallback. Meals without trusted nutrition will be blocked.",
    );
  }

  const plan = await personalizeAndFinalizeGeneratedPlan({
    generatedPlanId,
    weekStart,
    weekEnd,
    strategy,
    conceptsByCandidateId: composed.concepts.conceptsByCandidateId,
    recipesByCandidateId,
    completeMeals,
    nutritionByCandidateId,
    componentNutritionByKey,
    nutritionTarget: apis.nutritionTarget,
    generatedAt,
    onProgress,
  });

  // Defense in depth: never publish a ready plan with unresolved mains / structural blocks.
  const personalizedInstances =
    plan.personalizedWeeklyPlan?.days.flatMap((d) => d.meals) ?? [];
  const structuralBlocked = personalizedInstances.filter(
    (m) => m.status === "blocked" && isStructuralPortionBlockReason(m.blockReason),
  );
  const missingRecipes = strategy.uniqueCandidateIds.filter((id) => !recipesByCandidateId[id]);

  if (structuralBlocked.length > 0 || missingRecipes.length > 0) {
    throw Object.assign(
      new Error(
        `Refusing to activate weekly plan with ${structuralBlocked.length} structurally blocked meal(s)` +
          (missingRecipes.length > 0
            ? ` and ${missingRecipes.length} unresolved recipe(s)`
            : "") +
          ".",
      ),
      { code: "PLAN_NOT_EXECUTABLE" },
    );
  }

  if (!plan.personalizedWeeklyPlan?.finalization) {
    throw Object.assign(
      new Error("Refusing to activate weekly plan without PLAN-011 finalization."),
      { code: "PLAN_VALIDATION_FAILED" },
    );
  }

  return assertReadyPlanIntegrity(plan);
}

async function resolveCompleteMealsForStrategy(input: {
  apis: PlanGenerationApis;
  conceptsByCandidateId: Record<string, MealConcept>;
  selectedCandidateIds: string[];
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  targetCalories?: number;
}): Promise<Record<string, CompleteMeal>> {
  let completeMeals: Record<string, CompleteMeal> = {};
  if (input.apis.resolveSelectedCompleteMeals) {
    const selected = await input.apis.resolveSelectedCompleteMeals({
      mealConcepts: Object.values(input.conceptsByCandidateId),
      selectedCandidateIds: input.selectedCandidateIds,
      recipes: Object.values(input.recipesByCandidateId),
      targetCalories: input.targetCalories,
    });
    if (selected.ok) {
      completeMeals = completeMealsByCandidateId(selected.result);
    } else if (selected.result) {
      completeMeals = completeMealsByCandidateId(selected.result);
    }
  }
  if (Object.keys(completeMeals).length === 0) {
    const local = await resolveCompleteMealsLocally({
      conceptsByCandidateId: input.conceptsByCandidateId,
      selectedCandidateIds: input.selectedCandidateIds,
      recipesByCandidateId: input.recipesByCandidateId,
      targetCalories: input.targetCalories,
    });
    completeMeals = completeMealsByCandidateId(local);
  }
  return completeMeals;
}

/** @internal exported for tests */
export function assertNoUnresolvedRecipesOnReadyPlan(input: {
  uniqueCandidateIds: readonly string[];
  recipesByCandidateId: Record<string, ResolvedRecipe>;
}): { ok: true } | { ok: false; missingCandidateIds: string[] } {
  const missingCandidateIds = input.uniqueCandidateIds.filter(
    (id) => input.recipesByCandidateId[id] == null,
  );
  if (missingCandidateIds.length > 0) {
    return { ok: false, missingCandidateIds };
  }
  return { ok: true };
}

export async function generateConsumerWeeklyPlan(
  apis: PlanGenerationApis,
  onProgress?: GenerationProgressCallback,
): Promise<
  | { ok: true; plan: ConsumerWeeklyPlan }
  | {
      ok: false;
      error: string;
      code?: string;
      detail?: string;
      plan: ConsumerWeeklyPlan;
    }
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
    const validationReport =
      error && typeof error === "object" && "validationReport" in error
        ? (error as { validationReport?: import("@fitness-autopilot/contracts").WeeklyPlanValidationReport })
            .validationReport
        : undefined;
    if (validationReport && typeof console !== "undefined") {
      console.warn(
        "[PLAN-011] generation aborted:\n" +
          formatValidationReportForDiagnostics(validationReport),
      );
    }
    const consumerError = humanizePlanGenerationError(message, code);
    return {
      ok: false,
      error: consumerError,
      code,
      detail: formatPlanGenerationFailureDetail({
        code,
        message,
        validationReport,
      }) ?? undefined,
      plan: {
        ...createEmptyConsumerPlan(weekStart),
        status: "failed",
        errorMessage: consumerError,
        generationStage: undefined,
        validationReport,
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
