import { describe, expect, it } from "vitest";
import { generateConsumerWeeklyPlan } from "./consumer-plan-generate";
import type { PlanGenerationApis } from "./consumer-plan-generate";
import { formatValidationReportForDiagnostics } from "@fitness-autopilot/domain";

describe("PLAN-011 fresh local acceptance", () => {
  it("finalizes a local Generate My Plan week and reports day/week nutrition", async () => {
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
      else outsideHard += 1; // may still finalize via best_feasible extended band

      const proRatio =
        day.target.proteinGrams > 0
          ? (day.recomputedTotal?.proteinGrams ?? 0) / day.target.proteinGrams
          : 1;
      if (proRatio >= 0.95) preferredPro += 1;
      if (proRatio >= 0.9) hardPro += 1;
    }

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

    expect(result.plan.meals?.every((m) => m.personalizationStatus !== "blocked")).toBe(true);
  });
});
