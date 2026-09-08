import type {
  OnboardingGoalType,
  TdeeInputSnapshot,
  TdeeSource,
  Wearable,
} from "@fitness-autopilot/contracts";
import { TdeeValidationPolicy } from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import { roundKcal } from "../common/rounding";
import type { RmrSource } from "@fitness-autopilot/contracts";

export const TDEE_ALGORITHM_NAME = "apple_watch_active_plus_rmr" as const;
export const TDEE_ALGORITHM_VERSION = "tdee-v1" as const;

export type TdeeError = {
  code: "invalid_input";
  field?: "goalType" | "wearable" | "wearableCaloriesKcal" | "tdeeKcal";
  message: string;
};

export type TdeeEstimateDraft = {
  tdeeKcal: number;
  source: TdeeSource;
  wearable: Wearable;
  wearableCaloriesKcal: number;
  rmrKcalUsed: number | null;
  algorithmName: typeof TDEE_ALGORITHM_NAME | null;
  algorithmVersion: typeof TDEE_ALGORITHM_VERSION | null;
  inputSnapshot: TdeeInputSnapshot;
  calculatedAt: string;
};

export const TDEE_EXPLANATION =
  "TDEE is an estimate of how much energy you use in a typical day.";

export function validateOnboardingGoalType(
  goalType: string,
): Result<OnboardingGoalType, TdeeError> {
  if (goalType === "muscle_gain" || goalType === "fat_loss" || goalType === "recomposition") {
    return ok(goalType);
  }
  return err({
    code: "invalid_input",
    field: "goalType",
    message: "Choose Bulking, Shredding / Weight Loss, or Recomposition / Maintenance.",
  });
}

export function validateWearable(wearable: string): Result<Wearable, TdeeError> {
  if (wearable === "apple_watch" || wearable === "whoop") {
    return ok(wearable);
  }
  return err({
    code: "invalid_input",
    field: "wearable",
    message: "Choose Apple Watch or Whoop.",
  });
}

export function validateWearableCalories(value: number): Result<number, TdeeError> {
  if (!Number.isFinite(value) || value <= 0) {
    return err({
      code: "invalid_input",
      field: "wearableCaloriesKcal",
      message: "Calories must be a positive number.",
    });
  }
  if (
    value < TdeeValidationPolicy.wearableCaloriesKcal.min ||
    value > TdeeValidationPolicy.wearableCaloriesKcal.max
  ) {
    return err({
      code: "invalid_input",
      field: "wearableCaloriesKcal",
      message: "Calories must be within the supported range.",
    });
  }
  return ok(roundKcal(value));
}

export function validateTdeeRange(tdeeKcal: number): Result<number, TdeeError> {
  if (
    tdeeKcal < TdeeValidationPolicy.tdeeKcal.min ||
    tdeeKcal > TdeeValidationPolicy.tdeeKcal.max
  ) {
    return err({
      code: "invalid_input",
      field: "tdeeKcal",
      message: "TDEE must be within the supported range.",
    });
  }
  return ok(tdeeKcal);
}

/**
 * Whoop: TDEE is the user-entered average daily calories.
 * Apple Watch: TDEE is active calories + the established current RMR
 * (DEXA if provided, otherwise Mifflin-St Jeor).
 */
export function createTdeeFromWearable(input: {
  wearable: Wearable;
  wearableCaloriesKcal: number;
  rmrKcal: number;
  rmrSource: RmrSource;
  goalType: OnboardingGoalType;
  asOf?: Date;
}): Result<TdeeEstimateDraft, TdeeError> {
  const asOf = input.asOf ?? new Date();
  const wearable = validateWearable(input.wearable);
  if (!wearable.ok) {
    return wearable;
  }
  const goal = validateOnboardingGoalType(input.goalType);
  if (!goal.ok) {
    return goal;
  }
  const wearableCalories = validateWearableCalories(input.wearableCaloriesKcal);
  if (!wearableCalories.ok) {
    return wearableCalories;
  }
  if (!Number.isFinite(input.rmrKcal) || input.rmrKcal <= 0) {
    return err({
      code: "invalid_input",
      message: "A valid RMR is required before TDEE can be calculated.",
    });
  }

  const source: TdeeSource =
    wearable.value === "whoop" ? "whoop_daily_calories" : "apple_watch_active_plus_rmr";
  const rawTdee =
    wearable.value === "whoop"
      ? wearableCalories.value
      : wearableCalories.value + input.rmrKcal;
  const tdeeKcal = roundKcal(rawTdee);
  const ranged = validateTdeeRange(tdeeKcal);
  if (!ranged.ok) {
    return ranged;
  }

  return ok({
    tdeeKcal: ranged.value,
    source,
    wearable: wearable.value,
    wearableCaloriesKcal: wearableCalories.value,
    rmrKcalUsed: wearable.value === "apple_watch" ? input.rmrKcal : null,
    algorithmName: wearable.value === "apple_watch" ? TDEE_ALGORITHM_NAME : null,
    algorithmVersion: wearable.value === "apple_watch" ? TDEE_ALGORITHM_VERSION : null,
    inputSnapshot: {
      wearable: wearable.value,
      wearableCaloriesKcal: wearableCalories.value,
      rmrKcal: input.rmrKcal,
      rmrSource: input.rmrSource,
      goalType: goal.value,
    },
    calculatedAt: asOf.toISOString(),
  });
}

export function appendTdeeEstimate<T extends TdeeEstimateDraft>(
  history: readonly T[],
  next: T,
): T[] {
  return [...history, next];
}

export function selectCurrentTdee<T extends { calculatedAt: string }>(
  history: readonly T[],
): T | null {
  if (history.length === 0) {
    return null;
  }
  return [...history].sort((a, b) => a.calculatedAt.localeCompare(b.calculatedAt)).at(-1) ?? null;
}

export function formatTdeeKcalPerDay(tdeeKcal: number): string {
  return `${tdeeKcal.toLocaleString("en-US")} kcal/day`;
}

export function tdeeResultSourceLabel(source: TdeeSource): string {
  return source === "whoop_daily_calories"
    ? "From your Whoop average daily calories"
    : "Active calories + your RMR";
}

export function tdeeHomeSourceLabel(source: TdeeSource): string {
  return source === "whoop_daily_calories" ? "Whoop" : "Apple Watch + RMR";
}

export function wearableLabel(wearable: Wearable): string {
  return wearable === "whoop" ? "Whoop" : "Apple Watch";
}

export function wearableCaloriesFieldLabel(wearable: Wearable): string {
  return wearable === "whoop"
    ? "Average daily calories (kcal/day)"
    : "Active calories (kcal/day)";
}
