import type {
  CompleteMeal,
  DayOfWeek,
  NutritionBudget,
  NutritionPlanRepairRequest,
  PersonalizedDailyNutritionPlan,
  PersonalizedMealNutrition,
  PersonalizedMealPlan,
  PersonalizedMealPortion,
  PersonalizedWeeklyNutritionPlan,
  ValidationFailure,
  ValidationRuleResult,
  WeeklyPlanValidationReport,
} from "../../contracts/index.ts";
import { WEEK_DAYS } from "../../contracts/index.ts";
import { isUnresolvedPlaceholderName } from "../meal-composition/placeholders.ts";
import { isEdibleFoodIdentity } from "../meal-composition/edible-identity.ts";
import {
  getNutritionPlanValidationPolicy,
  NUTRITION_PLAN_VALIDATION_POLICY_V1,
} from "./validation-policy.ts";
import {
  emptyNutrition,
  nutritionClose,
  roundNutrition,
  ruleResult,
  sumPersonalized,
  worstSeverity,
  type ValidateWeeklyNutritionPlanContext,
} from "./validation-types.ts";

export type { ValidateWeeklyNutritionPlanContext };

/** Discriminated validation result (repo-adapted names from the story brief). */
export type WeeklyNutritionPlanValidationOutcome =
  | {
      status: "finalized";
      finalizedPlan: PersonalizedWeeklyNutritionPlan;
      report: WeeklyPlanValidationReport;
    }
  | {
      status: "repair_required";
      repairRequest: NutritionPlanRepairRequest;
      report: WeeklyPlanValidationReport;
    }
  | {
      status: "rejected";
      reasons: ValidationFailure[];
      report: WeeklyPlanValidationReport;
    };

// Re-export alias matching conceptual API.
export type WeeklyPlanValidationResultAlias = WeeklyNutritionPlanValidationOutcome;

function mealPortionsNutrition(
  portions: readonly PersonalizedMealPortion[],
): PersonalizedMealNutrition {
  return sumPersonalized(
    portions.map((p) => ({
      caloriesKcal: p.nutrition.caloriesKcal,
      proteinGrams: p.nutrition.proteinGrams,
      carbsGrams: p.nutrition.carbohydrateGrams,
      fatGrams: p.nutrition.fatGrams,
      fiberGrams: p.nutrition.fiberGrams,
    })),
  );
}

function macroEnergyKcal(n: PersonalizedMealNutrition): number {
  return n.proteinGrams * 4 + n.carbsGrams * 4 + n.fatGrams * 9;
}

