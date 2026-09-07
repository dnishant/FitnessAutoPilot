import type { RmrBiologicalSex, RmrSource } from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import {
  createEstimatedRmr,
  createUserReportedRmr,
  formatRmrKcalPerDay,
  RMR_EXPLANATION,
  rmrResultSourceLabel,
  type RmrError,
  type RmrEstimateDraft,
} from "./rmr";

export type OnboardingStep = "basics" | "source" | "dexa_details" | "result";

export type OnboardingDraft = {
  dateOfBirth: string;
  biologicalSex: RmrBiologicalSex | "";
  heightCm: string;
  weightKg: string;
  knowsRmr: boolean | null;
  reportedRmrKcal: string;
  reportDate: string;
};

export type OnboardingResultView = {
  rmrKcal: number;
  formattedRmr: string;
  source: RmrSource;
  sourceLabel: string;
  explanation: string;
  draft: RmrEstimateDraft;
};

export type OnboardingView = {
  step: OnboardingStep;
  draft: OnboardingDraft;
  error: string | null;
  result: OnboardingResultView | null;
};

export function createOnboardingView(overrides: Partial<OnboardingDraft> = {}): OnboardingView {
  return {
    step: "basics",
    draft: {
      dateOfBirth: "",
      biologicalSex: "",
      heightCm: "",
      weightKg: "",
      knowsRmr: null,
      reportedRmrKcal: "",
      reportDate: "",
      ...overrides,
    },
    error: null,
    result: null,
  };
}

function parseRequiredNumber(value: string, label: string): Result<number, RmrError> {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isFinite(parsed)) {
    return err({
      code: "invalid_input",
      message: `${label} must be a positive number.`,
    });
  }
  return ok(parsed);
}

function parseBasics(draft: OnboardingDraft): Result<
  {
    dateOfBirth: string;
    biologicalSex: RmrBiologicalSex;
    heightCm: number;
    weightKg: number;
  },
  RmrError
> {
  if (draft.biologicalSex !== "male" && draft.biologicalSex !== "female") {
    return err({
      code: "invalid_input",
      field: "biologicalSex",
      message: "Choose male or female.",
    });
  }
  const height = parseRequiredNumber(draft.heightCm, "Height");
  if (!height.ok) {
    return height;
  }
  const weight = parseRequiredNumber(draft.weightKg, "Weight");
  if (!weight.ok) {
    return weight;
  }
  return ok({
    dateOfBirth: draft.dateOfBirth,
    biologicalSex: draft.biologicalSex,
    heightCm: height.value,
    weightKg: weight.value,
  });
}

function withError(view: OnboardingView, error: RmrError): OnboardingView {
  return { ...view, error: error.message };
}

function withResult(view: OnboardingView, draft: RmrEstimateDraft): OnboardingView {
  return {
    ...view,
    step: "result",
    error: null,
    result: {
      rmrKcal: draft.rmrKcal,
      formattedRmr: formatRmrKcalPerDay(draft.rmrKcal),
      source: draft.source,
      sourceLabel: rmrResultSourceLabel(draft.source),
      explanation: RMR_EXPLANATION,
      draft,
    },
  };
}

export function submitOnboardingBasics(
  view: OnboardingView,
  asOf: Date = new Date(),
): OnboardingView {
  const basics = parseBasics(view.draft);
  if (!basics.ok) {
    return withError(view, basics.error);
  }
  const preview = createEstimatedRmr({ ...basics.value, asOf });
  if (!preview.ok) {
    return withError(view, preview.error);
  }
  return { ...view, step: "source", error: null };
}

export function chooseOnboardingRmrSource(
  view: OnboardingView,
  knowsRmr: boolean,
  asOf: Date = new Date(),
): OnboardingView {
  const next: OnboardingView = {
    ...view,
    draft: { ...view.draft, knowsRmr },
    error: null,
  };
  if (knowsRmr) {
    return { ...next, step: "dexa_details" };
  }

  const basics = parseBasics(next.draft);
  if (!basics.ok) {
    return withError(next, basics.error);
  }
  const estimated = createEstimatedRmr({ ...basics.value, asOf });
  if (!estimated.ok) {
    return withError(next, estimated.error);
  }
  return withResult(next, estimated.value);
}

export function submitOnboardingDexa(
  view: OnboardingView,
  asOf: Date = new Date(),
): OnboardingView {
  const basics = parseBasics(view.draft);
  if (!basics.ok) {
    return withError(view, basics.error);
  }
  const rmr = parseRequiredNumber(view.draft.reportedRmrKcal, "RMR");
  if (!rmr.ok) {
    return withError(view, rmr.error);
  }
  const reported = createUserReportedRmr({
    rmrKcal: rmr.value,
    reportDate: view.draft.reportDate,
    asOf,
  });
  if (!reported.ok) {
    return withError(view, reported.error);
  }
  return withResult({ ...view, draft: { ...view.draft, knowsRmr: true } }, reported.value);
}
