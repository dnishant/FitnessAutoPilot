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
import { unitFamily } from "../grocery/units";

/**
 * Reconcile prep-task ingredient demand with weekly recipe requirements.
 *
 * Just-in-time model: each scaled recipe ingredient should appear on exactly one
 * execution step (advance_prep or cook) for its core meal — not silently lost
 * and not double-consumed.
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

  const expected = new Map<string, { quantity: number; unit: string }>();
  for (const req of input.requirements) {
    const recipe = input.recipesByCandidateId[req.candidateId];
    if (!recipe) {
      weeklyRecipeDemandMismatches += 1;
      continue;
    }
    const scale = scaleFactorForRequirement(req);
    for (const ing of recipe.ingredients) {
      const key = `${req.coreMealId}::${normalizeIngredientKey(ing.name)}::${ing.ingredientId}`;
      expected.set(key, { quantity: ing.quantity * scale, unit: ing.unit });
    }
  }

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
        prev.count += 1;
        prev.quantity += ing.quantity;
        duplicatedIngredientDemand += 1;
      } else {
        actual.set(key, { quantity: ing.quantity, unit: ing.unit, count: 1 });
      }
    }
  }

  for (const [key, exp] of expected) {
    const act = actual.get(key);
    if (!act) {
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

  void input.groceryList;
  void MEAL_PREP_POLICY;

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
  if (unitFamily(aUnit) !== unitFamily(bUnit)) return false;
  if (aUnit !== bUnit) {
    // Cross-unit conversion is intentionally conservative in V1.
    return false;
  }
  const tol = MEAL_PREP_POLICY.ingredientReconciliationTolerance;
  const denom = Math.max(Math.abs(aQty), Math.abs(bQty), 1e-9);
  return Math.abs(aQty - bQty) / denom <= tol;
}
