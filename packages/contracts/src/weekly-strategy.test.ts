import { describe, expect, it } from "vitest";
import {
  WeeklyMealStrategySchema,
  WeeklyStrategyRequestSchema,
} from "./weekly-strategy";

describe("weekly strategy contracts", () => {
  it("accepts the PLAN-004 request shape with reused preference enums", () => {
    const parsed = WeeklyStrategyRequestSchema.safeParse({
      nutrition: {
        targetCaloriesPerDay: 2200,
        targetProteinGramsPerDay: 160,
      },
      foodPreferences: {
        cuisines: ["Indian", "Mexican"],
        proteinPreferences: ["Chicken", "Fish"],
        experiencePreferences: ["Saucy & flavorful"],
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
        varietyLevel: "balanced",
      },
      cookingPreferences: {
        prepFrequency: "once_weekly",
        maxPrepSessionMinutes: 90,
        cookingStyle: "ready_lunch_fresh_dinner",
        maxFinishMinutes: 10,
        useDinnerPrepForNextLunch: true,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("requires exactly seven days in WeeklyMealStrategySchema", () => {
    const base = {
      strategySummary: {
        varietyLevel: "balanced",
        breakfastPattern: "rotating",
        lunchPattern: "ready bowls",
        dinnerPattern: "quick finish",
        snackPattern: "yogurt",
        prepApproach: "once weekly",
      },
      days: [
        {
          day: "monday",
          breakfast: {
            conceptId: "b1",
            name: "Smoothie",
            mealType: "breakfast",
            prepIntent: "fully_prepped",
          },
        },
      ],
      sharedIngredientIntents: ["yogurt"],
    };
    expect(WeeklyMealStrategySchema.safeParse(base).success).toBe(false);

    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ].map((day) => ({
      day,
      breakfast: {
        conceptId: "b1",
        name: "Smoothie",
        mealType: "breakfast",
        prepIntent: "fully_prepped",
      },
    }));
    expect(WeeklyMealStrategySchema.safeParse({ ...base, days }).success).toBe(true);
  });
});
