import type {
  CompleteMeal,
  CompleteMealComponent,
  ComponentNutritionCoefficient,
  ConsumerMealSlot,
  PersonalizedMealNutrition,
} from "@fitness-autopilot/contracts";
import { isEdibleFoodIdentity } from "../meal-composition/edible-identity";
import { isUnresolvedPlaceholderName } from "../meal-composition/placeholders";

/**
 * Canonical executable meal integrity.
 *
 * After Culinary Meal Architect decisions, CompleteMeal.components that are
 * independent edible owners are the prescribed plate. Nutrition, PLAN-010, and
 * consumer UI must agree on that same set — no UI-only food, no nutrition-only
 * owners, no LLM estimate posing as personalized totals.
 */

export type CanonicalIntegrityFailureCode =
  | "INDEPENDENT_OWNER_MISSING_COEFFICIENT"
  | "COEFFICIENT_WITHOUT_INDEPENDENT_OWNER"
  | "UI_COMPONENT_WITHOUT_PERSONALIZED_NUTRITION"
  | "PERSONALIZED_NUTRITION_WITHOUT_PORTIONS"
  | "MEAL_TOTAL_MISMATCH"
  | "LLM_ESTIMATE_AS_PERSONALIZED"
  | "SELECTED_COMPONENT_MISSING_AMOUNT";

export type CanonicalIntegrityFailure = {
  code: CanonicalIntegrityFailureCode;
  message: string;
  componentId?: string;
};

/**
 * Independently consumed prescribed food on the canonical CompleteMeal.
 * Parent-owned intrinsic structure and non-edible labels are excluded.
 */
export function isIndependentEdibleOwner(component: CompleteMealComponent): boolean {
  if ((component.nutritionOwnership ?? "independent") === "parent_owned") return false;
  if (isUnresolvedPlaceholderName(component.name)) return false;
  if (!isEdibleFoodIdentity(component.name)) return false;
  return true;
}

export function listIndependentEdibleOwners(
  meal: CompleteMeal,
): CompleteMealComponent[] {
  return meal.components.filter(isIndependentEdibleOwner);
}

/**
 * Bijection: every independent edible owner ↔ exactly one coefficient owner.
 * Relationship (recommended vs required) does not grant a nutrition free pass once
 * the component is on the prescribed CompleteMeal.
 */
export function assertCoefficientOwnersMatchIndependentEdibles(input: {
  meal: CompleteMeal;
  coefficients: readonly ComponentNutritionCoefficient[];
}): { ok: true } | { ok: false; error: CanonicalIntegrityFailure } {
  const owners = listIndependentEdibleOwners(input.meal);
  const coeffIds = new Set(input.coefficients.map((c) => c.componentId));

  for (const owner of owners) {
    if (!coeffIds.has(owner.componentId)) {
      return {
        ok: false,
        error: {
          code: "INDEPENDENT_OWNER_MISSING_COEFFICIENT",
          message: `Prescribed independent edible "${owner.name}" has no nutritional coefficient / PLAN-010 variable.`,
          componentId: owner.componentId,
        },
      };
    }
  }

  const ownerIds = new Set(owners.map((o) => o.componentId));
  for (const coeff of input.coefficients) {
    if (!ownerIds.has(coeff.componentId)) {
      return {
        ok: false,
        error: {
          code: "COEFFICIENT_WITHOUT_INDEPENDENT_OWNER",
          message: `Coefficient "${coeff.displayName}" has no matching independent edible on the canonical meal.`,
          componentId: coeff.componentId,
        },
      };
    }
  }

  return { ok: true };
}

function nutritionClose(
  a: PersonalizedMealNutrition,
  b: PersonalizedMealNutrition,
  calorieTolerance = 2,
): boolean {
  return (
    Math.abs(a.caloriesKcal - b.caloriesKcal) <= calorieTolerance &&
    Math.abs(a.proteinGrams - b.proteinGrams) <= 0.6 &&
    Math.abs(a.carbsGrams - b.carbsGrams) <= 0.6 &&
    Math.abs(a.fatGrams - b.fatGrams) <= 0.6
  );
}

