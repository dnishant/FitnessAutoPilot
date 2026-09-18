import { describe, expect, it } from "vitest";
import type { ConsumerSetupSnapshot } from "./consumer-setup";
import {
  authenticatedBootstrapHref,
  isConsumerSetupComplete,
  isCoreSetupComplete,
  resolveAuthenticatedBootstrapRoute,
} from "./consumer-setup";

function snapshot(partial: Partial<ConsumerSetupSnapshot> = {}): ConsumerSetupSnapshot {
  return {
    profile: null,
    currentRmr: null,
    currentTdee: null,
    currentCalorieTarget: null,
    nutritionTarget: null,
    goal: null,
    mealPreferences: null,
    cookingPreferences: null,
    ...partial,
  };
}

const filledCore = {
  profile: {
    userId: "00000000-0000-4000-8000-000000000001",
    dateOfBirth: "1990-01-01",
    biologicalSex: "female" as const,
    heightCm: 165,
    weightKg: 65,
  },
  currentRmr: { id: "r" } as ConsumerSetupSnapshot["currentRmr"],
  currentTdee: { id: "t" } as ConsumerSetupSnapshot["currentTdee"],
  currentCalorieTarget: { id: "c" } as ConsumerSetupSnapshot["currentCalorieTarget"],
  nutritionTarget: { id: "n" } as ConsumerSetupSnapshot["nutritionTarget"],
  goal: { id: "g" } as ConsumerSetupSnapshot["goal"],
};

describe("consumer authenticated bootstrap routing", () => {
  it("sends incomplete core setup to onboarding", () => {
    const state = snapshot({
      profile: filledCore.profile,
      currentRmr: filledCore.currentRmr,
    });
    expect(isCoreSetupComplete(state)).toBe(false);
    expect(resolveAuthenticatedBootstrapRoute(state)).toEqual({ kind: "onboarding" });
    expect(authenticatedBootstrapHref(resolveAuthenticatedBootstrapRoute(state))).toBe(
      "/onboarding",
    );
  });

  it("sends core-complete user missing meal prefs to food preferences only", () => {
    const state = snapshot({ ...filledCore });
    expect(isCoreSetupComplete(state)).toBe(true);
    expect(isConsumerSetupComplete(state)).toBe(false);
    expect(resolveAuthenticatedBootstrapRoute(state)).toEqual({ kind: "meal_preferences" });
  });

  it("sends user missing only cooking prefs to cooking preferences", () => {
    const state = snapshot({
      ...filledCore,
      mealPreferences: { userId: "u" } as ConsumerSetupSnapshot["mealPreferences"],
    });
    expect(resolveAuthenticatedBootstrapRoute(state)).toEqual({ kind: "cooking_preferences" });
  });

  it("sends fully configured user to main even without a weekly plan", () => {
    const state = snapshot({
      ...filledCore,
      mealPreferences: { userId: "u" } as ConsumerSetupSnapshot["mealPreferences"],
      cookingPreferences: { userId: "u" } as ConsumerSetupSnapshot["cookingPreferences"],
    });
    expect(isConsumerSetupComplete(state)).toBe(true);
    expect(resolveAuthenticatedBootstrapRoute(state)).toEqual({ kind: "main" });
    expect(authenticatedBootstrapHref(resolveAuthenticatedBootstrapRoute(state))).toBe(
      "/(tabs)/today",
    );
  });
});
