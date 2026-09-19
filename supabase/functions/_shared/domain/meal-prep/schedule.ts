import type {
  MealPrepIssue,
  MealPrepScheduleSummary,
  PrepTask,
} from "../../contracts/index.ts";
import { MEAL_PREP_POLICY } from "./policy.ts";

type Interval = {
  taskId: string;
  start: number;
  end: number;
  activeEnd: number;
  attention: boolean;
  equipment: string[];
  ovenTemp?: number;
};

/**
 * Deterministic practical scheduler:
 * - honor dependencies
 * - overlap passive windows with other work
 * - sequence incompatible oven temps
 * - limit concurrent attention-heavy tasks
 */
export function schedulePrepTasks(tasks: PrepTask[]): {
  tasks: PrepTask[];
  sessionTaskOrder: string[];
  schedule: MealPrepScheduleSummary;
  issues: MealPrepIssue[];
} {
  const issues: MealPrepIssue[] = [];
  const sessionTasks = tasks.filter((t) => t.type !== "fresh_finish");
  const byId = new Map(sessionTasks.map((t) => [t.id, t]));

  // Validate deps exist among session tasks (fresh_finish deps may reference session).
  for (const t of sessionTasks) {
    for (const dep of t.dependencies) {
      if (!byId.has(dep) && !tasks.some((x) => x.id === dep)) {
        issues.push({
          code: "MISSING_TASK_DEPENDENCY",
          message: `Task ${t.id} depends on missing ${dep}.`,
          taskId: t.id,
          preservable: false,
        });
      }
    }
  }

  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const t of sessionTasks) {
    indegree.set(t.id, 0);
    dependents.set(t.id, []);
  }
  for (const t of sessionTasks) {
    for (const dep of t.dependencies) {
      if (!byId.has(dep)) continue;
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1);
      dependents.get(dep)!.push(t.id);
    }
  }

  const ready = sessionTasks
    .filter((t) => (indegree.get(t.id) ?? 0) === 0)
    .sort(taskPriority);
  const scheduled: Interval[] = [];
  const startById = new Map<string, number>();
  const endById = new Map<string, number>();
  const order: string[] = [];

  while (order.length < sessionTasks.length) {
    if (ready.length === 0) {
      issues.push({
        code: "INVALID_TASK_GRAPH",
        message: "Unable to schedule remaining tasks — dependency cycle or deadlock.",
        preservable: false,
      });
      break;
    }

    // Pick next task that can start given equipment/attention.
    let chosenIdx = -1;
    let chosenStart = 0;
    for (let i = 0; i < ready.length; i++) {
      const candidate = ready[i]!;
      const earliest = earliestStart(candidate, startById, endById, byId);
      const start = findFeasibleStart(candidate, earliest, scheduled);
      if (chosenIdx < 0 || start < chosenStart || (start === chosenStart && taskPriority(candidate, ready[chosenIdx]!) < 0)) {
        chosenIdx = i;
        chosenStart = start;
      }
      // Prefer the soonest-start among ready; first pass is enough for V1 heuristic.
      if (i === 0) {
        // keep scanning for better
      }
    }

    const task = ready.splice(chosenIdx, 1)[0]!;
    const active = task.durationMinutes;
    const passive = task.passiveMinutes ?? 0;
    const end = chosenStart + active + passive;
    const activeEnd = chosenStart + active;

    scheduled.push({
      taskId: task.id,
      start: chosenStart,
      end,
      activeEnd,
      attention: task.requiresAttention === true,
      equipment: task.equipment ?? [],
      ovenTemp: task.ovenTemperatureF,
    });
    startById.set(task.id, chosenStart);
    endById.set(task.id, end);
    order.push(task.id);

    for (const depId of dependents.get(task.id) ?? []) {
      const next = (indegree.get(depId) ?? 1) - 1;
      indegree.set(depId, next);
      if (next === 0) {
        const t = byId.get(depId);
        if (t) {
          ready.push(t);
          ready.sort(taskPriority);
        }
      }
    }
  }

  const timed = tasks.map((t) => {
    if (!startById.has(t.id)) return t;
    const start = startById.get(t.id)!;
    const end = endById.get(t.id)!;
    const parallel = scheduled
      .filter((s) => s.taskId !== t.id && intervalsOverlap(start, end, s.start, s.end))
      .map((s) => s.taskId);
    return {
      ...t,
      timing: {
        startOffsetMinutes: start,
        endOffsetMinutes: end,
        parallelTaskIds: parallel,
      },
    };
  });

  const elapsedMinutes = scheduled.reduce((m, s) => Math.max(m, s.end), 0);
  const handsOnMinutes = computeHandsOn(scheduled);
  const naiveSummedMinutes = sessionTasks.reduce(
    (s, t) => s + t.durationMinutes + (t.passiveMinutes ?? 0),
    0,
  );

  return {
    tasks: timed,
    sessionTaskOrder: order,
    schedule: {
      elapsedMinutes,
      handsOnMinutes,
      naiveSummedMinutes,
      scheduledTaskCount: order.length,
    },
    issues,
  };
}

