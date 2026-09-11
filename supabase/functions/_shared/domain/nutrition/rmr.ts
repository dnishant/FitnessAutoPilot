import type {
  EstimatedRmrInputSnapshot,
  RmrBiologicalSex,
  RmrSource,
} from "../../contracts/index.ts";
import { RmrValidationPolicy } from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";
import { roundKcal } from "../common/rounding.ts";

export const RMR_ALGORITHM_NAME = "mifflin_st_jeor" as const;
export const RMR_ALGORITHM_VERSION = "rmr-v1" as const;

export type EstimateRmrInput = {
  dateOfBirth: string;
  biologicalSex: RmrBiologicalSex;
  heightCm: number;
  weightKg: number;
  asOf?: Date;
};

export type EstimatedRmrResult = {
  rmrKcal: number;
  method: typeof RMR_ALGORITHM_NAME;
  algorithmVersion: typeof RMR_ALGORITHM_VERSION;
  ageYears: number;
};

export type RmrEstimateDraft = {
  rmrKcal: number;
  source: RmrSource;
  algorithmName: typeof RMR_ALGORITHM_NAME | null;
  algorithmVersion: typeof RMR_ALGORITHM_VERSION | null;
  inputSnapshot: EstimatedRmrInputSnapshot | null;
  reportedOrMeasuredAt: string | null;
  calculatedAt: string;
};

