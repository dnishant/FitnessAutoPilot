import { describe, expect, it } from "vitest";
import {
  createRecipeResolutionPreviewUiState,
  dedupeProofRows,
  formatRecipeResolutionFailureLine,
  humanizeRecipeResolutionError,
  slotUsageCountForCandidate,
} from "./recipe-resolution-preview";

describe("recipe resolution preview helpers", () => {
  it("loads the PLAN-008 Simple strategy with 6 unique candidates and 14 slots", () => {
    const state = createRecipeResolutionPreviewUiState();
    expect(state.uniqueCandidateIds).toHaveLength(6);
    expect(state.candidates).toHaveLength(6);
    expect(slotUsageCountForCandidate(state.strategy, "tikka-chicken")).toBe(4);
    expect(slotUsageCountForCandidate(state.strategy, "kerala-beef-fry")).toBe(3);
    expect(slotUsageCountForCandidate(state.strategy, "quick-fresh-dinner")).toBe(1);
    const rows = dedupeProofRows(state.strategy, null);
    expect(rows.find((r) => r.label === "Weekly meal slots")?.value).toBe("14");
    expect(rows.find((r) => r.label === "Unique candidates")?.value).toBe("6");
  });

  it("humanizes partial weekly failures and formats failure lines", () => {
    expect(
      humanizeRecipeResolutionError({
        message: "2 of 6 unique candidates failed recipe resolution.",
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
