import { describe, expect, it } from "vitest";
import {
  MacroTargetInputSnapshotSchema,
  NutritionTargetSchema,
} from "./nutrition";

describe("NutritionTargetSchema", () => {
  it("accepts a macro-policy-v1 target with an auditable snapshot", () => {
    const snapshot = MacroTargetInputSnapshotSchema.parse({
      bodyWeightKg: 81.6466266,
      bodyWeightLb: 180,
      bodyWeightUnit: "lb",
      targetCalories: 2250,
      proteinGramsPerLb: 1,
      fatGramsPerKg: 0.7,
      proteinKcalPerGram: 4,
      carbKcalPerGram: 4,
      fatKcalPerGram: 9,
      policyVersion: "macro-policy-v1",
    });
    const result = NutritionTargetSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111117",
      userId: "11111111-1111-1111-1111-111111111111",
      goalId: "11111111-1111-1111-1111-111111111115",
      calorieTargetId: "11111111-1111-1111-1111-111111111114",
      estimatedMaintenanceCalories: 2700,
      targetCalories: 2250,
      proteinG: 180,
      fatG: 57.15263862,
      fatMinG: 57.15263862,
      fatMaxG: 57.15263862,
      carbohydrateG: 253.906563105,
      desiredRateKgPerWeek: -0.408233133,
      algorithmName: "nutrition-target",
      algorithmVersion: "macro-policy-v1",
      macroPolicyName: "macro-policy",
      macroPolicyVersion: "macro-policy-v1",
      inputSnapshot: snapshot,
      validFrom: "2026-09-08T00:00:00.000Z",
      createdAt: "2026-09-08T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
