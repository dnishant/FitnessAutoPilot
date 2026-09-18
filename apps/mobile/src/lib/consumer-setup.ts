import type {
  CalorieTarget,
  CookingPreferences,
  Goal,
  MealPreferences,
  NutritionTarget,
  ProfileBasics,
  RmrEstimate,
  TdeeEstimate,
} from "@fitness-autopilot/contracts";

/**
 * Consumer authenticated lifecycle — derive route from persisted domain records,
 * not AsyncStorage navigation flags.
 */

export type ConsumerSetupSnapshot = {
  profile: ProfileBasics | null;
  currentRmr: RmrEstimate | null;
  currentTdee: TdeeEstimate | null;
  currentCalorieTarget: CalorieTarget | null;
  nutritionTarget: NutritionTarget | null;
  goal: Goal | null;
  mealPreferences: MealPreferences | null;
  cookingPreferences: CookingPreferences | null;
};

/** Core nutrition/identity setup (before meal/cooking prefs). */
export function isCoreSetupComplete(state: ConsumerSetupSnapshot): boolean {
  return Boolean(
    state.profile &&
      state.currentRmr &&
      state.currentTdee &&
      state.currentCalorieTarget &&
      state.nutritionTarget &&
      state.goal,
  );
}

/** Fully configured for main app (prefs included). Missing plan is OK. */
export function isConsumerSetupComplete(state: ConsumerSetupSnapshot): boolean {
  return (
    isCoreSetupComplete(state) &&
    state.mealPreferences != null &&
    state.cookingPreferences != null
  );
}

export type AuthenticatedBootstrapRoute =
  | { kind: "onboarding" }
  | { kind: "meal_preferences" }
  | { kind: "cooking_preferences" }
  | { kind: "main" };

/**
 * Where an authenticated user should land after session restore.
 * Configured users always go to main — even with no weekly plan.
 */
export function resolveAuthenticatedBootstrapRoute(
  state: ConsumerSetupSnapshot,
): AuthenticatedBootstrapRoute {
  if (!isCoreSetupComplete(state)) {
    return { kind: "onboarding" };
  }
  if (!state.mealPreferences) {
    return { kind: "meal_preferences" };
  }
  if (!state.cookingPreferences) {
    return { kind: "cooking_preferences" };
  }
  return { kind: "main" };
}

export function authenticatedBootstrapHref(
  route: AuthenticatedBootstrapRoute,
): "/onboarding" | "/preferences" | "/cooking-preferences" | "/(tabs)/today" {
  switch (route.kind) {
    case "onboarding":
      return "/onboarding";
    case "meal_preferences":
      return "/preferences";
    case "cooking_preferences":
      return "/cooking-preferences";
    case "main":
      return "/(tabs)/today";
  }
}
