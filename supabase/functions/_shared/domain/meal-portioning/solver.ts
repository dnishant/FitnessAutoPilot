import type {
  IngredientNutrition,
  MealNutritionIntent,
  MealPortionPolicy,
  PersonalizedMealPlan,
  PersonalizedMealPortion,
  PortionSolverBlockReason,
  PortionSolverDiagnostics,
  PortionVariable,
  PortionVariableDiagnostic,
  SolveMealPortionsRequest,
} from "../../contracts/index.ts";
import {
  MEAL_PORTION_POLICY_VERSION,
  MEAL_PORTION_SOLVER_VERSION,
} from "../../contracts/index.ts";
import { buildPortionVariables } from "./build-variables.ts";
import {
  nutritionForCount,
  nutritionForFoodGrams,
  nutritionForRecipeScale,
  roundMealNutritionForAuthority,
  roundPortionNutrition,
  roundPracticalCount,
  roundPracticalGrams,
  sumIngredientNutrition,
  toPersonalizedMealNutrition,
} from "./nutrition.ts";
import { getMealPortionPolicy, getRoleScalingPolicy } from "./policy.ts";

type MutableAssignment = number[];

type EvalResult = {
  nutrition: IngredientNutrition;
  score: number;
  assignments: MutableAssignment;
};

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function defaultPriorities(intent: MealNutritionIntent): Required<
  NonNullable<MealNutritionIntent["priorities"]>
> {
  return {
    calories: intent.priorities?.calories ?? 1,
    protein: intent.priorities?.protein ?? (intent.targetProteinGrams != null ? 1 : 0),
    carbs: intent.priorities?.carbs ?? (intent.targetCarbsGrams != null ? 1 : 0),
    fat: intent.priorities?.fat ?? (intent.targetFatGrams != null ? 1 : 0),
    fiber: intent.priorities?.fiber ?? (intent.targetFiberGrams != null ? 1 : 0),
  };
}

function variablePreferred(variable: PortionVariable): number {
  switch (variable.kind) {
    case "recipe_scale":
      return variable.preferredScale;
    case "food_grams":
      return variable.preferredGrams;
    case "count":
      return variable.preferredCount;
    case "fixed":
      return variable.amount;
  }
}

function variableMin(variable: PortionVariable): number {
  switch (variable.kind) {
    case "recipe_scale":
      return variable.minScale;
    case "food_grams":
      return variable.minGrams;
    case "count":
      return variable.minCount;
    case "fixed":
      return variable.amount;
  }
}

function variableMax(variable: PortionVariable): number {
  switch (variable.kind) {
    case "recipe_scale":
      return variable.maxScale;
    case "food_grams":
      return variable.maxGrams;
    case "count":
      return variable.maxCount;
    case "fixed":
      return variable.amount;
  }
}

function variableStep(variable: PortionVariable, coarse: boolean): number {
  if (variable.kind === "fixed") return 0;
  if (variable.kind === "count") {
    return variable.quantityStep ?? 1;
  }
  if (variable.kind === "food_grams") {
    const base = variable.quantityStep ?? 5;
    return coarse ? Math.max(base, 15) : Math.max(1, Math.round(base));
  }
  // recipe_scale
  const base = variable.quantityStep ?? 0.05;
  return coarse ? Math.max(base, 0.1) : Math.max(0.025, base / 2);
}

function snapToStep(value: number, min: number, max: number, step: number): number {
  if (step <= 0) return clamp(value, min, max);
  const snapped = Math.round((value - min) / step) * step + min;
  return clamp(Number(snapped.toFixed(6)), min, max);
}

function enumerateValues(variable: PortionVariable, coarse: boolean): number[] {
  if (variable.kind === "fixed") return [variable.amount];
  const min = variableMin(variable);
  const max = variableMax(variable);
  const step = variableStep(variable, coarse);
  const values: number[] = [];
  for (let v = min; v <= max + step * 0.25; v += step) {
    values.push(clamp(Number(v.toFixed(6)), min, max));
  }
  const preferred = variablePreferred(variable);
  if (!values.some((v) => Math.abs(v - preferred) < step * 0.25)) {
    values.push(preferred);
  }
  values.sort((a, b) => a - b);
  // Dedup
  const out: number[] = [];
  for (const v of values) {
    if (out.length === 0 || Math.abs(out[out.length - 1]! - v) > 1e-9) out.push(v);
  }
  return out;
}

