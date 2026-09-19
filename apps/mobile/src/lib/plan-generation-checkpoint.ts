import type {
  CulinaryDiscoveryCandidate,
  MealConcept,
  RankedCulinaryCandidate,
  RankedWeeklyStrategy,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";

export const PLAN_GENERATION_CHECKPOINT_KEY = "fa.consumer.planGenerationCheckpoint";

/** Discard checkpoints older than this so stale LLM pools do not linger. */
export const PLAN_GENERATION_CHECKPOINT_TTL_MS = 2 * 60 * 60 * 1000;

export const PLAN_GENERATION_CHECKPOINT_VERSION = 1 as const;

/**
 * Durable stages that can be skipped on retry after a failed Generate My Plan run.
 * Progress UI stages still fire; expensive LLM work is what we resume past.
 */
export type PlanGenerationCheckpointStage =
  | "ranked"
  | "composed"
  | "strategy"
  | "recipes_resolved";

export type PlanGenerationCheckpointV1 = {
  version: typeof PLAN_GENERATION_CHECKPOINT_VERSION;
  savedAt: string;
  weekStart: string;
  preferenceFingerprint: string;
  completedStage: PlanGenerationCheckpointStage;
  lunchCandidates: CulinaryDiscoveryCandidate[];
  dinnerCandidates: CulinaryDiscoveryCandidate[];
  lunchRanked: RankedCulinaryCandidate[];
  dinnerRanked: RankedCulinaryCandidate[];
  conceptsByCandidateId?: Record<string, MealConcept>;
  strategy?: RankedWeeklyStrategy;
  recipesByCandidateId?: Record<string, ResolvedRecipe>;
  failedCandidateIds?: string[];
};

export type PlanGenerationCheckpointStore = {
  load: () => Promise<PlanGenerationCheckpointV1 | null>;
  save: (checkpoint: PlanGenerationCheckpointV1) => Promise<void>;
  clear: () => Promise<void>;
};

export function buildPreferenceFingerprint(input: {
  nutritionTargetId?: string | null;
  mealPreferencesUpdatedAt?: string | null;
  cookingPreferencesUpdatedAt?: string | null;
  varietyLevel?: string | null;
  cuisines?: readonly string[] | null;
  allergies?: readonly string[] | null;
  dietaryRestrictions?: readonly string[] | null;
  dislikes?: readonly string[] | null;
  cookingStyle?: string | null;
  maxFinishMinutes?: number | null;
}): string {
  return JSON.stringify({
    nt: input.nutritionTargetId ?? null,
    mealAt: input.mealPreferencesUpdatedAt ?? null,
    cookAt: input.cookingPreferencesUpdatedAt ?? null,
    variety: input.varietyLevel ?? null,
    cuisines: [...(input.cuisines ?? [])].sort(),
    allergies: [...(input.allergies ?? [])].sort(),
    dietary: [...(input.dietaryRestrictions ?? [])].sort(),
    dislikes: [...(input.dislikes ?? [])].sort(),
    style: input.cookingStyle ?? null,
    finish: input.maxFinishMinutes ?? null,
  });
}

export function parsePlanGenerationCheckpoint(
  raw: string | null | undefined,
): PlanGenerationCheckpointV1 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PlanGenerationCheckpointV1>;
    if (parsed.version !== PLAN_GENERATION_CHECKPOINT_VERSION) return null;
    if (
      typeof parsed.savedAt !== "string" ||
      typeof parsed.weekStart !== "string" ||
      typeof parsed.preferenceFingerprint !== "string" ||
      typeof parsed.completedStage !== "string" ||
      !Array.isArray(parsed.lunchCandidates) ||
      !Array.isArray(parsed.dinnerCandidates) ||
      !Array.isArray(parsed.lunchRanked) ||
      !Array.isArray(parsed.dinnerRanked)
    ) {
      return null;
    }
    return parsed as PlanGenerationCheckpointV1;
  } catch {
    return null;
  }
}

export function isCheckpointUsable(input: {
  checkpoint: PlanGenerationCheckpointV1 | null;
  preferenceFingerprint: string;
  weekStart: string;
  nowMs?: number;
  ttlMs?: number;
}): PlanGenerationCheckpointV1 | null {
  const cp = input.checkpoint;
  if (!cp) return null;
  if (cp.preferenceFingerprint !== input.preferenceFingerprint) return null;
  if (cp.weekStart !== input.weekStart) return null;
  const now = input.nowMs ?? Date.now();
  const ttl = input.ttlMs ?? PLAN_GENERATION_CHECKPOINT_TTL_MS;
  const saved = Date.parse(cp.savedAt);
  if (!Number.isFinite(saved) || now - saved > ttl) return null;
  return cp;
}

export function checkpointResumeProgressStage(
  completed: PlanGenerationCheckpointStage,
): "finding_meals" | "building_complete_meals" | "creating_week" | "finalizing_recipes" {
  switch (completed) {
    case "ranked":
      return "building_complete_meals";
    case "composed":
      return "creating_week";
    case "strategy":
      return "finalizing_recipes";
    case "recipes_resolved":
      return "finalizing_recipes";
  }
}
