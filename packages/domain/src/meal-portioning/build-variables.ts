import type {
  ComponentNutritionCoefficient,
  ComponentScalingPolicy,
  MealPortionPolicy,
  PortionVariable,
} from "@fitness-autopilot/contracts";
import { DEFAULT_COUNT_BOUNDS, getRoleScalingPolicy } from "./policy";
import { hasRequiredMacros } from "./nutrition";

export type BuildVariablesFailure = {
  code:
    | "missing_reference_yield"
    | "missing_canonical_nutrition"
    | "invalid_constraints"
    | "unquantifiable_component";
  message: string;
  componentId?: string;
};

export type BuildVariablesResult =
  | { ok: true; variables: PortionVariable[] }
  | { ok: false; error: BuildVariablesFailure };

function assertBounds(min: number, preferred: number, max: number, label: string): string | null {
  if (!(min > 0 && preferred > 0 && max > 0)) {
    return `${label}: bounds must be positive`;
  }
  if (!(min <= preferred && preferred <= max)) {
    return `${label}: require min ≤ preferred ≤ max (got ${min}, ${preferred}, ${max})`;
  }
  return null;
}

function applyGramsFromPolicy(
  policy: ComponentScalingPolicy,
  overrides: {
    preferredGrams?: number;
    minGrams?: number;
    maxGrams?: number;
    quantityStep?: number;
  },
): { preferredGrams: number; minGrams: number; maxGrams: number; quantityStep?: number } | BuildVariablesFailure {
  const preferredGrams = overrides.preferredGrams ?? policy.preferredGrams;
  const minGrams = overrides.minGrams ?? policy.minGrams;
  const maxGrams = overrides.maxGrams ?? policy.maxGrams;
  if (preferredGrams == null || minGrams == null || maxGrams == null) {
    return {
      code: "invalid_constraints",
      message: `Role ${policy.role} lacks gram bounds in meal-portion-policy-v1.`,
    };
  }
  const boundError = assertBounds(minGrams, preferredGrams, maxGrams, policy.role);
  if (boundError) {
    return { code: "invalid_constraints", message: boundError };
  }
  return {
    preferredGrams,
    minGrams,
    maxGrams,
    quantityStep: overrides.quantityStep ?? policy.quantityStep ?? 1,
  };
}

/**
 * Expand trusted component nutrition coefficients + role policy into explicit PortionVariables.
 */
