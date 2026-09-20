import type {
  CatalogRecipeIngredient,
  CatalogRecipeStep,
  CatalogRecipeStepIngredientUsage,
  RecipeCatalogFailureCode,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import {
  normalizeRecipeQuantity,
  quantitiesEqualWithinTolerance,
} from "./units";

export type ReconcileError = {
  code: RecipeCatalogFailureCode;
  message: string;
  ingredientId?: string;
};

export type IngredientUsageReconcileReport = {
  unaccountedIngredientIds: string[];
  duplicatedIngredientIds: string[];
  missingLinkIngredientIds: string[];
  incompatibleUnitIngredientIds: string[];
  ok: boolean;
  details: string[];
};

/**
 * Every required ingredient must have usages that sum to its authoritative quantity
 * in compatible units. Optional ingredients may remain unused (conditional).
 */
export function resolveRecipeIngredientUsage(
  ingredients: readonly CatalogRecipeIngredient[],
  steps: readonly CatalogRecipeStep[],
  usages: readonly CatalogRecipeStepIngredientUsage[],
): Result<IngredientUsageReconcileReport, ReconcileError> {
  const stepIds = new Set(steps.map((s) => s.id));
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const details: string[] = [];
  const unaccountedIngredientIds: string[] = [];
  const duplicatedIngredientIds: string[] = [];
  const missingLinkIngredientIds: string[] = [];
  const incompatibleUnitIngredientIds: string[] = [];

  for (const usage of usages) {
    if (!stepIds.has(usage.recipeStepId)) {
      return err({
        code: "MISSING_RECIPE_STEP",
        message: `Usage ${usage.id} references unknown step ${usage.recipeStepId}`,
      });
    }
    if (!ingredientById.has(usage.recipeIngredientId)) {
      return err({
        code: "UNACCOUNTED_INGREDIENT",
        message: `Usage ${usage.id} references ingredient outside this version`,
        ingredientId: usage.recipeIngredientId,
      });
    }
  }

  for (const ingredient of ingredients) {
    const linked = usages.filter((u) => u.recipeIngredientId === ingredient.id);
    if (linked.length === 0) {
      if (ingredient.optional) {
        continue;
      }
      missingLinkIngredientIds.push(ingredient.id);
      unaccountedIngredientIds.push(ingredient.id);
      details.push(`required ingredient ${ingredient.id} has no step usage`);
      continue;
    }

    let sum = 0;
    let incompatible = false;
    for (const usage of linked) {
      const normalized = normalizeRecipeQuantity(
        usage.quantity,
        usage.unit,
        ingredient.unit,
      );
      if (normalized == null) {
        incompatible = true;
        incompatibleUnitIngredientIds.push(ingredient.id);
        details.push(
          `ingredient ${ingredient.id}: usage unit ${usage.unit} incompatible with ${ingredient.unit}`,
        );
        break;
      }
      sum += normalized;
    }
    if (incompatible) continue;

    if (!quantitiesEqualWithinTolerance(sum, ingredient.quantity)) {
      if (sum > ingredient.quantity + 1e-6) {
        duplicatedIngredientIds.push(ingredient.id);
        details.push(
          `ingredient ${ingredient.id}: usages sum ${sum} exceeds authoritative ${ingredient.quantity} ${ingredient.unit}`,
        );
      } else {
        unaccountedIngredientIds.push(ingredient.id);
        details.push(
          `ingredient ${ingredient.id}: usages sum ${sum} under-accounts authoritative ${ingredient.quantity} ${ingredient.unit}`,
        );
      }
    }
  }

  const okReport =
    unaccountedIngredientIds.length === 0 &&
    duplicatedIngredientIds.length === 0 &&
    missingLinkIngredientIds.length === 0 &&
    incompatibleUnitIngredientIds.length === 0;

  return ok({
    unaccountedIngredientIds,
    duplicatedIngredientIds,
    missingLinkIngredientIds,
    incompatibleUnitIngredientIds,
    ok: okReport,
    details,
  });
}
