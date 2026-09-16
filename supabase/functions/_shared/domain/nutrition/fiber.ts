import type { FiberTarget } from "../../contracts/index.ts";
import { FIBER_POLICY_VERSION } from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";
import { roundGrams, roundHalfUp } from "../common/rounding.ts";

export const FIBER_POLICY_NAME = "fiber-policy" as const;
export { FIBER_POLICY_VERSION };

/**
 * fiber-policy-v1: approximately 14 g dietary fiber per 1000 kcal of daily energy target.
 * Evidence-aligned default (IOM/AMDR-style energy-proportional guidance).
 * Daily target only — not a per-meal quota.
 */
export const FIBER_GRAMS_PER_1000_KCAL = 14;

export type FiberTargetError = {
  code: "missing_calorie_target" | "invalid_calorie_target" | "invalid_fiber_result";
  message: string;
};

export type FiberTargetDraft = FiberTarget & {
  policyName: typeof FIBER_POLICY_NAME;
  fiberGramsPer1000Kcal: typeof FIBER_GRAMS_PER_1000_KCAL;
};

/**
 * Deterministic daily fiber target from calorie target.
 * Internal precision retained in fiberGrams; displayFiberGrams uses whole-gram rounding.
 */
export function calculateFiberTarget(input: {
  targetCalories?: number | null;
}): Result<FiberTargetDraft, FiberTargetError> {
  if (input.targetCalories === null || input.targetCalories === undefined) {
    return err({
      code: "missing_calorie_target",
      message: "A daily calorie target is required to calculate fiber.",
    });
  }
  if (!Number.isFinite(input.targetCalories) || input.targetCalories <= 0) {
    return err({
      code: "invalid_calorie_target",
      message: "Daily calorie target must be a finite number greater than 0.",
    });
  }

  const fiberGrams = (input.targetCalories * FIBER_GRAMS_PER_1000_KCAL) / 1000;
  if (!Number.isFinite(fiberGrams) || fiberGrams < 0) {
    return err({
      code: "invalid_fiber_result",
      message: "Fiber target must be a finite non-negative number.",
    });
  }

  return ok({
    fiberGrams,
    targetCalories: input.targetCalories,
    policyVersion: FIBER_POLICY_VERSION,
    displayFiberGrams: roundGrams(fiberGrams),
    policyName: FIBER_POLICY_NAME,
    fiberGramsPer1000Kcal: FIBER_GRAMS_PER_1000_KCAL,
  });
}

export function formatFiberGrams(grams: number): string {
  return `${roundGrams(grams).toLocaleString("en-US")} g`;
}

export const FIBER_POLICY_EXPLANATION = `${FIBER_GRAMS_PER_1000_KCAL} g fiber per 1000 kcal (${FIBER_POLICY_VERSION})`;

/** Round fiber for display explanations (1 decimal when useful). */
export function roundFiberForDisplay(grams: number): number {
  return roundHalfUp(grams, 1);
}