function nutritionForAssignment(
  variable: PortionVariable,
  value: number,
): IngredientNutrition {
  switch (variable.kind) {
    case "recipe_scale":
      return nutritionForRecipeScale(variable.baseNutrition, value);
    case "food_grams":
      return nutritionForFoodGrams(variable.nutritionPer100g, value);
    case "count":
      return nutritionForCount(variable.nutritionPerUnit, value);
    case "fixed":
      return variable.nutrition;
  }
}

function aggregateNutrition(
  variables: readonly PortionVariable[],
  assignments: readonly number[],
): IngredientNutrition {
  const parts = variables.map((variable, index) =>
    nutritionForAssignment(variable, assignments[index]!),
  );
  return sumIngredientNutrition(parts);
}

function normalizedAbsError(actual: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.abs(actual - target) / target;
}

function undershootError(actual: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  if (actual >= target) return (actual - target) / target * 0.35;
  return (target - actual) / target;
}

function culinaryPenalty(
  variables: readonly PortionVariable[],
  assignments: readonly number[],
  policy: MealPortionPolicy,
): number {
  let total = 0;
  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i]!;
    if (variable.kind === "fixed") continue;
    const preferred = variablePreferred(variable);
    const selected = assignments[i]!;
    const span = Math.max(variableMax(variable) - variableMin(variable), 1e-6);
    const normalized = Math.abs(selected - preferred) / span;
    const rolePolicy = getRoleScalingPolicy(variable.role, policy);
    total += rolePolicy.deviationPenalty * normalized * normalized;
  }
  return total;
}

function scoreAssignment(
  variables: readonly PortionVariable[],
  assignments: readonly number[],
  intent: MealNutritionIntent,
  policy: MealPortionPolicy,
): EvalResult {
  const nutrition = aggregateNutrition(variables, assignments);
  const priorities = defaultPriorities(intent);
  const w = policy.objectiveWeights;

  let score = 0;
  score +=
    w.calories *
    priorities.calories *
    normalizedAbsError(nutrition.caloriesKcal, intent.targetCaloriesKcal);

  if (intent.targetProteinGrams != null && priorities.protein > 0) {
    score +=
      w.protein *
      priorities.protein *
      undershootError(nutrition.proteinGrams, intent.targetProteinGrams);
  }
  if (intent.targetCarbsGrams != null && priorities.carbs > 0) {
    score +=
      w.carbs *
      priorities.carbs *
      normalizedAbsError(nutrition.carbohydrateGrams, intent.targetCarbsGrams);
  }
  if (intent.targetFatGrams != null && priorities.fat > 0) {
    score +=
      w.fat *
      priorities.fat *
      normalizedAbsError(nutrition.fatGrams, intent.targetFatGrams);
  }
  if (intent.targetFiberGrams != null && priorities.fiber > 0) {
    const fiber = nutrition.fiberGrams;
    if (fiber !== undefined) {
      score +=
        w.fiber * priorities.fiber * undershootError(fiber, intent.targetFiberGrams);
    }
  }

  score += w.culinary * culinaryPenalty(variables, assignments, policy);

  return { nutrition, score, assignments: [...assignments] };
}

function productSize(lists: number[][]): number {
  return lists.reduce((acc, list) => acc * Math.max(list.length, 1), 1);
}

/**
 * Deterministic coarse-to-fine search over a small number of portion variables.
 * Prefer full coarse Cartesian product when tractable; otherwise coordinate descent.
 */
