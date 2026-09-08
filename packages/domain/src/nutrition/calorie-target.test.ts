import { describe, expect, it } from "vitest";
import {
  appendCalorieTarget,
  calculateDailyCalorieAdjustment,
  calculateGoalAdjustedCalorieTarget,
  calculateTargetWeightChangePerWeek,
  calorieTargetGoalLabel,
  calorieTargetPaceLabel,
  createCalorieTarget,
  formatLbPerWeek,
  formatPercentPerWeek,
  formatTargetCaloriesPerDay,
  getTargetWeightChangeRate,
  KCAL_PER_POUND_BODY_WEIGHT_CHANGE,
  paceOptionsForGoal,
  selectCurrentCalorieTarget,
  WEIGHT_CHANGE_POLICY,
  WEIGHT_CHANGE_POLICY_VERSION,
} from "./calorie-target";
import { kgToLb, lbToKg } from "../common/units";

const asOf = new Date("2026-09-08T00:00:00.000Z");

describe("WEIGHT_CHANGE_POLICY", () => {
  it("uses the versioned V1 rates", () => {
    expect(WEIGHT_CHANGE_POLICY.weight_loss.recommended).toBe(-0.005);
    expect(WEIGHT_CHANGE_POLICY.weight_loss.faster).toBe(-0.0075);
    expect(WEIGHT_CHANGE_POLICY.weight_gain.recommended).toBe(0.0025);
    expect(WEIGHT_CHANGE_POLICY.weight_gain.faster).toBe(0.005);
    expect(WEIGHT_CHANGE_POLICY.maintenance.recommended).toBe(0);
    expect(WEIGHT_CHANGE_POLICY_VERSION).toBe("weight-change-policy-v1");
    expect(KCAL_PER_POUND_BODY_WEIGHT_CHANGE).toBe(3500);
  });
});

describe("getTargetWeightChangeRate", () => {
  it("maps existing goal names onto the policy", () => {
    expect(getTargetWeightChangeRate("fat_loss", "recommended")).toEqual({
      ok: true,
      value: -0.005,
    });
    expect(getTargetWeightChangeRate("fat_loss", "faster")).toEqual({
      ok: true,
      value: -0.0075,
    });
    expect(getTargetWeightChangeRate("muscle_gain", "recommended")).toEqual({
      ok: true,
      value: 0.0025,
    });
    expect(getTargetWeightChangeRate("muscle_gain", "faster")).toEqual({
      ok: true,
      value: 0.005,
    });
    expect(getTargetWeightChangeRate("recomposition", "recommended")).toEqual({
      ok: true,
      value: 0,
    });
    expect(getTargetWeightChangeRate("weight_loss", "recommended")).toEqual({
      ok: true,
      value: -0.005,
    });
    expect(getTargetWeightChangeRate("weight_gain", "faster")).toEqual({
      ok: true,
      value: 0.005,
    });
    expect(getTargetWeightChangeRate("maintenance", "recommended")).toEqual({
      ok: true,
      value: 0,
    });
  });

  it("rejects Faster on maintenance and unknown goals", () => {
    const faster = getTargetWeightChangeRate("recomposition", "faster");
    expect(faster.ok).toBe(false);
    if (!faster.ok) {
      expect(faster.error.field).toBe("pace");
    }
    const unknown = getTargetWeightChangeRate("general_fitness", "recommended");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error.field).toBe("goalType");
    }
  });
});

