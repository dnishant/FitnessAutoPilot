import type {
  CulinaryDiscoveryCandidate,
  RankedWeeklyStrategy,
  RecipeResolutionFailure,
  RecipeResolutionRequest,
  ResolvedRecipe,
  WeeklyRecipeResolutionResult,
} from "@fitness-autopilot/contracts";
import {
  DEFAULT_RECIPE_RESOLUTION_CONCURRENCY,
  RECIPE_RESOLUTION_PROMPT_VERSION,
  RecipeResolutionRequestSchema,
  ResolvedRecipeSchema,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import { stripNonAuthoritativeNutrition } from "./generation";
import { collectRankedMealSlots } from "../planning/ranked-weekly-strategy";

export { RECIPE_RESOLUTION_PROMPT_VERSION, DEFAULT_RECIPE_RESOLUTION_CONCURRENCY };

export type RecipeResolutionErrorCode =
  | "INVALID_RESOLUTION_REQUEST"
  | "RECIPE_SCHEMA_VALIDATION_FAILED"
  | "CANDIDATE_IDENTITY_MISMATCH"
  | "LLM_CONFIGURATION_ERROR"
  | "LLM_PROVIDER_ERROR"
  | "LLM_INVALID_STRUCTURED_OUTPUT"
  | "RATE_LIMITED"
  | "CANDIDATE_NOT_FOUND"
  | "PARTIAL_WEEKLY_RESOLUTION_FAILURE";

export type RecipeResolutionError = {
  code: RecipeResolutionErrorCode;
  message: string;
  details?: unknown;
  candidateId?: string;
  candidateName?: string;
};

/**
 * Provider-independent recipe resolver.
 * Implementations (Gemini + optional Google Search grounding) live outside domain.
 * Always resolves exactly one unique candidate per call.
 */
export interface RecipeResolver {
  resolve(request: RecipeResolutionRequest): Promise<ResolvedRecipe>;
}

export type RecipeResolutionPrompt = {
  version: typeof RECIPE_RESOLUTION_PROMPT_VERSION;
  systemInstruction: string;
  userPrompt: string;
};

export function recipeResolutionError(
  code: RecipeResolutionErrorCode,
  message: string,
  details?: unknown,
): RecipeResolutionError {
  return details === undefined ? { code, message } : { code, message, details };
}

export function parseRecipeResolutionRequest(
  input: unknown,
): Result<RecipeResolutionRequest, RecipeResolutionError> {
  const parsed = RecipeResolutionRequestSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_RESOLUTION_REQUEST",
      message: parsed.error.issues[0]?.message ?? "Invalid recipe resolution request.",
      details: parsed.error.flatten(),
    });
  }
  return ok(parsed.data);
}

/**
 * Strip AI-invented nutrition so callers never treat macros as authoritative.
 */
export function stripResolvedRecipeNutrition(value: unknown): unknown {
  return stripNonAuthoritativeNutrition(value);
}

function assertNoAuthoritativeNutrition(
  value: unknown,
): Result<void, RecipeResolutionError> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return ok(undefined);
  }
  const banned = [
    "calories",
    "caloriesKcal",
    "targetCalories",
    "proteinG",
    "proteinGrams",
    "carbsG",
    "carbohydrateG",
    "fatG",
    "macros",
    "nutrition",
    "nutritionTotals",
    "estimatedCalories",
    "estimatedProteinGrams",
  ];
  const record = value as Record<string, unknown>;
  for (const key of banned) {
    if (key in record) {
      return err({
        code: "RECIPE_SCHEMA_VALIDATION_FAILED",
        message: `Resolved recipe must not include authoritative nutrition field "${key}".`,
        details: { field: key },
      });
    }
  }
  return ok(undefined);
}

/**
 * Deterministically validate a resolved recipe against the request candidate.
 * Forces candidateId from the request — Gemini must not invent a new identity.
 */
