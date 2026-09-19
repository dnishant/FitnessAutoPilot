import type { PrepTask, TaskIngredientRequirement } from "../../contracts/index.ts";
import { formatGroceryDisplay } from "../grocery/units.ts";
import {
  cutFormVerb,
  normalizeIngredientKey,
  sharedUpstreamCutForm,
} from "./preparation-identity.ts";
import { unitFamily, toCompatibleBasis } from "../grocery/units.ts";

type MiseKey = string;

function consolidationKey(ing: TaskIngredientRequirement): MiseKey {
  const food = normalizeIngredientKey(ing.displayName);
  const cut = ing.cutForm ?? "other";
  return `${food}::${cut}`;
}

function foodKey(ing: TaskIngredientRequirement): string {
  return normalizeIngredientKey(ing.displayName);
}

/**
 * Consolidate compatible mise-en-place across recipes.
 * Same food + same cut form → one task with allocations.
 * Different cuts remain separate; optional shared peel/wash upstream when legitimate.
 */
export function consolidateMiseEnPlace(tasks: PrepTask[]): PrepTask[] {
  const mise = tasks.filter((t) => t.type === "mise_en_place");
  const rest = tasks.filter((t) => t.type !== "mise_en_place");
  if (mise.length <= 1) return tasks;

  const groups = new Map<MiseKey, PrepTask[]>();
  for (const task of mise) {
    const ing = task.ingredients[0];
    if (!ing) {
      rest.push(task);
      continue;
    }
    const key = consolidationKey(ing);
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }

  const consolidated: PrepTask[] = [];
  const idRemap = new Map<string, string>();

  for (const [, group] of groups) {
    if (group.length === 1) {
      consolidated.push(group[0]!);
      continue;
    }

    const ingredients = group.flatMap((t) => t.ingredients);
    const mergedQty = mergeQuantities(ingredients);
    const first = group[0]!;
    const ing0 = first.ingredients[0]!;
    const cut = ing0.cutForm ?? "other";
    const verb = cutFormVerb(cut === "other" ? "portioned" : cut);
    const display =
      mergedQty != null
        ? formatGroceryDisplay({ quantity: mergedQty.quantity, unit: mergedQty.unit })
        : undefined;

    const newId = `mise_shared_${foodKey(ing0)}_${cut}`.replace(/\s+/g, "_").slice(0, 100);
    for (const t of group) idRemap.set(t.id, newId);

    const allocations = group.flatMap((t) => {
      if (t.allocations?.length) return t.allocations;
      return t.coreMealIds.map((coreMealId) => ({
        coreMealId,
        mealName: undefined as string | undefined,
        quantityLabel: t.ingredients[0]?.displayQuantityLabel ?? "",
      }));
    });

    consolidated.push({
      id: newId,
      type: "mise_en_place",
      title:
        display != null
          ? `${verb} ${display.displayLabel} ${pluralizeFood(ing0.displayName)}`
          : `${verb} ${pluralizeFood(ing0.displayName)} (combined)`,
      durationMinutes: Math.max(
        ...group.map((t) => t.durationMinutes),
        Math.ceil(group.reduce((s, t) => s + t.durationMinutes, 0) * 0.7),
      ),
      dependencies: [],
      recipeIds: unique(group.flatMap((t) => t.recipeIds)),
      coreMealIds: unique(group.flatMap((t) => t.coreMealIds)),
      mealInstanceIds: unique(group.flatMap((t) => t.mealInstanceIds)),
      ingredients:
        mergedQty != null
          ? [
              {
                ...ing0,
                quantity: mergedQty.quantity,
                unit: mergedQty.unit,
                displayQuantityLabel: display?.displayLabel,
              },
            ]
          : ingredients,
      equipment: ["cutting_board"],
      canRunInParallel: true,
      requiresAttention: false,
      instructions: [
        `Prep once for: ${unique(group.flatMap((t) => t.coreMealIds)).join(", ")}.`,
        ...allocations.map(
          (a) => `• ${a.quantityLabel} → ${a.mealName ?? a.coreMealId}`,
        ),
      ],
      allocations,
      phaseGroup: first.phaseGroup,
    });
  }

  // Optional shared peel upstream when multiple incompatible cuts of same food exist.
  const byFood = new Map<string, PrepTask[]>();
  for (const t of consolidated) {
    const ing = t.ingredients[0];
    if (!ing) continue;
    const fk = foodKey(ing);
    const list = byFood.get(fk) ?? [];
    list.push(t);
    byFood.set(fk, list);
  }

  const upstream: PrepTask[] = [];
  for (const [fk, group] of byFood) {
    const cuts = new Set(group.map((t) => t.ingredients[0]?.cutForm ?? "other"));
    const needsPeel = [...cuts].some((c) => sharedUpstreamCutForm(c as never) === "peeled");
    if (!needsPeel || cuts.size < 2) continue;
    if ([...cuts].every((c) => c === "peeled")) continue;

    const peelId = `mise_shared_peel_${fk}`.replace(/\s+/g, "_").slice(0, 100);
    const allIngs = group.flatMap((t) => t.ingredients);
    const merged = mergeQuantities(allIngs);
    const display =
      merged != null
        ? formatGroceryDisplay({ quantity: merged.quantity, unit: merged.unit })
        : undefined;

    upstream.push({
      id: peelId,
      type: "mise_en_place",
      title: display
        ? `Peel ${display.displayLabel} ${pluralizeFood(group[0]!.ingredients[0]!.displayName)}`
        : `Peel ${pluralizeFood(group[0]!.ingredients[0]!.displayName)}`,
      durationMinutes: 4,
      dependencies: [],
      recipeIds: unique(group.flatMap((t) => t.recipeIds)),
      coreMealIds: unique(group.flatMap((t) => t.coreMealIds)),
      mealInstanceIds: unique(group.flatMap((t) => t.mealInstanceIds)),
      ingredients: merged
        ? [
            {
              ...group[0]!.ingredients[0]!,
              quantity: merged.quantity,
              unit: merged.unit,
              cutForm: "peeled",
              preparation: "peeled",
              displayQuantityLabel: display?.displayLabel,
            },
          ]
        : [],
      equipment: ["cutting_board"],
      canRunInParallel: true,
      requiresAttention: false,
      instructions: ["Shared peel before separate cuts."],
      phaseGroup: "produce",
    });

    for (const t of group) {
      if (!t.dependencies.includes(peelId)) t.dependencies = [...t.dependencies, peelId];
    }
  }

  // Remap dependencies in remaining tasks.
  const remappedRest = rest.map((t) => ({
    ...t,
    dependencies: t.dependencies.map((d) => idRemap.get(d) ?? d),
  }));

  return [...upstream, ...consolidated, ...remappedRest];
}

