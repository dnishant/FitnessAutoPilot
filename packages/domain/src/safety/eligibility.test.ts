import { describe, expect, it } from "vitest";
import { evaluateRecommendationEligibility, requireAllowedEligibility } from "./eligibility.js";

describe("safety eligibility", () => {
  it("allows empty restrictions", () => {
    expect(evaluateRecommendationEligibility([])).toEqual({ status: "allowed" });
    expect(requireAllowedEligibility([]).ok).toBe(true);
  });

  it("restricts when any flag is present", () => {
    const result = evaluateRecommendationEligibility(["pregnancy"]);
    expect(result).toEqual({ status: "restricted", reasons: ["pregnancy"] });
    const gated = requireAllowedEligibility(["eating_disorder"]);
    expect(gated.ok).toBe(false);
    if (!gated.ok) {
      expect(gated.error.code).toBe("restricted");
    }
  });
});
