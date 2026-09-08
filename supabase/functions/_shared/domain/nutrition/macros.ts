import type { MacroTargetInputSnapshot } from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";
import { roundGrams, roundKcal } from "../common/rounding";
import { kgToLb, lbToKg } from "../common/units";
import {
  CARB_KCAL_PER_GRAM,
  FAT_KCAL_PER_GRAM,
  PROTEIN_KCAL_PER_GRAM,
} from "./energy";

export const MACRO_POLICY_NAME = "macro-policy" as const;
export const MACRO_POLICY_VERSION = "macro-policy-v1" as const;

/** V1 protein policy: 1 gram per pound of current body weight per day. */
export const PROTEIN_GRAMS_PER_LB = 1.0;

/** V1 fat policy: 0.7 grams per kilogram of current body weight per day. */
export const FAT_GRAMS_PER_KG = 0.7;

export {
  CARB_KCAL_PER_GRAM,
  FAT_KCAL_PER_GRAM,
  PROTEIN_KCAL_PER_GRAM,
} from "./energy";

export type MacroTargetFailureReason =
  | "missing_weight"
  | "invalid_weight"
  | "missing_calorie_target"
  | "invalid_calorie_target"
  | "macro_budget_exceeded"
  | "invalid_macro_result";

export type MacroTargetError = {
  code: MacroTargetFailureReason;
  message: string;
};

export type MacroTargetDraft = {
  targetCalories: number;
  proteinGrams: number;
  fatGrams: number;
  carbohydrateGrams: number;
  proteinCalories: number;
  fatCalories: number;
  remainingCalories: number;
  macroPolicyName: typeof MACRO_POLICY_NAME;
  macroPolicyVersion: typeof MACRO_POLICY_VERSION;
  inputSnapshot: MacroTargetInputSnapshot;
  createdAt: string;
};

export type ResolvedBodyWeight = {
  weightKg: number;
  weightLb: number;
  unit: "kg" | "lb";
};

function isMissingNumber(value: number | null | undefined): boolean {
  return value === null || value === undefined;
}

function isInvalidPositiveNumber(value: number): boolean {
  return !Number.isFinite(value) || value <= 0;
}

function fail(code: MacroTargetFailureReason, message: string): Result<never, MacroTargetError> {
  return err({ code, message });
}

function resolveBodyWeight(input: {
  weightKg?: number | null;
  weightLb?: number | null;
}): Result<ResolvedBodyWeight, MacroTargetError> {
  const hasKg = !isMissingNumber(input.weightKg);
  const hasLb = !isMissingNumber(input.weightLb);
  if (!hasKg && !hasLb) {
    return fail("missing_weight", "Body weight is required to calculate macros.");
  }
  if (hasKg && isInvalidPositiveNumber(input.weightKg as number)) {
    return fail("invalid_weight", "Body weight must be a finite number greater than 0.");
  }
  if (hasLb && isInvalidPositiveNumber(input.weightLb as number)) {
    return fail("invalid_weight", "Body weight must be a finite number greater than 0.");
  }
  if (hasKg) {
    const weightKg = input.weightKg as number;
    const weightLb = kgToLb(weightKg);
    if (!Number.isFinite(weightLb) || weightLb <= 0) {
      return fail("invalid_weight", "Body weight must be a finite number greater than 0.");
    }
    return ok({ weightKg, weightLb, unit: "kg" });
  }
  const weightLb = input.weightLb as number;
  const weightKg = lbToKg(weightLb);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return fail("invalid_weight", "Body weight must be a finite number greater than 0.");
  }
  return ok({ weightKg, weightLb, unit: "lb" });
}

export function calculateProteinTarget(input: {
  weightKg?: number | null;
  weightLb?: number | null;
}): Result<number, MacroTargetError> {
  const weight = resolveBodyWeight(input);
  if (!weight.ok) {
    return weight;
  }
  const proteinGrams = weight.value.weightLb * PROTEIN_GRAMS_PER_LB;
  if (!Number.isFinite(proteinGrams) || proteinGrams <= 0) {
    return fail("invalid_macro_result", "Protein target must be a finite number greater than 0.");
  }
  return ok(proteinGrams);
}