export type RmrError = {
  code: "invalid_input";
  field?:
    | "dateOfBirth"
    | "biologicalSex"
    | "heightCm"
    | "weightKg"
    | "rmrKcal"
    | "reportDate";
  message: string;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a calendar date in UTC. Rejects impossible dates such as 2026-02-31. */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function utcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isFutureDate(date: Date, asOf: Date): boolean {
  return utcDateKey(date) > utcDateKey(asOf);
}

/**
 * Whole years of age on `asOf`, using UTC calendar dates.
 * Age is derived, never persisted as an authoritative profile field.
 */
export function calculateAgeFromDateOfBirth(
  dateOfBirth: string,
  asOf: Date = new Date(),
): Result<number, RmrError> {
  const dob = parseIsoDate(dateOfBirth);
  if (!dob) {
    return err({
      code: "invalid_input",
      field: "dateOfBirth",
      message: "Date of birth must be a valid calendar date (YYYY-MM-DD).",
    });
  }
  if (isFutureDate(dob, asOf)) {
    return err({
      code: "invalid_input",
      field: "dateOfBirth",
      message: "Date of birth cannot be in the future.",
    });
  }

  let ageYears = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const asOfMonth = asOf.getUTCMonth();
  const asOfDay = asOf.getUTCDate();
  const dobMonth = dob.getUTCMonth();
  const dobDay = dob.getUTCDate();
  if (asOfMonth < dobMonth || (asOfMonth === dobMonth && asOfDay < dobDay)) {
    ageYears -= 1;
  }

  if (
    ageYears < RmrValidationPolicy.ageYears.min ||
    ageYears > RmrValidationPolicy.ageYears.max
  ) {
    return err({
      code: "invalid_input",
      field: "dateOfBirth",
      message: "Date of birth is outside the supported range.",
    });
  }

  return ok(ageYears);
}

function validatePositiveRange(
  value: number,
  field: "heightCm" | "weightKg" | "rmrKcal",
  bounds: { min: number; max: number },
  label: string,
): Result<true, RmrError> {
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
  return ok(true);
}

export function validateRmrBiologicalSex(
  biologicalSex: string,
): Result<RmrBiologicalSex, RmrError> {
  if (biologicalSex === "male" || biologicalSex === "female") {
    return ok(biologicalSex);
  }
  return err({
    code: "invalid_input",
    field: "biologicalSex",
    message: "Biological sex must be male or female for V1 RMR.",
  });
}

/**
 * Unrounded Mifflin-St Jeor. Callers that need TDEE later should not
 * re-round this intermediate. Displayed/persisted RMR uses roundKcal.
 */
export function mifflinStJeorRaw(input: {
  biologicalSex: RmrBiologicalSex;
  heightCm: number;
  weightKg: number;
  ageYears: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears;
  return input.biologicalSex === "female" ? base - 161 : base + 5;
}

export function estimateRmrMifflinStJeor(
  input: EstimateRmrInput,
): Result<EstimatedRmrResult, RmrError> {
  const asOf = input.asOf ?? new Date();
  const sex = validateRmrBiologicalSex(input.biologicalSex);
  if (!sex.ok) {
    return sex;
  }

  const height = validatePositiveRange(
    input.heightCm,
    "heightCm",
    RmrValidationPolicy.heightCm,
    "Height",
  );
  if (!height.ok) {
    return height;
  }

  const weight = validatePositiveRange(
    input.weightKg,
    "weightKg",
    RmrValidationPolicy.weightKg,
    "Weight",
  );
  if (!weight.ok) {
    return weight;
  }

  const age = calculateAgeFromDateOfBirth(input.dateOfBirth, asOf);
  if (!age.ok) {
    return age;
  }

  const raw = mifflinStJeorRaw({
    biologicalSex: sex.value,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    ageYears: age.value,
  });
  if (!Number.isFinite(raw) || raw <= 0) {
    return err({
      code: "invalid_input",
      message: "Estimated RMR must be a positive number.",
    });
  }

  return ok({
    rmrKcal: roundKcal(raw),
    method: RMR_ALGORITHM_NAME,
    algorithmVersion: RMR_ALGORITHM_VERSION,
    ageYears: age.value,
  });
}

export function createEstimatedRmr(
  input: EstimateRmrInput,
): Result<RmrEstimateDraft, RmrError> {
  const asOf = input.asOf ?? new Date();
  const estimated = estimateRmrMifflinStJeor({ ...input, asOf });
  if (!estimated.ok) {
    return estimated;
  }

  return ok({
    rmrKcal: estimated.value.rmrKcal,
    source: "estimated_mifflin_st_jeor",
    algorithmName: RMR_ALGORITHM_NAME,
    algorithmVersion: RMR_ALGORITHM_VERSION,
    inputSnapshot: {
      dateOfBirth: input.dateOfBirth,
      biologicalSex: input.biologicalSex,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      ageYears: estimated.value.ageYears,
    },
    reportedOrMeasuredAt: null,
    calculatedAt: asOf.toISOString(),
  });
}

export function completeRmrOnboarding(input: {
  dateOfBirth: string;
  biologicalSex: RmrBiologicalSex;
  heightCm: number;
  weightKg: number;
  source: RmrSource;
  reportedRmrKcal?: number;
  reportDate?: string;
  asOf?: Date;
}): Result<{ profile: EstimateRmrInput; rmr: RmrEstimateDraft }, RmrError> {
  const asOf = input.asOf ?? new Date();
  const estimatedPreview = createEstimatedRmr({
    dateOfBirth: input.dateOfBirth,
    biologicalSex: input.biologicalSex,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    asOf,
  });
  if (!estimatedPreview.ok) {
    return estimatedPreview;
  }

  const rmr =
    input.source === "user_reported_dexa"
      ? createUserReportedRmr({
          rmrKcal: input.reportedRmrKcal ?? Number.NaN,
          reportDate: input.reportDate ?? "",
          asOf,
        })
      : estimatedPreview;

  if (!rmr.ok) {
    return rmr;
  }

  return ok({
    profile: {
      dateOfBirth: input.dateOfBirth,
      biologicalSex: input.biologicalSex,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
    },
    rmr: rmr.value,
  });
}

export function createUserReportedRmr(input: {
  rmrKcal: number;
  reportDate: string;
  asOf?: Date;
}): Result<RmrEstimateDraft, RmrError> {
  const asOf = input.asOf ?? new Date();
  const rmr = validatePositiveRange(
    input.rmrKcal,
    "rmrKcal",
    RmrValidationPolicy.rmrKcal,
    "RMR",
  );
  if (!rmr.ok) {
    return rmr;
  }

  const report = parseIsoDate(input.reportDate);
  if (!report) {
    return err({
      code: "invalid_input",
      field: "reportDate",
      message: "Scan/report date must be a valid calendar date (YYYY-MM-DD).",
    });
  }
  if (isFutureDate(report, asOf)) {
    return err({
      code: "invalid_input",
      field: "reportDate",
      message: "Scan/report date cannot be in the future.",
    });
  }

  return ok({
    rmrKcal: roundKcal(input.rmrKcal),
    source: "user_reported_dexa",
    algorithmName: null,
    algorithmVersion: null,
    inputSnapshot: null,
    reportedOrMeasuredAt: input.reportDate,
    calculatedAt: asOf.toISOString(),
  });
}

export function appendRmrEstimate<T extends RmrEstimateDraft>(
  history: readonly T[],
  next: T,
): T[] {
  return [...history, next];
}

export function selectCurrentRmr<T extends { calculatedAt: string }>(
  history: readonly T[],
): T | null {
  if (history.length === 0) {
    return null;
  }
  return [...history].sort((a, b) => a.calculatedAt.localeCompare(b.calculatedAt)).at(-1) ?? null;
}

export const RMR_EXPLANATION =
  "RMR is an estimate of how much energy your body uses at rest.";

export function formatRmrKcalPerDay(rmrKcal: number): string {
  return `${rmrKcal.toLocaleString("en-US")} kcal/day`;
}

export function rmrResultSourceLabel(source: RmrSource): string {
  return source === "user_reported_dexa"
    ? "From your DEXA/body-composition report"
    : "Estimated using Mifflin-St Jeor";
}

export function rmrHomeSourceLabel(source: RmrSource): string {
  return source === "user_reported_dexa"
    ? "From your DEXA/body-composition report"
    : "Estimated";
}
