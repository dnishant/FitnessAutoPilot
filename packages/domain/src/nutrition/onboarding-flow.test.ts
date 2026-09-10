import { describe, expect, it } from "vitest";
import { lbToKg } from "../common/units";
import {
  chooseOnboardingPace,
  chooseOnboardingRmrSource,
  chooseOnboardingWearable,
  completeOnboarding,
  continueFromCalorieTarget,
  continueFromEnergyResult,
  continueFromCuisine,
  continueFromExclusions,
  continueFromExperience,
  continueFromNutritionTarget,
  continueFromProteins,
  continueFromVariety,
  createOnboardingView,
  startMealPreferencesOnboarding,
  addOnboardingAllergy,
  addOnboardingDislike,
  addOnboardingRestriction,
  submitOnboardingBasics,
  submitOnboardingDexa,
  submitOnboardingGoal,
  submitOnboardingWearableCalories,
  toggleOnboardingCuisine,
  toggleOnboardingExperience,
  toggleOnboardingProtein,
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
    expect(result.value.calorieTarget.targetCalories).toBe(2800);
    expect(result.value.calorieTarget.pace).toBe("recommended");
  });

  it("uses the selected Faster pace for a cut", () => {
    const result = completeOnboarding({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: lbToKg(180),
      source: "estimated_mifflin_st_jeor",
      goalType: "fat_loss",
      wearable: "whoop",
      wearableCaloriesKcal: 2700,
      pace: "faster",
      asOf,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.calorieTarget.dailyCalorieAdjustment).toBe(-675);
    expect(result.value.calorieTarget.targetCalories).toBe(2025);
    expect(result.value.nutritionTarget.proteinGrams).toBeCloseTo(180, 10);
    expect(result.value.nutritionTarget.macroPolicyVersion).toBe("macro-policy-v1");
    expect(result.value.nutritionTarget.inputSnapshot.targetCalories).toBe(2025);
    expect(result.value.mealPreferences.varietyLevel).toBe("balanced");
    expect(result.value.mealPreferences.cuisines).toEqual([]);
  });
});

describe("pace and calorie-target steps", () => {
  it("asks cut users for pace, then shows the starting calorie target", () => {
    let view = createOnboardingView({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: "180",
      weightKg: String(lbToKg(180)),
      wearableCaloriesKcal: "2700",
    });
    view = submitOnboardingGoal(view, "fat_loss");
    view = chooseOnboardingWearable(view, "whoop");
    view = submitOnboardingWearableCalories(view);
    view = submitOnboardingBasics(view, asOf);
    view = chooseOnboardingRmrSource(view, false, asOf);
    view = continueFromEnergyResult(view, asOf);
    expect(view.step).toBe("pace");

    view = chooseOnboardingPace(view, "recommended", asOf);
    expect(view.step).toBe("calorie_target");
    expect(view.calorieTarget?.goalLabel).toBe("Lose weight");
    expect(view.calorieTarget?.paceLabel).toBe("Recommended");
    expect(view.calorieTarget?.formattedTargetRate).toBe("~0.9 lb/week");
    expect(view.calorieTarget?.formattedTargetCalories).toBe("2,250 kcal/day");
    expect(view.calorieTarget?.formattedMaintenance).toBe("2,700 kcal/day");
    expect(view.calorieTarget?.explanationRows.map((row) => row.label)).toEqual([
      "Current weight",
      "Selected rate",
      "Target change",
      "Daily calorie adjustment",
      "TDEE",
      "Target calories",
    ]);
  });

  it("asks bulk users for pace and shows a surplus target", () => {
    let view = createOnboardingView({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: "180",
      weightKg: String(lbToKg(180)),
      wearableCaloriesKcal: "2700",
    });
    view = submitOnboardingGoal(view, "muscle_gain");
    view = chooseOnboardingWearable(view, "whoop");
    view = submitOnboardingWearableCalories(view);
    view = submitOnboardingBasics(view, asOf);
    view = chooseOnboardingRmrSource(view, false, asOf);
    view = continueFromEnergyResult(view, asOf);
    expect(view.step).toBe("pace");

    view = chooseOnboardingPace(view, "recommended", asOf);
    expect(view.step).toBe("calorie_target");
    expect(view.calorieTarget?.goalLabel).toBe("Gain weight");
    expect(view.calorieTarget?.paceLabel).toBe("Recommended");
    expect(view.calorieTarget?.formattedTargetRate).toBe("~0.45 lb/week");
    expect(view.calorieTarget?.formattedTargetCalories).toBe("2,925 kcal/day");
  });

  it("skips pace for maintenance and uses a 0% adjustment", () => {
    let view = createOnboardingView({
      ...validBasics,
      wearableCaloriesKcal: "2700",
    });
    view = submitOnboardingGoal(view, "recomposition");
    view = chooseOnboardingWearable(view, "whoop");
    view = submitOnboardingWearableCalories(view);
    view = submitOnboardingBasics(view, asOf);
    view = chooseOnboardingRmrSource(view, false, asOf);
    view = continueFromEnergyResult(view, asOf);
    expect(view.step).toBe("calorie_target");
    expect(view.draft.pace).toBe("recommended");
    expect(view.calorieTarget?.goalLabel).toBe("Maintain");
    expect(view.calorieTarget?.formattedTargetCalories).toBe("2,700 kcal/day");
    expect(view.calorieTarget?.draft.dailyCalorieAdjustment).toBe(0);
  });
});