function searchBestAssignment(
  variables: readonly PortionVariable[],
  intent: MealNutritionIntent,
  policy: MealPortionPolicy,
): { best: EvalResult; candidatesEvaluated: number } {
  let candidatesEvaluated = 0;
  const preferred = variables.map(variablePreferred);

  const coarseLists = variables.map((v) => enumerateValues(v, true));
  let best = scoreAssignment(variables, preferred, intent, policy);
  candidatesEvaluated += 1;

  const coarseProduct = productSize(coarseLists);
  if (coarseProduct <= 12_000) {
    const recurse = (index: number, current: number[]) => {
      if (index >= variables.length) {
        const evalResult = scoreAssignment(variables, current, intent, policy);
        candidatesEvaluated += 1;
        if (evalResult.score < best.score) best = evalResult;
        return;
      }
      for (const value of coarseLists[index]!) {
        current[index] = value;
        recurse(index + 1, current);
      }
    };
    recurse(0, [...preferred]);
  } else {
    // Coordinate descent — deterministic order by flexibility (wide first).
    const order = variables
      .map((v, index) => ({
        index,
        flexibility: getRoleScalingPolicy(v.role, policy).flexibility,
      }))
      .sort((a, b) => {
        const rank = (f: string) =>
          f === "wide" ? 0 : f === "moderate" ? 1 : f === "tight" ? 2 : 3;
        return rank(a.flexibility) - rank(b.flexibility);
      });

    let current = [...preferred];
    for (let pass = 0; pass < 3; pass++) {
      for (const { index } of order) {
        const values = coarseLists[index]!;
        let localBest = best;
        for (const value of values) {
          const trial = [...current];
          trial[index] = value;
          const evalResult = scoreAssignment(variables, trial, intent, policy);
          candidatesEvaluated += 1;
          if (evalResult.score < localBest.score) {
            localBest = evalResult;
          }
        }
        current = localBest.assignments;
        best = localBest;
      }
    }
  }

  // Fine refine around best (±2 steps per adjustable variable).
  const fine = [...best.assignments];
  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i]!;
    if (variable.kind === "fixed") continue;
    const step = variableStep(variable, false);
    const min = variableMin(variable);
    const max = variableMax(variable);
    const center = fine[i]!;
    let localBestVal = center;
    let localBestScore = best.score;
    for (const delta of [-2, -1, 0, 1, 2]) {
      const candidate = snapToStep(center + delta * step, min, max, step);
      const trial = [...fine];
      trial[i] = candidate;
      const evalResult = scoreAssignment(variables, trial, intent, policy);
      candidatesEvaluated += 1;
      if (evalResult.score < localBestScore) {
        localBestScore = evalResult.score;
        localBestVal = candidate;
        best = evalResult;
      }
    }
    fine[i] = localBestVal;
  }

  // Second fine pass jointly nearby for carb × main when both adjustable.
  const carbIdx = variables.findIndex((v) => v.role === "carbohydrate" && v.kind !== "fixed");
  const mainIdx = variables.findIndex((v) => v.role === "main" && v.kind !== "fixed");
  if (carbIdx >= 0 && mainIdx >= 0) {
    const carbVar = variables[carbIdx]!;
    const mainVar = variables[mainIdx]!;
    const carbStep = variableStep(carbVar, false);
    const mainStep = variableStep(mainVar, false);
    for (const cd of [-1, 0, 1]) {
      for (const md of [-1, 0, 1]) {
        const trial = [...best.assignments];
        trial[carbIdx] = snapToStep(
          best.assignments[carbIdx]! + cd * carbStep,
          variableMin(carbVar),
          variableMax(carbVar),
          carbStep,
        );
        trial[mainIdx] = snapToStep(
          best.assignments[mainIdx]! + md * mainStep,
          variableMin(mainVar),
          variableMax(mainVar),
          mainStep,
        );
        const evalResult = scoreAssignment(variables, trial, intent, policy);
        candidatesEvaluated += 1;
        if (evalResult.score < best.score) best = evalResult;
      }
    }
  }

  return { best, candidatesEvaluated };
}

function roundAssignments(
  variables: readonly PortionVariable[],
  assignments: readonly number[],
): number[] {
  return variables.map((variable, index) => {
    const value = assignments[index]!;
    switch (variable.kind) {
      case "food_grams":
        return clamp(
          roundPracticalGrams(value),
          Math.ceil(variable.minGrams),
          Math.floor(variable.maxGrams),
        );
      case "count": {
        const step = variable.quantityStep ?? 1;
        const rounded = roundPracticalCount(value, step);
        return clamp(rounded, variable.minCount, variable.maxCount);
      }
      case "recipe_scale": {
        // Keep scale precise; display grams are rounded separately.
        return Number(value.toFixed(4));
      }
      case "fixed":
        return variable.amount;
    }
  });
}

