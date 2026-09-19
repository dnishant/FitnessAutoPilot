import type { PrepTask, TaskIngredientRequirement } from "@fitness-autopilot/contracts";
import { normalizeIngredientKey } from "./preparation-identity";

const LOOKAHEAD_MINUTES = 25;

type PrepNeed = {
  taskId: string;
  task: PrepTask;
  ingredient: TaskIngredientRequirement;
  foodKey: string;
  cutKey: string;
};

/**
 * Just-in-time shared-prep lookahead.
 *
 * When two upcoming execution steps need identical preparation (same food + cut)
 * within a short window, consolidate prep into the earlier step with an
 * allocation note. Different cuts are never merged.
 *
 * Global session-wide mise consolidation is intentionally NOT performed.
 */
export function consolidateNearbyPrep(tasks: PrepTask[]): PrepTask[] {
  const executable = tasks.filter((t) => t.type === "advance_prep" || t.type === "cook");
  if (executable.length < 2) return tasks;

  const needs: PrepNeed[] = [];
  for (const task of executable) {
    for (const ing of task.ingredients) {
      const cut = ing.cutForm ?? "other";
      if (cut === "other" || cut === "whole") continue;
      needs.push({
        taskId: task.id,
        task,
        ingredient: ing,
        foodKey: normalizeIngredientKey(ing.displayName),
        cutKey: String(cut),
      });
    }
  }

  const groups = new Map<string, PrepNeed[]>();
  for (const need of needs) {
    const key = `${need.foodKey}::${need.cutKey}`;
    const list = groups.get(key) ?? [];
    list.push(need);
    groups.set(key, list);
  }

  const byId = new Map(
    tasks.map((t) => [t.id, { ...t, instructions: [...t.instructions], ingredients: [...t.ingredients] }]),
  );

  for (const [, group] of groups) {
    const byMeal = new Map<string, PrepNeed>();
    for (const n of group) {
      const meal = n.task.coreMealIds[0] ?? n.taskId;
      if (!byMeal.has(meal)) byMeal.set(meal, n);
    }
    if (byMeal.size < 2) continue;

    const ordered = [...byMeal.values()].sort((a, b) => {
      const aStart = a.task.timing?.startOffsetMinutes ?? Number.MAX_SAFE_INTEGER;
      const bStart = b.task.timing?.startOffsetMinutes ?? Number.MAX_SAFE_INTEGER;
      if (aStart !== bStart) return aStart - bStart;
      return a.taskId.localeCompare(b.taskId);
    });

    const primary = ordered[0]!;
    const secondary = ordered[1]!;
    if (primary.task.timing && secondary.task.timing) {
      const gap =
        (secondary.task.timing.startOffsetMinutes ?? 0) -
        (primary.task.timing.startOffsetMinutes ?? 0);
      if (gap > LOOKAHEAD_MINUTES) continue;
    }

    const primaryTask = byId.get(primary.taskId);
    const secondaryTask = byId.get(secondary.taskId);
    if (!primaryTask || !secondaryTask) continue;

    // Keep authoritative per-meal quantities on each step. Consolidation is
    // instructional only ("prep once, set aside") — never invent merged demand.
    const allocLine = `Prep once for two nearby dishes: prepare ${primary.ingredient.displayQuantityLabel ?? "your portion"} now, plus ${secondary.ingredient.displayQuantityLabel ?? "another portion"} to set aside for ${secondary.task.title}.`;
    if (!primaryTask.instructions.some((l) => l.includes("set aside"))) {
      primaryTask.instructions = [allocLine, ...primaryTask.instructions].slice(0, 20);
    }

    primaryTask.allocations = [
      {
        coreMealId: primary.task.coreMealIds[0] ?? primary.taskId,
        mealName: primary.task.title,
        quantityLabel: primary.ingredient.displayQuantityLabel ?? "",
      },
      {
        coreMealId: secondary.task.coreMealIds[0] ?? secondary.taskId,
        mealName: secondary.task.title,
        quantityLabel: secondary.ingredient.displayQuantityLabel ?? "",
      },
    ];

    const note = `Use the ${secondary.ingredient.displayName} set aside earlier (${secondary.ingredient.displayQuantityLabel ?? ""}).`;
    if (!secondaryTask.instructions.some((l) => l.includes("set aside earlier"))) {
      secondaryTask.instructions = [note, ...secondaryTask.instructions].slice(0, 20);
    }
  }

  return tasks.map((t) => byId.get(t.id) ?? t);
}

/**
 * @deprecated Prefer consolidateNearbyPrep. Legacy global mise collapse removed;
 * any leftover mise_en_place tasks are dropped (JIT extraction no longer emits them).
 */
export function consolidateMiseEnPlace(tasks: PrepTask[]): PrepTask[] {
  const withoutMise = tasks.filter((t) => t.type !== "mise_en_place");
  return consolidateNearbyPrep(withoutMise);
}