export function calculateFatTarget(input: {
  weightKg?: number | null;
  weightLb?: number | null;
}): Result<number, MacroTargetError> {
  const weight = resolveBodyWeight(input);
  if (!weight.ok) {
    return weight;
  }
  const fatGrams = weight.value.weightKg * FAT_GRAMS_PER_KG;
  if (!Number.isFinite(fatGrams) || fatGrams <= 0) {
    return fail("invalid_macro_result", "Fat target must be a finite number greater than 0.");
  }
  return ok(fatGrams);
}

export function calculateCarbohydrateTarget(input: {
  targetCalories?: number | null;
  proteinGrams: number;
  fatGrams: number;
}): Result<
  {
    carbohydrateGrams: number;
    proteinCalories: number;
    fatCalories: number;
    remainingCalories: number;
  },
  MacroTargetError
> {
  if (isMissingNumber(input.targetCalories)) {
    return fail("missing_calorie_target", "A daily calorie target is required to calculate carbohydrates.");
  }
  if (isInvalidPositiveNumber(input.targetCalories as number)) {
    return fail(
      "invalid_calorie_target",
      "Daily calorie target must be a finite number greater than 0.",
    );
  }
  if (!Number.isFinite(input.proteinGrams) || !Number.isFinite(input.fatGrams)) {
    return fail("invalid_macro_result", "Macro grams must be finite numbers.");
  }
  if (input.proteinGrams <= 0 || input.fatGrams <= 0) {
    return fail("invalid_macro_result", "Protein and fat targets must be greater than 0.");
  }

  const proteinCalories = input.proteinGrams * PROTEIN_KCAL_PER_GRAM;
  const fatCalories = input.fatGrams * FAT_KCAL_PER_GRAM;
  if (
    !Number.isFinite(proteinCalories) ||
    !Number.isFinite(fatCalories) ||
    proteinCalories < 0 ||
    fatCalories < 0
  ) {
    return fail("invalid_macro_result", "Macro calories must be finite non-negative numbers.");
  }

  const remainingCalories = (input.targetCalories as number) - proteinCalories - fatCalories;
  if (!Number.isFinite(remainingCalories)) {
    return fail("invalid_macro_result", "Remaining calories must be a finite number.");
  }
  if (remainingCalories < 0 || proteinCalories + fatCalories > (input.targetCalories as number)) {
    return fail(
      "macro_budget_exceeded",
      "Protein and fat calories exceed the daily calorie target.",
    );
  }

  const carbohydrateGrams = remainingCalories / CARB_KCAL_PER_GRAM;
  if (!Number.isFinite(carbohydrateGrams) || carbohydrateGrams < 0) {
    return fail("invalid_macro_result", "Carbohydrate target must be a finite non-negative number.");
  }

  return ok({
    carbohydrateGrams,
    proteinCalories,
    fatCalories,
    remainingCalories,
  });
}