export function validateResolvedRecipe(
  input: unknown,
  request: RecipeResolutionRequest,
): Result<ResolvedRecipe, RecipeResolutionError> {
  const nutritionCheck = assertNoAuthoritativeNutrition(input);
  if (!nutritionCheck.ok) {
    return nutritionCheck;
  }
  const sanitized = stripResolvedRecipeNutrition(input);

  const withIdentity =
    sanitized !== null && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? {
          ...(sanitized as Record<string, unknown>),
          candidateId: request.candidate.candidateId,
          source: {
            name: request.candidate.source.name,
            url: request.candidate.source.url,
            author: request.candidate.source.author ?? null,
          },
        }
      : sanitized;

  const parsed = ResolvedRecipeSchema.safeParse(withIdentity);
  if (!parsed.success) {
    return err({
      code: "RECIPE_SCHEMA_VALIDATION_FAILED",
      message: parsed.error.issues[0]?.message ?? "Resolved recipe failed schema validation.",
      details: parsed.error.flatten(),
      candidateId: request.candidate.candidateId,
      candidateName: request.candidate.name,
    });
  }

  if (parsed.data.candidateId !== request.candidate.candidateId) {
    return err({
      code: "CANDIDATE_IDENTITY_MISMATCH",
      message: `Resolved candidateId "${parsed.data.candidateId}" does not match requested "${request.candidate.candidateId}".`,
      candidateId: request.candidate.candidateId,
      candidateName: request.candidate.name,
    });
  }

  const ingredientIds = new Set(parsed.data.ingredients.map((i) => i.ingredientId));
  for (const ingredient of parsed.data.ingredients) {
    if (
      ingredient.scalingReferenceIngredientId &&
      !ingredientIds.has(ingredient.scalingReferenceIngredientId)
    ) {
      return err({
        code: "RECIPE_SCHEMA_VALIDATION_FAILED",
        message: `Ingredient "${ingredient.ingredientId}" references unknown scaling ingredient "${ingredient.scalingReferenceIngredientId}".`,
        candidateId: request.candidate.candidateId,
        candidateName: request.candidate.name,
      });
    }
  }

  return ok(parsed.data);
}

