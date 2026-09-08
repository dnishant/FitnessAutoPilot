import { describe, expect, it } from "vitest";
import { kgToLb, lbToKg } from "../common/units";
import {
  appendNutritionTarget,
  calculateCarbohydrateTarget,
  calculateFatTarget,
  calculateMacroTargets,
  calculateProteinTarget,
  FAT_GRAMS_PER_KG,
  formatMacroGrams,
  formatNutritionCalories,
  MACRO_POLICY_VERSION,
  nutritionTargetExplanationRows,
  PROTEIN_GRAMS_PER_LB,
  selectCurrentNutritionTarget,
} from "./macros";

const asOf = new Date("2026-09-08T00:00:00.000Z");

describe("macro-policy-v1 constants", () => {
  it("uses the versioned V1 protein and fat rates", () => {
    expect(PROTEIN_GRAMS_PER_LB).toBe(1.0);
    expect(FAT_GRAMS_PER_KG).toBe(0.7);
    expect(MACRO_POLICY_VERSION).toBe("macro-policy-v1");
  });
});

describe("calculateProteinTarget", () => {
  it("assigns 150 g from 150 lb", () => {
    expect(calculateProteinTarget({ weightLb: 150 })).toEqual({ ok: true, value: 150 });
  });

  it("assigns 180 g from 180 lb", () => {
    expect(calculateProteinTarget({ weightLb: 180 })).toEqual({ ok: true, value: 180 });
  });

  it("produces the same protein from the equivalent kilogram weight", () => {
    const fromLb = calculateProteinTarget({ weightLb: 180 });
    const fromKg = calculateProteinTarget({ weightKg: lbToKg(180) });
    expect(fromLb.ok && fromKg.ok).toBe(true);
    if (fromLb.ok && fromKg.ok) {
      expect(fromKg.value).toBeCloseTo(fromLb.value, 10);
      expect(fromLb.value).toBe(180);
    }
  });

  it("fails for missing or invalid weight", () => {
    expect(calculateProteinTarget({}).ok).toBe(false);
    const missing = calculateProteinTarget({});
    if (!missing.ok) {
      expect(missing.error.code).toBe("missing_weight");
    }
    const zero = calculateProteinTarget({ weightLb: 0 });
    expect(zero.ok).toBe(false);
    if (!zero.ok) {
      expect(zero.error.code).toBe("invalid_weight");
    }
    const negative = calculateProteinTarget({ weightKg: -10 });
    expect(negative.ok).toBe(false);
    if (!negative.ok) {
      expect(negative.error.code).toBe("invalid_weight");
    }
  });
});

describe("calculateFatTarget", () => {
  it("assigns 56 g from 80 kg", () => {
    expect(calculateFatTarget({ weightKg: 80 })).toEqual({ ok: true, value: 56 });
  });

  it("keeps 81.65 kg × 0.7 at full internal precision", () => {
    const result = calculateFatTarget({ weightKg: 81.65 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeCloseTo(57.155, 10);
    }
  });

  it("fails for invalid weight", () => {
    const missing = calculateFatTarget({});
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe("missing_weight");
    }
    const invalid = calculateFatTarget({ weightKg: Number.NaN });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.code).toBe("invalid_weight");
    }
  });
});

