import { describe, expect, it } from "vitest";
import {
  chooseOnboardingRmrSource,
  chooseOnboardingWearable,
  completeOnboarding,
  createOnboardingView,
  submitOnboardingBasics,
  submitOnboardingDexa,
  submitOnboardingGoal,
  submitOnboardingWearableCalories,
} from "./onboarding-flow";

const asOf = new Date("2026-09-07T00:00:00.000Z");

const validBasics = {
  dateOfBirth: "1990-03-01",
  biologicalSex: "male" as const,
  heightCm: "180",
  weightKg: "80",
};

function startEstimatedPath() {
  let view = createOnboardingView({
    ...validBasics,
    wearableCaloriesKcal: "650",
  });
  view = submitOnboardingGoal(view, "muscle_gain");
  view = chooseOnboardingWearable(view, "apple_watch");
  view = submitOnboardingWearableCalories(view);
  view = submitOnboardingBasics(view, asOf);
  return view;
}

describe("energy onboarding flow", () => {
  it("starts on the goal step", () => {
    const view = createOnboardingView();
    expect(view.step).toBe("goal");
    expect(view.result).toBeNull();
  });

  it("walks Apple Watch + estimated RMR to a labeled TDEE result", () => {
    let view = startEstimatedPath();
    expect(view.step).toBe("source");

    view = chooseOnboardingRmrSource(view, false, asOf);
    expect(view.step).toBe("result");
    expect(view.result?.rmrKcal).toBe(1750);
    expect(view.result?.formattedRmr).toBe("1,750 kcal/day");
    expect(view.result?.sourceLabel).toBe("Estimated using Mifflin-St Jeor");
    expect(view.result?.tdeeKcal).toBe(2400);
    expect(view.result?.formattedTdee).toBe("2,400 kcal/day");
    expect(view.result?.tdeeSource).toBe("apple_watch_active_plus_rmr");
    expect(view.result?.tdeeSourceLabel).toBe("Active calories + your RMR");
    expect(view.result?.goalType).toBe("muscle_gain");
    expect(view.result?.goalLabel).toBe("Bulking");
  });

  it("walks Whoop + DEXA RMR and uses daily calories as TDEE", () => {
    let view = createOnboardingView({
      ...validBasics,
      wearableCaloriesKcal: "2800",
      reportedRmrKcal: "1782",
      reportDate: "2026-01-15",
    });
    view = submitOnboardingGoal(view, "fat_loss");
    view = chooseOnboardingWearable(view, "whoop");
    view = submitOnboardingWearableCalories(view);
    view = submitOnboardingBasics(view, asOf);
    view = chooseOnboardingRmrSource(view, true, asOf);
    expect(view.step).toBe("dexa_details");

    view = submitOnboardingDexa(view, asOf);
    expect(view.step).toBe("result");
    expect(view.result?.rmrKcal).toBe(1782);
    expect(view.result?.source).toBe("user_reported_dexa");
    expect(view.result?.tdeeKcal).toBe(2800);
    expect(view.result?.tdeeSource).toBe("whoop_daily_calories");
    expect(view.result?.tdeeSourceLabel).toBe("From your Whoop average daily calories");
    expect(view.result?.goalLabel).toBe("Shredding / Weight Loss");
  });

  it("surfaces a missing goal", () => {
    let view = createOnboardingView();
    view = submitOnboardingGoal(view, "general_fitness" as never);
    expect(view.step).toBe("goal");
    expect(view.error).toMatch(/Bulking|Shredding|Recomposition/);
  });

  it("surfaces wearable calorie validation errors", () => {
    let view = createOnboardingView({ wearableCaloriesKcal: "10" });
    view = submitOnboardingGoal(view, "recomposition");
    view = chooseOnboardingWearable(view, "whoop");
    view = submitOnboardingWearableCalories(view);
    expect(view.step).toBe("wearable_calories");
    expect(view.error).toMatch(/range/i);
  });

  it("surfaces validation errors on basics", () => {
    let view = createOnboardingView({
      ...validBasics,
      dateOfBirth: "2027-01-01",
      wearableCaloriesKcal: "650",
    });
    view = submitOnboardingGoal(view, "recomposition");
    view = chooseOnboardingWearable(view, "apple_watch");
    view = submitOnboardingWearableCalories(view);
    view = submitOnboardingBasics(view, asOf);
    expect(view.step).toBe("basics");
    expect(view.error).toMatch(/future/i);
  });

  it("surfaces validation errors on the DEXA form", () => {
    let view = createOnboardingView({
      ...validBasics,
      wearableCaloriesKcal: "650",
      reportedRmrKcal: "1782",
      reportDate: "2026-12-01",
    });
    view = submitOnboardingGoal(view, "recomposition");
    view = chooseOnboardingWearable(view, "apple_watch");
    view = submitOnboardingWearableCalories(view);
    view = submitOnboardingBasics(view, asOf);
    view = chooseOnboardingRmrSource(view, true, asOf);
    view = submitOnboardingDexa(view, asOf);
    expect(view.step).toBe("dexa_details");
    expect(view.error).toMatch(/future/i);
    expect(view.result).toBeNull();
  });
});

describe("completeOnboarding", () => {
  it("returns profile, RMR, TDEE, and goal for the estimated Apple Watch path", () => {
    const result = completeOnboarding({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      source: "estimated_mifflin_st_jeor",
      goalType: "muscle_gain",
      wearable: "apple_watch",
      wearableCaloriesKcal: 650,
      asOf,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.rmr.rmrKcal).toBe(1750);
    expect(result.value.tdee.tdeeKcal).toBe(2400);
    expect(result.value.goalType).toBe("muscle_gain");
    expect(result.value.tdee.inputSnapshot).toEqual({
      wearable: "apple_watch",
      wearableCaloriesKcal: 650,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "muscle_gain",
    });
  });

  it("uses Whoop daily calories as TDEE and keeps algorithm fields null", () => {
    const result = completeOnboarding({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      source: "estimated_mifflin_st_jeor",
      goalType: "recomposition",
      wearable: "whoop",
      wearableCaloriesKcal: 2800,
      asOf,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.tdee.tdeeKcal).toBe(2800);
    expect(result.value.tdee.algorithmName).toBeNull();
    expect(result.value.tdee.algorithmVersion).toBeNull();
  });
});
