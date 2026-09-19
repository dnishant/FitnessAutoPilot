import type {
  MealPrepIssue,
  MealPrepPhaseProgress,
  MealPrepPlan,
  PrepTask,
} from "../../contracts/index.ts";
import {
  CULINARY_PREP_INTERPRETATION_VERSION,
  MEAL_PREP_POLICY_VERSION,
} from "../../contracts/index.ts";
import { consolidateNearbyPrep } from "./consolidate-mise.ts";
import { extractTasksForRequirement } from "./extract-tasks.ts";
import type { BuildMealPrepPlanInput, BuildMealPrepPlanResult } from "./policy.ts";
import { reconcilePrepQuantities } from "./reconcile.ts";
import { schedulePrepTasks } from "./schedule.ts";
import { buildStorageAndFutureActions } from "./storage.ts";
import { validateTaskGraph } from "./validate-graph.ts";
import { deriveWeeklyCookingRequirements } from "./weekly-requirements.ts";

/**
 * PLAN-013 entry point: build a meal-prep execution plan from finalized truth.
 *
 * Deterministic quantities, graph, schedule, storage.
 * Culinary interpretation version stamps the heuristic prep extraction policy.
 */
export function buildMealPrepPlan(input: BuildMealPrepPlanInput): BuildMealPrepPlanResult {
  const plan = input.personalizedWeeklyPlan;
  const issues: MealPrepIssue[] = [];

  if (!plan.finalization || plan.finalization.validationStatus !== "finalized") {
    return {
      ok: false,
      code: "MISSING_FINALIZED_PLAN",
      message: "Meal prep requires a PLAN-011 finalized weekly nutrition plan.",
      issues: [
        {
          code: "MISSING_FINALIZED_PLAN",
          message: "Plan is not finalized.",
          preservable: false,
        },
      ],
    };
  }

  if (input.groceryList?.generatedPlanId && input.groceryList.generatedPlanId !== plan.generatedPlanId) {
    issues.push({
      code: "STALE_PLAN_LINK",
      message: "Grocery list generatedPlanId does not match finalized plan.",
      preservable: false,
    });
  }

  const { requirements, issues: reqIssues } = deriveWeeklyCookingRequirements({
    personalizedWeeklyPlan: plan,
    recipesByCandidateId: input.recipesByCandidateId,
    coreRepertoire: input.coreRepertoire,
  });
  issues.push(...reqIssues);

  if (requirements.length === 0) {
    return {
      ok: false,
      code: "EMPTY_PLAN",
      message: "No weekly cooking requirements could be derived.",
      issues,
    };
  }

  const cookingStyle = input.cookingPreferences?.cookingStyle;
  const maxFinishMinutes = input.cookingPreferences?.maxFinishMinutes;

  let tasks: PrepTask[] = [];
  for (const req of requirements) {
    const recipe = input.recipesByCandidateId[req.candidateId];
    if (!recipe) {
      issues.push({
        code: "MISSING_PREP_PROFILE",
        message: `Missing resolved recipe for core meal ${req.coreMealId}.`,
        coreMealId: req.coreMealId,
        preservable: false,
      });
      continue;
    }
    if (!recipe.supportedPrepModes?.length) {
      issues.push({
        code: "MISSING_PREP_PROFILE",
        message: `Recipe ${recipe.name} has no supportedPrepModes.`,
        coreMealId: req.coreMealId,
        recipeId: recipe.recipeId,
        preservable: true,
      });
    }
    tasks.push(
      ...extractTasksForRequirement({
        requirement: req,
        recipe,
        cookingStyle,
        maxFinishMinutes,
      }),
    );
  }

  // Drop any legacy mise tasks; nearby consolidation runs after schedule (has timing).
  tasks = tasks.filter((t) => t.type !== "mise_en_place");

  const graph = validateTaskGraph(tasks);
  issues.push(...graph.issues);

  if (!graph.ok) {
    const hard = issues.filter((i) => !i.preservable);
    return {
      ok: false,
      code: "INVALID_TASK_GRAPH",
      message: hard[0]?.message ?? "Prep task graph is invalid.",
      issues,
    };
  }

  const scheduled = schedulePrepTasks(tasks);
  issues.push(...scheduled.issues);
  tasks = consolidateNearbyPrep(scheduled.tasks);

  const prepSessionDay = input.prepSessionDay ?? input.coreRepertoire?.flexibleDay ?? "sunday";

  const storage = buildStorageAndFutureActions({
    requirements,
    recipesByCandidateId: input.recipesByCandidateId,
    coreRepertoire: input.coreRepertoire,
    prepSessionDay,
    tasks,
  });
  issues.push(...storage.issues);

  // Enrich portion_and_store instructions with per-portion dispositions.
  tasks = enrichStoreTasks(tasks, storage.assignments);

  const unsupportedStorage = storage.issues.filter(
    (i) => i.code === "UNSAFE_STORAGE_HORIZON" || i.code === "MISSING_STORAGE_PROFILE",
  ).length;

  const instanceIds = new Set(
    requirements.flatMap((r) => r.mealInstanceIds),
  );
  const orphanFutureActions = storage.futureActions.filter(
    (a) => !instanceIds.has(a.mealInstanceId),
  ).length;

  const stalePlanLinks = issues.filter((i) => i.code === "STALE_PLAN_LINK").length;

  const reconciliation = reconcilePrepQuantities({
    requirements,
    recipesByCandidateId: input.recipesByCandidateId,
    tasks,
    groceryList: input.groceryList,
    missingDependencies: graph.missingDependencies,
    dependencyCycles: graph.cycles,
    unsupportedStorageAssignments: unsupportedStorage,
    orphanFutureActions,
    stalePlanLinks,
  });

  const hardFailures = issues.filter((i) => !i.preservable);
  const available = hardFailures.length === 0;

  if (!available && hardFailures.some((i) => i.code === "UNSAFE_STORAGE_HORIZON")) {
    // Still return a plan marked unavailable when only storage horizon fails preservable=false —
    // consumer UI can show failure state with detail.
  }

  const mealPrepPlan: MealPrepPlan = {
    generatedPlanId: plan.generatedPlanId,
    weekStart: plan.weekStart,
    weekEnd: plan.weekEnd,
    policyVersion: MEAL_PREP_POLICY_VERSION,
    culinaryInterpretationVersion: CULINARY_PREP_INTERPRETATION_VERSION,
    lifecycle: available ? "ready" : "failed",
    available,
    generatedAt: input.generatedAt ?? plan.generatedAt,
    prepSessionDay,
    cookingStyle: cookingStyle,
    prepFrequency: input.cookingPreferences?.prepFrequency,
    maxPrepSessionMinutes: input.cookingPreferences?.maxPrepSessionMinutes ?? undefined,
    maxFinishMinutes: maxFinishMinutes ?? undefined,
    coreMealCount: requirements.length,
    portionCount: requirements.reduce((s, r) => s + r.weeklyInstanceCount, 0),
    coveredDayCount: input.coreRepertoire?.coveredDays.length ?? 6,
    weeklyRequirements: requirements,
    tasks,
    sessionTaskOrder: scheduled.sessionTaskOrder,
    storageAssignments: storage.assignments,
    futureActions: storage.futureActions,
    schedule: scheduled.schedule,
    reconciliation,
    issues,
    phaseProgress: buildPhaseProgress(tasks),
  };

  if (!available) {
    return {
      ok: false,
      code: hardFailures[0]?.code ?? "INVALID_TASK_GRAPH",
      message: hardFailures[0]?.message ?? "Meal prep plan failed validation.",
      issues,
      mealPrepPlan,
    };
  }

  return { ok: true, mealPrepPlan, issues };
}