describe("180 lb hand-calculated examples", () => {
  it("recommended cut is -0.90 lb/week and -450 kcal/day", () => {
    const change = calculateTargetWeightChangePerWeek({
      bodyWeightLb: 180,
      targetRatePerWeek: -0.005,
    });
    expect(change).toEqual({ ok: true, value: -0.9 });
    const daily = calculateDailyCalorieAdjustment({
      targetWeightChangeLbPerWeek: -0.9,
    });
    expect(daily).toEqual({ ok: true, value: -450 });
  });

  it("faster cut is -1.35 lb/week and -675 kcal/day", () => {
    const change = calculateTargetWeightChangePerWeek({
      bodyWeightLb: 180,
      targetRatePerWeek: -0.0075,
    });
    expect(change.ok).toBe(true);
    if (!change.ok) {
      return;
    }
    // 180 * 0.0075 is not a dyadic rational; keep full precision and compare closely.
    expect(change.value).toBeCloseTo(-1.35, 12);
    const dailyFromExact = calculateDailyCalorieAdjustment({
      targetWeightChangeLbPerWeek: -1.35,
    });
    expect(dailyFromExact).toEqual({ ok: true, value: -675 });
    const dailyFromFullPrecision = calculateDailyCalorieAdjustment({
      targetWeightChangeLbPerWeek: change.value,
    });
    expect(dailyFromFullPrecision.ok).toBe(true);
    if (dailyFromFullPrecision.ok) {
      expect(dailyFromFullPrecision.value).toBeCloseTo(-675, 10);
    }
  });

  it("recommended bulk is +0.45 lb/week and +225 kcal/day", () => {
    const change = calculateTargetWeightChangePerWeek({
      bodyWeightLb: 180,
      targetRatePerWeek: 0.0025,
    });
    expect(change).toEqual({ ok: true, value: 0.45 });
    const daily = calculateDailyCalorieAdjustment({
      targetWeightChangeLbPerWeek: 0.45,
    });
    expect(daily).toEqual({ ok: true, value: 225 });
  });

  it("faster bulk is +0.90 lb/week and +450 kcal/day", () => {
    const change = calculateTargetWeightChangePerWeek({
      bodyWeightLb: 180,
      targetRatePerWeek: 0.005,
    });
    expect(change).toEqual({ ok: true, value: 0.9 });
    const daily = calculateDailyCalorieAdjustment({
      targetWeightChangeLbPerWeek: 0.9,
    });
    expect(daily).toEqual({ ok: true, value: 450 });
  });
});

describe("TDEE 2700 targets", () => {
  it("applies the 180 lb adjustments to a 2700 TDEE", () => {
    expect(
      calculateGoalAdjustedCalorieTarget({ tdeeKcal: 2700, dailyCalorieAdjustment: -450 }),
    ).toEqual({ ok: true, value: 2250 });
    expect(
      calculateGoalAdjustedCalorieTarget({ tdeeKcal: 2700, dailyCalorieAdjustment: -675 }),
    ).toEqual({ ok: true, value: 2025 });
    expect(
      calculateGoalAdjustedCalorieTarget({ tdeeKcal: 2700, dailyCalorieAdjustment: 225 }),
    ).toEqual({ ok: true, value: 2925 });
    expect(
      calculateGoalAdjustedCalorieTarget({ tdeeKcal: 2700, dailyCalorieAdjustment: 450 }),
    ).toEqual({ ok: true, value: 3150 });
    expect(
      calculateGoalAdjustedCalorieTarget({ tdeeKcal: 2700, dailyCalorieAdjustment: 0 }),
    ).toEqual({ ok: true, value: 2700 });
  });
});

describe("kg/lb equivalence", () => {
  it("produces the same 180 lb recommended cut from kilograms", () => {
    const fromLb = calculateTargetWeightChangePerWeek({
      bodyWeightLb: 180,
      targetRatePerWeek: -0.005,
    });
    const fromKg = calculateTargetWeightChangePerWeek({
      bodyWeightLb: kgToLb(lbToKg(180)),
      targetRatePerWeek: -0.005,
    });
    expect(fromLb.ok && fromKg.ok).toBe(true);
    if (fromLb.ok && fromKg.ok) {
      expect(fromKg.value).toBeCloseTo(fromLb.value, 10);
      expect(fromLb.value).toBe(-0.9);
    }
  });
});

