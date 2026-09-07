import { describe, expect, it } from "vitest";
import { UserProfileSchema } from "./profile.js";

describe("UserProfileSchema", () => {
  it("accepts a valid profile", () => {
    const result = UserProfileSchema.safeParse({
      userId: "11111111-1111-1111-1111-111111111111",
      dateOfBirth: "1990-05-01",
      biologicalSex: "female",
      heightCm: 165,
      weightKg: 68,
      fitnessExperience: "intermediate",
      dietaryPreference: "omnivore",
      mealPrepAvailability: "weekends",
      cookingSkill: "intermediate",
      maxMealPrepMinutes: 45,
    });
    expect(result.success).toBe(true);
  });

  it("rejects storing nonsense height", () => {
    const result = UserProfileSchema.safeParse({
      userId: "11111111-1111-1111-1111-111111111111",
      dateOfBirth: "1990-05-01",
      biologicalSex: "female",
      heightCm: -1,
      weightKg: 68,
      fitnessExperience: "intermediate",
      dietaryPreference: "omnivore",
      mealPrepAvailability: "weekends",
      cookingSkill: "intermediate",
      maxMealPrepMinutes: 45,
    });
    expect(result.success).toBe(false);
  });
});
