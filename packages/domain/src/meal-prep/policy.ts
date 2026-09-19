import type {
  CookingPreferences,
  CoreMealRepertoire,
  CompleteMeal,
  GroceryList,
  MealPrepIssue,
  MealPrepPlan,
  PersonalizedWeeklyNutritionPlan,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import {
  CULINARY_PREP_INTERPRETATION_VERSION,
  MEAL_PREP_POLICY_VERSION,
} from "@fitness-autopilot/contracts";

export const MEAL_PREP_POLICY = {
  version: MEAL_PREP_POLICY_VERSION,
  culinaryInterpretationVersion: CULINARY_PREP_INTERPRETATION_VERSION,
  /** Max concurrent attention-heavy active tasks. */
  maxConcurrentAttentionTasks: 1,
  /** Max simple parallel active tasks when none require heavy attention. */
  maxConcurrentSimpleActiveTasks: 2,
  /** Oven tasks may overlap when temperatures are within this delta (°F). */
  ovenTemperatureCompatibilityDeltaF: 25,
  /** Prefer freezing when days-until-eat exceeds fridge life. */
  freezeWhenBeyondFridgeLife: true,
  /** Thaw the evening before eating. */
  thawDaysBeforeEat: 1,
  /** Practical batch: do not round up more than this fraction above required. */
  maxPracticalBatchOvershootFraction: 0.15,
  /** Absolute overshoot cap in reference servings. */
  maxPracticalBatchOvershootServings: 0.5,
  /** Default fridge life when CoreMeal has none but mealPrepQuality is good+. */
  defaultFridgeLifeWhenGoodPrep: 3,
  /** Ingredient reconciliation relative tolerance. */
  ingredientReconciliationTolerance: 0.02,
} as const;

export type BuildMealPrepPlanInput = {
  personalizedWeeklyPlan: PersonalizedWeeklyNutritionPlan;
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  completeMealsByCandidateId?: Record<string, CompleteMeal>;
  coreRepertoire?: CoreMealRepertoire;
  groceryList?: GroceryList;
  cookingPreferences?: Pick<
    CookingPreferences,
    | "cookingStyle"
    | "prepFrequency"
    | "maxPrepSessionMinutes"
    | "maxFinishMinutes"
  > | null;
  /** Usually strategy.flexibleDay — default sunday. */
  prepSessionDay?: MealPrepPlan["prepSessionDay"];
  generatedAt?: string;
};

export type BuildMealPrepPlanResult =
  | {
      ok: true;
      mealPrepPlan: MealPrepPlan;
      issues: MealPrepIssue[];
    }
  | {
      ok: false;
      code: MealPrepIssue["code"];
      message: string;
      issues: MealPrepIssue[];
      mealPrepPlan?: MealPrepPlan;
    };
