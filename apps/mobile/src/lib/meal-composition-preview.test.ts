import { describe, expect, it } from "vitest";
import {
  createMealCompositionPreviewUiState,
  plateLines,
  roleCheck,
  sourceLabel,
  weeklyCompositionSummaryRows,
} from "./meal-composition-preview";
import type { WeeklyMealConceptResult } from "@fitness-autopilot/contracts";

describe("meal-composition-preview helpers", () => {
  it("seeds ranked PLAN-008 simple candidates", () => {
    const state = createMealCompositionPreviewUiState();
    expect(state.rankedCandidates).toHaveLength(6);
    expect(state.targetCalories).toBe(2250);
    expect(state.rankedCandidates.some((item) => item.candidate.name.includes("Tacos"))).toBe(true);
  });

  it("formats role checks and sources", () => {
    expect(roleCheck("primary protein", true)).toContain("✓");
    expect(roleCheck("carb", false)).toContain("✗");
    expect(sourceLabel("composition_engine")).toMatch(/Composition engine/);
  });

  it("summarizes weekly diagnostics including fiber policy and v2 prompt", () => {
    const result: WeeklyMealConceptResult = {
      conceptsByCandidateId: {},
      uniqueCandidateIds: [],
      sharedComponentKeys: [],
      componentReuse: [],
      conceptCount: 0,
      diagnostics: {
        weeklyMealSlots: 14,
        rankedCandidates: 10,
        uniqueCandidatesComposed: 6,
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
        componentComplexitySignal: "mixed",
      },
      fiberTarget: {
        fiberGrams: 31.5,
        targetCalories: 2250,
        policyVersion: "fiber-policy-v1",
        displayFiberGrams: 32,
      },
      policyVersions: {
        mealComposition: "meal-composition-v1",
        prompt: "meal-composition-v2",
        fiber: "fiber-policy-v1",
      },
    };
    const rows = weeklyCompositionSummaryRows(result);
    expect(rows.some((r) => r.label === "Daily fiber target" && r.value.includes("32 g"))).toBe(
      true,
    );
    expect(rows.some((r) => r.value.includes("fiber-policy-v1"))).toBe(true);
    expect(rows.some((r) => r.value.includes("meal-composition-v2"))).toBe(true);
    expect(rows.some((r) => r.label === "Unique candidates composed" && r.value === "6")).toBe(true);
  });

  it("lists plate lines from a concept", () => {
    expect(
      plateLines({
        candidateId: "tikka-chicken",
        name: "Chicken Tikka",
        main: {
          componentId: "main",
          role: "main",
          name: "Chicken Tikka",
          relationship: "intrinsic",
          source: "candidate",
          reason: "main",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:chicken tikka",
        },
        components: [
          {
            componentId: "rice",
            role: "carbohydrate",
            name: "Basmati Rice",
            relationship: "required_companion",
            source: "composition_engine",
            reason: "starch",
            definitionKind: "atomic_food",
            normalizedComponentKey: "carbohydrate:basmati rice",
          },
        ],
        compositionProfile: {
          hasPrimaryProtein: true,
          hasMeaningfulCarbohydrate: true,
          hasMeaningfulVegetableOrFruit: false,
          hasMeaningfulFiberSource: false,
          hasSauceOrMoistureComponent: false,
          addedComponentRoles: ["carbohydrate"],
        },
        metadata: {
          promptVersion: "meal-composition-v2",
          policyVersion: "meal-composition-v1",
          createdAt: "2026-09-16T00:00:00.000Z",
        },
      }),
    ).toEqual(["Chicken Tikka", "Basmati Rice"]);
  });
});
