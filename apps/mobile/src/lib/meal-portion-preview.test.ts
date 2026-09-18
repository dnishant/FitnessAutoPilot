import { describe, expect, it } from "vitest";
import {
  createMealPortionPreviewUiState,
  parseDeveloperTestIntent,
  runMealPortionPreview,
} from "./meal-portion-preview";

describe("meal-portion-preview helpers", () => {
  it("parses developer test intent with optional macros", () => {
    const state = createMealPortionPreviewUiState();
    const intent = parseDeveloperTestIntent(state);
    expect(intent.isDeveloperTestIntent).toBe(true);
    expect(intent.targetCaloriesKcal).toBe(600);
    expect(intent.targetProteinGrams).toBe(50);
  });

  it("solves Chicken Tikka fixture without network calls", () => {
    const outcome = runMealPortionPreview(createMealPortionPreviewUiState());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.status).not.toBe("blocked");
    expect(outcome.result.portions.length).toBe(4);
    expect(outcome.diagnosticsText).toContain("meal-portion-policy-v1");
  });
});
