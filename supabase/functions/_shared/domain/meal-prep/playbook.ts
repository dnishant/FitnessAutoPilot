import type { MealPrepPlan, PrepTask, PrepTaskType } from "../../contracts/index.ts";

/**
 * Consumer-facing timed playbook for one prep session.
 * Offsets are minutes from session start (t=0), matching PrepTask.timing.
 */

export type SessionPlaybookStep = {
  stepNumber: number;
  task: PrepTask;
  startOffsetMinutes: number;
  endOffsetMinutes: number;
  /** When active work ends (before passive wait). */
  activeEndMinutes: number;
  clockStart: string;
  clockEnd: string;
  clockActiveEnd: string;
  phaseLabel: string;
  /** Other session tasks that overlap this step's window. */
  whileThisRuns: PrepTask[];
  isPassiveHeavy: boolean;
};

export type SessionPlaybook = {
  steps: SessionPlaybookStep[];
  elapsedMinutes: number;
  handsOnMinutes: number;
  allottedMinutes: number | null;
  overAllottedMinutes: number;
  parallelSavingsMinutes: number;
};

const PHASE_LABELS: Record<PrepTaskType, string> = {
  mise_en_place: "Prep",
  advance_prep: "Prep",
  cook: "Cook",
  portion_and_store: "Store",
  fresh_finish: "Finish later",
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Compact timeline label: 0:00, 1:05, … */
export function formatTimelineMark(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}:${pad2(rem)}`;
}

export function formatDurationLabel(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} hr` : `${h} hr ${rem} min`;
}

/**
 * Build a chronological step-by-step play from a scheduled MealPrepPlan.
 * Session tasks only (excludes fresh_finish).
 */
export function buildSessionPlaybook(plan: MealPrepPlan): SessionPlaybook {
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const orderIndex = new Map(plan.sessionTaskOrder.map((id, i) => [id, i]));

  const sessionTasks: PrepTask[] = [];
  for (const id of plan.sessionTaskOrder) {
    const t = byId.get(id);
    if (t && t.type !== "fresh_finish") sessionTasks.push(t);
  }

  const sorted = [...sessionTasks].sort((a, b) => {
    const aStart = a.timing?.startOffsetMinutes ?? orderIndex.get(a.id) ?? 0;
    const bStart = b.timing?.startOffsetMinutes ?? orderIndex.get(b.id) ?? 0;
    if (aStart !== bStart) return aStart - bStart;
    return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
  });

  const steps: SessionPlaybookStep[] = sorted.map((task, index) => {
    const start = task.timing?.startOffsetMinutes ?? 0;
    const end =
      task.timing?.endOffsetMinutes ??
      start + task.durationMinutes + (task.passiveMinutes ?? 0);
    const activeEnd = start + task.durationMinutes;
    const parallelIds = new Set(task.timing?.parallelTaskIds ?? []);
    const whileThisRuns: PrepTask[] = [];
    for (const id of parallelIds) {
      const peer = byId.get(id);
      if (peer && peer.id !== task.id) whileThisRuns.push(peer);
    }
    whileThisRuns.sort(
      (a, b) =>
        (a.timing?.startOffsetMinutes ?? 0) - (b.timing?.startOffsetMinutes ?? 0),
    );

    return {
      stepNumber: index + 1,
      task,
      startOffsetMinutes: start,
      endOffsetMinutes: end,
      activeEndMinutes: activeEnd,
      clockStart: formatTimelineMark(start),
      clockEnd: formatTimelineMark(end),
      clockActiveEnd: formatTimelineMark(activeEnd),
      phaseLabel: PHASE_LABELS[task.type] ?? task.type,
      whileThisRuns,
      isPassiveHeavy:
        (task.passiveMinutes ?? 0) > 0 &&
        (task.passiveMinutes ?? 0) >= task.durationMinutes,
    };
  });

  const allotted = plan.maxPrepSessionMinutes ?? null;
  const elapsed = plan.schedule.elapsedMinutes;
  const overAllotted =
    allotted != null && allotted > 0 ? Math.max(0, elapsed - allotted) : 0;
  const parallelSavings = Math.max(
    0,
    plan.schedule.naiveSummedMinutes - plan.schedule.elapsedMinutes,
  );

  return {
    steps,
    elapsedMinutes: elapsed,
    handsOnMinutes: plan.schedule.handsOnMinutes,
    allottedMinutes: allotted,
    overAllottedMinutes: overAllotted,
    parallelSavingsMinutes: parallelSavings,
  };
}

export function playbookPhaseLabel(type: PrepTaskType): string {
  return PHASE_LABELS[type] ?? type;
}