function portionFromAssignment(
  variable: PortionVariable,
  value: number,
): PersonalizedMealPortion {
  const nutrition = roundPortionNutrition(nutritionForAssignment(variable, value));
  switch (variable.kind) {
    case "recipe_scale": {
      if (variable.referenceYieldGrams != null) {
        const grams = roundPracticalGrams(variable.referenceYieldGrams * value);
        return {
          componentId: variable.componentId,
          displayName: variable.displayName,
          role: variable.role,
          amount: grams,
          unit: "g",
          internalScale: value,
          nutrition: roundPortionNutrition(
            nutritionForRecipeScale(variable.baseNutrition, grams / variable.referenceYieldGrams),
          ),
        };
      }
      // Servings-only representation — do not invent gram yield.
      const servings = Number((value * (variable.baseServings ?? 1)).toFixed(2));
      return {
        componentId: variable.componentId,
        displayName: variable.displayName,
        role: variable.role,
        amount: servings,
        unit: servings === 1 ? "serving" : "servings",
        internalScale: value,
        nutrition,
      };
    }
    case "food_grams":
      return {
        componentId: variable.componentId,
        displayName: variable.displayName,
        role: variable.role,
        amount: roundPracticalGrams(value),
        unit: "g",
        nutrition: roundPortionNutrition(
          nutritionForFoodGrams(variable.nutritionPer100g, roundPracticalGrams(value)),
        ),
      };
    case "count": {
      const count = roundPracticalCount(value, variable.quantityStep ?? 1);
      return {
        componentId: variable.componentId,
        displayName: variable.displayName,
        role: variable.role,
        amount: count,
        unit: variable.unitLabel,
        nutrition: roundPortionNutrition(nutritionForCount(variable.nutritionPerUnit, count)),
      };
    }
    case "fixed":
      return {
        componentId: variable.componentId,
        displayName: variable.displayName,
        role: variable.role,
        amount: variable.amount,
        unit: variable.unit,
        nutrition: roundPortionNutrition(variable.nutrition),
      };
  }
}

function buildDiagnostics(input: {
  mealName?: string;
  status: PersonalizedMealPlan["status"];
  blockReason?: PortionSolverBlockReason;
  message?: string;
  variables: readonly PortionVariable[];
  assignments?: readonly number[];
  nutrition?: IngredientNutrition;
  intent: MealNutritionIntent;
  objectiveScore?: number;
  candidatesEvaluated?: number;
  solveTimeMs?: number;
}): PortionSolverDiagnostics {
  const variableDiagnostics: PortionVariableDiagnostic[] = input.variables.map((variable, index) => {
    const preferred = variablePreferred(variable);
    const selected = input.assignments?.[index] ?? preferred;
    let unit = "unit";
    if (variable.kind === "food_grams") unit = "g";
    else if (variable.kind === "recipe_scale") {
      unit = variable.referenceYieldGrams != null ? "x" : "serving";
    } else if (variable.kind === "count") unit = variable.unitLabel;
    else if (variable.kind === "fixed") unit = variable.unit;
    return {
      componentId: variable.componentId,
      displayName: variable.displayName,
      role: variable.role,
      kind: variable.kind,
      preferred,
      selected,
      min: variableMin(variable),
      max: variableMax(variable),
      unit,
      deviationFromPreferred: selected - preferred,
    };
  });

  const nutrition = input.nutrition;
  return {
    mealName: input.mealName,
    status: input.status,
    blockReason: input.blockReason,
    message: input.message,
    variables: variableDiagnostics,
    calorieDeviationKcal:
      nutrition != null
        ? Number((nutrition.caloriesKcal - input.intent.targetCaloriesKcal).toFixed(2))
        : undefined,
    proteinDeviationGrams:
      nutrition != null && input.intent.targetProteinGrams != null
        ? Number((nutrition.proteinGrams - input.intent.targetProteinGrams).toFixed(2))
        : undefined,
    carbsDeviationGrams:
      nutrition != null && input.intent.targetCarbsGrams != null
        ? Number((nutrition.carbohydrateGrams - input.intent.targetCarbsGrams).toFixed(2))
        : undefined,
    fatDeviationGrams:
      nutrition != null && input.intent.targetFatGrams != null
        ? Number((nutrition.fatGrams - input.intent.targetFatGrams).toFixed(2))
        : undefined,
    fiberDeviationGrams:
      nutrition != null &&
      input.intent.targetFiberGrams != null &&
      nutrition.fiberGrams !== undefined
        ? Number((nutrition.fiberGrams - input.intent.targetFiberGrams).toFixed(2))
        : undefined,
    objectiveScore: input.objectiveScore,
    candidatesEvaluated: input.candidatesEvaluated,
    solveTimeMs: input.solveTimeMs,
    policyVersion: MEAL_PORTION_POLICY_VERSION,
    solverVersion: MEAL_PORTION_SOLVER_VERSION,
  };
}

