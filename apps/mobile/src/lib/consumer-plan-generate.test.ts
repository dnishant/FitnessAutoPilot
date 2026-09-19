import { describe, expect, it } from "vitest";
import { generateConsumerWeeklyPlan, assertNoUnresolvedRecipesOnReadyPlan } from "./consumer-plan-generate";
import type { PlanGenerationApis } from "./consumer-plan-generate";
import { GENERATION_STAGE_ORDER } from "./consumer-plan-view";

describe("PLAN-010/011 consumer generation orchestration", () => {
  it("runs personalization + PLAN-011 finalization in local Generate My Plan flow", async () => {
    const stages: string[] = [];
    const apis: PlanGenerationApis = {
      useLocalMode: true,
      nutritionTarget: {
        id: "00000000-0000-4000-8000-000000000010",
        userId: "00000000-0000-4000-8000-000000000011",
        goalId: "00000000-0000-4000-8000-000000000012",
        estimatedMaintenanceCalories: 2500,
        targetCalories: 2200,
        proteinG: 160,
        fatMinG: 60,
        fatMaxG: 80,
        fatG: 70,
        carbohydrateG: 220,
        fiberG: 30,
        desiredRateKgPerWeek: -0.5,
        algorithmName: "nutrition-target",
        algorithmVersion: "nutrition-target-v1",
        inputSnapshot: {},
        validFrom: "2026-09-17T00:00:00.000Z",
        createdAt: "2026-09-17T00:00:00.000Z",
      },
      mealPreferences: null,
      cookingPreferences: null,
      discoverCulinaryCandidates: async () => ({
        ok: false,
        error: "unused in local mode",
      }),
      rankCulinaryCandidates: async () => ({
        ok: false,
        error: "unused in local mode",
      }),
      composeMealConcepts: async () => ({
        ok: false,
        error: "unused in local mode",
      }),
      generateRankedWeeklyStrategy: async () => ({
        ok: false,
        error: "unused in local mode",
      }),
      resolveWeeklyRecipes: async () => ({
        ok: false,
        error: "unused in local mode",
      }),
    };

    const result = await generateConsumerWeeklyPlan(apis, (stage) => {
      stages.push(stage);
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(stages).toContain("personalizing_portions");
    expect(stages).toContain("finalizing_plan");
    expect(GENERATION_STAGE_ORDER).toContain("finalizing_plan");
    expect(result.plan.generatedPlanId).toBeTruthy();
    expect(result.plan.personalizedWeeklyPlan).toBeTruthy();
    expect(result.plan.personalizedWeeklyPlan?.finalization?.validationStatus).toBe(
      "finalized",
    );
    expect(result.plan.validationReport?.policyVersion).toBe("nutrition-validation-policy-v1");
    expect(result.plan.validationReport?.status).toBe("finalized");
    expect(result.plan.meals?.length).toBe(12);
    const withNutrition = result.plan.meals?.filter((m) => m.personalizedNutrition);
    expect((withNutrition?.length ?? 0) > 0).toBe(true);
    const sample = withNutrition![0]!;
    expect(sample.components.some((c) => c.amount != null && c.unit)).toBe(true);
    expect(sample.mealInstanceId).toContain(result.plan.generatedPlanId!);
    // No fixture meal-name gate — whatever the strategy selected is personalized.
    expect(sample.name.length).toBeGreaterThan(0);
    // PLAN-012: grocery list derived from finalized plan (no fixtures / no LLM).
    expect(result.plan.groceryList?.available).toBe(true);
    expect(result.plan.groceryList?.aggregationPolicyVersion).toBe(
      "grocery-aggregation-policy-v1",
    );
    expect(result.plan.groceryList?.generatedPlanId).toBe(result.plan.generatedPlanId);
    const groceryItems = result.plan.groceryList!.sections.flatMap((s) => s.items);
    expect(groceryItems.length).toBeGreaterThan(0);
    expect(result.plan.groceryList?.diagnostics?.droppedRequirementCount).toBe(0);

    // PLAN-013: meal prep derived from finalized plan + recipes.
    expect(stages).toContain("building_meal_prep");
    expect(GENERATION_STAGE_ORDER).toContain("building_meal_prep");
    expect(result.plan.mealPrepPlan).toBeTruthy();
    expect(result.plan.mealPrepPlan?.generatedPlanId).toBe(result.plan.generatedPlanId);
    expect(result.plan.mealPrepPlan?.policyVersion).toBe("meal-prep-policy-v1");
    expect(result.plan.mealPrepPlan?.available).toBe(true);
    expect(result.plan.mealPrepPlan?.tasks.some((t) => t.type === "mise_en_place")).toBe(false);
    expect(
      result.plan.mealPrepPlan?.tasks.some(
        (t) => t.type === "advance_prep" || t.type === "cook",
      ),
    ).toBe(true);
    expect(result.plan.mealPrepPlan?.reconciliation.dependencyCycles).toBe(0);
    expect(result.plan.mealPrepPlan?.reconciliation.missingDependencies).toBe(0);
  });

  it("does not leak Plan A instance ids into a second generation", async () => {
    const apis: PlanGenerationApis = {
      useLocalMode: true,
      nutritionTarget: null,
      mealPreferences: null,
      cookingPreferences: null,
      discoverCulinaryCandidates: async () => ({ ok: false, error: "unused" }),
      rankCulinaryCandidates: async () => ({ ok: false, error: "unused" }),
      composeMealConcepts: async () => ({ ok: false, error: "unused" }),
      generateRankedWeeklyStrategy: async () => ({ ok: false, error: "unused" }),
      resolveWeeklyRecipes: async () => ({ ok: false, error: "unused" }),
    };
    const first = await generateConsumerWeeklyPlan(apis);
    const second = await generateConsumerWeeklyPlan(apis);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.plan.generatedPlanId).not.toBe(second.plan.generatedPlanId);
    expect(first.plan.meals?.[0]?.mealInstanceId).not.toBe(
      second.plan.meals?.[0]?.mealInstanceId,
    );
  });

  it("refuses ready activation when unique candidates lack resolved recipes", () => {
    const check = assertNoUnresolvedRecipesOnReadyPlan({
      uniqueCandidateIds: ["a", "b"],
      recipesByCandidateId: {
        a: {
          recipeId: "r1",
          candidateId: "a",
        } as never,
      },
    });
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.missingCandidateIds).toEqual(["b"]);
  });
});
