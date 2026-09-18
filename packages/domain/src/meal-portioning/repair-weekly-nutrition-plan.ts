import type {
  DayOfWeek,
  NutritionPlanRepairRequest,
  PersonalizedWeeklyNutritionPlan,
} from "@fitness-autopilot/contracts";
import {
  personalizeWeeklyNutritionPlan,
  type PersonalizeWeeklyNutritionPlanInput,
} from "./personalize";

/**
 * Convert PLAN-011 declarative repair diagnostics into PLAN-010 intent scales.
 *
 * Ownership: 011 diagnoses; 010 optimizes portions within culinary bounds.
 * Does not change recipes, add/remove foods, or invent coefficients.
 */
export function buildRepairDayOverridesFromRequest(
  repairRequest: NutritionPlanRepairRequest,
): NonNullable<PersonalizeWeeklyNutritionPlanInput["repairDayOverrides"]> {
  const overrides: NonNullable<PersonalizeWeeklyNutritionPlanInput["repairDayOverrides"]> =
    {};

  for (const hint of repairRequest.days) {
    // calorieDeltaPct is (planned - target) / target.
    // If planned is 12% low (delta = -0.12), scale meals up to close the gap.
    // Reserved share stays fixed; scale only lunch+dinner intents.
    // Approximate: mealShare ≈ 0.65 of day → scale ≈ 1 - delta/0.65
    const calorieScale = clampScale(1 - hint.calorieDeltaPct / 0.65);
    const proteinScale = clampScale(1 - hint.proteinDeltaPct / 0.65);
    overrides[hint.day] = {
      mealCalorieScale: calorieScale,
      mealProteinScale: proteinScale,
    };
  }

  return overrides;
}

function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  // Keep intent adjustments modest so repair does not push meals into blocked territory.
  return Math.min(1.18, Math.max(0.85, scale));
}

/**
 * PLAN-010 targeted re-personalization driven by a PLAN-011 repair request.
 */
export function repairWeeklyNutritionPlan(input: {
  personalizeInput: PersonalizeWeeklyNutritionPlanInput;
  repairRequest: NutritionPlanRepairRequest;
  /** Prior plan — retained when repair would introduce blocked meals. */
  previousPlan?: PersonalizedWeeklyNutritionPlan;
}): PersonalizedWeeklyNutritionPlan {
  if (input.repairRequest.allowedScope !== "portion_rebalance") {
    throw new Error("PLAN-011 repair scope must be portion_rebalance");
  }
  const repairDayOverrides = buildRepairDayOverridesFromRequest(input.repairRequest);
  // Merge with any existing overrides (later repair wins per day).
  const merged: PersonalizeWeeklyNutritionPlanInput["repairDayOverrides"] = {
    ...(input.personalizeInput.repairDayOverrides ?? {}),
  };
  for (const [day, override] of Object.entries(repairDayOverrides) as Array<
    [DayOfWeek, { mealCalorieScale?: number; mealProteinScale?: number }]
  >) {
    const prev = merged[day];
    merged[day] = {
      mealCalorieScale:
        (prev?.mealCalorieScale ?? 1) * (override.mealCalorieScale ?? 1),
      mealProteinScale:
        (prev?.mealProteinScale ?? 1) * (override.mealProteinScale ?? 1),
    };
    // Re-clamp after merge so stacked repairs stay modest.
    merged[day] = {
      mealCalorieScale: clampScale(merged[day]!.mealCalorieScale ?? 1),
      mealProteinScale: clampScale(merged[day]!.mealProteinScale ?? 1),
    };
  }

  const repaired = personalizeWeeklyNutritionPlan({
    ...input.personalizeInput,
    repairDayOverrides: merged,
  });

  if (
    input.previousPlan &&
    repaired.blockedMealCount > input.previousPlan.blockedMealCount
  ) {
    return input.previousPlan;
  }
  return repaired;
}
