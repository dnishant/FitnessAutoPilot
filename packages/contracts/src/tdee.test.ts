import { describe, expect, it } from "vitest";
import {
  CompleteOnboardingRequestSchema,
  TdeeEstimateSchema,
  TdeeValidationPolicy,
} from "./tdee";
import { onboardingGoalLabel } from "./goal";

describe("TdeeValidationPolicy", () => {
  it("exposes named bounds rather than medical claims", () => {
    expect(TdeeValidationPolicy.wearableCaloriesKcal.min).toBeGreaterThan(0);
    expect(TdeeValidationPolicy.tdeeKcal.min).toBeGreaterThan(0);
  });
});

describe("onboarding goal labels", () => {
  it("maps stored goal types to the V1 labels", () => {
    expect(onboardingGoalLabel("muscle_gain")).toBe("Bulking");
    expect(onboardingGoalLabel("fat_loss")).toBe("Shredding / Weight Loss");
    expect(onboardingGoalLabel("recomposition")).toBe("Recomposition / Maintenance");
  });
});

describe("CompleteOnboardingRequestSchema", () => {
  it("accepts a Whoop onboarding request", () => {
    const result = CompleteOnboardingRequestSchema.safeParse({
      dateOfBirth: "1990-05-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      source: "estimated_mifflin_st_jeor",
      goalType: "muscle_gain",
      wearable: "whoop",
      wearableCaloriesKcal: 2800,
    });
    expect(result.success).toBe(true);
  });

  it("accepts meal preference intent on complete onboarding", () => {
    const result = CompleteOnboardingRequestSchema.safeParse({
      dateOfBirth: "1990-05-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      source: "estimated_mifflin_st_jeor",
      goalType: "muscle_gain",
      wearable: "whoop",
      wearableCaloriesKcal: 2800,
      mealPreferences: {
        cuisines: ["indian", "surprise_me"],
        proteinPreferences: ["chicken"],
        allergies: ["Peanuts"],
        dietaryRestrictions: ["Pork"],
        dislikes: ["Olives"],
        experiencePreferences: ["spicy"],
        varietyLevel: "balanced",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unsupported onboarding goal", () => {
    const result = CompleteOnboardingRequestSchema.safeParse({
      dateOfBirth: "1990-05-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      source: "estimated_mifflin_st_jeor",
      goalType: "general_fitness",
      wearable: "apple_watch",
      wearableCaloriesKcal: 650,
    });
    expect(result.success).toBe(false);
  });
});

describe("TdeeEstimateSchema", () => {
  it("requires null algorithm fields for a Whoop daily-calorie TDEE", () => {
    const result = TdeeEstimateSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111113",
      userId: "11111111-1111-1111-1111-111111111111",
      tdeeKcal: 2800,
      source: "whoop_daily_calories",
      wearable: "whoop",
      wearableCaloriesKcal: 2800,
      rmrKcalUsed: null,
      algorithmName: null,
      algorithmVersion: null,
      inputSnapshot: {
        wearable: "whoop",
        wearableCaloriesKcal: 2800,
        rmrKcal: 1750,
        rmrSource: "estimated_mifflin_st_jeor",
        goalType: "muscle_gain",
      },
      calculatedAt: "2026-09-07T00:00:00.000Z",
      createdAt: "2026-09-07T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
