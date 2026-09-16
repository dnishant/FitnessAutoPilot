import { describe, expect, it } from "vitest";
import {
  createMealCompositionPreviewUiState,
  roleCheck,
  sourceLabel,
  weeklyCompositionSummaryRows,
} from "./meal-composition-preview";
import type { WeeklyMealCompositionResult } from "@fitness-autopilot/contracts";

describe("meal-composition-preview helpers", () => {
  it("seeds six PLAN-009 recipes", () => {
    const state = createMealCompositionPreviewUiState();
    expect(state.recipes).toHaveLength(6);
    expect(state.targetCalories).toBe(2250);
  });

  it("formats role checks and sources", () => {
    expect(roleCheck("primary protein", true)).toContain("✓");
    expect(roleCheck("carb", false)).toContain("✗");
    expect(sourceLabel("composition_engine")).toMatch(/Composition engine/);
  });

  it("summarizes weekly diagnostics including fiber policy", () => {
    const result: WeeklyMealCompositionResult = {
      mealsByCandidateId: {},
      uniqueCandidateIds: [],
      sharedComponentsByKey: {},
      mealCount: 0,
      slotCount: 14,
      diagnostics: {
        weeklyMealSlots: 14,
        uniqueMainRecipes: 6,
        compositionProviderCalls: 4,
        mealsAlreadyComplete: 2,
        mealsWithAddedComponents: 4,
        totalAddedComponents: 8,
        uniqueAddedComponents: 5,
        reusedComponents: 2,
        atomicComponents: 3,
        recipeComponents: 5,
        unresolvedComponents: 0,
      },
      fiberTarget: {
        fiberGrams: 31.5,
        targetCalories: 2250,
        policyVersion: "fiber-policy-v1",
        displayFiberGrams: 32,
      },
      policyVersions: {
        mealComposition: "meal-composition-v1",
        prompt: "meal-composition-v1",
        fiber: "fiber-policy-v1",
      },
    };
    const rows = weeklyCompositionSummaryRows(result);
    expect(rows.some((r) => r.label === "Daily fiber target" && r.value.includes("32 g"))).toBe(
      true,
    );
    expect(rows.some((r) => r.value.includes("fiber-policy-v1"))).toBe(true);
  });
});