describe("calculateCarbohydrateTarget", () => {
  it("gives remaining calories to carbohydrates for the 180 lb / 2250 example", () => {
    const weightKg = lbToKg(180);
    const proteinGrams = 180;
    const fatGrams = weightKg * 0.7;
    const proteinCalories = 180 * 4;
    const fatCalories = fatGrams * 9;
    const remainingCalories = 2250 - proteinCalories - fatCalories;
    const carbohydrateGrams = remainingCalories / 4;

    expect(weightKg).toBeCloseTo(81.6466266, 6);
    expect(proteinCalories).toBe(720);
    expect(fatGrams).toBeCloseTo(57.15263862, 6);
    expect(fatCalories).toBeCloseTo(514.37374758, 6);
    expect(remainingCalories).toBeCloseTo(1015.62625242, 6);
    expect(carbohydrateGrams).toBeCloseTo(253.906563105, 6);

    const result = calculateCarbohydrateTarget({
      targetCalories: 2250,
      proteinGrams,
      fatGrams,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.proteinCalories).toBe(720);
    expect(result.value.fatCalories).toBeCloseTo(514.37, 2);
    expect(result.value.remainingCalories).toBeCloseTo(1015.63, 2);
    expect(result.value.carbohydrateGrams).toBeCloseTo(253.91, 2);
  });

  it("fails when protein and fat exceed the calorie budget", () => {
    const result = calculateCarbohydrateTarget({
      targetCalories: 800,
      proteinGrams: 180,
      fatGrams: 57,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("macro_budget_exceeded");
    }
  });
});

describe("calculateMacroTargets", () => {
  it("returns a deterministic auditable 180 lb / 2250 target", () => {
    const first = calculateMacroTargets({
      targetCalories: 2250,
      weightLb: 180,
      asOf,
    });
    const second = calculateMacroTargets({
      targetCalories: 2250,
      weightLb: 180,
      asOf,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(first.value).toEqual(second.value);
    expect(first.value.proteinGrams).toBe(180);
    expect(first.value.fatGrams).toBeCloseTo(lbToKg(180) * 0.7, 12);
    expect(first.value.carbohydrateGrams).toBeCloseTo(253.906563105, 6);
    expect(first.value.macroPolicyVersion).toBe("macro-policy-v1");
    expect(first.value.inputSnapshot).toEqual({
      bodyWeightKg: lbToKg(180),
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
  });

  it("reconciles macros with the calorie target at full precision", () => {
    const result = calculateMacroTargets({
      targetCalories: 2250,
      weightKg: lbToKg(180),
      asOf,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const reconstructed =
      result.value.proteinGrams * 4 +
      result.value.carbohydrateGrams * 4 +
      result.value.fatGrams * 9;
    expect(reconstructed).toBeCloseTo(2250, 10);
    expect(result.value.inputSnapshot.bodyWeightUnit).toBe("kg");
  });

  it("fails a negative carbohydrate budget without shrinking protein or fat", () => {
    const result = calculateMacroTargets({
      targetCalories: 800,
      weightLb: 180,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("macro_budget_exceeded");
    }
  });

  it("fails missing or invalid calorie targets and non-finite results", () => {
    const missing = calculateMacroTargets({ weightLb: 180 });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe("missing_calorie_target");
    }
    const invalid = calculateMacroTargets({
      targetCalories: 0,
      weightLb: 180,
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.code).toBe("invalid_calorie_target");
    }
    const infinite = calculateMacroTargets({
      targetCalories: Number.POSITIVE_INFINITY,
      weightLb: 180,
    });
    expect(infinite.ok).toBe(false);
    if (!infinite.ok) {
      expect(infinite.error.code).toBe("invalid_calorie_target");
    }
  });
});

describe("nutrition target history", () => {
  it("appends a new target without mutating the previous record", () => {
    const first = calculateMacroTargets({
      targetCalories: 2250,
      weightLb: 180,
      asOf,
    });
    const second = calculateMacroTargets({
      targetCalories: 2025,
      weightLb: 180,
      asOf: new Date("2026-09-08T01:00:00.000Z"),
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    const history = appendNutritionTarget([], first.value);
    const snapshot = structuredClone(history[0]);
    const next = appendNutritionTarget(history, second.value);
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(snapshot);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(snapshot);
    expect(selectCurrentNutritionTarget(next)?.targetCalories).toBe(2025);
  });
});

describe("nutrition target display", () => {
  it("formats whole calories and grams and explains the policy", () => {
    expect(formatNutritionCalories(2250)).toBe("2,250 kcal");
    expect(formatMacroGrams(180)).toBe("180 g");
    expect(formatMacroGrams(57.15263862)).toBe("57 g");
    expect(formatMacroGrams(253.906563105)).toBe("254 g");
    expect(nutritionTargetExplanationRows()).toEqual([
      { label: "Protein", value: "1 g per lb of body weight" },
      { label: "Fat", value: "0.7 g per kg of body weight" },
      { label: "Carbohydrates", value: "Remaining calories after protein and fat" },
    ]);
    expect(kgToLb(lbToKg(180))).toBeCloseTo(180, 10);
  });
});
