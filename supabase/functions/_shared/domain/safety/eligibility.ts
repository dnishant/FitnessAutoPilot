import type { SafetyRestriction } from "../../contracts/index.ts";
import { ok, err, type Result } from "../../validation/index.ts";

export type RecommendationEligibility =
  | { status: "allowed" }
  | { status: "restricted"; reasons: SafetyRestriction[] };

export type SafetyFailure = {
  code: "restricted";
  reasons: SafetyRestriction[];
  message: string;
};

export function evaluateRecommendationEligibility(
  safetyRestrictions: readonly SafetyRestriction[],
): RecommendationEligibility {
  if (safetyRestrictions.length === 0) {
    return { status: "allowed" };
  }
  return { status: "restricted", reasons: [...safetyRestrictions] };
}

export function requireAllowedEligibility(
  safetyRestrictions: readonly SafetyRestriction[],
): Result<true, SafetyFailure> {
  const eligibility = evaluateRecommendationEligibility(safetyRestrictions);
  if (eligibility.status === "allowed") {
    return ok(true);
  }
  return err({
    code: "restricted",
    reasons: eligibility.reasons,
    message:
      "Autonomous calorie prescription is blocked due to safety restrictions. Seek professional guidance.",
  });
}