export function buildRecipeResolutionPrompt(
  request: RecipeResolutionRequest,
): RecipeResolutionPrompt {
  const { candidate } = request;
  const preferredModes =
    request.preferredPrepIntents && request.preferredPrepIntents.length > 0
      ? request.preferredPrepIntents.join(", ")
      : candidate.mealPrepAdaptability === "fresh_only"
        ? "fresh"
        : candidate.mealPrepAdaptability;

  const systemInstruction = [
    "You are the Fitness Autopilot recipe resolution engine.",
    "Resolve ONE selected culinary candidate into a precise, delicious, structured recipe.",
    "Taste first: preserve sauces, marinades, spices, aromatics, texture, technique, finishing ingredients, appropriate fat, acidity, and garnishes.",
    "Do NOT optimize for low calorie, diet food, clean eating, bodybuilding, or macro friendliness.",
    "Preserve culinary identity. Do not substitute a different dish. Do not turn Chicken Tikka into a healthy bowl or salad.",
    "Create an original structured representation informed by the source and dish tradition.",
    "Do NOT copy source prose, copyrighted recipe articles, or verbatim instructions.",
    "Do NOT invent or output calories, protein, carbs, fat, macros, or nutrition totals.",
    "Main recipe ingredients must stay separate from meal-completion components (rice, chutney, sides).",
    "Meal components must be culinarily appropriate — never mindlessly add rice + broccoli to every dish.",
    "Annotate scalingBehavior so a future portion solver can adjust without destroying identity.",
    "Instructions must be practical and executable for a normal home cook.",
    `Prompt version: ${RECIPE_RESOLUTION_PROMPT_VERSION}.`,
  ].join(" ");

  const userPrompt = [
    "Resolve this PLAN-005 culinary candidate into a Fitness Autopilot structured recipe.",
    "",
    "CANDIDATE (identity must be preserved):",
    `- candidateId: ${candidate.candidateId}`,
    `- name: ${candidate.name}`,
    `- source.name: ${candidate.source.name}`,
    `- source.url: ${candidate.source.url}`,
    `- source.author: ${candidate.source.author ?? "(none)"}`,
    `- cuisineFamily: ${candidate.cuisineFamily}`,
    `- regionalStyle: ${candidate.regionalStyle ?? "(none)"}`,
    `- primaryProtein: ${candidate.primaryProtein ?? "(none)"}`,
    `- dishFormat: ${candidate.dishFormat}`,
    `- flavorFamilies: ${candidate.flavorFamilies.join(", ")}`,
    `- cookingTechniques: ${candidate.cookingTechniques.join(", ")}`,
    `- textureTags: ${candidate.textureTags.join(", ") || "(none)"}`,
    `- experienceTags: ${candidate.experienceTags.join(", ") || "(none)"}`,
    `- mealPrepAdaptability: ${candidate.mealPrepAdaptability}`,
    `- whyItIsInteresting: ${candidate.whyItIsInteresting}`,
    "",
    "SOURCE GROUNDING:",
    "Use the source URL / provenance and Google Search (when available) only to verify culinary identity and traditional structure of THIS dish.",
    "Do not search for unrelated alternative dishes. Do not silently replace the selected dish.",
    "",
    "OUTPUT REQUIREMENTS (JSON object):",
    `- candidateId MUST equal "${candidate.candidateId}"`,
    `- name should remain recognizably "${candidate.name}"`,
    "- recipeId: short stable id slug for this resolution",
    "- description: appetizing culinary description (not diet marketing)",
    "- baseServings: coherent base recipe size (e.g. 4), NOT weekly slot count",
    "- ingredients[]: structured with ingredientId, name, quantity, unit, optional preparation,",
    "  role (protein|carb|fat|vegetable|sauce|seasoning|aromatic|acid|garnish|other),",
    "  scalingBehavior (primary_scalable|secondary_scalable|ratio_bound|fixed),",
    "  optional scalingReferenceIngredientId for ratio_bound items",
    "- instructions[]: { stepNumber, text } executable steps",
    "- prepTimeMinutes, cookTimeMinutes",
    "- supportedPrepModes[]: for each mode include mode, advanceTasks, finishTasks, finishTimeMinutes, optional storageInstructions",
    `  Prefer modes compatible with: ${preferredModes}`,
    "- storageInstructions, reheatingInstructions when meal-prep relevant",
    "- mealComponents[]: main + culturally appropriate sides/condiments with type, required, purpose, relationship (intrinsic|recommended_side|optional)",
    "  mealComponent.type MUST be one of: main | carb_side | vegetable_side | sauce | condiment | garnish | other",
    "  Do NOT use type values like protein or side.",
    "- flavorProfile, experienceProfile (moistureLevel, flavorIntensity, textureTags, mealPrepQuality)",
    "",
    "SCALING GUIDANCE:",
    "- Primary protein and carb sides: primary_scalable",
    "- Marinades, spice mixes, aromatics bound to protein: ratio_bound with scalingReferenceIngredientId",
    "- Oil may be secondary_scalable or ratio_bound",
    "- Garnishes often fixed or secondary_scalable",
    "",
    "Return ONLY a JSON object matching the schema. No markdown commentary outside the JSON.",
  ].join("\n");

  return {
    version: RECIPE_RESOLUTION_PROMPT_VERSION,
    systemInstruction,
    userPrompt,
  };
}

/**
 * Extract unique candidate IDs from a ranked weekly strategy (14 slots → unique set).
 */
export function getUniqueCandidatesFromWeeklyStrategy(
  strategy: RankedWeeklyStrategy,
): string[] {
  if (strategy.uniqueCandidateIds.length > 0) {
    return [...strategy.uniqueCandidateIds];
  }
  return [...new Set(collectRankedMealSlots(strategy.days).map((slot) => slot.candidateId))];
}

export function countWeeklyMealSlots(strategy: RankedWeeklyStrategy): number {
  return collectRankedMealSlots(strategy.days).length;
}

