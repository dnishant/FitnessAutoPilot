import { describe, expect, it } from "vitest";
import {
  createRecipeResolutionPreviewUiState,
  dedupeProofRows,
  formatRecipeResolutionFailureLine,
  humanizeRecipeResolutionError,
  slotUsageCountForCandidate,
} from "./recipe-resolution-preview";

describe("recipe resolution preview helpers", () => {
  it("loads the V1 Simple strategy with 4 unique candidates and 12 slots", () => {
    const state = createRecipeResolutionPreviewUiState();
    expect(state.uniqueCandidateIds).toHaveLength(4);
    expect(state.candidates).toHaveLength(4);
    expect(slotUsageCountForCandidate(state.strategy, "tikka-chicken")).toBe(3);
    expect(slotUsageCountForCandidate(state.strategy, "kerala-beef-fry")).toBe(3);
    expect(slotUsageCountForCandidate(state.strategy, "jamaican-jerk-chicken")).toBe(3);
    expect(slotUsageCountForCandidate(state.strategy, "thai-green-curry")).toBe(3);
    const rows = dedupeProofRows(state.strategy, null);
    expect(rows.find((r) => r.label === "Weekly meal slots")?.value).toBe("12");
    expect(rows.find((r) => r.label === "Unique candidates")?.value).toBe("4");
  });

  it("humanizes partial weekly failures and formats failure lines", () => {
    expect(
      humanizeRecipeResolutionError({
        message: "2 of 4 unique candidates failed recipe resolution.",
        code: "PARTIAL_WEEKLY_RESOLUTION_FAILURE",
      }),
    ).toContain("Failures below");
    expect(
      formatRecipeResolutionFailureLine({
        candidateId: "tikka-chicken",
        candidateName: "Chicken Tikka",
        failureReason: "Invalid enum value",
        code: "RECIPE_SCHEMA_VALIDATION_FAILED",
      }),
    ).toContain("tikka-chicken");
  });
});
