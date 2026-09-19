import type {
  DayOfWeek,
  NutritionBudget,
  PersonalizedMealNutrition,
  ValidationRuleId,
  ValidationRuleResult,
  ValidationRuleSeverity,
} from "../../contracts/index.ts";

/**
 * Internal policy shape for PLAN-011 (domain-owned; contracts hold result types).
 */
export type NutritionPlanValidationPolicy = {
  version: "nutrition-validation-policy-v1";
  calories: {
    preferredBandFraction: number;
    hardBandFraction: number;
    bestFeasibleExtendedBandFraction: number;
    weeklyPreferredBandFraction: number;
    weeklyHardBandFraction: number;
  };
  protein: {
    preferredMinimumFraction: number;
    hardMinimumFraction: number;
    hardMaximumFraction: number;
  };
  carbohydrates: {
    pathologicalMinimumFractionOfTarget: number;
    pathologicalMaximumFractionOfTarget: number;
  };
  fat: {
    pathologicalMinimumFractionOfTarget: number;
    pathologicalMaximumFractionOfTarget: number;
  };
  fiber: {
    moderateLowFraction: number;
    severeLowFraction: number;
    weeklyAverageMinimumFraction: number;
    severeLowDayCountForRepair: number;
  };
  arithmetic: {
    mealCalorieAbsToleranceKcal: number;
    mealMacroAbsToleranceGrams: number;
    dailyCalorieAbsToleranceKcal: number;
    dailyMacroAbsToleranceGrams: number;
    macroEnergyRelativeTolerance: number;
    macroEnergyAbsToleranceKcal: number;
  };
  portions: {
    fixedQuantityRelativeTolerance: number;
    discreteStepRelativeTolerance: number;
  };
  reserved: {
    reconcileCalorieAbsToleranceKcal: number;
    reconcileMacroAbsToleranceGrams: number;
  };
  repair: {
    maxFinalizationRepairAttempts: number;
  };
  authoritativeNutritionSourceVersions: readonly string[];
};

export type ValidateWeeklyNutritionPlanContext = {
  generatedPlanId: string;
  expectedDays?: readonly DayOfWeek[];
  /** Complete meals keyed by candidateId for structural ownership checks. */
  completeMealsByCandidateId?: Record<
    string,
    import("../../contracts/index.ts").CompleteMeal
  >;
  repairAttempts?: number;
  validatedAt?: string;
};

export function ruleResult(input: {
  ruleId: ValidationRuleId;
  severity: ValidationRuleSeverity;
  message: string;
  repairable: boolean;
  day?: DayOfWeek;
  mealInstanceId?: string;
  componentId?: string;
  observed?: number | string;
  expected?: number | string;
}): ValidationRuleResult {
  const out: ValidationRuleResult = {
    ruleId: input.ruleId,
    severity: input.severity,
    message: input.message,
    repairable: input.repairable,
  };
  if (input.day) out.day = input.day;
  if (input.mealInstanceId) out.mealInstanceId = input.mealInstanceId;
  if (input.componentId) out.componentId = input.componentId;
  if (input.observed !== undefined) out.observed = input.observed;
  if (input.expected !== undefined) out.expected = input.expected;
  return out;
}

export function emptyNutrition(): PersonalizedMealNutrition {
  return {
    caloriesKcal: 0,
    proteinGrams: 0,
    carbsGrams: 0,
    fatGrams: 0,
    fiberGrams: 0,
  };
}

export function sumPersonalized(
  parts: readonly (PersonalizedMealNutrition | NutritionBudget | undefined)[],
): PersonalizedMealNutrition {
  let caloriesKcal = 0;
  let proteinGrams = 0;
  let carbsGrams = 0;
  let fatGrams = 0;
  let fiberGrams = 0;
  let hasFiber = false;
  for (const part of parts) {
    if (!part) continue;
    caloriesKcal += part.caloriesKcal;
    proteinGrams += part.proteinGrams;
    const carbs =
      "carbsGrams" in part
        ? (part.carbsGrams ?? 0)
        : ((part as NutritionBudget).carbsGrams ?? 0);
    const fat =
      "fatGrams" in part && typeof (part as PersonalizedMealNutrition).fatGrams === "number"
        ? ((part as PersonalizedMealNutrition).fatGrams ?? 0)
        : ((part as NutritionBudget).fatGrams ?? 0);
    carbsGrams += carbs;
    fatGrams += fat;
    const fiber =
      "fiberGrams" in part ? part.fiberGrams : (part as NutritionBudget).fiberGrams;
    if (fiber != null && Number.isFinite(fiber)) {
      fiberGrams += fiber;
      hasFiber = true;
    }
  }
  const out: PersonalizedMealNutrition = {
    caloriesKcal,
    proteinGrams,
    carbsGrams,
    fatGrams,
  };
  if (hasFiber) out.fiberGrams = fiberGrams;
  return out;
}

export function nutritionClose(
  a: PersonalizedMealNutrition,
  b: PersonalizedMealNutrition,
  calorieTol: number,
  macroTol: number,
): boolean {
  const fiberOk =
    a.fiberGrams == null ||
    b.fiberGrams == null ||
    Math.abs((a.fiberGrams ?? 0) - (b.fiberGrams ?? 0)) <= macroTol;
  return (
    Math.abs(a.caloriesKcal - b.caloriesKcal) <= calorieTol &&
    Math.abs(a.proteinGrams - b.proteinGrams) <= macroTol &&
    Math.abs(a.carbsGrams - b.carbsGrams) <= macroTol &&
    Math.abs(a.fatGrams - b.fatGrams) <= macroTol &&
    fiberOk
  );
}

export function worstSeverity(
  severities: readonly ValidationRuleSeverity[],
): ValidationRuleSeverity {
  if (severities.includes("hard_failure")) return "hard_failure";
  if (severities.includes("repairable_failure")) return "repairable_failure";
  if (severities.includes("warning")) return "warning";
  return "pass";
}

export function roundNutrition(n: PersonalizedMealNutrition): PersonalizedMealNutrition {
  const out: PersonalizedMealNutrition = {
    caloriesKcal: Math.round(n.caloriesKcal),
    proteinGrams: Math.round(n.proteinGrams * 10) / 10,
    carbsGrams: Math.round(n.carbsGrams * 10) / 10,
    fatGrams: Math.round(n.fatGrams * 10) / 10,
  };
  if (n.fiberGrams != null) {
    out.fiberGrams = Math.round(n.fiberGrams * 10) / 10;
  }
  return out;
}