export function buildCandidateLookup(
  candidates: readonly CulinaryDiscoveryCandidate[],
): Map<string, CulinaryDiscoveryCandidate> {
  const map = new Map<string, CulinaryDiscoveryCandidate>();
  for (const candidate of candidates) {
    map.set(candidate.candidateId, candidate);
  }
  return map;
}

/**
 * Run async work over items with a bounded concurrency limit.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current]!, current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

export type ResolveWeeklyStrategyRecipesOptions = {
  concurrency?: number;
  preferredPrepIntentsByCandidateId?: Record<string, ResolvedRecipe["supportedPrepModes"][number]["mode"][]>;
};

export type WeeklyRecipeResolutionSuccess = WeeklyRecipeResolutionResult & {
  failures: RecipeResolutionFailure[];
};

/**
 * Orchestrate unique-candidate recipe resolution for a weekly strategy.
 * Deduplicates by candidateId — never one Gemini call per meal slot.
 */
export async function resolveWeeklyStrategyRecipes(input: {
  strategy: RankedWeeklyStrategy;
  candidatesById: Map<string, CulinaryDiscoveryCandidate> | ReadonlyMap<string, CulinaryDiscoveryCandidate>;
  resolver: RecipeResolver;
  options?: ResolveWeeklyStrategyRecipesOptions;
}): Promise<Result<WeeklyRecipeResolutionSuccess, RecipeResolutionError>> {
  const uniqueCandidateIds = getUniqueCandidatesFromWeeklyStrategy(input.strategy);
  const slotCount = countWeeklyMealSlots(input.strategy);
  const concurrency =
    input.options?.concurrency ?? DEFAULT_RECIPE_RESOLUTION_CONCURRENCY;

  const recipesByCandidateId: Record<string, ResolvedRecipe> = {};
  const failures: RecipeResolutionFailure[] = [];

  const outcomes = await mapWithConcurrency(uniqueCandidateIds, concurrency, async (candidateId) => {
    const candidate = input.candidatesById.get(candidateId);
    if (!candidate) {
      return {
        ok: false as const,
        failure: {
          candidateId,
          candidateName: candidateId,
          failureReason: `Candidate metadata not found for id "${candidateId}".`,
          code: "CANDIDATE_NOT_FOUND" as const,
        },
      };
    }

    try {
      const recipe = await input.resolver.resolve({
        candidate,
        preferredPrepIntents: input.options?.preferredPrepIntentsByCandidateId?.[candidateId],
      });
      const validated = validateResolvedRecipe(recipe, { candidate });
      if (!validated.ok) {
        return {
          ok: false as const,
          failure: {
            candidateId: candidate.candidateId,
            candidateName: candidate.name,
            failureReason: validated.error.message,
            code: validated.error.code,
          },
        };
      }
      return { ok: true as const, recipe: validated.value };
    } catch (error) {
      const mapped = asRecipeResolutionError(error, candidate);
      return {
        ok: false as const,
        failure: {
          candidateId: candidate.candidateId,
          candidateName: candidate.name,
          failureReason: mapped.message,
          code: mapped.code,
        },
      };
    }
  });

  for (const outcome of outcomes) {
    if (outcome.ok) {
      recipesByCandidateId[outcome.recipe.candidateId] = outcome.recipe;
    } else {
      failures.push(outcome.failure);
    }
  }

  if (failures.length > 0) {
    return err({
      code: "PARTIAL_WEEKLY_RESOLUTION_FAILURE",
      message: `${failures.length} of ${uniqueCandidateIds.length} unique candidates failed recipe resolution.`,
      details: { failures, recipesByCandidateId },
      candidateId: failures[0]?.candidateId,
      candidateName: failures[0]?.candidateName,
    });
  }

  return ok({
    recipesByCandidateId,
    uniqueCandidateIds,
    resolvedCount: Object.keys(recipesByCandidateId).length,
    slotCount,
    resolverCallCount: uniqueCandidateIds.length,
    failures,
  });
}

