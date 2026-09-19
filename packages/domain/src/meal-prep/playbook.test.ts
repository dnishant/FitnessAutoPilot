import { describe, expect, it } from "vitest";
import type { MealPrepPlan, PrepTask } from "@fitness-autopilot/contracts";
import { buildSessionPlaybook, formatTimelineMark } from "./playbook";

function task(overrides: Partial<PrepTask> & Pick<PrepTask, "id" | "title">): PrepTask {
  return {
    type: "cook",
    durationMinutes: 10,
    dependencies: [],
    recipeIds: [],
    coreMealIds: ["m1"],
    mealInstanceIds: [],
    ingredients: [],
    equipment: [],
    canRunInParallel: true,
    requiresAttention: false,
    instructions: ["Do the thing."],
    ...overrides,
  };
}

function minimalPlan(tasks: PrepTask[], order: string[]): MealPrepPlan {
  return {
    generatedPlanId: "plan_test",
    weekStart: "2026-09-15",
    weekEnd: "2026-09-21",
    policyVersion: "meal-prep-policy-v1",
    culinaryInterpretationVersion: "culinary-prep-interpretation-v1",
    prepSessionDay: "sunday",
    coreMealCount: 1,
    portionCount: 2,
    coveredDayCount: 6,
    weeklyRequirements: [],
    tasks,
    sessionTaskOrder: order,
    storageAssignments: [],
    futureActions: [],
    schedule: {
      elapsedMinutes: 45,
      handsOnMinutes: 30,
      naiveSummedMinutes: 60,
      scheduledTaskCount: order.length,
    },
    phaseProgress: {
      mise_en_place: { total: 0, completed: 0 },
      advance_prep: { total: 0, completed: 0 },
      cook: { total: order.length, completed: 0 },
      portion_and_store: { total: 0, completed: 0 },
      fresh_finish: { total: 0, completed: 0 },
    },
    reconciliation: {
      weeklyRecipeDemandMismatches: 0,
      duplicatedIngredientDemand: 0,
      missingIngredientDemand: 0,
      orphanPrepTasks: 0,
      missingDependencies: 0,
      dependencyCycles: 0,
      unsupportedStorageAssignments: 0,
      orphanFutureActions: 0,
      stalePlanLinks: 0,
      intentionalExcessServingsTotal: 0,
    },
    issues: [],
    lifecycle: "ready",
    available: true,
    generatedAt: new Date().toISOString(),
    maxPrepSessionMinutes: 90,
  };
}

describe("buildSessionPlaybook", () => {
  it("orders steps by startOffsetMinutes and labels the clock", () => {
    const a = task({
      id: "t-late",
      title: "Store portions",
      type: "portion_and_store",
      timing: { startOffsetMinutes: 30, endOffsetMinutes: 45, parallelTaskIds: [] },
    });
    const b = task({
      id: "t-early",
      title: "Chop onions",
      type: "mise_en_place",
      durationMinutes: 15,
      timing: { startOffsetMinutes: 0, endOffsetMinutes: 15, parallelTaskIds: ["t-mid"] },
    });
    const c = task({
      id: "t-mid",
      title: "Simmer sauce",
      type: "advance_prep",
      durationMinutes: 5,
      passiveMinutes: 20,
      timing: { startOffsetMinutes: 10, endOffsetMinutes: 35, parallelTaskIds: ["t-early"] },
    });

    const playbook = buildSessionPlaybook(minimalPlan([a, b, c], ["t-early", "t-mid", "t-late"]));
    expect(playbook.steps.map((s) => s.task.id)).toEqual(["t-early", "t-mid", "t-late"]);
    expect(playbook.steps[0]!.clockStart).toBe("0:00");
    expect(playbook.steps[0]!.clockEnd).toBe("0:15");
    expect(playbook.steps[1]!.whileThisRuns.map((t) => t.id)).toContain("t-early");
    expect(playbook.allottedMinutes).toBe(90);
    expect(playbook.overAllottedMinutes).toBe(0);
    expect(playbook.parallelSavingsMinutes).toBe(15);
  });

  it("flags when schedule exceeds allotted session time", () => {
    const t = task({
      id: "t1",
      title: "Long cook",
      timing: { startOffsetMinutes: 0, endOffsetMinutes: 100, parallelTaskIds: [] },
    });
    const plan = minimalPlan([t], ["t1"]);
    plan.schedule.elapsedMinutes = 100;
    plan.maxPrepSessionMinutes = 60;
    const playbook = buildSessionPlaybook(plan);
    expect(playbook.overAllottedMinutes).toBe(40);
  });

  it("formatTimelineMark pads minutes", () => {
    expect(formatTimelineMark(0)).toBe("0:00");
    expect(formatTimelineMark(65)).toBe("1:05");
  });
});