export function blockedPlan(
  request: SolveMealPortionsRequest,
  reason: PortionSolverBlockReason,
  message: string,
  variables: readonly PortionVariable[] = [],
  solveTimeMs?: number,
): PersonalizedMealPlan {
  const generatedAt = request.generatedAt ?? new Date().toISOString();
  return {
    mealId: request.mealId,
    mealName: request.mealName,
    sourceCompleteMealId: request.sourceCompleteMealId,
    portions: variables.length
      ? variables.map((v) => portionFromAssignment(v, variablePreferred(v)))
      : [
          {
            componentId: "unavailable",
            displayName: request.mealName ?? "Meal",
            role: "main",
            amount: 1,
            unit: "serving",
            nutrition: {
              caloriesKcal: 0,
              proteinGrams: 0,
              carbohydrateGrams: 0,
              fatGrams: 0,
            },
          },
        ],
    nutrition: {
      caloriesKcal: 0,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 0,
    },
    intent: request.nutritionIntent,
    status: "blocked",
    diagnostics: buildDiagnostics({
      mealName: request.mealName,
      status: "blocked",
      blockReason: reason,
      message,
      variables,
      intent: request.nutritionIntent,
      solveTimeMs,
    }),
    policyVersion: MEAL_PORTION_POLICY_VERSION,
    solverVersion: MEAL_PORTION_SOLVER_VERSION,
    nutritionSourceVersion: request.nutritionSourceVersion,
    generatedAt,
  };
}

function classifyStatus(
  nutrition: IngredientNutrition,
  intent: MealNutritionIntent,
  policy: MealPortionPolicy,
): PersonalizedMealPlan["status"] {
  const calorieOk =
    Math.abs(nutrition.caloriesKcal - intent.targetCaloriesKcal) /
      intent.targetCaloriesKcal <=
    policy.solvedCalorieToleranceFraction;
  let proteinOk = true;
  if (intent.targetProteinGrams != null && intent.targetProteinGrams > 0) {
    const min =
      intent.targetProteinGrams * (1 - policy.solvedProteinUndershootFraction);
    proteinOk = nutrition.proteinGrams >= min;
  }
  return calorieOk && proteinOk ? "solved" : "best_feasible";
}

function minimumCalories(variables: readonly PortionVariable[]): number {
  const mins = variables.map((v) => variableMin(v));
  return aggregateNutrition(variables, mins).caloriesKcal;
}

/**
 * Deterministic complete-meal portion solver (PLAN-010).
 * Consumes trusted nutrition coefficients + MealNutritionIntent.
 * Does not allocate daily targets across meals (PLAN-011).
 */
export function solveMealPortions(request: SolveMealPortionsRequest): PersonalizedMealPlan {
  const started = nowMs();
  const policy = getMealPortionPolicy(request.policyVersion ?? MEAL_PORTION_POLICY_VERSION);
  const intent = request.nutritionIntent;

  if (
    !Number.isFinite(intent.targetCaloriesKcal) ||
    intent.targetCaloriesKcal <= 0 ||
    (intent.targetProteinGrams != null && intent.targetProteinGrams < 0) ||
    (intent.targetCarbsGrams != null && intent.targetCarbsGrams < 0) ||
    (intent.targetFatGrams != null && intent.targetFatGrams < 0) ||
    (intent.targetFiberGrams != null && intent.targetFiberGrams < 0)
  ) {
    return blockedPlan(request, "invalid_intent", "Nutrition intent targets must be finite and valid.");
  }

  const built = buildPortionVariables(request.components, policy);
  if (!built.ok) {
    return blockedPlan(
      request,
      built.error.code,
      built.error.message,
      [],
      nowMs() - started,
    );
  }

  const { variables } = built;
  const minCalories = minimumCalories(variables);
  if (minCalories > intent.targetCaloriesKcal * (1 + policy.hardCalorieOvershootFraction)) {
    return blockedPlan(
      request,
      "minimum_exceeds_calorie_ceiling",
      `Minimum culinary portions already provide ~${Math.round(minCalories)} kcal vs target ${Math.round(intent.targetCaloriesKcal)} kcal.`,
      variables,
      nowMs() - started,
    );
  }

  const { best, candidatesEvaluated } = searchBestAssignment(variables, intent, policy);
  const roundedAssignments = roundAssignments(variables, best.assignments);

  // Recalculate nutrition from practical (rounded) quantities — authoritative.
  const portions = variables.map((variable, index) =>
    portionFromAssignment(variable, roundedAssignments[index]!),
  );
  // Re-derive meal nutrition strictly from portion rows (post-rounding).
  const mealNutritionRaw = sumIngredientNutrition(portions.map((p) => p.nutrition));
  const mealNutrition = roundMealNutritionForAuthority(mealNutritionRaw);
  // Keep portion nutrition already rounded; meal uses rounded macros for display authority.
  const status = classifyStatus(
    {
      caloriesKcal: mealNutrition.caloriesKcal,
      proteinGrams: mealNutrition.proteinGrams,
      carbohydrateGrams: mealNutrition.carbsGrams,
      fatGrams: mealNutrition.fatGrams,
      fiberGrams: mealNutrition.fiberGrams,
    },
    intent,
    policy,
  );

  const solveTimeMs = Number((nowMs() - started).toFixed(3));
  const generatedAt = request.generatedAt ?? new Date().toISOString();

  return {
    mealId: request.mealId,
    mealName: request.mealName,
    sourceCompleteMealId: request.sourceCompleteMealId,
    portions,
    nutrition: mealNutrition,
    intent,
    status,
    diagnostics: buildDiagnostics({
      mealName: request.mealName,
      status,
      message:
        status === "solved"
          ? "Within culinary bounds and nutrition tolerance."
          : "Best feasible plate within culinary bounds.",
      variables,
      assignments: roundedAssignments,
      nutrition: {
        caloriesKcal: mealNutrition.caloriesKcal,
        proteinGrams: mealNutrition.proteinGrams,
        carbohydrateGrams: mealNutrition.carbsGrams,
        fatGrams: mealNutrition.fatGrams,
        fiberGrams: mealNutrition.fiberGrams,
      },
      intent,
      objectiveScore: Number(best.score.toFixed(6)),
      candidatesEvaluated,
      solveTimeMs,
    }),
    policyVersion: MEAL_PORTION_POLICY_VERSION,
    solverVersion: MEAL_PORTION_SOLVER_VERSION,
    nutritionSourceVersion: request.nutritionSourceVersion,
    generatedAt,
  };
}