describe("createCalorieTarget", () => {
  it("builds an auditable recommended cut from kg weight", () => {
    const result = createCalorieTarget({
      goalType: "fat_loss",
      pace: "recommended",
      weightKg: lbToKg(180),
      tdeeKcal: 2700,
      asOf,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.targetLbPerWeek).toBeCloseTo(-0.9, 10);
    expect(result.value.dailyCalorieAdjustment).toBe(-450);
    expect(result.value.targetCalories).toBe(2250);
    expect(result.value.policyVersion).toBe("weight-change-policy-v1");
    expect(result.value.inputSnapshot.pace).toBe("recommended");
    expect(result.value.inputSnapshot.weightChangeDirection).toBe("weight_loss");
  });

  it("uses 0% for maintenance and does not require Faster", () => {
    const result = createCalorieTarget({
      goalType: "recomposition",
      pace: "recommended",
      weightKg: lbToKg(180),
      tdeeKcal: 2700,
      asOf,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetRatePerWeek).toBe(0);
      expect(result.value.targetCalories).toBe(2700);
      expect(result.value.dailyCalorieAdjustment).toBe(0);
    }
  });

  it("rejects invalid weight, TDEE, pace, and target calories", () => {
    expect(
      createCalorieTarget({
        goalType: "fat_loss",
        pace: "recommended",
        weightKg: 0,
        tdeeKcal: 2700,
      }).ok,
    ).toBe(false);
    expect(
      createCalorieTarget({
        goalType: "fat_loss",
        pace: "recommended",
        weightKg: lbToKg(180),
        tdeeKcal: Number.NaN,
      }).ok,
    ).toBe(false);
    expect(
      createCalorieTarget({
        goalType: "recomposition",
        pace: "faster",
        weightKg: lbToKg(180),
        tdeeKcal: 2700,
      }).ok,
    ).toBe(false);
    expect(
      calculateGoalAdjustedCalorieTarget({
        tdeeKcal: 2700,
        dailyCalorieAdjustment: Number.POSITIVE_INFINITY,
      }).ok,
    ).toBe(false);
  });
});

describe("calorie target history", () => {
  it("appends a new target without mutating the previous record", () => {
    const first = createCalorieTarget({
      goalType: "fat_loss",
      pace: "recommended",
      weightKg: lbToKg(180),
      tdeeKcal: 2700,
      asOf,
    });
    const second = createCalorieTarget({
      goalType: "fat_loss",
      pace: "faster",
      weightKg: lbToKg(180),
      tdeeKcal: 2700,
      asOf: new Date("2026-09-08T01:00:00.000Z"),
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    const history = appendCalorieTarget([], first.value);
    const snapshot = structuredClone(history[0]);
    const next = appendCalorieTarget(history, second.value);
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(snapshot);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(snapshot);
    expect(selectCurrentCalorieTarget(next)?.pace).toBe("faster");
    expect(selectCurrentCalorieTarget(next)?.targetCalories).toBe(2025);
  });
});

describe("calorie target display", () => {
  it("formats pace, rate, and calorie target labels", () => {
    expect(calorieTargetGoalLabel("fat_loss")).toBe("Lose weight");
    expect(calorieTargetPaceLabel("recommended")).toBe("Recommended");
    expect(formatPercentPerWeek(-0.005)).toBe("0.50%");
    expect(formatPercentPerWeek(-0.0075)).toBe("0.75%");
    expect(formatPercentPerWeek(0.0025)).toBe("0.25%");
    expect(formatPercentPerWeek(0.005)).toBe("0.50%");
    expect(formatLbPerWeek(-0.9)).toBe("~0.9 lb/week");
    expect(formatLbPerWeek(0.45)).toBe("~0.45 lb/week");
    expect(formatTargetCaloriesPerDay(2250)).toBe("2,250 kcal/day");
    expect(calorieTargetPaceLabel("faster")).toBe("Faster");
    expect(paceOptionsForGoal("fat_loss").map((option) => option.detail)).toEqual([
      "0.50% body weight/week",
      "0.75% body weight/week",
    ]);
    expect(paceOptionsForGoal("muscle_gain").map((option) => option.detail)).toEqual([
      "0.25% body weight/week",
      "0.50% body weight/week",
    ]);
    expect(paceOptionsForGoal("recomposition")).toEqual([]);
  });
});
