import type {
  CalorieTargetInputSnapshot,
  OnboardingGoalType,
  WeightChangeDirection,
  WeightChangePace,
} from "../../contracts/index.ts";
import { CalorieTargetValidationPolicy } from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";
import { roundHalfUp, roundKcal } from "../common/rounding";
import { kgToLb } from "../common/units";

export const WEIGHT_CHANGE_POLICY_NAME = "weight-change-policy" as const;
export const WEIGHT_CHANGE_POLICY_VERSION = "weight-change-policy-v1" as const;

export const WEIGHT_CHANGE_POLICY = {
  weight_loss: {
    recommended: -0.005,
    faster: -0.0075,
  },
  maintenance: {
    recommended: 0,
  },
  weight_gain: {
    recommended: 0.0025,
    faster: 0.005,
  },
} as const;

export const KCAL_PER_POUND_BODY_WEIGHT_CHANGE = 3500;

export type CalorieTargetError = {
  code: "invalid_input";
  field?:
    | "weightKg"
    | "weightLb"
    | "tdeeKcal"
    | "goalType"
    | "pace"
    | "targetCalories";
  message: string;
};

export type CalorieTargetDraft = {
  tdeeKcal: number;
  bodyWeightKg: number;
  bodyWeightLb: number;
  pace: WeightChangePace;
  targetRatePerWeek: number;
  targetLbPerWeek: number;
  weeklyCalorieAdjustment: number;
  dailyCalorieAdjustment: number;
  targetCalories: number;
  policyName: typeof WEIGHT_CHANGE_POLICY_NAME;
  policyVersion: typeof WEIGHT_CHANGE_POLICY_VERSION;
  inputSnapshot: CalorieTargetInputSnapshot;
  createdAt: string;
};

export function mapGoalToWeightChangeDirection(
  goalType: string,
): Result<WeightChangeDirection, CalorieTargetError> {
  if (goalType === "fat_loss") {
    return ok("weight_loss");
  }
  if (goalType === "muscle_gain") {
    return ok("weight_gain");
  }
  if (goalType === "recomposition") {
    return ok("maintenance");
  }
  return err({
    code: "invalid_input",
    field: "goalType",
    message: "Unsupported goal for a calorie target.",
  });
}

export function validateWeightChangePace(
  pace: string,
): Result<WeightChangePace, CalorieTargetError> {
  if (pace === "recommended" || pace === "faster") {
    return ok(pace);
  }
  return err({
    code: "invalid_input",
    field: "pace",
    message: "Choose Recommended or Faster.",
  });
}

function resolveWeightChangeDirection(
  goalType: OnboardingGoalType | WeightChangeDirection | string,
): Result<WeightChangeDirection, CalorieTargetError> {
  if (goalType === "weight_loss" || goalType === "weight_gain" || goalType === "maintenance") {
    return ok(goalType);
  }
  return mapGoalToWeightChangeDirection(goalType);
}

export function getTargetWeightChangeRate(
  goalType: OnboardingGoalType | WeightChangeDirection | string,
  pace: WeightChangePace | string,
): Result<number, CalorieTargetError> {
  const direction = resolveWeightChangeDirection(goalType);
  if (!direction.ok) {
    return direction;
  }
  const parsedPace = validateWeightChangePace(pace);
  if (!parsedPace.ok) {
    return parsedPace;
  }
  const policy = WEIGHT_CHANGE_POLICY[direction.value];
  if (parsedPace.value === "faster") {
    if (!("faster" in policy)) {
      return err({
        code: "invalid_input",
        field: "pace",
        message: "Maintenance does not use a Faster pace.",
      });
    }
    return ok(policy.faster);
  }
  return ok(policy.recommended);
}

function validateFinitePositive(
  value: number,
  field: "weightKg" | "weightLb" | "tdeeKcal",
  bounds: { min: number; max: number },
  label: string,
): Result<number, CalorieTargetError> {
  if (!Number.isFinite(value) || value <= 0) {
    return err({
      code: "invalid_input",
      field,
      message: `${label} must be a positive number.`,
    });
  }
  if (value < bounds.min || value > bounds.max) {
    return err({
      code: "invalid_input",
      field,
      message: `${label} must be within the supported range.`,
    });
  }
  return ok(value);
}

