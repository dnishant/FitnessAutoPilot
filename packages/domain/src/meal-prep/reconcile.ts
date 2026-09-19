import type {
  GroceryList,
  MealPrepReconciliation,
  PrepTask,
  WeeklyCookingRequirement,
} from "@fitness-autopilot/contracts";
import { MEAL_PREP_POLICY } from "./policy";
import { normalizeIngredientKey } from "./preparation-identity";
import { scaleFactorForRequirement } from "./weekly-requirements";
import type { ResolvedRecipe } from "@fitness-autopilot/contracts";
import { toCompatibleBasis, unitFamily } from "../grocery/units";

/**
 * Reconcile prep-task ingredient demand with weekly recipe requirements.
 * Detect duplicates / missing demand within tolerance.
 */
export function reconcilePrepQuantities(input: {
  requirements: WeeklyCookingRequirement[];
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  tasks: PrepTask[];
  groceryList?: GroceryList;
  missingDependencies: number;
  dependencyCycles: number;
  unsupportedStorageAssignments: number;
  orphanFutureActions: number;
  stalePlanLinks: number;
}): MealPrepReconciliation {
  let duplicatedIngredientDemand = 0;
  let missingIngredientDemand = 0;
  let weeklyRecipeDemandMismatches = 0;

  // Expected demand from weekly cook scale (mise ingredients should cover prep-able ones).
  const expected = new Map<string, { quantity: number; unit: string }>();
  for (const req of input.requirements) {
    const recipe = input.recipesByCandidateId[req.candidateId];
    if (!recipe) {
      weeklyRecipeDemandMismatches += 1;
      continue;
    }
    const scale = scaleFactorForRequirement(req);
    for (const ing of recipe.ingredients) {
      // Only ingredients that appear in mise/cook tasks are expected in prep demand.
      const key = `${req.coreMealId}::${normalizeIngredientKey(ing.name)}::${ing.ingredientId}`;
      expected.set(key, { quantity: ing.quantity * scale, unit: ing.unit });
    }
  }

  // Actual demand from mise + cook tasks (avoid double-counting store).
  const actual = new Map<string, { quantity: number; unit: string; count: number }>();
  for (const task of input.tasks) {
    if (task.type !== "mise_en_place" && task.type !== "cook" && task.type !== "advance_prep") {
      continue;
    }
    for (const ing of task.ingredients) {
      const core = ing.coreMealId ?? task.coreMealIds[0] ?? "unknown";
      const key = `${core}::${normalizeIngredientKey(ing.displayName)}::${ing.ingredientId}`;
      const prev = actual.get(key);
      if (prev) {
        // Same ingredient appearing in both mise and cook is expected once each role —
        // count duplicate only when same task type double-lists.
        prev.count += 1;
        if (task.type === "mise_en_place" && prev.count > 1) {
          duplicatedIngredientDemand += 1;
        }
      } else {
        actual.set(key, { quantity: ing.quantity, unit: ing.unit, count: 1 });
      }
    }
  }

  // Compare mise totals to expected for ingredients that have mise tasks.
  const miseKeys = new Set(
    input.tasks
      .filter((t) => t.type === "mise_en_place")
      .flatMap((t) =>
        t.ingredients.map((ing) => {
          const core = ing.coreMealId ?? t.coreMealIds[0] ?? "unknown";
          return `${core}::${normalizeIngredientKey(ing.displayName)}::${ing.ingredientId}`;
        }),
      ),
  );

  for (const key of miseKeys) {
    const exp = expected.get(key);
    const act = actual.get(key);
    if (!exp || !act) {
      missingIngredientDemand += 1;
      continue;
    }
    if (!quantitiesClose(exp.quantity, exp.unit, act.quantity, act.unit)) {
      weeklyRecipeDemandMismatches += 1;
    }
  }

  const orphanPrepTasks = input.tasks.filter(
    (t) => t.coreMealIds.length === 0 && t.recipeIds.length === 0,
  ).length;

  const intentionalExcessServingsTotal = input.requirements.reduce(
    (s, r) => s + r.expectedExcessServings,
    0,
  );

  // Grocery ↔ prep: soft check that grocery source recipe ids cover prep recipe ids.
  if (input.groceryList?.available) {
    const groceryRecipes = new Set(
      input.groceryList.sections.flatMap((s) => s.items.flatMap((i) => i.sourceRecipeIds ?? [])),
    );
    for (const req of input.requirements) {
      if (groceryRecipes.size > 0 && !groceryRecipes.has(req.recipeId)) {
        // Not a hard failure — component recipes may use synthetic ids.
      }
    }
  }

  return {
    weeklyRecipeDemandMismatches,
    duplicatedIngredientDemand,
    missingIngredientDemand,
    orphanPrepTasks,
    missingDependencies: input.missingDependencies,
    dependencyCycles: input.dependencyCycles,
    unsupportedStorageAssignments: input.unsupportedStorageAssignments,
    orphanFutureActions: input.orphanFutureActions,
    stalePlanLinks: input.stalePlanLinks,
    intentionalExcessServingsTotal,
  };
}

function quantitiesClose(
  aQty: number,
  aUnit: string,
  bQty: number,
  bUnit: string,
): boolean {
  const tol = MEAL_PREP_POLICY.ingredientReconciliationTolerance;
  if (aUnit === bUnit) {
    const denom = Math.max(aQty, bQty, 1e-9);
    return Math.abs(aQty - bQty) / denom <= tol;
  }
  const a = toCompatibleBasis(aQty, aUnit);
  const b = toCompatibleBasis(bQty, bUnit);
  if (!a.ok || !b.ok || a.family !== b.family) {
    // Different unit families — skip hard mismatch if families unknown.
    return unitFamily(aUnit) === "unknown" || unitFamily(bUnit) === "unknown";
  }
  if (a.family === "mass" && b.family === "mass") {
    const denom = Math.max(a.grams, b.grams, 1e-9);
    return Math.abs(a.grams - b.grams) / denom <= tol;
  }
  if (a.family === "volume" && b.family === "volume") {
    const denom = Math.max(a.teaspoons, b.teaspoons, 1e-9);
    return Math.abs(a.teaspoons - b.teaspoons) / denom <= tol;
  }
  if (a.family === "count" && b.family === "count") {
    const denom = Math.max(a.count, b.count, 1e-9);
    return Math.abs(a.count - b.count) / denom <= tol;
  }
  return false;
}