function earliestStart(
  task: PrepTask,
  _startById: Map<string, number>,
  endById: Map<string, number>,
  byId: Map<string, PrepTask>,
): number {
  let start = 0;
  for (const dep of task.dependencies) {
    if (!byId.has(dep)) continue;
    start = Math.max(start, endById.get(dep) ?? 0);
  }
  return start;
}

function findFeasibleStart(task: PrepTask, earliest: number, scheduled: Interval[]): number {
  let t = earliest;
  // Probe forward until constraints satisfied (bounded).
  for (let guard = 0; guard < 500; guard++) {
    const activeEnd = t + task.durationMinutes;
    const conflict = scheduled.some((s) => {
      if (!intervalsOverlap(t, activeEnd, s.start, s.activeEnd)) return false;

      // Attention constraint
      if (task.requiresAttention && s.attention) return true;
      if (task.requiresAttention) {
        const concurrentAttention = scheduled.filter(
          (x) => x.attention && intervalsOverlap(t, activeEnd, x.start, x.activeEnd),
        ).length;
        if (concurrentAttention >= MEAL_PREP_POLICY.maxConcurrentAttentionTasks) return true;
      }

      // Oven temperature compatibility
      if (
        task.equipment?.includes("oven") &&
        s.equipment.includes("oven") &&
        task.ovenTemperatureF != null &&
        s.ovenTemp != null
      ) {
        const delta = Math.abs(task.ovenTemperatureF - s.ovenTemp);
        if (delta >= MEAL_PREP_POLICY.ovenTemperatureCompatibilityDeltaF) return true;
      }

      // Single stovetop attention-heavy skillet conflict
      if (
        task.requiresAttention &&
        task.equipment?.includes("skillet") &&
        s.equipment.includes("skillet") &&
        s.attention
      ) {
        return true;
      }

      return false;
    });

    if (!conflict) return t;
    // Jump to next active-end boundary.
    const next = scheduled
      .filter((s) => s.activeEnd > t)
      .map((s) => s.activeEnd)
      .sort((a, b) => a - b)[0];
    t = next ?? t + 1;
  }
  return t;
}

function computeHandsOn(scheduled: Interval[]): number {
  if (scheduled.length === 0) return 0;
  // Sweep active intervals only.
  const points: Array<{ t: number; d: number }> = [];
  for (const s of scheduled) {
    points.push({ t: s.start, d: 1 });
    points.push({ t: s.activeEnd, d: -1 });
  }
  points.sort((a, b) => a.t - b.t || b.d - a.d);
  let active = 0;
  let prev = points[0]?.t ?? 0;
  let hands = 0;
  for (const p of points) {
    if (active > 0) hands += p.t - prev;
    active += p.d;
    prev = p.t;
  }
  return hands;
}

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function taskPriority(a: PrepTask, b?: PrepTask): number {
  if (!b) return 0;
  // Start long-passive advance prep early; then mise; then cook; then store.
  const rank = (t: PrepTask) => {
    if (t.type === "advance_prep" && (t.passiveMinutes ?? 0) > 0) return 0;
    if (t.type === "mise_en_place") return 1;
    if (t.type === "advance_prep") return 2;
    if (t.type === "cook") return 3;
    if (t.type === "portion_and_store") return 4;
    return 5;
  };
  const d = rank(a) - rank(b);
  if (d !== 0) return d;
  return a.id.localeCompare(b.id);
}