function isFiniteNonNegative(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

function budgetNonNegative(budget: NutritionBudget): boolean {
  return (
    isFiniteNonNegative(budget.caloriesKcal) &&
    isFiniteNonNegative(budget.proteinGrams) &&
    (budget.carbsGrams == null || isFiniteNonNegative(budget.carbsGrams)) &&
    (budget.fatGrams == null || isFiniteNonNegative(budget.fatGrams)) &&
    (budget.fiberGrams == null || isFiniteNonNegative(budget.fiberGrams))
  );
}

function validatePortions(
  plan: PersonalizedMealPlan,
  mealInstanceId: string,
  day: DayOfWeek,
  rules: ValidationRuleResult[],
): void {
  const policy = getNutritionPlanValidationPolicy();

  for (const portion of plan.portions) {
    const amount = portion.amount;
    if (!Number.isFinite(amount) || Number.isNaN(amount)) {
      rules.push(
        ruleResult({
          ruleId: "PORTION_INVALID_NUMBER",
          severity: "hard_failure",
          message: `Portion for "${portion.displayName}" is not a finite number.`,
          repairable: false,
          day,
          mealInstanceId,
          componentId: portion.componentId,
          observed: String(amount),
        }),
      );
      continue;
    }
    if (amount === Number.POSITIVE_INFINITY || amount === Number.NEGATIVE_INFINITY) {
      rules.push(
        ruleResult({
          ruleId: "PORTION_INVALID_NUMBER",
          severity: "hard_failure",
          message: `Portion for "${portion.displayName}" is infinite.`,
          repairable: false,
          day,
          mealInstanceId,
          componentId: portion.componentId,
        }),
      );
      continue;
    }
    if (amount <= 0) {
      rules.push(
        ruleResult({
          ruleId: "PORTION_ZERO_REQUIRED",
          severity: "hard_failure",
          message: `Required portion for "${portion.displayName}" is not positive.`,
          repairable: false,
          day,
          mealInstanceId,
          componentId: portion.componentId,
          observed: amount,
        }),
      );
    }

    const diagnostic = plan.diagnostics.variables.find(
      (v) => v.componentId === portion.componentId,
    );
    if (!diagnostic) continue;

    // Compare solver-selected quantity to hard bounds in the SAME unit as diagnostics
    // (scale / grams / count) — not display grams vs scale bounds.
    const selected = diagnostic.selected;
    if (!Number.isFinite(selected) || Number.isNaN(selected)) {
      rules.push(
        ruleResult({
          ruleId: "PORTION_INVALID_NUMBER",
          severity: "hard_failure",
          message: `Solver-selected quantity for "${portion.displayName}" is not finite.`,
          repairable: false,
          day,
          mealInstanceId,
          componentId: portion.componentId,
          observed: String(selected),
        }),
      );
      continue;
    }

    if (selected < diagnostic.min - 1e-9 || selected > diagnostic.max + 1e-9) {
      rules.push(
        ruleResult({
          ruleId: "PORTION_HARD_BOUND_VIOLATION",
          severity: "hard_failure",
          message: `Portion for "${portion.displayName}" violates hard bounds [${diagnostic.min}, ${diagnostic.max}] ${diagnostic.unit}.`,
          repairable: true,
          day,
          mealInstanceId,
          componentId: portion.componentId,
          observed: selected,
          expected: `${diagnostic.min}–${diagnostic.max} ${diagnostic.unit}`,
        }),
      );
    } else {
      const preferredSpan = Math.abs(diagnostic.max - diagnostic.min);
      if (
        preferredSpan > 0 &&
        Math.abs(selected - diagnostic.preferred) > preferredSpan * 0.95
      ) {
        rules.push(
          ruleResult({
            ruleId: "PORTION_PREFERRED_RANGE_DEVIATION",
            severity: "warning",
            message: `Portion for "${portion.displayName}" is far from preferred culinary center.`,
            repairable: false,
            day,
            mealInstanceId,
            componentId: portion.componentId,
            observed: selected,
            expected: diagnostic.preferred,
          }),
        );
      }
    }

    if (diagnostic.kind === "count") {
      const step = 1;
      const nearest = Math.round(selected / step) * step;
      const tol = Math.max(step * policy.portions.discreteStepRelativeTolerance, 1e-6);
      if (Math.abs(selected - nearest) > tol) {
        rules.push(
          ruleResult({
            ruleId: "PORTION_DISCRETE_STEP_VIOLATION",
            severity: "hard_failure",
            message: `Discrete portion for "${portion.displayName}" is not aligned to step ${step}.`,
            repairable: true,
            day,
            mealInstanceId,
            componentId: portion.componentId,
            observed: selected,
            expected: nearest,
          }),
        );
      }
    }

    if (diagnostic.kind === "fixed") {
      const tol = Math.max(
        Math.abs(diagnostic.preferred) * policy.portions.fixedQuantityRelativeTolerance,
        1e-6,
      );
      if (Math.abs(selected - diagnostic.preferred) > tol) {
        rules.push(
          ruleResult({
            ruleId: "PORTION_FIXED_QUANTITY_MISMATCH",
            severity: "hard_failure",
            message: `Fixed portion for "${portion.displayName}" does not match declared fixed quantity.`,
            repairable: false,
            day,
            mealInstanceId,
            componentId: portion.componentId,
            observed: selected,
            expected: diagnostic.preferred,
          }),
        );
      }
    }
  }
}

function validateCanonicalMealStructure(
  completeMeal: CompleteMeal | undefined,
  mealPlan: PersonalizedMealPlan | undefined,
  mealInstanceId: string,
  day: DayOfWeek,
  rules: ValidationRuleResult[],
): void {
  if (!completeMeal) {
    rules.push(
      ruleResult({
        ruleId: "STRUCTURE_CANONICAL_MEAL_MISSING",
        severity: "hard_failure",
        message: `No canonical CompleteMeal for meal instance ${mealInstanceId}.`,
        repairable: false,
        day,
        mealInstanceId,
      }),
    );
    return;
  }

  if (!mealPlan || mealPlan.status === "blocked") return;

  const owners = completeMeal.components.filter((c) => {
    if ((c.nutritionOwnership ?? "independent") === "parent_owned") return false;
    if (isUnresolvedPlaceholderName(c.name)) {
      rules.push(
        ruleResult({
          ruleId: "STRUCTURE_CULINARY_NEED_AS_FOOD",
          severity: "hard_failure",
          message: `Unresolved culinary need "${c.name}" reached personalized meal.`,
          repairable: false,
          day,
          mealInstanceId,
          componentId: c.componentId,
        }),
      );
      return false;
    }
    if (!isEdibleFoodIdentity(c.name)) {
      rules.push(
        ruleResult({
          ruleId: "STRUCTURE_CULINARY_NEED_AS_FOOD",
          severity: "hard_failure",
          message: `Non-edible / culinary-need identity "${c.name}" owns nutrition on personalized meal.`,
          repairable: false,
          day,
          mealInstanceId,
          componentId: c.componentId,
        }),
      );
      return false;
    }
    return true;
  });

  const portionIds = new Set(mealPlan.portions.map((p) => p.componentId));
  const seenOwners = new Set<string>();

  for (const owner of owners) {
    if (seenOwners.has(owner.componentId)) {
      rules.push(
        ruleResult({
          ruleId: "STRUCTURE_DUPLICATE_NUTRITION_OWNER",
          severity: "hard_failure",
          message: `Duplicate nutritional owner "${owner.name}" on canonical meal.`,
          repairable: false,
          day,
          mealInstanceId,
          componentId: owner.componentId,
        }),
      );
    }
    seenOwners.add(owner.componentId);

    if (
      (owner.relationship === "required_companion" ||
        owner.relationship === "intrinsic" ||
        owner.relationship === "recommended" ||
        owner.role === "main") &&
      !portionIds.has(owner.componentId)
    ) {
      rules.push(
        ruleResult({
          ruleId: "STRUCTURE_COMPONENT_OWNER_MISSING",
          severity: "hard_failure",
          message: `Selected edible "${owner.name}" has no personalized portion / nutrition owner.`,
          repairable: false,
          day,
          mealInstanceId,
          componentId: owner.componentId,
        }),
      );
    }
  }

  // Recommended companions without portions are skipped by PLAN-010 by design.

  // Parent-owned components must not appear as independent portion owners.
  for (const portion of mealPlan.portions) {
    const component = completeMeal.components.find((c) => c.componentId === portion.componentId);
    if (component && (component.nutritionOwnership ?? "independent") === "parent_owned") {
      rules.push(
        ruleResult({
          ruleId: "STRUCTURE_PARENT_CHILD_DOUBLE_COUNT",
          severity: "hard_failure",
          message: `Parent-owned component "${portion.displayName}" contributes independent personalized nutrition.`,
          repairable: false,
          day,
          mealInstanceId,
          componentId: portion.componentId,
        }),
      );
    }
  }

  // Duplicate portion owners
  const portionOwnerCounts = new Map<string, number>();
  for (const portion of mealPlan.portions) {
    portionOwnerCounts.set(
      portion.componentId,
      (portionOwnerCounts.get(portion.componentId) ?? 0) + 1,
    );
  }
  for (const [componentId, count] of portionOwnerCounts) {
    if (count > 1) {
      rules.push(
        ruleResult({
          ruleId: "STRUCTURE_DUPLICATE_NUTRITION_OWNER",
          severity: "hard_failure",
          message: `Duplicate personalized nutrition owner ${componentId}.`,
          repairable: false,
          day,
          mealInstanceId,
          componentId,
        }),
      );
    }
  }
}

function validateMealProvenanceAndArithmetic(
  mealPlan: PersonalizedMealPlan,
  mealInstanceId: string,
  day: DayOfWeek,
  rules: ValidationRuleResult[],
): PersonalizedMealNutrition {
  const policy = getNutritionPlanValidationPolicy();

  const source = mealPlan.nutritionSourceVersion;
  if (
    source &&
    (source === "llm_estimate" ||
      source === "generated-recipe-nutrition-v1" ||
      /llm/i.test(source))
  ) {
    rules.push(
      ruleResult({
        ruleId: "NUTRITION_LLM_SOURCE_NOT_AUTHORITATIVE",
        severity: "hard_failure",
        message: `Meal ${mealInstanceId} uses non-authoritative nutrition source "${source}" as personalized totals.`,
        repairable: false,
        day,
        mealInstanceId,
        observed: source,
      }),
    );
  }

  // Missing authority: personalized plan without portions
  if (!mealPlan.portions.length) {
    rules.push(
      ruleResult({
        ruleId: "NUTRITION_AUTHORITY_MISSING",
        severity: "hard_failure",
        message: `Meal ${mealInstanceId} has no personalized portions.`,
        repairable: false,
        day,
        mealInstanceId,
      }),
    );
    return emptyNutrition();
  }

  const recomputed = roundNutrition(mealPortionsNutrition(mealPlan.portions));
  const stored = mealPlan.nutrition;
  if (
    !nutritionClose(
      recomputed,
      stored,
      policy.arithmetic.mealCalorieAbsToleranceKcal,
      policy.arithmetic.mealMacroAbsToleranceGrams,
    )
  ) {
    rules.push(
      ruleResult({
        ruleId: "NUTRITION_MEAL_TOTAL_MISMATCH",
        severity: "hard_failure",
        message: `Stored meal nutrition does not match sum of personalized nutritional owners for ${mealInstanceId}.`,
        repairable: false,
        day,
        mealInstanceId,
        observed: stored.caloriesKcal,
        expected: recomputed.caloriesKcal,
      }),
    );
  }

  const derived = macroEnergyKcal(stored);
  const energyTol = Math.max(
    policy.arithmetic.macroEnergyAbsToleranceKcal,
    stored.caloriesKcal * policy.arithmetic.macroEnergyRelativeTolerance,
  );
  if (Math.abs(derived - stored.caloriesKcal) > energyTol) {
    rules.push(
      ruleResult({
        ruleId: "NUTRITION_MACRO_ENERGY_MISMATCH",
        severity: "hard_failure",
        message: `Macro-derived energy disagrees with labeled calories for ${mealInstanceId}.`,
        repairable: false,
        day,
        mealInstanceId,
        observed: stored.caloriesKcal,
        expected: Math.round(derived),
      }),
    );
  }

  return recomputed;
}

function validateReservedAndDay(
  dayPlan: PersonalizedDailyNutritionPlan,
  recomputedMeals: PersonalizedMealNutrition,
  rules: ValidationRuleResult[],
): {
  recomputedTotal: PersonalizedMealNutrition;
  deviations: {
    calorieDeltaKcal: number;
    calorieDeltaPct: number;
    proteinDeltaGrams: number;
    proteinDeltaPct: number;
    carbsDeltaGrams?: number;
    fatDeltaGrams?: number;
    fiberDeltaGrams?: number;
  };
} {
  const policy = getNutritionPlanValidationPolicy();
  const day = dayPlan.day;
  const target = dayPlan.budget.target;
  const reserved = dayPlan.reservedNutrition;

  if (!budgetNonNegative(reserved)) {
    rules.push(
      ruleResult({
        ruleId: "RESERVED_NUTRITION_NEGATIVE",
        severity: "hard_failure",
        message: `Reserved breakfast/snack nutrition has negative values on ${day}.`,
        repairable: false,
        day,
      }),
    );
  }

  if (reserved.caloriesKcal > target.caloriesKcal + 1e-6) {
    rules.push(
      ruleResult({
        ruleId: "RESERVED_NUTRITION_EXCEEDS_TARGET",
        severity: "hard_failure",
        message: `Reserved nutrition exceeds entire daily calorie target on ${day}.`,
        repairable: false,
        day,
        observed: reserved.caloriesKcal,
        expected: target.caloriesKcal,
      }),
    );
  }

  const recomputedTotal = roundNutrition(
    sumPersonalized([recomputedMeals, reserved]),
  );

  // Stored projected vs recomputed
  if (dayPlan.projectedDailyNutrition) {
    if (
      !nutritionClose(
        recomputedTotal,
        dayPlan.projectedDailyNutrition,
        policy.arithmetic.dailyCalorieAbsToleranceKcal,
        policy.arithmetic.dailyMacroAbsToleranceGrams,
      )
    ) {
      rules.push(
        ruleResult({
          ruleId: "NUTRITION_DAILY_TOTAL_MISMATCH",
          severity: "hard_failure",
          message: `Stored daily projected nutrition disagrees with meals + reserved on ${day}.`,
          repairable: false,
          day,
          observed: dayPlan.projectedDailyNutrition.caloriesKcal,
          expected: recomputedTotal.caloriesKcal,
        }),
      );
    }
  }

  // Target vs (meals + reserved) reconcile — reserved is budget, not consumed food.
  const targetAsMeal: PersonalizedMealNutrition = {
    caloriesKcal: target.caloriesKcal,
    proteinGrams: target.proteinGrams,
    carbsGrams: target.carbsGrams ?? 0,
    fatGrams: target.fatGrams ?? 0,
    fiberGrams: target.fiberGrams,
  };
  // Gap between target and projected is expected within band — checked as calorie adherence.
  // Hidden disappearance: planned meals + reserved should equal projected (already checked).
  // Also ensure plannedNutrition + reserved ≈ projected when plannedNutrition present.
  if (dayPlan.plannedNutrition) {
    const fromPlanned = roundNutrition(
      sumPersonalized([dayPlan.plannedNutrition, reserved]),
    );
    if (
      dayPlan.projectedDailyNutrition &&
      !nutritionClose(
        fromPlanned,
        dayPlan.projectedDailyNutrition,
        policy.reserved.reconcileCalorieAbsToleranceKcal,
        policy.reserved.reconcileMacroAbsToleranceGrams,
      )
    ) {
      rules.push(
        ruleResult({
          ruleId: "RESERVED_NUTRITION_RECONCILE_GAP",
          severity: "hard_failure",
          message: `Planned lunch/dinner + reserved does not reconcile to daily projected on ${day}.`,
          repairable: false,
          day,
          observed: dayPlan.projectedDailyNutrition.caloriesKcal,
          expected: fromPlanned.caloriesKcal,
        }),
      );
    }
  }

  const calorieDeltaKcal = recomputedTotal.caloriesKcal - target.caloriesKcal;
  const calorieDeltaPct =
    target.caloriesKcal > 0 ? calorieDeltaKcal / target.caloriesKcal : 0;
  const proteinDeltaGrams = recomputedTotal.proteinGrams - target.proteinGrams;
  const proteinDeltaPct =
    target.proteinGrams > 0 ? proteinDeltaGrams / target.proteinGrams : 0;

  const absCalPct = Math.abs(calorieDeltaPct);
  if (absCalPct > policy.calories.hardBandFraction) {
    const dayBestFeasible = dayPlan.status === "best_feasible";
    if (
      dayBestFeasible &&
      absCalPct <= policy.calories.bestFeasibleExtendedBandFraction
    ) {
      rules.push(
        ruleResult({
          ruleId: "TARGET_DAILY_CALORIES_OUTSIDE_HARD",
          severity: "warning",
          message: `Daily calories on ${day} exceed preferred hard band but day is best_feasible within culinary bounds (±${policy.calories.bestFeasibleExtendedBandFraction * 100}%).`,
          repairable: false,
          day,
          observed: recomputedTotal.caloriesKcal,
          expected: target.caloriesKcal,
        }),
      );
    } else {
      rules.push(
        ruleResult({
          ruleId: "TARGET_DAILY_CALORIES_OUTSIDE_HARD",
          severity: "repairable_failure",
          message: `Daily calories on ${day} are outside hard finalizable band (±${policy.calories.hardBandFraction * 100}%).`,
          repairable: true,
          day,
          observed: recomputedTotal.caloriesKcal,
          expected: target.caloriesKcal,
        }),
      );
    }
  } else if (absCalPct > policy.calories.preferredBandFraction) {
    rules.push(
      ruleResult({
        ruleId: "TARGET_DAILY_CALORIES_OUTSIDE_PREFERRED",
        severity: "warning",
        message: `Daily calories on ${day} are outside preferred band (±${policy.calories.preferredBandFraction * 100}%) but within hard tolerance.`,
        repairable: false,
        day,
        observed: recomputedTotal.caloriesKcal,
        expected: target.caloriesKcal,
      }),
    );
  }

  const proteinRatio =
    target.proteinGrams > 0
      ? recomputedTotal.proteinGrams / target.proteinGrams
      : 1;
  if (proteinRatio < policy.protein.hardMinimumFraction) {
    rules.push(
      ruleResult({
        ruleId: "TARGET_DAILY_PROTEIN_LOW_HARD",
        severity: "repairable_failure",
        message: `Daily protein on ${day} is below hard minimum (${policy.protein.hardMinimumFraction * 100}% of target).`,
        repairable: true,
        day,
        observed: recomputedTotal.proteinGrams,
        expected: target.proteinGrams,
      }),
    );
  } else if (proteinRatio < policy.protein.preferredMinimumFraction) {
    rules.push(
      ruleResult({
        ruleId: "TARGET_DAILY_PROTEIN_LOW_PREFERRED",
        severity: "warning",
        message: `Daily protein on ${day} is below preferred minimum (${policy.protein.preferredMinimumFraction * 100}% of target).`,
        repairable: false,
        day,
        observed: recomputedTotal.proteinGrams,
        expected: target.proteinGrams,
      }),
    );
  } else if (proteinRatio > policy.protein.hardMaximumFraction) {
    rules.push(
      ruleResult({
        ruleId: "TARGET_DAILY_PROTEIN_HIGH_GUARDRAIL",
        severity: "repairable_failure",
        message: `Daily protein on ${day} exceeds corruption guardrail (${policy.protein.hardMaximumFraction * 100}% of target).`,
        repairable: true,
        day,
        observed: recomputedTotal.proteinGrams,
        expected: target.proteinGrams,
      }),
    );
  }

  // Carbs / fat pathological checks vs daily targets when targets exist.
  if (target.carbsGrams != null && target.carbsGrams > 0) {
    const ratio = recomputedTotal.carbsGrams / target.carbsGrams;
    if (
      ratio < policy.carbohydrates.pathologicalMinimumFractionOfTarget ||
      ratio > policy.carbohydrates.pathologicalMaximumFractionOfTarget
    ) {
      rules.push(
        ruleResult({
          ruleId: "TARGET_DAILY_CARBS_PATHOLOGICAL",
          severity: "repairable_failure",
          message: `Daily carbohydrates on ${day} are pathologically far from target.`,
          repairable: true,
          day,
          observed: recomputedTotal.carbsGrams,
          expected: target.carbsGrams,
        }),
      );
    }
  }

  if (target.fatGrams != null && target.fatGrams > 0) {
    const ratio = recomputedTotal.fatGrams / target.fatGrams;
    if (
      ratio < policy.fat.pathologicalMinimumFractionOfTarget ||
      ratio > policy.fat.pathologicalMaximumFractionOfTarget
    ) {
      rules.push(
        ruleResult({
          ruleId: "TARGET_DAILY_FAT_PATHOLOGICAL",
          severity: "repairable_failure",
          message: `Daily fat on ${day} is pathologically far from target.`,
          repairable: true,
          day,
          observed: recomputedTotal.fatGrams,
          expected: target.fatGrams,
        }),
      );
    }
  }

  if (target.fiberGrams != null && target.fiberGrams > 0) {
    const fiber = recomputedTotal.fiberGrams ?? 0;
    const ratio = fiber / target.fiberGrams;
    if (ratio < policy.fiber.severeLowFraction) {
      rules.push(
        ruleResult({
          ruleId: "TARGET_DAILY_FIBER_SEVERE_LOW",
          severity: "warning", // day-level severe is warning; weekly / multi-day escalates
          message: `Daily fiber on ${day} is severely below target.`,
          repairable: false,
          day,
          observed: fiber,
          expected: target.fiberGrams,
        }),
      );
    } else if (ratio < policy.fiber.moderateLowFraction) {
      rules.push(
        ruleResult({
          ruleId: "TARGET_DAILY_FIBER_MODERATE_LOW",
          severity: "warning",
          message: `Daily fiber on ${day} is moderately below target.`,
          repairable: false,
          day,
          observed: fiber,
          expected: target.fiberGrams,
        }),
      );
    }
  }

  void targetAsMeal;

  const deviations: {
    calorieDeltaKcal: number;
    calorieDeltaPct: number;
    proteinDeltaGrams: number;
    proteinDeltaPct: number;
    carbsDeltaGrams?: number;
    fatDeltaGrams?: number;
    fiberDeltaGrams?: number;
  } = {
    calorieDeltaKcal,
    calorieDeltaPct,
    proteinDeltaGrams,
    proteinDeltaPct,
  };
  if (target.carbsGrams != null) {
    deviations.carbsDeltaGrams = recomputedTotal.carbsGrams - target.carbsGrams;
  }
  if (target.fatGrams != null) {
    deviations.fatDeltaGrams = recomputedTotal.fatGrams - (target.fatGrams ?? 0);
  }
  if (target.fiberGrams != null) {
    deviations.fiberDeltaGrams =
      (recomputedTotal.fiberGrams ?? 0) - target.fiberGrams;
  }

  return { recomputedTotal, deviations };
}

/**
 * Deterministic PLAN-011 validation of a PLAN-010 personalized weekly prescription.
 * No network calls. Does not mutate portions.
 */
export function validateWeeklyNutritionPlan(input: {
  personalizedWeeklyPlan: PersonalizedWeeklyNutritionPlan;
  generationContext?: ValidateWeeklyNutritionPlanContext;
}): WeeklyNutritionPlanValidationOutcome {
  const policy = getNutritionPlanValidationPolicy();
  const plan = input.personalizedWeeklyPlan;
  const ctx = input.generationContext ?? { generatedPlanId: plan.generatedPlanId };
  const validatedAt = ctx.validatedAt ?? new Date().toISOString();
  const repairAttempts = ctx.repairAttempts ?? 0;
  const expectedDays = ctx.expectedDays ?? WEEK_DAYS;
  const completeMeals = ctx.completeMealsByCandidateId ?? {};

  const structuralRules: ValidationRuleResult[] = [];
  const daySummaries: WeeklyPlanValidationReport["days"] = [];
  const allRules: ValidationRuleResult[] = [];

  // --- Weekly structural consistency ---
  const seenInstanceIds = new Set<string>();
  const daysPresent = new Set(plan.days.map((d) => d.day));

  for (const day of expectedDays) {
    if (!daysPresent.has(day)) {
      structuralRules.push(
        ruleResult({
          ruleId: "STRUCTURE_WEEK_INCOMPLETE",
          severity: "hard_failure",
          message: `Expected day ${day} is missing from the personalized weekly plan.`,
          repairable: false,
          day,
        }),
      );
    }
  }

  if (plan.generatedPlanId !== ctx.generatedPlanId) {
    structuralRules.push(
      ruleResult({
        ruleId: "STRUCTURE_STALE_PLAN_LINKAGE",
        severity: "hard_failure",
        message: `Personalized plan generatedPlanId does not match generation context.`,
        repairable: false,
        observed: plan.generatedPlanId,
        expected: ctx.generatedPlanId,
      }),
    );
  }

  // Blocked week / blocked meals cannot finalize
  if (plan.status === "blocked" || plan.blockedMealCount > 0) {
    structuralRules.push(
      ruleResult({
        ruleId: "STRUCTURE_PERSONALIZATION_STATUS_BLOCKED",
        severity: "hard_failure",
        message: `Weekly plan has blocked meal personalization and cannot finalize.`,
        repairable: false,
        observed: plan.blockedMealCount,
      }),
    );
  }

  let weeklyRecomputed = emptyNutrition();
  let weeklyTargetCalories = 0;
  let weeklyTargetProtein = 0;
  let weeklyTargetFiber = 0;
  let weeklyActualFiber = 0;
  let fiberDays = 0;
  let severeFiberDays = 0;

  for (const dayPlan of plan.days) {
    const dayRules: ValidationRuleResult[] = [];
    const mealNutritions: PersonalizedMealNutrition[] = [];

    if (dayPlan.meals.length < 2) {
      dayRules.push(
        ruleResult({
          ruleId: "STRUCTURE_WEEK_INCOMPLETE",
          severity: "hard_failure",
          message: `Day ${dayPlan.day} is missing expected lunch/dinner meal slots.`,
          repairable: false,
          day: dayPlan.day,
        }),
      );
    }

    for (const meal of dayPlan.meals) {
      if (seenInstanceIds.has(meal.mealInstanceId)) {
        dayRules.push(
          ruleResult({
            ruleId: "STRUCTURE_DUPLICATE_MEAL_INSTANCE",
            severity: "hard_failure",
            message: `Duplicate mealInstanceId ${meal.mealInstanceId}.`,
            repairable: false,
            day: dayPlan.day,
            mealInstanceId: meal.mealInstanceId,
          }),
        );
      }
      seenInstanceIds.add(meal.mealInstanceId);

      const expectedId = `${plan.generatedPlanId}:${dayPlan.day}:${meal.mealType}`;
      if (meal.mealInstanceId !== expectedId) {
        dayRules.push(
          ruleResult({
            ruleId: "STRUCTURE_MEAL_INSTANCE_MISMATCH",
            severity: "hard_failure",
            message: `Meal instance id does not match plan/day/slot lineage.`,
            repairable: false,
            day: dayPlan.day,
            mealInstanceId: meal.mealInstanceId,
            expected: expectedId,
          }),
        );
      }

      if (meal.day !== dayPlan.day) {
        dayRules.push(
          ruleResult({
            ruleId: "STRUCTURE_ORPHAN_PERSONALIZED_MEAL",
            severity: "hard_failure",
            message: `Meal instance day does not match parent day plan.`,
            repairable: false,
            day: dayPlan.day,
            mealInstanceId: meal.mealInstanceId,
          }),
        );
      }

      if (meal.status === "blocked") {
        dayRules.push(
          ruleResult({
            ruleId: "STRUCTURE_MEAL_NOT_EXECUTABLE",
            severity: "hard_failure",
            message: `Meal ${meal.mealInstanceId} is blocked and not finalizable.`,
            repairable: false,
            day: dayPlan.day,
            mealInstanceId: meal.mealInstanceId,
          }),
        );
        continue;
      }

      if (!meal.personalizedPlan) {
        dayRules.push(
          ruleResult({
            ruleId: "STRUCTURE_PERSONALIZATION_MISSING",
            severity: "hard_failure",
            message: `Meal ${meal.mealInstanceId} is missing personalized plan.`,
            repairable: false,
            day: dayPlan.day,
            mealInstanceId: meal.mealInstanceId,
          }),
        );
        continue;
      }

      // Stale linkage: personalized meal id must belong to this plan
      if (!meal.personalizedPlan.mealId.startsWith(plan.generatedPlanId)) {
        dayRules.push(
          ruleResult({
            ruleId: "STRUCTURE_STALE_PLAN_LINKAGE",
            severity: "hard_failure",
            message: `Personalized meal references a different plan version.`,
            repairable: false,
            day: dayPlan.day,
            mealInstanceId: meal.mealInstanceId,
            observed: meal.personalizedPlan.mealId,
            expected: plan.generatedPlanId,
          }),
        );
      }

      const mealsProvided =
        Object.keys(completeMeals).length > 0;
      const completeMeal = mealsProvided
        ? (meal.candidateId ? completeMeals[meal.candidateId] : undefined) ??
          (meal.completeMealId
            ? Object.values(completeMeals).find((m) => m.mealId === meal.completeMealId)
            : undefined)
        : undefined;

      if (mealsProvided) {
        validateCanonicalMealStructure(
          completeMeal,
          meal.personalizedPlan,
          meal.mealInstanceId,
          dayPlan.day,
          dayRules,
        );
      }
      validatePortions(
        meal.personalizedPlan,
        meal.mealInstanceId,
        dayPlan.day,
        dayRules,
      );
      const recomputedMeal = validateMealProvenanceAndArithmetic(
        meal.personalizedPlan,
        meal.mealInstanceId,
        dayPlan.day,
        dayRules,
      );
      mealNutritions.push(recomputedMeal);
    }

    const recomputedMeals = roundNutrition(sumPersonalized(mealNutritions));
    const { recomputedTotal, deviations } = validateReservedAndDay(
      dayPlan,
      recomputedMeals,
      dayRules,
    );

    weeklyRecomputed = sumPersonalized([weeklyRecomputed, recomputedTotal]);
    weeklyTargetCalories += dayPlan.budget.target.caloriesKcal;
    weeklyTargetProtein += dayPlan.budget.target.proteinGrams;
    if (dayPlan.budget.target.fiberGrams != null) {
      weeklyTargetFiber += dayPlan.budget.target.fiberGrams;
      weeklyActualFiber += recomputedTotal.fiberGrams ?? 0;
      fiberDays += 1;
      if (
        dayPlan.budget.target.fiberGrams > 0 &&
        (recomputedTotal.fiberGrams ?? 0) / dayPlan.budget.target.fiberGrams <
          policy.fiber.severeLowFraction
      ) {
        severeFiberDays += 1;
      }
    }

    allRules.push(...dayRules);
    daySummaries.push({
      day: dayPlan.day,
      target: dayPlan.budget.target,
      plannedMeals: dayPlan.plannedNutrition,
      reservedNutrition: dayPlan.reservedNutrition,
      total: dayPlan.projectedDailyNutrition,
      recomputedTotal,
      deviations,
      rules: dayRules,
    });
  }

  const weeklyRules: ValidationRuleResult[] = [];
  weeklyRecomputed = roundNutrition(weeklyRecomputed);
  const weeklyCalorieDelta = weeklyRecomputed.caloriesKcal - weeklyTargetCalories;
  const weeklyCalorieDeltaPct =
    weeklyTargetCalories > 0 ? weeklyCalorieDelta / weeklyTargetCalories : 0;
  const weeklyProteinDelta = weeklyRecomputed.proteinGrams - weeklyTargetProtein;
  const weeklyProteinDeltaPct =
    weeklyTargetProtein > 0 ? weeklyProteinDelta / weeklyTargetProtein : 0;

  const absWeeklyCal = Math.abs(weeklyCalorieDeltaPct);
  const allDaysBestFeasible = plan.days.every((d) => d.status === "best_feasible");
  if (absWeeklyCal > policy.calories.weeklyHardBandFraction) {
    if (
      allDaysBestFeasible &&
      absWeeklyCal <= policy.calories.bestFeasibleExtendedBandFraction
    ) {
      weeklyRules.push(
        ruleResult({
          ruleId: "TARGET_WEEKLY_CALORIES_OUTSIDE_HARD",
          severity: "warning",
          message: `Weekly calories exceed hard band but all days are best_feasible within culinary constraints.`,
          repairable: false,
          observed: weeklyRecomputed.caloriesKcal,
          expected: weeklyTargetCalories,
        }),
      );
    } else {
      weeklyRules.push(
        ruleResult({
          ruleId: "TARGET_WEEKLY_CALORIES_OUTSIDE_HARD",
          severity: "repairable_failure",
          message: `Weekly calories are outside hard band (±${policy.calories.weeklyHardBandFraction * 100}%).`,
          repairable: true,
          observed: weeklyRecomputed.caloriesKcal,
          expected: weeklyTargetCalories,
        }),
      );
    }
  } else if (absWeeklyCal > policy.calories.weeklyPreferredBandFraction) {
    weeklyRules.push(
      ruleResult({
        ruleId: "TARGET_WEEKLY_CALORIES_OUTSIDE_PREFERRED",
        severity: "warning",
        message: `Weekly calories are outside preferred band but within hard tolerance.`,
        repairable: false,
        observed: weeklyRecomputed.caloriesKcal,
        expected: weeklyTargetCalories,
      }),
    );
  }

  if (
    weeklyTargetProtein > 0 &&
    weeklyRecomputed.proteinGrams / weeklyTargetProtein < policy.protein.hardMinimumFraction
  ) {
    weeklyRules.push(
      ruleResult({
        ruleId: "TARGET_WEEKLY_PROTEIN_LOW",
        severity: "repairable_failure",
        message: `Weekly protein is below hard minimum fraction of target.`,
        repairable: true,
        observed: weeklyRecomputed.proteinGrams,
        expected: weeklyTargetProtein,
      }),
    );
  }

  if (fiberDays > 0 && weeklyTargetFiber > 0) {
    const weeklyAvgRatio = weeklyActualFiber / weeklyTargetFiber;
    if (
      weeklyAvgRatio < policy.fiber.weeklyAverageMinimumFraction ||
      severeFiberDays >= policy.fiber.severeLowDayCountForRepair
    ) {
      // Fiber cannot be repaired by portion rebalance alone (would need different foods).
      // Surface as warning until breakfast/snack planning or meal replacement exists.
      weeklyRules.push(
        ruleResult({
          ruleId: "TARGET_WEEKLY_FIBER_LOW",
          severity: "warning",
          message: `Weekly fiber average is below preferred adequacy (${policy.fiber.weeklyAverageMinimumFraction * 100}% of target).`,
          repairable: false,
          observed: Math.round((weeklyActualFiber / fiberDays) * 10) / 10,
          expected: Math.round((weeklyTargetFiber / fiberDays) * 10) / 10,
        }),
      );
    }
  }

  allRules.push(...structuralRules, ...weeklyRules);

  const hardFailures = allRules.filter((r) => r.severity === "hard_failure");
  const repairableFailures = allRules.filter((r) => r.severity === "repairable_failure");
  const warnings = allRules.filter((r) => r.severity === "warning");
  const overallSeverity = worstSeverity(allRules.map((r) => r.severity));

  const weeklyTarget: NutritionBudget = {
    caloriesKcal: weeklyTargetCalories,
    proteinGrams: weeklyTargetProtein,
    fiberGrams: fiberDays > 0 ? weeklyTargetFiber : undefined,
  };

  let status: WeeklyPlanValidationReport["status"] = "finalized";
  if (hardFailures.length > 0) status = "rejected";
  else if (repairableFailures.length > 0) status = "repair_required";

  const report: WeeklyPlanValidationReport = {
    policyVersion: NUTRITION_PLAN_VALIDATION_POLICY_V1.version,
    status,
    validatedAt,
    overallSeverity,
    days: daySummaries,
    weekly: {
      target: weeklyTarget,
      actual: weeklyRecomputed,
      recomputed: weeklyRecomputed,
      deviations: {
        calorieDeltaKcal: weeklyCalorieDelta,
        calorieDeltaPct: weeklyCalorieDeltaPct,
        proteinDeltaGrams: weeklyProteinDelta,
        proteinDeltaPct: weeklyProteinDeltaPct,
        fiberDeltaGrams:
          fiberDays > 0 ? weeklyActualFiber - weeklyTargetFiber : undefined,
      },
      rules: weeklyRules,
    },
    structuralRules,
    repairAttempts,
    warningCount: warnings.length,
    repairableFailureCount: repairableFailures.length,
    hardFailureCount: hardFailures.length,
  };

  if (status === "rejected") {
    return {
      status: "rejected",
      reasons: hardFailures.map((r) => ({
        ruleId: r.ruleId,
        message: r.message,
        day: r.day,
        mealInstanceId: r.mealInstanceId,
        componentId: r.componentId,
      })),
      report,
    };
  }

  if (status === "repair_required") {
    const dayHints = daySummaries
      .filter((d) =>
        d.rules.some((r) => r.severity === "repairable_failure" && r.repairable),
      )
      .map((d) => ({
        day: d.day,
        calorieDeltaPct: d.deviations?.calorieDeltaPct ?? 0,
        proteinDeltaPct: d.deviations?.proteinDeltaPct ?? 0,
        calorieDeltaKcal: d.deviations?.calorieDeltaKcal ?? 0,
        proteinDeltaGrams: d.deviations?.proteinDeltaGrams ?? 0,
        fiberDeltaGrams: d.deviations?.fiberDeltaGrams,
        ruleIds: d.rules
          .filter((r) => r.severity === "repairable_failure")
          .map((r) => r.ruleId),
      }));

    // Include weekly-only repairables as applying to all days with calorie/protein issues
    const weeklyRepairable = weeklyRules.filter(
      (r) => r.severity === "repairable_failure" && r.repairable,
    );
    if (dayHints.length === 0 && weeklyRepairable.length > 0) {
      for (const d of daySummaries) {
        dayHints.push({
          day: d.day,
          calorieDeltaPct: d.deviations?.calorieDeltaPct ?? 0,
          proteinDeltaPct: d.deviations?.proteinDeltaPct ?? 0,
          calorieDeltaKcal: d.deviations?.calorieDeltaKcal ?? 0,
          proteinDeltaGrams: d.deviations?.proteinDeltaGrams ?? 0,
          fiberDeltaGrams: d.deviations?.fiberDeltaGrams,
          ruleIds: weeklyRepairable.map((r) => r.ruleId),
        });
      }
    }

    return {
      status: "repair_required",
      repairRequest: {
        policyVersion: NUTRITION_PLAN_VALIDATION_POLICY_V1.version,
        allowedScope: "portion_rebalance",
        days: dayHints.length > 0 ? dayHints : [
          {
            day: daySummaries[0]?.day ?? "monday",
            calorieDeltaPct: weeklyCalorieDeltaPct,
            proteinDeltaPct: weeklyProteinDeltaPct,
            calorieDeltaKcal: weeklyCalorieDelta,
            proteinDeltaGrams: weeklyProteinDelta,
            ruleIds: repairableFailures.map((r) => r.ruleId),
          },
        ],
        message: `PLAN-011 repairable nutrition deviations on ${dayHints.length || 1} day(s); PLAN-010 may rebalance portions within culinary bounds.`,
      },
      report,
    };
  }

  // Finalized: attach immutable finalization metadata (new object — do not mutate history).
  const finalizedPlan: PersonalizedWeeklyNutritionPlan = {
    ...plan,
    finalization: {
      finalizedAt: validatedAt,
      validationPolicyVersion: NUTRITION_PLAN_VALIDATION_POLICY_V1.version,
      validationStatus: "finalized",
      repairAttempts,
    },
  };

  return {
    status: "finalized",
    finalizedPlan,
    report: { ...report, status: "finalized" },
  };
}

/** @deprecated Prefer WeeklyNutritionPlanValidationOutcome — kept for brief naming. */
export type WeeklyPlanValidationResult = WeeklyPlanValidationResultAlias;
