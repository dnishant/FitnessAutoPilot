import { describe, expect, it } from "vitest";
import { CalorieTargetSchema, CalorieTargetValidationPolicy } from "./calorie-target";

describe("CalorieTargetValidationPolicy", () => {
  it("exposes named bounds rather than medical claims", () => {
    expect(CalorieTargetValidationPolicy.weightKg.min).toBeGreaterThan(0);
    expect(CalorieTargetValidationPolicy.tdeeKcal.min).toBeGreaterThan(0);
    expect(CalorieTargetValidationPolicy.targetCalories.min).toBeGreaterThan(0);
  });
});

describe("CalorieTargetSchema", () => {
  it("accepts an auditable starting target", () => {
    const result = CalorieTargetSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111114",
      userId: "11111111-1111-1111-1111-111111111111",
      goalId: "11111111-1111-1111-1111-111111111115",
      tdeeEstimateId: "11111111-1111-1111-1111-111111111116",
      tdeeKcal: 2700,
      bodyWeightKg: 81.65,
      bodyWeightLb: 180,
      pace: "recommended",
      targetRatePerWeek: -0.005,
      targetLbPerWeek: -0.9,
      weeklyCalorieAdjustment: -3150,
      dailyCalorieAdjustment: -450,
      targetCalories: 2250,
      policyName: "weight-change-policy",
      policyVersion: "weight-change-policy-v1",
      inputSnapshot: {
        goalType: "fat_loss",
        weightChangeDirection: "weight_loss",
        pace: "recommended",
        weightKg: 81.65,
        weightLb: 180,
        tdeeKcal: 2700,
        targetRatePerWeek: -0.005,
        policyVersion: "weight-change-policy-v1",
      },
      createdAt: "2026-09-08T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