export function calculateTargetWeightChangePerWeek(input: {
  bodyWeightLb: number;
  targetRatePerWeek: number;
}): Result<number, CalorieTargetError> {
  const weight = validateFinitePositive(
    input.bodyWeightLb,
    "weightLb",
    CalorieTargetValidationPolicy.weightLb,
    "Weight",
  );
  if (!weight.ok) {
    return weight;
  }
  if (!Number.isFinite(input.targetRatePerWeek)) {
    return err({
      code: "invalid_input",
      message: "Target rate must be a finite number.",
    });
  }
  const change = weight.value * input.targetRatePerWeek;
  if (!Number.isFinite(change)) {
    return err({
      code: "invalid_input",
      message: "Target weight change must be a finite number.",
    });
  }
  return ok(change);
}

export function calculateDailyCalorieAdjustment(input: {
  targetWeightChangeLbPerWeek: number;
}): Result<number, CalorieTargetError> {
  if (!Number.isFinite(input.targetWeightChangeLbPerWeek)) {
    return err({
      code: "invalid_input",
      message: "Target weight change must be a finite number.",
    });
  }
  const weekly = input.targetWeightChangeLbPerWeek * KCAL_PER_POUND_BODY_WEIGHT_CHANGE;
  const daily = weekly / 7;
  if (!Number.isFinite(weekly) || !Number.isFinite(daily)) {
    return err({
      code: "invalid_input",
      message: "Calorie adjustment must be a finite number.",
    });
  }
  return ok(daily);
}

export function calculateGoalAdjustedCalorieTarget(input: {
  tdeeKcal: number;
  dailyCalorieAdjustment: number;
}): Result<number, CalorieTargetError> {
  const tdee = validateFinitePositive(
    input.tdeeKcal,
    "tdeeKcal",
    CalorieTargetValidationPolicy.tdeeKcal,
    "TDEE",
  );
  if (!tdee.ok) {
    return tdee;
  }
  if (!Number.isFinite(input.dailyCalorieAdjustment)) {
    return err({
      code: "invalid_input",
      message: "Calorie adjustment must be a finite number.",
    });
  }
  const raw = tdee.value + input.dailyCalorieAdjustment;
  if (!Number.isFinite(raw)) {
    return err({
      code: "invalid_input",
      field: "targetCalories",
      message: "Target calories must be a finite number.",
    });
  }
  const targetCalories = roundKcal(raw);
  if (
    targetCalories < CalorieTargetValidationPolicy.targetCalories.min ||
    targetCalories > CalorieTargetValidationPolicy.targetCalories.max
  ) {
    return err({
      code: "invalid_input",
      field: "targetCalories",
      message: "Target calories must be within the supported range.",
    });
  }
  return ok(targetCalories);
}

export function createCalorieTarget(input: {
  goalType: OnboardingGoalType;
  pace: WeightChangePace;
  weightKg: number;
  tdeeKcal: number;
  asOf?: Date;
}): Result<CalorieTargetDraft, CalorieTargetError> {
  const asOf = input.asOf ?? new Date();
  const weight = validateFinitePositive(
    input.weightKg,
    "weightKg",
    CalorieTargetValidationPolicy.weightKg,
    "Weight",
  );
  if (!weight.ok) {
    return weight;
  }
  const rate = getTargetWeightChangeRate(input.goalType, input.pace);
  if (!rate.ok) {
    return rate;
  }
  const direction = mapGoalToWeightChangeDirection(input.goalType);
  if (!direction.ok) {
    return direction;
  }
  const weightLb = kgToLb(weight.value);
  const change = calculateTargetWeightChangePerWeek({
    bodyWeightLb: weightLb,
    targetRatePerWeek: rate.value,
  });
  if (!change.ok) {
    return change;
  }
  const daily = calculateDailyCalorieAdjustment({
    targetWeightChangeLbPerWeek: change.value,
  });
  if (!daily.ok) {
    return daily;
  }
  const target = calculateGoalAdjustedCalorieTarget({
    tdeeKcal: input.tdeeKcal,
    dailyCalorieAdjustment: daily.value,
  });
  if (!target.ok) {
    return target;
  }

  return ok({
    tdeeKcal: roundKcal(input.tdeeKcal),
    bodyWeightKg: weight.value,
    bodyWeightLb: weightLb,
    pace: input.pace,
    targetRatePerWeek: rate.value,
    targetLbPerWeek: change.value,
    weeklyCalorieAdjustment: change.value * KCAL_PER_POUND_BODY_WEIGHT_CHANGE,
    dailyCalorieAdjustment: roundKcal(daily.value),
    targetCalories: target.value,
    policyName: WEIGHT_CHANGE_POLICY_NAME,
    policyVersion: WEIGHT_CHANGE_POLICY_VERSION,
    inputSnapshot: {
      goalType: input.goalType,
      weightChangeDirection: direction.value,
      pace: input.pace,
      weightKg: weight.value,
      weightLb,
      tdeeKcal: roundKcal(input.tdeeKcal),
      targetRatePerWeek: rate.value,
      policyVersion: WEIGHT_CHANGE_POLICY_VERSION,
    },
    createdAt: asOf.toISOString(),
  });
}

