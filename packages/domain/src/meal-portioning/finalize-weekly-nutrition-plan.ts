import type {
  ConsumerWeeklyPlan,
  PersonalizedWeeklyNutritionPlan,
  WeeklyPlanValidationReport,
} from "@fitness-autopilot/contracts";
import { MAX_FINALIZATION_REPAIR_ATTEMPTS } from "./validation-policy";
import {
  validateWeeklyNutritionPlan,
  type ValidateWeeklyNutritionPlanContext,
  type WeeklyNutritionPlanValidationOutcome,
} from "./validate-weekly-nutrition-plan";
import { repairWeeklyNutritionPlan } from "./repair-weekly-nutrition-plan";
import type { PersonalizeWeeklyNutritionPlanInput } from "./personalize";
import { personalizeWeeklyNutritionPlan } from "./personalize";

export type FinalizeWeeklyNutritionPlanInput = {
  /** Initial PLAN-010 input — used for bounded repair re-personalization. */
  personalizeInput: PersonalizeWeeklyNutritionPlanInput;
  /** Optional precomputed PLAN-010 output; otherwise personalize runs once. */
  personalizedWeeklyPlan?: PersonalizedWeeklyNutritionPlan;
  generationContext?: Omit<ValidateWeeklyNutritionPlanContext, "repairAttempts">;
  maxRepairAttempts?: number;
};

export type FinalizeWeeklyNutritionPlanResult =
  | {
      ok: true;
      status: "finalized";
      personalizedWeeklyPlan: PersonalizedWeeklyNutritionPlan;
      report: WeeklyPlanValidationReport;
      repairAttempts: number;
    }
  | {
      ok: false;
      status: "rejected" | "repair_exhausted";
      personalizedWeeklyPlan: PersonalizedWeeklyNutritionPlan;
      report: WeeklyPlanValidationReport;
      repairAttempts: number;
      reasons: Array<{ ruleId: string; message: string }>;
    };

/**
 * Bounded PLAN-010 → PLAN-011 → (repair → PLAN-010) → PLAN-011 loop.
 *
 * Structural hard failures never trigger repair.
 * Nutrition repairable failures may re-enter PLAN-010 up to MAX_FINALIZATION_REPAIR_ATTEMPTS.
 */
export function finalizeWeeklyNutritionPlan(
  input: FinalizeWeeklyNutritionPlanInput,
): FinalizeWeeklyNutritionPlanResult {
  const maxAttempts = input.maxRepairAttempts ?? MAX_FINALIZATION_REPAIR_ATTEMPTS;
  let personalized =
    input.personalizedWeeklyPlan ?? personalizeWeeklyNutritionPlan(input.personalizeInput);
  let repairAttempts = 0;
  let lastOutcome: WeeklyNutritionPlanValidationOutcome | null = null;

  while (true) {
    const outcome = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: personalized,
      generationContext: {
        generatedPlanId:
          input.generationContext?.generatedPlanId ?? personalized.generatedPlanId,
        expectedDays: input.generationContext?.expectedDays,
        completeMealsByCandidateId:
          input.generationContext?.completeMealsByCandidateId ??
          input.personalizeInput.completeMealsByCandidateId,
        repairAttempts,
        validatedAt: input.generationContext?.validatedAt,
      },
    });
    lastOutcome = outcome;

    if (outcome.status === "finalized") {
      return {
        ok: true,
        status: "finalized",
        personalizedWeeklyPlan: outcome.finalizedPlan,
        report: outcome.report,
        repairAttempts,
      };
    }

    if (outcome.status === "rejected") {
      return {
        ok: false,
        status: "rejected",
        personalizedWeeklyPlan: personalized,
        report: outcome.report,
        repairAttempts,
        reasons: outcome.reasons.map((r) => ({
          ruleId: r.ruleId,
          message: r.message,
        })),
      };
    }

    // repair_required
    if (repairAttempts >= maxAttempts) {
      return {
        ok: false,
        status: "repair_exhausted",
        personalizedWeeklyPlan: personalized,
        report: {
          ...outcome.report,
          status: "rejected",
          overallSeverity: "hard_failure",
        },
        repairAttempts,
        reasons: outcome.repairRequest.days.flatMap((d) =>
          d.ruleIds.map((ruleId) => ({
            ruleId,
            message: outcome.repairRequest.message,
          })),
        ),
      };
    }

    personalized = repairWeeklyNutritionPlan({
      personalizeInput: {
        ...input.personalizeInput,
        repairDayOverrides: input.personalizeInput.repairDayOverrides,
      },
      repairRequest: outcome.repairRequest,
      previousPlan: personalized,
    });
    repairAttempts += 1;
  }

  // Unreachable — satisfy control flow analyzers.
  void lastOutcome;
  throw new Error("finalizeWeeklyNutritionPlan exited unexpectedly");
}

/**
 * Attach a finalized PLAN-011 prescription onto a consumer weekly plan.
 * Activation remains atomic at the caller: only persist/publish when ok.
 */
export function attachFinalizedWeeklyPlan(
  consumerPlan: ConsumerWeeklyPlan,
  finalized: Extract<FinalizeWeeklyNutritionPlanResult, { ok: true }>,
): ConsumerWeeklyPlan {
  return {
    ...consumerPlan,
    status: "ready",
    generationStage: "complete",
    personalizedWeeklyPlan: finalized.personalizedWeeklyPlan,
    validationReport: finalized.report,
  };
}

export function formatValidationReportForDiagnostics(
  report: WeeklyPlanValidationReport,
): string {
  const lines: string[] = [
    `PLAN-011 status: ${report.status}`,
    `policy: ${report.policyVersion}`,
    `severity: ${report.overallSeverity}`,
    `warnings: ${report.warningCount}  repairable: ${report.repairableFailureCount}  hard: ${report.hardFailureCount}`,
    `repairAttempts: ${report.repairAttempts}`,
    "",
    "Weekly:",
    `  target kcal=${report.weekly.target.caloriesKcal}  actual=${report.weekly.actual?.caloriesKcal ?? "—"}`,
    `  calorie Δ%=${(((report.weekly.deviations?.calorieDeltaPct ?? 0) * 100)).toFixed(1)}%`,
    `  protein Δ%=${(((report.weekly.deviations?.proteinDeltaPct ?? 0) * 100)).toFixed(1)}%`,
  ];
  for (const day of report.days) {
    const d = day.deviations;
    lines.push(
      `${day.day}: target=${day.target.caloriesKcal} actual=${day.recomputedTotal?.caloriesKcal ?? day.total?.caloriesKcal ?? "—"} ` +
        `calΔ%=${(((d?.calorieDeltaPct ?? 0) * 100)).toFixed(1)}% ` +
        `proΔ%=${(((d?.proteinDeltaPct ?? 0) * 100)).toFixed(1)}% ` +
        `rules=${day.rules.filter((r) => r.severity !== "pass").map((r) => r.ruleId).join(",") || "ok"}`,
    );
  }
  if (report.structuralRules.length > 0) {
    lines.push("", "Structural:");
    for (const r of report.structuralRules) {
      lines.push(`  [${r.severity}] ${r.ruleId}: ${r.message}`);
    }
  }
  return lines.join("\n");
}
