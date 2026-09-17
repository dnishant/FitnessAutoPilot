import type {
  MealNutritionIntent,
  PersonalizedMealPlan,
  SolveMealPortionsRequest,
} from "@fitness-autopilot/contracts";
import {
  chickenTikkaCompleteMealRequest,
  formatPortionSolverDiagnostics,
  jamaicanJerkCompleteMealRequest,
  shrimpTacosCompleteMealRequest,
  solveMealPortions,
  thaiGreenCurryCompleteMealRequest,
} from "@fitness-autopilot/domain";

export const MEAL_PORTION_PREVIEW_TITLE = "Meal Portion Solver";
export const MEAL_PORTION_PREVIEW_LOADING = "Solving portions…";

export type PortionPreviewFixtureId =
  | "tikka"
  | "jerk"
  | "thai"
  | "tacos";

export const PORTION_PREVIEW_FIXTURES: Array<{
  id: PortionPreviewFixtureId;
  label: string;
  build: (intent: MealNutritionIntent) => SolveMealPortionsRequest;
}> = [
  {
    id: "tikka",
    label: "Chicken Tikka",
    build: chickenTikkaCompleteMealRequest,
  },
  {
    id: "jerk",
    label: "Jerk Chicken",
    build: jamaicanJerkCompleteMealRequest,
  },
  {
    id: "thai",
    label: "Thai Green Curry",
    build: thaiGreenCurryCompleteMealRequest,
  },
  {
    id: "tacos",
    label: "Shrimp Tacos",
    build: shrimpTacosCompleteMealRequest,
  },
];

export type MealPortionPreviewUiState = {
  fixtureId: PortionPreviewFixtureId;
  targetCalories: string;
  targetProtein: string;
  targetCarbs: string;
  targetFat: string;
  targetFiber: string;
  busy: boolean;
  result: PersonalizedMealPlan | null;
  diagnosticsText: string | null;
  error: string | null;
};

export function createMealPortionPreviewUiState(): MealPortionPreviewUiState {
  return {
    fixtureId: "tikka",
    targetCalories: "600",
    targetProtein: "50",
    targetCarbs: "60",
    targetFat: "18",
    targetFiber: "8",
    busy: false,
    result: null,
    diagnosticsText: null,
    error: null,
  };
}

export function parseDeveloperTestIntent(state: MealPortionPreviewUiState): MealNutritionIntent {
  const calories = Number(state.targetCalories);
  if (!Number.isFinite(calories) || calories <= 0) {
    throw new Error("Target calories must be a positive number.");
  }
  const intent: MealNutritionIntent = {
    targetCaloriesKcal: calories,
    isDeveloperTestIntent: true,
    label: "Developer/test meal intent — not production daily allocation",
  };
  const protein = Number(state.targetProtein);
  if (state.targetProtein.trim() && Number.isFinite(protein)) {
    intent.targetProteinGrams = protein;
  }
  const carbs = Number(state.targetCarbs);
  if (state.targetCarbs.trim() && Number.isFinite(carbs)) {
    intent.targetCarbsGrams = carbs;
  }
  const fat = Number(state.targetFat);
  if (state.targetFat.trim() && Number.isFinite(fat)) {
    intent.targetFatGrams = fat;
  }
  const fiber = Number(state.targetFiber);
  if (state.targetFiber.trim() && Number.isFinite(fiber)) {
    intent.targetFiberGrams = fiber;
  }
  return intent;
}

export function runMealPortionPreview(
  state: MealPortionPreviewUiState,
): { ok: true; result: PersonalizedMealPlan; diagnosticsText: string } | { ok: false; error: string } {
  try {
    const intent = parseDeveloperTestIntent(state);
    const fixture = PORTION_PREVIEW_FIXTURES.find((f) => f.id === state.fixtureId);
    if (!fixture) return { ok: false, error: "Unknown meal fixture." };
    const result = solveMealPortions(fixture.build(intent));
    return {
      ok: true,
      result,
      diagnosticsText: formatPortionSolverDiagnostics(result),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Portion solve failed.",
    };
  }
}