export function buildPortionVariables(
  components: readonly ComponentNutritionCoefficient[],
  policy: MealPortionPolicy,
): BuildVariablesResult {
  const variables: PortionVariable[] = [];

  for (const component of components) {
    const rolePolicy = getRoleScalingPolicy(component.role, policy);

    if (component.kind === "recipe_scale") {
      if (!hasRequiredMacros(component.baseNutrition)) {
        return {
          ok: false,
          error: {
            code: "missing_canonical_nutrition",
            message: `Component "${component.displayName}" is missing required calories/protein.`,
            componentId: component.componentId,
          },
        };
      }
      const requiresYield = component.requiresReferenceYield !== false;
      if (requiresYield && component.referenceYieldGrams == null && component.baseServings == null) {
        return {
          ok: false,
          error: {
            code: "missing_reference_yield",
            message: `Compound/main component "${component.displayName}" lacks referenceYieldGrams and baseServings.`,
            componentId: component.componentId,
          },
        };
      }
      const preferredScale = rolePolicy.preferredScale;
      const minScale = rolePolicy.minScale;
      const maxScale = rolePolicy.maxScale;
      const boundError = assertBounds(minScale, preferredScale, maxScale, component.displayName);
      if (boundError) {
        return { ok: false, error: { code: "invalid_constraints", message: boundError, componentId: component.componentId } };
      }
      if (rolePolicy.flexibility === "fixed") {
        variables.push({
          kind: "fixed",
          componentId: component.componentId,
          displayName: component.displayName,
          role: component.role,
          amount: component.referenceYieldGrams ?? preferredScale,
          unit: component.referenceYieldGrams != null ? "g" : "serving",
          nutrition: component.baseNutrition,
        });
        continue;
      }
      variables.push({
        kind: "recipe_scale",
        componentId: component.componentId,
        displayName: component.displayName,
        role: component.role,
        preferredScale,
        minScale,
        maxScale,
        baseNutrition: component.baseNutrition,
        referenceYieldGrams: component.referenceYieldGrams,
        baseServings: component.baseServings,
        quantityStep: component.quantityStep ?? 0.05,
      });
      continue;
    }

    if (component.kind === "food_grams") {
      if (!hasRequiredMacros(component.nutritionPer100g)) {
        return {
          ok: false,
          error: {
            code: "missing_canonical_nutrition",
            message: `Atomic food "${component.displayName}" is missing required calories/protein per 100g.`,
            componentId: component.componentId,
          },
        };
      }
      const grams = applyGramsFromPolicy(rolePolicy, component);
      if ("code" in grams) {
        return { ok: false, error: { ...grams, componentId: component.componentId } };
      }
      if (rolePolicy.flexibility === "fixed") {
        variables.push({
          kind: "fixed",
          componentId: component.componentId,
          displayName: component.displayName,
          role: component.role,
          amount: grams.preferredGrams,
          unit: "g",
          nutrition: {
            caloriesKcal: (component.nutritionPer100g.caloriesKcal * grams.preferredGrams) / 100,
            proteinGrams: (component.nutritionPer100g.proteinGrams * grams.preferredGrams) / 100,
            carbohydrateGrams:
              (component.nutritionPer100g.carbohydrateGrams * grams.preferredGrams) / 100,
            fatGrams: (component.nutritionPer100g.fatGrams * grams.preferredGrams) / 100,
            ...(component.nutritionPer100g.fiberGrams != null
              ? { fiberGrams: (component.nutritionPer100g.fiberGrams * grams.preferredGrams) / 100 }
              : {}),
          },
        });
        continue;
      }
      variables.push({
        kind: "food_grams",
        componentId: component.componentId,
        displayName: component.displayName,
        role: component.role,
        preferredGrams: grams.preferredGrams,
        minGrams: grams.minGrams,
        maxGrams: grams.maxGrams,
        nutritionPer100g: component.nutritionPer100g,
        quantityStep: grams.quantityStep,
      });
      continue;
    }

    if (component.kind === "count") {
      if (!hasRequiredMacros(component.nutritionPerUnit)) {
        return {
          ok: false,
          error: {
            code: "missing_canonical_nutrition",
            message: `Count food "${component.displayName}" is missing required calories/protein per unit.`,
            componentId: component.componentId,
          },
        };
      }
      const preferredCount =
        component.preferredCount ?? rolePolicy.preferredCount ?? DEFAULT_COUNT_BOUNDS.preferredCount;
      const minCount = component.minCount ?? rolePolicy.minCount ?? DEFAULT_COUNT_BOUNDS.minCount;
      const maxCount = component.maxCount ?? rolePolicy.maxCount ?? DEFAULT_COUNT_BOUNDS.maxCount;
      const quantityStep =
        component.quantityStep ?? rolePolicy.quantityStep ?? DEFAULT_COUNT_BOUNDS.quantityStep;
      const boundError = assertBounds(minCount, preferredCount, maxCount, component.displayName);
      if (boundError) {
        return { ok: false, error: { code: "invalid_constraints", message: boundError, componentId: component.componentId } };
      }
      variables.push({
        kind: "count",
        componentId: component.componentId,
        displayName: component.displayName,
        role: component.role,
        preferredCount,
        minCount,
        maxCount,
        nutritionPerUnit: component.nutritionPerUnit,
        quantityStep,
        unitLabel: component.unitLabel ?? "piece",
      });
      continue;
    }

    if (component.kind === "fixed") {
      if (!hasRequiredMacros(component.nutrition)) {
        return {
          ok: false,
          error: {
            code: "missing_canonical_nutrition",
            message: `Fixed component "${component.displayName}" is missing required calories/protein.`,
            componentId: component.componentId,
          },
        };
      }
      variables.push({
        kind: "fixed",
        componentId: component.componentId,
        displayName: component.displayName,
        role: component.role,
        amount: component.amount,
        unit: component.unit,
        nutrition: component.nutrition,
      });
      continue;
    }

    return {
      ok: false,
      error: {
        code: "unquantifiable_component",
        message: `Component cannot be quantified for portion solving.`,
      },
    };
  }

  return { ok: true, variables };
}
