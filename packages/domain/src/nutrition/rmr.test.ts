import { describe, expect, it } from "vitest";
import { RmrValidationPolicy } from "@fitness-autopilot/contracts";
import { roundKcal } from "../common/rounding";
import {
  appendRmrEstimate,
  calculateAgeFromDateOfBirth,
  completeRmrOnboarding,
  createEstimatedRmr,
  createUserReportedRmr,
  estimateRmrMifflinStJeor,
  formatRmrKcalPerDay,
  mifflinStJeorRaw,
  RMR_ALGORITHM_NAME,
  RMR_ALGORITHM_VERSION,
  rmrHomeSourceLabel,
  rmrResultSourceLabel,
  selectCurrentRmr,
} from "./rmr";

const asOf = new Date("2026-09-07T00:00:00.000Z");

describe("calculateAgeFromDateOfBirth", () => {
  it("counts a birthday that already occurred this year", () => {
    const age = calculateAgeFromDateOfBirth("1990-03-01", asOf);
    expect(age).toEqual({ ok: true, value: 36 });
  });

  it("does not increment age when the birthday has not occurred yet", () => {
    const age = calculateAgeFromDateOfBirth("1990-12-01", asOf);
    expect(age).toEqual({ ok: true, value: 35 });
  });

  it("increments age on the exact birthday", () => {
    const age = calculateAgeFromDateOfBirth("1990-09-07", asOf);
    expect(age).toEqual({ ok: true, value: 36 });
  });

  it("rejects a future date of birth", () => {
    const age = calculateAgeFromDateOfBirth("2027-01-01", asOf);
    expect(age.ok).toBe(false);
    if (!age.ok) {
      expect(age.error.field).toBe("dateOfBirth");
      expect(age.error.message).toMatch(/future/i);
    }
  });

  it("rejects an impossible calendar date", () => {
    const age = calculateAgeFromDateOfBirth("2026-02-31", asOf);
    expect(age.ok).toBe(false);
  });
});

describe("estimateRmrMifflinStJeor", () => {
  it("matches a manually calculated male example", () => {
    // 10*80 + 6.25*180 - 5*36 + 5 = 800 + 1125 - 180 + 5 = 1750
    const result = estimateRmrMifflinStJeor({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      asOf,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        rmrKcal: 1750,
        method: "mifflin_st_jeor",
        algorithmVersion: "rmr-v1",
        ageYears: 36,
      },
    });
  });

  it("matches a manually calculated female example", () => {
    // 10*70 + 6.25*165 - 5*36 - 161 = 700 + 1031.25 - 180 - 161 = 1390.25
    const raw = 10 * 70 + 6.25 * 165 - 5 * 36 - 161;
    expect(raw).toBe(1390.25);
    const result = estimateRmrMifflinStJeor({
      dateOfBirth: "1990-03-01",
      biologicalSex: "female",
      heightCm: 165,
      weightKg: 70,
      asOf,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rmrKcal).toBe(1390);
      expect(result.value.rmrKcal).toBe(roundKcal(raw));
    }
  });

  it("is deterministic for the same inputs", () => {
    const input = {
      dateOfBirth: "1990-03-01",
      biologicalSex: "male" as const,
      heightCm: 180,
      weightKg: 80,
      asOf,
    };
    expect(estimateRmrMifflinStJeor(input)).toEqual(estimateRmrMifflinStJeor(input));
  });

  it("rounds a .5 remainder half-up to the next whole kcal", () => {
    // 10*80.05 + 6.25*180 - 5*36 + 5 = 800.5 + 1125 - 180 + 5 = 1750.5
    const raw = 10 * 80.05 + 6.25 * 180 - 5 * 36 + 5;
    expect(raw).toBe(1750.5);
    const result = estimateRmrMifflinStJeor({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80.05,
      asOf,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rmrKcal).toBe(1751);
    }
  });

  it("rejects invalid height", () => {
    const zero = estimateRmrMifflinStJeor({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 0,
      weightKg: 80,
      asOf,
    });
    const high = estimateRmrMifflinStJeor({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: RmrValidationPolicy.heightCm.max + 1,
      weightKg: 80,
      asOf,
    });
    expect(zero.ok).toBe(false);
    expect(high.ok).toBe(false);
    if (!zero.ok) {
      expect(zero.error.field).toBe("heightCm");
    }
  });

  it("rejects invalid weight", () => {
    const zero = estimateRmrMifflinStJeor({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: -5,
      asOf,
    });
    expect(zero.ok).toBe(false);
    if (!zero.ok) {
      expect(zero.error.field).toBe("weightKg");
    }
  });

  it("rejects invalid date of birth", () => {
    const result = estimateRmrMifflinStJeor({
      dateOfBirth: "2027-01-01",
      biologicalSex: "female",
      heightCm: 165,
      weightKg: 70,
      asOf,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("dateOfBirth");
    }
  });
});