function enrichStoreTasks(
  tasks: PrepTask[],
  assignments: MealPrepPlan["storageAssignments"],
): PrepTask[] {
  return tasks.map((t) => {
    if (t.type !== "portion_and_store") return t;
    const related = assignments.filter((a) => t.coreMealIds.includes(a.coreMealId));
    if (related.length === 0) return t;
    return {
      ...t,
      instructions: [
        ...t.instructions,
        ...related.map(
          (a) =>
            `${capitalize(a.day)} ${a.mealType}: ${a.disposition.replace(/_/g, " ")} (${a.personalServings.toFixed(1)} servings)`,
        ),
      ],
    };
  });
}

function buildPhaseProgress(tasks: PrepTask[]): MealPrepPhaseProgress {
  const count = (type: PrepTask["type"]) => tasks.filter((t) => t.type === type).length;
  return {
    mise_en_place: { total: count("mise_en_place"), completed: 0 },
    advance_prep: { total: count("advance_prep"), completed: 0 },
    cook: { total: count("cook"), completed: 0 },
    portion_and_store: { total: count("portion_and_store"), completed: 0 },
    fresh_finish: { total: count("fresh_finish"), completed: 0 },
  };
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function formatMealPrepDiagnostics(plan: MealPrepPlan): string {
  const lines = [
    `PLAN-013 meal prep (${plan.lifecycle})`,
    `policy=${plan.policyVersion} culinary=${plan.culinaryInterpretationVersion}`,
    `meals=${plan.coreMealCount} portions=${plan.portionCount} days=${plan.coveredDayCount}`,
    `elapsed=${plan.schedule.elapsedMinutes}m hands-on=${plan.schedule.handsOnMinutes}m naive=${plan.schedule.naiveSummedMinutes}m`,
    `tasks=${plan.tasks.length} future=${plan.futureActions.length} issues=${plan.issues.length}`,
    `reconciliation: mismatches=${plan.reconciliation.weeklyRecipeDemandMismatches} dupes=${plan.reconciliation.duplicatedIngredientDemand} missing=${plan.reconciliation.missingIngredientDemand} cycles=${plan.reconciliation.dependencyCycles} excess=${plan.reconciliation.intentionalExcessServingsTotal}`,
  ];
  return lines.join("\n");
}