describe("nutrition target result", () => {
  it("renders calories, protein, fat, carbs, and the calculation explanation", () => {
    let view = createOnboardingView({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: "180",
      weightKg: String(lbToKg(180)),
      wearableCaloriesKcal: "2700",
    });
    view = submitOnboardingGoal(view, "fat_loss");
    view = chooseOnboardingWearable(view, "whoop");
    view = submitOnboardingWearableCalories(view);
    view = submitOnboardingBasics(view, asOf);
    view = chooseOnboardingRmrSource(view, false, asOf);
    view = continueFromEnergyResult(view, asOf);
    view = chooseOnboardingPace(view, "recommended", asOf);
    view = continueFromCalorieTarget(view, asOf);

    expect(view.step).toBe("nutrition_target");
    expect(view.nutritionTarget?.formattedCalories).toBe("2,250 kcal");
    expect(view.nutritionTarget?.formattedProtein).toBe("180 g");
    expect(view.nutritionTarget?.formattedFat).toBe("57 g");
    expect(view.nutritionTarget?.formattedCarbohydrates).toBe("254 g");
    expect(view.nutritionTarget?.explanationRows).toEqual([
      { label: "Protein", value: "1 g per lb of body weight" },
      { label: "Fat", value: "0.7 g per kg of body weight" },
      { label: "Carbohydrates", value: "Remaining calories after protein and fat" },
    ]);
    expect(JSON.stringify(view.nutritionTarget)).not.toMatch(/%|percent|percentage/i);
    expect(view.nutritionTarget?.draft.inputSnapshot.proteinGramsPerLb).toBe(1);
    expect(view.nutritionTarget?.draft.macroPolicyVersion).toBe("macro-policy-v1");
  });
});

describe("meal preference onboarding", () => {
  function reachNutritionTarget() {
    let view = createOnboardingView({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: "180",
      weightKg: String(lbToKg(180)),
      wearableCaloriesKcal: "2700",
    });
    view = submitOnboardingGoal(view, "fat_loss");
    view = chooseOnboardingWearable(view, "whoop");
    view = submitOnboardingWearableCalories(view);
    view = submitOnboardingBasics(view, asOf);
    view = chooseOnboardingRmrSource(view, false, asOf);
    view = continueFromEnergyResult(view, asOf);
    view = chooseOnboardingPace(view, "recommended", asOf);
    view = continueFromCalorieTarget(view, asOf);
    return view;
  }

  it("collects meal preferences after the nutrition target without requiring selections", () => {
    let view = reachNutritionTarget();
    view = continueFromNutritionTarget(view);
    expect(view.step).toBe("cuisine");
    expect(view.draft.varietyLevel).toBe("balanced");

    view = continueFromCuisine(view);
    expect(view.step).toBe("proteins");
    view = continueFromProteins(view);
    expect(view.step).toBe("exclusions");
    view = continueFromExclusions(view);
    expect(view.step).toBe("experience");
    view = continueFromExperience(view);
    expect(view.step).toBe("variety");
    view = continueFromVariety(view);
    expect(view.mealPreferences?.cuisines).toEqual([]);
    expect(view.mealPreferences?.varietyLevel).toBe("balanced");
  });

  it("keeps multiple cuisine, protein, and experience selections including Surprise me", () => {
    let view = reachNutritionTarget();
    view = continueFromNutritionTarget(view);
    view = toggleOnboardingCuisine(view, "indian");
    view = toggleOnboardingCuisine(view, "mexican");
    view = toggleOnboardingCuisine(view, "surprise_me");
    expect(view.draft.cuisines).toEqual(["indian", "mexican", "surprise_me"]);
    view = continueFromCuisine(view);
    view = toggleOnboardingProtein(view, "chicken");
    view = toggleOnboardingProtein(view, "paneer");
    expect(view.draft.proteinPreferences).toEqual(["chicken", "paneer"]);
    view = continueFromProteins(view);
    view = continueFromExclusions(view);
    view = toggleOnboardingExperience(view, "saucy_flavorful");
    view = toggleOnboardingExperience(view, "spicy");
    expect(view.draft.experiencePreferences).toEqual(["saucy_flavorful", "spicy"]);
  });

  it("stores allergies separately from restrictions and dislikes", () => {
    let view = reachNutritionTarget();
    view = continueFromNutritionTarget(view);
    view = continueFromCuisine(view);
    view = continueFromProteins(view);
    view = { ...view, draft: { ...view.draft, allergyDraft: "Peanuts" } };
    view = addOnboardingAllergy(view);
    view = { ...view, draft: { ...view.draft, restrictionDraft: "Pork" } };
    view = addOnboardingRestriction(view);
    view = { ...view, draft: { ...view.draft, dislikeDraft: "Olives" } };
    view = addOnboardingDislike(view);
    expect(view.draft.allergies).toEqual(["Peanuts"]);
    expect(view.draft.dietaryRestrictions).toEqual(["Pork"]);
    expect(view.draft.dislikes).toEqual(["Olives"]);
  });

  it("restores existing selections when editing later", () => {
    const view = startMealPreferencesOnboarding(createOnboardingView(), {
      cuisines: ["italian", "surprise_me"],
      proteinPreferences: ["eggs", "tofu"],
      allergies: ["Peanuts"],
      dietaryRestrictions: ["Pork"],
      dislikes: ["Olives"],
      experiencePreferences: ["comforting", "fresh"],
      varietyLevel: "simple",
    });
    expect(view.step).toBe("cuisine");
    expect(view.draft.cuisines).toEqual(["italian", "surprise_me"]);
    expect(view.draft.proteinPreferences).toEqual(["eggs", "tofu"]);
    expect(view.draft.allergies).toEqual(["Peanuts"]);
    expect(view.draft.dietaryRestrictions).toEqual(["Pork"]);
    expect(view.draft.dislikes).toEqual(["Olives"]);
    expect(view.draft.experiencePreferences).toEqual(["comforting", "fresh"]);
    expect(view.draft.varietyLevel).toBe("simple");
  });
});
