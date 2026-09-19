import type { MealPrepIssue, PrepTask } from "../../contracts/index.ts";

/**
 * Validate prep task DAG integrity.
 * Never silently reorder a corrupted graph — return typed failures.
 */
export function validateTaskGraph(tasks: PrepTask[]): {
  ok: boolean;
  issues: MealPrepIssue[];
  cycles: number;
  missingDependencies: number;
} {
  const issues: MealPrepIssue[] = [];
  const ids = new Set(tasks.map((t) => t.id));
  let missingDependencies = 0;

  for (const t of tasks) {
    for (const dep of t.dependencies) {
      if (!ids.has(dep)) {
        missingDependencies += 1;
        issues.push({
          code: "MISSING_TASK_DEPENDENCY",
          message: `Task "${t.id}" depends on missing "${dep}".`,
          taskId: t.id,
          preservable: false,
        });
      }
    }

    // Storage must not precede cook for same core meal when both exist.
    if (t.type === "portion_and_store") {
      const cooks = tasks.filter(
        (c) =>
          c.type === "cook" &&
          c.coreMealIds.some((id) => t.coreMealIds.includes(id)),
      );
      for (const cook of cooks) {
        if (!t.dependencies.includes(cook.id) && !hasPath(tasks, cook.id, t.id)) {
          // Soft: scheduler may still work if explicit dep missing — flag it.
          issues.push({
            code: "INVALID_TASK_GRAPH",
            message: `Storage task ${t.id} should depend on cook ${cook.id}.`,
            taskId: t.id,
            preservable: true,
          });
        }
      }
    }
  }

  const cycles = countCycles(tasks);
  if (cycles > 0) {
    issues.push({
      code: "INVALID_TASK_GRAPH",
      message: `Task graph contains ${cycles} cycle(s).`,
      preservable: false,
    });
  }

  const hard = issues.filter((i) => !i.preservable);
  return {
    ok: hard.length === 0 && cycles === 0 && missingDependencies === 0,
    issues,
    cycles,
    missingDependencies,
  };
}

function hasPath(tasks: PrepTask[], from: string, to: string): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const stack = [to];
  // Walk dependencies of `to` upward looking for `from`.
  while (stack.length) {
    const id = stack.pop()!;
    if (id === from) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = byId.get(id);
    if (!t) continue;
    for (const d of t.dependencies) stack.push(d);
  }
  return false;
}

function countCycles(tasks: PrepTask[]): number {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const t of tasks) color.set(t.id, WHITE);
  let cycles = 0;

  const visit = (id: string) => {
    color.set(id, GRAY);
    const t = byId.get(id);
    if (!t) {
      color.set(id, BLACK);
      return;
    }
    for (const dep of t.dependencies) {
      if (!byId.has(dep)) continue;
      const c = color.get(dep) ?? WHITE;
      if (c === GRAY) {
        cycles += 1;
      } else if (c === WHITE) {
        visit(dep);
      }
    }
    color.set(id, BLACK);
  };

  for (const t of tasks) {
    if (color.get(t.id) === WHITE) visit(t.id);
  }
  return cycles;
}