function sumSlotComponentNutrition(
  slot: ConsumerMealSlot,
): PersonalizedMealNutrition | null {
  const withNutrition = slot.components.filter((c) => c.nutrition);
  if (withNutrition.length === 0) return null;
  let caloriesKcal = 0;
  let proteinGrams = 0;
  let carbsGrams = 0;
  let fatGrams = 0;
  let fiberGrams = 0;
  let hasFiber = false;
  for (const component of withNutrition) {
    const n = component.nutrition!;
    caloriesKcal += n.caloriesKcal;
    proteinGrams += n.proteinGrams;
    carbsGrams += n.carbsGrams;
    fatGrams += n.fatGrams;
    if (n.fiberGrams != null) {
      fiberGrams += n.fiberGrams;
      hasFiber = true;
    }
  }
  const out: PersonalizedMealNutrition = {
    caloriesKcal: Math.round(caloriesKcal),
    proteinGrams: Math.round(proteinGrams * 10) / 10,
    carbsGrams: Math.round(carbsGrams * 10) / 10,
    fatGrams: Math.round(fatGrams * 10) / 10,
  };
  if (hasFiber) out.fiberGrams = Math.round(fiberGrams * 10) / 10;
  return out;
}

/**
 * Active consumer meal integrity: prescribed components, amounts, and totals
 * must come from personalized portions — never LLM recipe estimates.
 */
export function assertConsumerMealNutritionIntegrity(
  slot: ConsumerMealSlot,
): { ok: true } | { ok: false; error: CanonicalIntegrityFailure } {
  const message = slot.personalizationMessage ?? "";
  if (
    /llm_estimate/i.test(message) ||
    /Macros from recipe\.nutrition/i.test(message)
  ) {
    return {
      ok: false,
      error: {
        code: "LLM_ESTIMATE_AS_PERSONALIZED",
        message: `Meal "${slot.name}" exposes LLM estimate as personalized nutrition.`,
      },
    };
  }

  if (slot.personalizationStatus === "blocked") {
    if (slot.personalizedNutrition) {
      return {
        ok: false,
        error: {
          code: "PERSONALIZED_NUTRITION_WITHOUT_PORTIONS",
          message: `Blocked meal "${slot.name}" must not carry personalizedNutrition.`,
        },
      };
    }
    return { ok: true };
  }

  // Solved / best_feasible: every visible component needs amount + nutrition.
  for (const component of slot.components) {
    if (component.amount == null || !component.unit) {
      return {
        ok: false,
        error: {
          code: "SELECTED_COMPONENT_MISSING_AMOUNT",
          message: `Prescribed component "${component.displayName}" lacks personalized amount.`,
          componentId: component.componentId,
        },
      };
    }
    if (!component.nutrition) {
      return {
        ok: false,
        error: {
          code: "UI_COMPONENT_WITHOUT_PERSONALIZED_NUTRITION",
          message: `Prescribed component "${component.displayName}" lacks personalized nutrition.`,
          componentId: component.componentId,
        },
      };
    }
  }

  if (!slot.personalizedNutrition) {
    return {
      ok: false,
      error: {
        code: "PERSONALIZED_NUTRITION_WITHOUT_PORTIONS",
        message: `Meal "${slot.name}" is personalized but missing meal totals.`,
      },
    };
  }

  const summed = sumSlotComponentNutrition(slot);
  if (!summed || !nutritionClose(summed, slot.personalizedNutrition)) {
    return {
      ok: false,
      error: {
        code: "MEAL_TOTAL_MISMATCH",
        message: `Meal "${slot.name}" totals do not equal sum of personalized component nutrition.`,
      },
    };
  }

  return { ok: true };
}

export function assertWeeklyConsumerPlanIntegrity(
  meals: readonly ConsumerMealSlot[],
): { ok: true } | { ok: false; failures: CanonicalIntegrityFailure[] } {
  const failures: CanonicalIntegrityFailure[] = [];
  for (const meal of meals) {
    // Only validate meals that claim to be active personalized prescriptions.
    if (meal.personalizationStatus === "blocked") {
      const result = assertConsumerMealNutritionIntegrity(meal);
      if (!result.ok) failures.push(result.error);
      continue;
    }
    if (meal.personalizationStatus == null && !meal.personalizedNutrition) {
      continue;
    }
    const result = assertConsumerMealNutritionIntegrity(meal);
    if (!result.ok) failures.push(result.error);
  }
  if (failures.length > 0) return { ok: false, failures };
  return { ok: true };
}
