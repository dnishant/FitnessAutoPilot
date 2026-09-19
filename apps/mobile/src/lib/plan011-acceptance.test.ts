import { describe, expect, it } from "vitest";
import { generateConsumerWeeklyPlan } from "./consumer-plan-generate";
import type { PlanGenerationApis } from "./consumer-plan-generate";
import {
  formatGroceryListDiagnostics,
  formatMealPrepDiagnostics,
  formatValidationReportForDiagnostics,
} from "@fitness-autopilot/domain";

describe("PLAN-011/012/013 fresh local acceptance", () => {
  it("finalizes a local Generate My Plan week with groceries and meal prep", async () => {
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
      cookingPreferences: {
        userId: "00000000-0000-4000-8000-000000000011",
        prepFrequency: "once_weekly",
        maxPrepSessionMinutes: 90,
        cookingStyle: "ready_lunch_fresh_dinner",
        maxFinishMinutes: 15,
        useDinnerPrepForNextLunch: false,
        createdAt: "2026-09-17T00:00:00.000Z",
        updatedAt: "2026-09-17T00:00:00.000Z",
      },
      discoverCulinaryCandidates: async () => ({ ok: false, error: "unused" }),
      rankCulinaryCandidates: async () => ({ ok: false, error: "unused" }),
      composeMealConcepts: async () => ({ ok: false, error: "unused" }),
      generateRankedWeeklyStrategy: async () => ({ ok: false, error: "unused" }),
      resolveWeeklyRecipes: async () => ({ ok: false, error: "unused" }),
    };

    const result = await generateConsumerWeeklyPlan(apis);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.plan.validationReport!;
    expect(report.status).toBe("finalized");
    expect(result.plan.personalizedWeeklyPlan?.finalization?.validationStatus).toBe("finalized");

    const structuralErrors = [
      report.hardFailureCount,
      report.structuralRules.filter((r) => r.severity === "hard_failure").length,
    ];
    expect(structuralErrors.every((n) => n === 0)).toBe(true);

    let preferredCal = 0;
    let acceptableCal = 0;
    let outsideHard = 0;
    let preferredPro = 0;
    let hardPro = 0;

    for (const day of report.days) {
      const abs = Math.abs(day.deviations?.calorieDeltaPct ?? 0);
      if (abs <= 0.05) preferredCal += 1;
      else if (abs <= 0.1) acceptableCal += 1;
      else outsideHard += 1;

      const proRatio =
        day.target.proteinGrams > 0
          ? (day.recomputedTotal?.proteinGrams ?? 0) / day.target.proteinGrams
          : 1;
      if (proRatio >= 0.95) preferredPro += 1;
      if (proRatio >= 0.9) hardPro += 1;
    }

    const grocery = result.plan.groceryList;
    expect(grocery?.available).toBe(true);
    expect(grocery?.aggregationPolicyVersion).toBe("grocery-aggregation-policy-v1");
    expect(grocery?.diagnostics?.droppedRequirementCount).toBe(0);
    expect(grocery?.diagnostics?.duplicateRequirementCount).toBe(0);
    const groceryItems = grocery!.sections.flatMap((s) => s.items);
    expect(groceryItems.length).toBeGreaterThan(0);
    expect(
      groceryItems.every(
        (item) =>
          item.provenance.length > 0 ||
          item.sourceRecipeIds.length > 0 ||
          item.sourceMealInstanceIds.length > 0,
      ),
    ).toBe(true);

    const prep = result.plan.mealPrepPlan;
    expect(prep).toBeTruthy();
    expect(prep!.generatedPlanId).toBe(result.plan.generatedPlanId);
    expect(prep!.available).toBe(true);
    expect(prep!.policyVersion).toBe("meal-prep-policy-v1");
    expect(prep!.weeklyRequirements.length).toBe(4);
    expect(prep!.tasks.some((t) => t.type === "mise_en_place")).toBe(false);
    expect(prep!.tasks.some((t) => t.type === "advance_prep" || t.type === "cook")).toBe(true);
    expect(prep!.storageAssignments.length).toBe(12);
    expect(prep!.reconciliation.dependencyCycles).toBe(0);
    expect(prep!.reconciliation.missingDependencies).toBe(0);
    expect(prep!.reconciliation.orphanPrepTasks).toBe(0);
    expect(prep!.reconciliation.orphanFutureActions).toBe(0);
    expect(prep!.reconciliation.stalePlanLinks).toBe(0);

    console.log("\n=== PLAN-011 ACCEPTANCE ===");
    console.log(formatValidationReportForDiagnostics(report));
    console.log(
      JSON.stringify(
        {
          preferredCal,
          acceptableCal,
          outsideHardOrExtended: outsideHard,
          preferredPro,
          hardPro,
          weeklyCalDeltaPct: report.weekly.deviations?.calorieDeltaPct,
          weeklyProDeltaPct: report.weekly.deviations?.proteinDeltaPct,
          warnings: report.warningCount,
          repairs: report.repairAttempts,
          finalStatus: report.status,
        },
        null,
        2,
      ),
    );
    console.log("\n=== PLAN-012 GROCERY ===");
    console.log(formatGroceryListDiagnostics(grocery!));
    console.log(
      JSON.stringify(
        {
          itemCount: groceryItems.length,
          sourceRequirements: grocery!.diagnostics?.sourceIngredientRequirementCount,
          aggregated: grocery!.diagnostics?.aggregatedItemCount,
          dropped: grocery!.diagnostics?.droppedRequirementCount,
          duplicates: grocery!.diagnostics?.duplicateRequirementCount,
          excludedNonPurchased: grocery!.diagnostics?.excludedNonPurchasedCount,
          incompatibleLines: grocery!.diagnostics?.incompatibleQuantityLineCount,
        },
        null,
        2,
      ),
    );

    console.log("\n=== PLAN-013 MEAL PREP ===");
    console.log(formatMealPrepDiagnostics(prep!));
    console.log("\n--- Core meals ---");
    for (const req of prep!.weeklyRequirements) {
      console.log(
        JSON.stringify(
          {
            name: req.name,
            weeklyInstances: req.weeklyInstanceCount,
            requiredOutput: req.requiredOutputServings,
            referenceYield: req.referenceYieldServings,
            plannedCookOutput: req.plannedCookOutputServings,
            expectedExcess: req.expectedExcessServings,
            prepIntent: req.prepIntent,
          },
          null,
          2,
        ),
      );
    }
    console.log("\n--- Guided steps (no mise phase) ---");
    for (const id of prep!.sessionTaskOrder) {
      const t = prep!.tasks.find((x) => x.id === id);
      if (!t) continue;
      console.log(
        `• [${t.type}] ${t.title} active=${t.durationMinutes}m passive=${t.passiveMinutes ?? 0}m ingredients=${t.ingredients.length}`,
      );
    }
    console.log("\n--- Advance prep ---");
    for (const t of prep!.tasks.filter((x) => x.type === "advance_prep")) {
      console.log(
        `• ${t.title} active=${t.durationMinutes}m passive=${t.passiveMinutes ?? 0}m deps=${t.dependencies.join("|") || "none"}`,
      );
    }
    console.log("\n--- Cook schedule ---");
    for (const id of prep!.sessionTaskOrder) {
      const t = prep!.tasks.find((x) => x.id === id);
      if (!t || (t.type !== "cook" && t.type !== "advance_prep")) continue;
      console.log(
        `t+${t.timing?.startOffsetMinutes ?? "?"} ${t.title} active=${t.durationMinutes} passive=${t.passiveMinutes ?? 0} equip=${(t.equipment ?? []).join(",")}`,
      );
    }
    console.log(
      `hands-on=${prep!.schedule.handsOnMinutes}m elapsed=${prep!.schedule.elapsedMinutes}m naive=${prep!.schedule.naiveSummedMinutes}m`,
    );
    console.log("\n--- Storage ---");
    for (const a of prep!.storageAssignments) {
      console.log(
        `${a.day} ${a.mealType} ${a.mealName}: ${a.disposition} (${a.reason.slice(0, 80)})`,
      );
    }
    console.log("\n--- Future actions ---");
    for (const a of prep!.futureActions) {
      console.log(
        `${a.scheduledDay} ${a.scheduledWindow}: ${a.type} → ${a.mealName ?? a.mealInstanceId} (~${a.durationMinutes ?? 0}m)`,
      );
    }
    console.log("\n--- Reconciliation ---");
    console.log(JSON.stringify(prep!.reconciliation, null, 2));

    expect(result.plan.meals?.every((m) => m.personalizationStatus !== "blocked")).toBe(true);
  });
});