describe("createEstimatedRmr", () => {
  it("stores algorithm version and an immutable input snapshot", () => {
    const result = createEstimatedRmr({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      asOf,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.source).toBe("estimated_mifflin_st_jeor");
    expect(result.value.algorithmName).toBe(RMR_ALGORITHM_NAME);
    expect(result.value.algorithmVersion).toBe(RMR_ALGORITHM_VERSION);
    expect(result.value.inputSnapshot).toEqual({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      ageYears: 36,
    });
    expect(result.value.reportedOrMeasuredAt).toBeNull();
    expect(result.value.rmrKcal).toBe(1750);
  });
});

describe("createUserReportedRmr", () => {
  it("preserves a valid direct RMR and scan date", () => {
    const result = createUserReportedRmr({
      rmrKcal: 1782,
      reportDate: "2026-01-15",
      asOf,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        rmrKcal: 1782,
        source: "user_reported_dexa",
        algorithmName: null,
        algorithmVersion: null,
        inputSnapshot: null,
        reportedOrMeasuredAt: "2026-01-15",
        calculatedAt: asOf.toISOString(),
      },
    });
  });

  it("rejects a future report date", () => {
    const result = createUserReportedRmr({
      rmrKcal: 1782,
      reportDate: "2026-12-01",
      asOf,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("reportDate");
      expect(result.error.message).toMatch(/future/i);
    }
  });

  it("rejects an invalid reported RMR", () => {
    const result = createUserReportedRmr({
      rmrKcal: 0,
      reportDate: "2026-01-15",
      asOf,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("rmrKcal");
    }
  });
});

describe("RMR history", () => {
  it("appends a new estimate without mutating the previous record", () => {
    const first = createEstimatedRmr({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      asOf,
    });
    const second = createUserReportedRmr({
      rmrKcal: 1782,
      reportDate: "2026-01-15",
      asOf: new Date("2026-09-07T01:00:00.000Z"),
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    const history = appendRmrEstimate([], first.value);
    const snapshot = structuredClone(history[0]);
    const next = appendRmrEstimate(history, second.value);

    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(snapshot);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(snapshot);
    expect(selectCurrentRmr(next)?.source).toBe("user_reported_dexa");
    expect(selectCurrentRmr(next)?.rmrKcal).toBe(1782);
  });
});

describe("completeRmrOnboarding", () => {
  it("validates profile fields even on the DEXA path", () => {
    const result = completeRmrOnboarding({
      dateOfBirth: "1990-03-01",
      biologicalSex: "female",
      heightCm: 0,
      weightKg: 70,
      source: "user_reported_dexa",
      reportedRmrKcal: 1782,
      reportDate: "2026-01-15",
      asOf,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("heightCm");
    }
  });
});

describe("RMR display copy", () => {
  it("formats kcal/day and source labels", () => {
    expect(formatRmrKcalPerDay(1782)).toBe("1,782 kcal/day");
    expect(rmrResultSourceLabel("estimated_mifflin_st_jeor")).toBe(
      "Estimated using Mifflin-St Jeor",
    );
    expect(rmrResultSourceLabel("user_reported_dexa")).toBe(
      "From your DEXA/body-composition report",
    );
    expect(rmrHomeSourceLabel("estimated_mifflin_st_jeor")).toBe("Estimated");
  });
});

describe("mifflinStJeorRaw", () => {
  it("keeps the unrounded intermediate for later TDEE reuse", () => {
    expect(
      mifflinStJeorRaw({
        biologicalSex: "female",
        heightCm: 165,
        weightKg: 70,
        ageYears: 36,
      }),
    ).toBe(1390.25);
  });
});