function mergeQuantities(
  ingredients: TaskIngredientRequirement[],
): { quantity: number; unit: string } | null {
  if (ingredients.length === 0) return null;
  const unit = ingredients[0]!.unit;
  const family = unitFamily(unit);
  if (family === "unknown") {
    // Only merge when all units match exactly.
    if (!ingredients.every((i) => i.unit === unit)) return null;
    return {
      quantity: ingredients.reduce((s, i) => s + i.quantity, 0),
      unit,
    };
  }

  let total = 0;
  let basisUnit = unit;
  for (const ing of ingredients) {
    const basis = toCompatibleBasis(ing.quantity, ing.unit);
    if (!basis.ok) return null;
    if (basis.family === "mass") {
      total += basis.grams;
      basisUnit = "g";
    } else if (basis.family === "volume") {
      total += basis.teaspoons;
      basisUnit = "tsp";
    } else if (basis.family === "count") {
      total += basis.count;
      basisUnit = basis.unit;
    } else {
      return null;
    }
  }
  return { quantity: total, unit: basisUnit };
}

function pluralizeFood(name: string): string {
  const n = name.trim();
  if (/onion$/i.test(n)) return "onions";
  if (/clove$/i.test(n)) return "garlic cloves";
  if (/garlic$/i.test(n)) return "garlic";
  return n;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
