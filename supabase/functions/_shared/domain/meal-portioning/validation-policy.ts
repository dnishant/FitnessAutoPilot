import type { NutritionPlanValidationPolicy } from "./validation-types.ts";

/**
 * Centralized PLAN-011 validation policy.
 * Versioned — do not scatter magic numbers across validators.
 *
 * Aligns with PLAN-010 meal-portion tolerances where compatible:
 * - meal solved calorie band ≈ 8% (meal-portion-policy-v1)
 * - daily preferred ±5%, hard finalizable ±10%
 * - protein asymmetric: preferred ≥95%, hard ≥90% of daily target
 */
export const NUTRITION_PLAN_VALIDATION_POLICY_V1: NutritionPlanValidationPolicy = {
  version: "nutrition-validation-policy-v1",

  calories: {
    /** Preferred daily band vs target (fraction). */
    preferredBandFraction: 0.05,
    /** Maximum band that may still finalize when other hard rules pass. */
    hardBandFraction: 0.1,
    /**
     * When a day is already `best_feasible` (culinary bounds binding), allow up to this
     * deviation as a warning rather than endless repair — PLAN-010 already maximized.
     * Catastrophic outliers beyond this remain repairable/reject.
     */
    bestFeasibleExtendedBandFraction: 0.18,
    /** Weekly preferred / hard bands on sum(daily targets). */
    weeklyPreferredBandFraction: 0.04,
    weeklyHardBandFraction: 0.08,
  },

  protein: {
    /** At or above this fraction of target → preferred pass. */
    preferredMinimumFraction: 0.95,
    /** Below this fraction → repairable/hard depending on repairability. */
    hardMinimumFraction: 0.9,
    /**
     * Upper guardrail vs target — catches solver/data corruption, not ordinary food variation.
     */
    hardMaximumFraction: 1.35,
  },

  carbohydrates: {
    /** Pathological: near-zero carbs on a day with substantial calorie target. */
    pathologicalMinimumFractionOfTarget: 0.15,
    /** Pathological overshoot vs daily carb target. */
    pathologicalMaximumFractionOfTarget: 2.0,
  },

  fat: {
    pathologicalMinimumFractionOfTarget: 0.2,
    pathologicalMaximumFractionOfTarget: 2.0,
  },

  fiber: {
    /**
     * Daily fiber moderately below target (warning / acceptable).
     * Uses existing fiber-policy-v1 target from dailyTarget.fiberGrams.
     */
    moderateLowFraction: 0.75,
    /** Daily fiber severely below target. */
    severeLowFraction: 0.55,
    /**
     * Weekly average fiber below this fraction of weekly target → repairable.
     * Fiber naturally varies by day.
     */
    weeklyAverageMinimumFraction: 0.8,
    /** Count of severe-low days that triggers repairable failure. */
    severeLowDayCountForRepair: 3,
  },

  arithmetic: {
    /** Absolute kcal tolerance when comparing recomputed vs stored meal/day totals. */
    mealCalorieAbsToleranceKcal: 3,
    mealMacroAbsToleranceGrams: 0.8,
    dailyCalorieAbsToleranceKcal: 4,
    dailyMacroAbsToleranceGrams: 1.0,
    /**
     * Macro-derived energy vs labeled calories:
     * protein×4 + carbs×4 + fat×9 vs caloriesKcal.
     * Food DBs differ for fiber/alcohol/rounding — allow generous relative band.
     */
    macroEnergyRelativeTolerance: 0.22,
    macroEnergyAbsToleranceKcal: 40,
  },

  portions: {
    /** Relative tolerance when comparing fixed quantity to declared fixed amount. */
    fixedQuantityRelativeTolerance: 0.02,
    /** Relative tolerance for discrete step alignment. */
    discreteStepRelativeTolerance: 0.02,
  },

  reserved: {
    /** Absolute reconcile gap between target and (planned meals + reserved). */
    reconcileCalorieAbsToleranceKcal: 5,
    reconcileMacroAbsToleranceGrams: 1.5,
  },

  repair: {
    maxFinalizationRepairAttempts: 2,
  },

  /**
   * Authoritative personalized nutrition must come from PLAN-010 portioning,
   * not raw LLM recipe totals. Validated llm_estimate coefficients used as
   * PLAN-010 inputs (ADR-024) are allowed — rejecting "llm as personalized totals".
   */
  authoritativeNutritionSourceVersions: [
    "nutrition-calculation-v1",
    "discrete-staple-estimate-v1",
    "role-structural-estimate-v1",
  ],
};

export function getNutritionPlanValidationPolicy(
  version: string = NUTRITION_PLAN_VALIDATION_POLICY_V1.version,
): NutritionPlanValidationPolicy {
  if (version !== NUTRITION_PLAN_VALIDATION_POLICY_V1.version) {
    throw new Error(`Unknown nutrition plan validation policy version: ${version}`);
  }
  return NUTRITION_PLAN_VALIDATION_POLICY_V1;
}

/** Exported constant name matching the story brief. */
export const NUTRITION_PLAN_VALIDATION_POLICY = NUTRITION_PLAN_VALIDATION_POLICY_V1;

export const MAX_FINALIZATION_REPAIR_ATTEMPTS =
  NUTRITION_PLAN_VALIDATION_POLICY_V1.repair.maxFinalizationRepairAttempts;
