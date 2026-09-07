import { describe, expect, it } from "vitest";
import { makeProfile } from "@fitness-autopilot/test-fixtures";
import {
  calculateNutritionTarget,
  NUTRITION_TARGET_ALGORITHM_VERSION,
  NutritionTargetV1Policy,
} from "./target.js";

const asOf = new Date("2026-09-07T00:00:00.000Z");

describe("calculateNutritionTarget", () => {
  it("returns deterministic output with algorithm version", () => {
    const profile = makeProfile();
    const a = calculateNutritionTarget(
      profile,
      { id: "55555555-5555-5555-5555-555555555555", goalType: "fat_loss" },
      { asOf },
    );
    const b = calculateNutritionTarget(
      profile,
      { id: "55555555-5555-5555-5555-555555555555", goalType: "fat_loss" },
      { asOf },
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value).toEqual(b.value);
      expect(a.value.algorithmVersion).toBe(NUTRITION_TARGET_ALGORITHM_VERSION);
      expect(a.value.proteinG).toBeGreaterThanOrEqual(0);
      expect(a.value.carbohydrateG).toBeGreaterThanOrEqual(0);
      expect(a.value.fatMinG).toBeGreaterThanOrEqual(0);
      expect(a.value.targetCalories).toBeGreaterThan(0);
    }
  });

  it("applies calorie deficit for fat_loss consistently", () => {
    const profile = makeProfile();
    const loss = calculateNutritionTarget(
      profile,
      { id: "55555555-5555-5555-5555-555555555555", goalType: "fat_loss" },
      { asOf },
    );
    const maintain = calculateNutritionTarget(
      profile,
      { id: "55555555-5555-5555-5555-555555555555", goalType: "general_fitness" },
      { asOf },
    );
    expect(loss.ok && maintain.ok).toBe(true);
    if (loss.ok && maintain.ok) {
      expect(loss.value.targetCalories).toBeLessThan(maintain.value.targetCalories);
      expect(loss.value.targetCalories).toBeLessThan(
        loss.value.estimatedMaintenanceCalories,
      );
    }
  });

  it("reconciles macro calories within tolerance", () => {
    const result = calculateNutritionTarget(
      makeProfile(),
      { id: "55555555-5555-5555-5555-555555555555", goalType: "recomposition" },
      { asOf },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fatMid = (result.value.fatMinG + result.value.fatMaxG) / 2;
    const macroKcal =
      result.value.proteinG * NutritionTargetV1Policy.proteinKcalPerG +
      result.value.carbohydrateG * NutritionTargetV1Policy.carbKcalPerG +
      fatMid * NutritionTargetV1Policy.fatKcalPerG;
    const tolerance = Math.max(30, result.value.targetCalories * 0.02);
    expect(Math.abs(macroKcal - result.value.targetCalories)).toBeLessThanOrEqual(tolerance);
  });

  it("fails controlled when safety restricted", () => {
    const result = calculateNutritionTarget(
      makeProfile({ safetyRestrictions: ["pregnancy"] }),
      { id: "55555555-5555-5555-5555-555555555555", goalType: "fat_loss" },
      { asOf },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("restricted");
    }
  });

  it("returns invalid_input for bad weight", () => {
    const result = calculateNutritionTarget(
      makeProfile({ weightKg: -5 }),
      { id: "55555555-5555-5555-5555-555555555555", goalType: "fat_loss" },
      { asOf },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_input");
    }
  });
});