export function calculateMacroTargets(input: {
  targetCalories?: number | null;
  weightKg?: number | null;
  weightLb?: number | null;
  asOf?: Date;
}): Result<MacroTargetDraft, MacroTargetError> {
  if (isMissingNumber(input.targetCalories)) {
    return fail("missing_calorie_target", "A daily calorie target is required to calculate macros.");
  }
  if (isInvalidPositiveNumber(input.targetCalories as number)) {
    return fail(
      "invalid_calorie_target",
      "Daily calorie target must be a finite number greater than 0.",
    );
  }

  const weight = resolveBodyWeight(input);
  if (!weight.ok) {
    return weight;
  }
  const protein = calculateProteinTarget(input);
  if (!protein.ok) {
    return protein;
  }
  const fat = calculateFatTarget(input);
  if (!fat.ok) {
    return fat;
  }
  const carbs = calculateCarbohydrateTarget({
    targetCalories: input.targetCalories,
    proteinGrams: protein.value,
    fatGrams: fat.value,
  });
  if (!carbs.ok) {
    return carbs;
  }

  const targetCalories = input.targetCalories as number;
  const asOf = input.asOf ?? new Date();
  return ok({
    targetCalories,
    proteinGrams: protein.value,
    fatGrams: fat.value,
    carbohydrateGrams: carbs.value.carbohydrateGrams,
    proteinCalories: carbs.value.proteinCalories,
    fatCalories: carbs.value.fatCalories,
    remainingCalories: carbs.value.remainingCalories,
    macroPolicyName: MACRO_POLICY_NAME,
    macroPolicyVersion: MACRO_POLICY_VERSION,
    inputSnapshot: {
      bodyWeightKg: weight.value.weightKg,
      bodyWeightLb: weight.value.weightLb,
      bodyWeightUnit: weight.value.unit,
      targetCalories,
      proteinGramsPerLb: PROTEIN_GRAMS_PER_LB,
      fatGramsPerKg: FAT_GRAMS_PER_KG,
      proteinKcalPerGram: PROTEIN_KCAL_PER_GRAM,
      carbKcalPerGram: CARB_KCAL_PER_GRAM,
      fatKcalPerGram: FAT_KCAL_PER_GRAM,
      policyVersion: MACRO_POLICY_VERSION,
    },
    createdAt: asOf.toISOString(),
  });
}

export function appendNutritionTarget<T extends { createdAt: string }>(
  history: readonly T[],
  next: T,
): T[] {
  return [...history, next];
}

export function selectCurrentNutritionTarget<T extends { createdAt: string }>(
  history: readonly T[],
): T | null {
  if (history.length === 0) {
    return null;
  }
  return [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1) ?? null;
}

export function formatNutritionCalories(kcal: number): string {
  return `${roundKcal(kcal).toLocaleString("en-US")} kcal`;
}

export function formatMacroGrams(grams: number): string {
  return `${roundGrams(grams).toLocaleString("en-US")} g`;
}

export const MACRO_PROTEIN_EXPLANATION = "1 g per lb of body weight";
export const MACRO_FAT_EXPLANATION = "0.7 g per kg of body weight";
export const MACRO_CARB_EXPLANATION = "Remaining calories after protein and fat";

export function nutritionTargetPersistFields(input: {
  macros: MacroTargetDraft;
  tdeeKcal: number;
  desiredRateKgPerWeek: number;
}): {
  estimatedMaintenanceCalories: number;
  targetCalories: number;
  proteinG: number;
  fatG: number;
  fatMinG: number;
  fatMaxG: number;
  carbohydrateG: number;
  desiredRateKgPerWeek: number;
  algorithmName: "nutrition-target";
  algorithmVersion: typeof MACRO_POLICY_VERSION;
  macroPolicyName: typeof MACRO_POLICY_NAME;
  macroPolicyVersion: typeof MACRO_POLICY_VERSION;
  inputSnapshot: MacroTargetInputSnapshot;
} {
  return {
    estimatedMaintenanceCalories: input.tdeeKcal,
    targetCalories: input.macros.targetCalories,
    proteinG: input.macros.proteinGrams,
    fatG: input.macros.fatGrams,
    fatMinG: input.macros.fatGrams,
    fatMaxG: input.macros.fatGrams,
    carbohydrateG: input.macros.carbohydrateGrams,
    desiredRateKgPerWeek: input.desiredRateKgPerWeek,
    algorithmName: "nutrition-target",
    algorithmVersion: MACRO_POLICY_VERSION,
    macroPolicyName: input.macros.macroPolicyName,
    macroPolicyVersion: input.macros.macroPolicyVersion,
    inputSnapshot: input.macros.inputSnapshot,
  };
}

export function nutritionTargetExplanationRows(): Array<{ label: string; value: string }> {
  return [
    { label: "Protein", value: MACRO_PROTEIN_EXPLANATION },
    { label: "Fat", value: MACRO_FAT_EXPLANATION },
    { label: "Carbohydrates", value: MACRO_CARB_EXPLANATION },
  ];
}
