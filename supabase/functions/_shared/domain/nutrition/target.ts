import type {
  BiologicalSex,
  FitnessExperience,
  Goal,
  GoalType,
  UserProfile,
} from "../../contracts/index.ts";
import { ok, err, type Result } from "../../validation/index.ts";
import { requireAllowedEligibility, type SafetyFailure } from "../safety/eligibility.js";
import { roundKcal, roundMacroG } from "../common/rounding.js";

export const NUTRITION_TARGET_ALGORITHM_NAME = "nutrition-target" as const;
export const NUTRITION_TARGET_ALGORITHM_VERSION = "nutrition-target-v1" as const;

/** Conservative v1 policy constants — product assumptions, not medical certainty. */
export const NutritionTargetV1Policy = {
  activityMultipliers: {
    sedentary: 1.2,
    beginner: 1.375,
    intermediate: 1.55,
    advanced: 1.725,
  } satisfies Record<FitnessExperience, number>,
  defaultRateKgPerWeek: {
    fat_loss: -0.5,
    muscle_gain: 0.25,
    recomposition: 0,
    general_fitness: 0,
  } satisfies Record<GoalType, number>,
  /** Approximate kcal per kg body-weight change per week → daily kcal. */
  kcalPerKgPerWeek: 1100,
  rateClampKgPerWeek: { min: -1.0, max: 0.5 },
  calorieFloor: { female: 1200, male: 1500, other: 1500 } satisfies Record<
    BiologicalSex,
    number
  >,
  maxAbsDeltaFromTdee: 1000,
  proteinGPerKg: 1.6,
  proteinClampG: { min: 80, max: 220 },
  fatCalorieFraction: { min: 0.2, max: 0.35 },
  proteinKcalPerG: 4,
  carbKcalPerG: 4,
  fatKcalPerG: 9,
} as const;

export type NutritionTargetCalculation = {
  estimatedMaintenanceCalories: number;
  targetCalories: number;
  proteinG: number;
  fatMinG: number;
  fatMaxG: number;
  carbohydrateG: number;
  desiredRateKgPerWeek: number;
  algorithmName: typeof NUTRITION_TARGET_ALGORITHM_NAME;
  algorithmVersion: typeof NUTRITION_TARGET_ALGORITHM_VERSION;
  inputSnapshot: Record<string, unknown>;
};

export type NutritionTargetError =
  | SafetyFailure
  | { code: "invalid_input"; message: string };

function ageFromDob(dateOfBirth: string, asOf: Date): number {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  if (!y || !m || !d) {
    return NaN;
  }
  let age = asOf.getUTCFullYear() - y;
  const month = asOf.getUTCMonth() + 1;
  const day = asOf.getUTCDate();
  if (month < m || (month === m && day < d)) {
    age -= 1;
  }
  return age;
}

function mifflinStJeorBmr(args: {
  sex: BiologicalSex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}): number {
  const base = 10 * args.weightKg + 6.25 * args.heightCm - 5 * args.ageYears;
  // `other` uses male constants as a documented conservative placeholder.
  if (args.sex === "female") {
    return base - 161;
  }
  return base + 5;
}

export function calculateNutritionTarget(
  profile: UserProfile,
  goal: Pick<Goal, "goalType" | "desiredRateKgPerWeek" | "id">,
  options?: { asOf?: Date },
): Result<NutritionTargetCalculation, NutritionTargetError> {
  const allowed = requireAllowedEligibility(profile.safetyRestrictions);
  if (!allowed.ok) {
    return allowed;
  }

  const asOf = options?.asOf ?? new Date();
  const ageYears = ageFromDob(profile.dateOfBirth, asOf);
  if (!Number.isFinite(ageYears) || ageYears < 16 || ageYears > 100) {
    return err({
      code: "invalid_input",
      message: "Date of birth must yield an age between 16 and 100 for v1.",
    });
  }

  if (!Number.isFinite(profile.weightKg) || profile.weightKg <= 0) {
    return err({ code: "invalid_input", message: "Weight must be a positive number." });
  }
  if (!Number.isFinite(profile.heightCm) || profile.heightCm <= 0) {
    return err({ code: "invalid_input", message: "Height must be a positive number." });
  }

  const bmr = mifflinStJeorBmr({
    sex: profile.biologicalSex,
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    ageYears,
  });
  const activity =
    NutritionTargetV1Policy.activityMultipliers[profile.fitnessExperience];
  const tdee = bmr * activity;

  let rate =
    goal.desiredRateKgPerWeek ??
    NutritionTargetV1Policy.defaultRateKgPerWeek[goal.goalType];
  rate = Math.min(
    NutritionTargetV1Policy.rateClampKgPerWeek.max,
    Math.max(NutritionTargetV1Policy.rateClampKgPerWeek.min, rate),
  );

  const deltaKcal = (rate * NutritionTargetV1Policy.kcalPerKgPerWeek) / 7;
  let target = tdee + deltaKcal;

  const floor = NutritionTargetV1Policy.calorieFloor[profile.biologicalSex];
  target = Math.max(floor, target);
  target = Math.min(tdee + NutritionTargetV1Policy.maxAbsDeltaFromTdee, target);
  target = Math.max(tdee - NutritionTargetV1Policy.maxAbsDeltaFromTdee, target);
  target = Math.max(floor, target);

  let proteinG = profile.weightKg * NutritionTargetV1Policy.proteinGPerKg;
  proteinG = Math.min(
    NutritionTargetV1Policy.proteinClampG.max,
    Math.max(NutritionTargetV1Policy.proteinClampG.min, proteinG),
  );

  const fatMinG =
    (target * NutritionTargetV1Policy.fatCalorieFraction.min) /
    NutritionTargetV1Policy.fatKcalPerG;
  const fatMaxG =
    (target * NutritionTargetV1Policy.fatCalorieFraction.max) /
    NutritionTargetV1Policy.fatKcalPerG;
  const fatMidG = (fatMinG + fatMaxG) / 2;

  const proteinKcal = proteinG * NutritionTargetV1Policy.proteinKcalPerG;
  const fatKcal = fatMidG * NutritionTargetV1Policy.fatKcalPerG;
  const remaining = Math.max(0, target - proteinKcal - fatKcal);
  const carbohydrateG = remaining / NutritionTargetV1Policy.carbKcalPerG;

  const inputSnapshot: Record<string, unknown> = {
    profile: {
      userId: profile.userId,
      dateOfBirth: profile.dateOfBirth,
      ageYears,
      biologicalSex: profile.biologicalSex,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      fitnessExperience: profile.fitnessExperience,
      safetyRestrictions: profile.safetyRestrictions,
    },
    goal: {
      id: goal.id,
      goalType: goal.goalType,
      desiredRateKgPerWeek: goal.desiredRateKgPerWeek ?? null,
      effectiveRateKgPerWeek: rate,
    },
    policy: NutritionTargetV1Policy,
    asOf: asOf.toISOString(),
  };

  return ok({
    estimatedMaintenanceCalories: roundKcal(tdee),
    targetCalories: roundKcal(target),
    proteinG: roundMacroG(proteinG),
    fatMinG: roundMacroG(fatMinG),
    fatMaxG: roundMacroG(fatMaxG),
    carbohydrateG: roundMacroG(carbohydrateG),
    desiredRateKgPerWeek: rate,
    algorithmName: NUTRITION_TARGET_ALGORITHM_NAME,
    algorithmVersion: NUTRITION_TARGET_ALGORITHM_VERSION,
    inputSnapshot,
  });
}