/**
 * Resolve an explicit unique candidate list (dev preview / Edge batch).
 */
export async function resolveUniqueCandidates(input: {
  candidates: readonly CulinaryDiscoveryCandidate[];
  uniqueCandidateIds?: readonly string[];
  resolver: RecipeResolver;
  concurrency?: number;
}): Promise<Result<WeeklyRecipeResolutionSuccess, RecipeResolutionError>> {
  const lookup = buildCandidateLookup(input.candidates);
  const ids =
    input.uniqueCandidateIds && input.uniqueCandidateIds.length > 0
      ? [...new Set(input.uniqueCandidateIds)]
      : [...lookup.keys()];

  const syntheticStrategy = {
    days: [],
    uniqueCandidateIds: ids,
    strategySummary: {
      varietyApproach: "n/a",
      prepApproach: "n/a",
      ingredientReuseApproach: "n/a",
    },
    metadata: {
      provider: "local",
      model: "n/a",
      promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
    },
  } as unknown as RankedWeeklyStrategy;

  // Prefer direct path without requiring 7 days for preview/batch.
  const concurrency = input.concurrency ?? DEFAULT_RECIPE_RESOLUTION_CONCURRENCY;
  const recipesByCandidateId: Record<string, ResolvedRecipe> = {};
  const failures: RecipeResolutionFailure[] = [];

  const outcomes = await mapWithConcurrency(ids, concurrency, async (candidateId) => {
    const candidate = lookup.get(candidateId);
    if (!candidate) {
      return {
        ok: false as const,
        failure: {
          candidateId,
          candidateName: candidateId,
          failureReason: `Candidate metadata not found for id "${candidateId}".`,
          code: "CANDIDATE_NOT_FOUND" as const,
        },
      };
    }
    try {
      const recipe = await input.resolver.resolve({ candidate });
      const validated = validateResolvedRecipe(recipe, { candidate });
      if (!validated.ok) {
        return {
          ok: false as const,
          failure: {
            candidateId: candidate.candidateId,
            candidateName: candidate.name,
            failureReason: validated.error.message,
            code: validated.error.code,
          },
        };
      }
      return { ok: true as const, recipe: validated.value };
    } catch (error) {
      const mapped = asRecipeResolutionError(error, candidate);
      return {
        ok: false as const,
        failure: {
          candidateId: candidate.candidateId,
          candidateName: candidate.name,
          failureReason: mapped.message,
          code: mapped.code,
        },
      };
    }
  });

  for (const outcome of outcomes) {
    if (outcome.ok) {
      recipesByCandidateId[outcome.recipe.candidateId] = outcome.recipe;
    } else {
      failures.push(outcome.failure);
    }
  }

  if (failures.length > 0) {
    return err({
      code: "PARTIAL_WEEKLY_RESOLUTION_FAILURE",
      message: `${failures.length} of ${ids.length} unique candidates failed recipe resolution.`,
      details: { failures, recipesByCandidateId },
      candidateId: failures[0]?.candidateId,
      candidateName: failures[0]?.candidateName,
    });
  }

  void syntheticStrategy;
  return ok({
    recipesByCandidateId,
    uniqueCandidateIds: ids,
    resolvedCount: Object.keys(recipesByCandidateId).length,
    slotCount: ids.length,
    resolverCallCount: ids.length,
    failures,
  });
}

function asRecipeResolutionError(
  error: unknown,
  candidate: CulinaryDiscoveryCandidate,
): RecipeResolutionError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as RecipeResolutionError).code === "string" &&
    typeof (error as RecipeResolutionError).message === "string"
  ) {
    const typed = error as RecipeResolutionError;
    return {
      ...typed,
      candidateId: typed.candidateId ?? candidate.candidateId,
      candidateName: typed.candidateName ?? candidate.name,
    };
  }
  return {
    code: "LLM_PROVIDER_ERROR",
    message: error instanceof Error ? error.message : "Recipe resolution failed.",
    candidateId: candidate.candidateId,
    candidateName: candidate.name,
  };
}