export function appendCalorieTarget<T extends CalorieTargetDraft>(
  history: readonly T[],
  next: T,
): T[] {
  return [...history, next];
}

export function selectCurrentCalorieTarget<T extends { createdAt: string }>(
  history: readonly T[],
): T | null {
  if (history.length === 0) {
    return null;
  }
  return [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1) ?? null;
}

export function calorieTargetGoalLabel(goalType: OnboardingGoalType): string {
  if (goalType === "fat_loss") {
    return "Lose weight";
  }
  if (goalType === "muscle_gain") {
    return "Gain weight";
  }
  return "Maintain";
}

export function calorieTargetPaceLabel(pace: WeightChangePace): string {
  return pace === "faster" ? "Faster" : "Recommended";
}

export function formatPercentPerWeek(rate: number): string {
  return `${roundHalfUp(Math.abs(rate) * 100, 2).toFixed(2)}%`;
}

export function formatLbPerWeek(lbPerWeek: number): string {
  const magnitude = Math.abs(lbPerWeek);
  const rounded = roundHalfUp(magnitude, 2);
  const text =
    Math.abs(rounded * 10 - Math.round(rounded * 10)) < 1e-9
      ? rounded.toFixed(1)
      : rounded.toFixed(2);
  return `~${text} lb/week`;
}

export function formatSignedKcalPerDay(kcal: number): string {
  const rounded = roundKcal(kcal);
  const formatted = Math.abs(rounded).toLocaleString("en-US");
  if (rounded > 0) {
    return `+${formatted} kcal/day`;
  }
  if (rounded < 0) {
    return `−${formatted} kcal/day`;
  }
  return "0 kcal/day";
}

export function formatTargetCaloriesPerDay(kcal: number): string {
  return `${kcal.toLocaleString("en-US")} kcal/day`;
}

export function paceOptionsForGoal(goalType: OnboardingGoalType): ReadonlyArray<{
  pace: WeightChangePace;
  label: string;
  detail: string;
}> {
  const direction = mapGoalToWeightChangeDirection(goalType);
  if (!direction.ok || direction.value === "maintenance") {
    return [];
  }
  const policy = WEIGHT_CHANGE_POLICY[direction.value];
  const verb = direction.value === "weight_loss" ? "lose" : "gain";
  return [
    {
      pace: "recommended",
      label: "Recommended",
      detail: `${formatPercentPerWeek(policy.recommended)} body weight/week`,
    },
    {
      pace: "faster",
      label: "Faster",
      detail: `${formatPercentPerWeek(policy.faster)} body weight/week`,
    },
  ];
}

export function pacePromptForGoal(goalType: OnboardingGoalType): string {
  const direction = mapGoalToWeightChangeDirection(goalType);
  if (!direction.ok || direction.value === "maintenance") {
    return "";
  }
  return direction.value === "weight_loss"
    ? "How fast would you like to lose weight?"
    : "How fast would you like to gain weight?";
}
