import { describe, expect, it } from "vitest";
import {
  calculateMacroTargets,
  createCalorieTarget,
  createEstimatedRmr,
  createTdeeFromWearable,
  createUserReportedRmr,
} from "@fitness-autopilot/domain";
import { lbToKg } from "@fitness-autopilot/domain";
import {
  ensureLocalUser,
  localSaveCalorieTarget,
  localSaveNutritionTarget,
  localSaveOnboardingGoal,
  localSaveProfile,
  localSaveRmrEstimate,
  localSaveTdeeEstimate,
} from "./local-planner";

const asOf = new Date("2026-09-07T00:00:00.000Z");

describe("local RMR persistence", () => {
  it("stores algorithm metadata and does not mutate prior rows", () => {
    const store = ensureLocalUser("rmr-history@example.com", "test-password");
    localSaveProfile(store.userId, {
      userId: store.userId,
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
    });

    const firstDraft = createEstimatedRmr({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      asOf,
    });
    expect(firstDraft.ok).toBe(true);
    if (!firstDraft.ok) {
      return;
    }
    const first = localSaveRmrEstimate(store.userId, firstDraft.value);
    const firstSnapshot = structuredClone(first);

    expect(first.algorithmVersion).toBe("rmr-v1");
    expect(first.inputSnapshot).toEqual({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      ageYears: 36,
    });

    const secondDraft = createUserReportedRmr({
      rmrKcal: 1782,
      reportDate: "2026-01-15",
      asOf: new Date("2026-09-07T02:00:00.000Z"),
    });
    expect(secondDraft.ok).toBe(true);
    if (!secondDraft.ok) {
      return;
    }
    localSaveRmrEstimate(store.userId, secondDraft.value);

    expect(store.rmrHistory).toHaveLength(2);
    expect(store.rmrHistory[0]).toEqual(firstSnapshot);
    expect(store.currentRmr?.source).toBe("user_reported_dexa");
    expect(store.currentRmr?.rmrKcal).toBe(1782);
  });

  it("stores TDEE algorithm metadata and does not mutate prior rows", () => {
    const store = ensureLocalUser("tdee-history@example.com", "test-password");
    const firstDraft = createTdeeFromWearable({
      wearable: "whoop",
      wearableCaloriesKcal: 2800,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "muscle_gain",
      asOf,
    });
    expect(firstDraft.ok).toBe(true);
    if (!firstDraft.ok) {
      return;
    }
    const first = localSaveTdeeEstimate(store.userId, firstDraft.value);
    const firstSnapshot = structuredClone(first);
    expect(first.algorithmName).toBeNull();
    expect(first.tdeeKcal).toBe(2800);

    const secondDraft = createTdeeFromWearable({
      wearable: "apple_watch",
      wearableCaloriesKcal: 650,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "fat_loss",
      asOf: new Date("2026-09-07T02:00:00.000Z"),
    });
    expect(secondDraft.ok).toBe(true);
    if (!secondDraft.ok) {
      return;
    }
    localSaveTdeeEstimate(store.userId, secondDraft.value);
    const goal = localSaveOnboardingGoal(store.userId, "fat_loss", asOf);

    expect(store.tdeeHistory).toHaveLength(2);
    expect(store.tdeeHistory[0]).toEqual(firstSnapshot);
    expect(store.currentTdee?.source).toBe("apple_watch_active_plus_rmr");
    expect(store.currentTdee?.tdeeKcal).toBe(2400);
    expect(store.currentTdee?.algorithmVersion).toBe("tdee-v1");
    expect(goal.goalType).toBe("fat_loss");
    expect(goal.status).toBe("active");
  });

  it("stores a calorie target without mutating prior rows", () => {
    const store = ensureLocalUser("calorie-history@example.com", "test-password");
    const tdeeDraft = createTdeeFromWearable({
      wearable: "whoop",
      wearableCaloriesKcal: 2700,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "fat_loss",
      asOf,
    });
    expect(tdeeDraft.ok).toBe(true);
    if (!tdeeDraft.ok) {
      return;
    }
    const tdee = localSaveTdeeEstimate(store.userId, tdeeDraft.value);
    const goal = localSaveOnboardingGoal(store.userId, "fat_loss", asOf);
    const firstDraft = createCalorieTarget({
      goalType: "fat_loss",
      pace: "recommended",
      weightKg: lbToKg(180),
      tdeeKcal: 2700,
      asOf,
    });
    expect(firstDraft.ok).toBe(true);
    if (!firstDraft.ok) {
      return;
    }
    const first = localSaveCalorieTarget(store.userId, firstDraft.value, {
      goalId: goal.id,
      tdeeEstimateId: tdee.id,
    });
    const firstSnapshot = structuredClone(first);
    const secondDraft = createCalorieTarget({
      goalType: "fat_loss",
      pace: "faster",
      weightKg: lbToKg(180),
      tdeeKcal: 2700,
      asOf: new Date("2026-09-08T02:00:00.000Z"),
    });
    expect(secondDraft.ok).toBe(true);
    if (!secondDraft.ok) {
      return;
    }
    localSaveCalorieTarget(store.userId, secondDraft.value, {
      goalId: goal.id,
      tdeeEstimateId: tdee.id,
    });
    expect(store.calorieTargetHistory).toHaveLength(2);
    expect(store.calorieTargetHistory[0]).toEqual(firstSnapshot);
    expect(store.currentCalorieTarget?.pace).toBe("faster");
    expect(store.currentCalorieTarget?.targetCalories).toBe(2025);
    expect(store.currentCalorieTarget?.policyVersion).toBe("weight-change-policy-v1");
  });

  it("stores a nutrition target without mutating prior rows", () => {
    const store = ensureLocalUser("macro-history@example.com", "test-password");
    const tdeeDraft = createTdeeFromWearable({
      wearable: "whoop",
      wearableCaloriesKcal: 2700,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "fat_loss",
      asOf,
    });
    expect(tdeeDraft.ok).toBe(true);
    if (!tdeeDraft.ok) {
      return;
    }
    const tdee = localSaveTdeeEstimate(store.userId, tdeeDraft.value);
    const goal = localSaveOnboardingGoal(store.userId, "fat_loss", asOf);
    const calorieDraft = createCalorieTarget({
      goalType: "fat_loss",
      pace: "recommended",
      weightKg: lbToKg(180),
      tdeeKcal: 2700,
      asOf,
    });
    expect(calorieDraft.ok).toBe(true);
    if (!calorieDraft.ok) {
      return;
    }
    const calorie = localSaveCalorieTarget(store.userId, calorieDraft.value, {
      goalId: goal.id,
      tdeeEstimateId: tdee.id,
    });
    const firstDraft = calculateMacroTargets({
      targetCalories: 2250,
      weightLb: 180,
      asOf,
    });
    expect(firstDraft.ok).toBe(true);
    if (!firstDraft.ok) {
      return;
    }
    const first = localSaveNutritionTarget(store.userId, firstDraft.value, {
      goalId: goal.id,
      calorieTargetId: calorie.id,
      tdeeKcal: 2700,
      targetLbPerWeek: calorie.targetLbPerWeek,
    });
    const firstSnapshot = structuredClone(first);
    const secondDraft = calculateMacroTargets({
      targetCalories: 2025,
      weightLb: 180,
      asOf: new Date("2026-09-08T02:00:00.000Z"),
    });
    expect(secondDraft.ok).toBe(true);
    if (!secondDraft.ok) {
      return;
    }
    localSaveNutritionTarget(store.userId, secondDraft.value, {
      goalId: goal.id,
      calorieTargetId: calorie.id,
      tdeeKcal: 2700,
      targetLbPerWeek: calorie.targetLbPerWeek,
    });
    expect(store.nutritionTargetHistory).toHaveLength(2);
    expect(store.nutritionTargetHistory[0]).toEqual(firstSnapshot);
    expect(store.currentNutritionTarget?.targetCalories).toBe(2025);
    expect(store.currentNutritionTarget?.macroPolicyVersion).toBe("macro-policy-v1");
    expect(store.currentNutritionTarget?.inputSnapshot).toMatchObject({
      proteinGramsPerLb: 1,
      fatGramsPerKg: 0.7,
      policyVersion: "macro-policy-v1",
    });
  });
});