/** Developer helper: format diagnostics as a readable multi-line string. */
export function formatPortionSolverDiagnostics(plan: PersonalizedMealPlan): string {
  const d = plan.diagnostics;
  const lines: string[] = [];
  lines.push(`Meal: ${plan.mealName ?? plan.mealId}`);
  lines.push("Intent:");
  lines.push(`  ${plan.intent.targetCaloriesKcal} kcal`);
  if (plan.intent.targetProteinGrams != null) {
    lines.push(`  ${plan.intent.targetProteinGrams}g protein`);
  }
  if (plan.intent.isDeveloperTestIntent) {
    lines.push("  (developer/test intent — not production daily allocation)");
  }
  lines.push("Variables:");
  for (const v of d.variables) {
    lines.push(
      `  ${v.displayName}: preferred ${v.preferred}${v.unit === "x" ? "x" : v.unit === "g" ? "g" : ` ${v.unit}`} → selected ${v.selected}${v.unit === "x" ? "x" : v.unit === "g" ? "g" : ` ${v.unit}`}`,
    );
  }
  lines.push("Result:");
  lines.push(`  ${plan.nutrition.caloriesKcal} kcal`);
  lines.push(`  ${plan.nutrition.proteinGrams}g protein`);
  lines.push(`  ${plan.nutrition.carbsGrams}g carbs`);
  lines.push(`  ${plan.nutrition.fatGrams}g fat`);
  if (plan.nutrition.fiberGrams != null) {
    lines.push(`  ${plan.nutrition.fiberGrams}g fiber`);
  }
  if (d.calorieDeviationKcal != null) {
    lines.push(
      `Calorie deviation: ${d.calorieDeviationKcal >= 0 ? "+" : ""}${d.calorieDeviationKcal}`,
    );
  }
  if (d.proteinDeviationGrams != null) {
    lines.push(
      `Protein deviation: ${d.proteinDeviationGrams >= 0 ? "+" : ""}${d.proteinDeviationGrams}`,
    );
  }
  lines.push(`Status: ${plan.status}`);
  if (d.blockReason) lines.push(`Block reason: ${d.blockReason}`);
  lines.push(`Policy: ${plan.policyVersion}`);
  if (d.candidatesEvaluated != null) {
    lines.push(`Candidates evaluated: ${d.candidatesEvaluated}`);
  }
  if (d.solveTimeMs != null) {
    lines.push(`Solve time: ${d.solveTimeMs.toFixed(2)} ms`);
  }
  return lines.join("\n");
}

export function toPersonalizedMealNutritionFromPlan(
  plan: PersonalizedMealPlan,
): ReturnType<typeof toPersonalizedMealNutrition> {
  return plan.nutrition;
}
