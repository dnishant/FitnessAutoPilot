import { describe, expect, it } from "vitest";
import {
  RecipeCandidateSchema,
  RecipeGenerationRequestSchema,
} from "./recipe-generation";

describe("recipe generation contracts", () => {
  it("accepts the PLAN-003 manual development request shape", () => {
    const parsed = RecipeGenerationRequestSchema.safeParse({
      mealType: "dinner",
      targetCalories: 650,
      targetProteinGrams: 50,
      cuisines: ["Indian", "Mexican", "Mediterranean", "East Asian"],
      proteinPreferences: ["Chicken", "Fish"],
      experiencePreferences: ["Saucy & flavorful", "Spicy"],
      allergies: [],
      dietaryRestrictions: [],
      dislikes: [],
      varietyLevel: "balanced",
      cookingStyle: "ready_lunch_fresh_dinner",
      maxFinishMinutes: 10,
    });
    expect(parsed.success).toBe(true);
  });

  it("requires positive grams and explicit measurement state", () => {
    const parsed = RecipeCandidateSchema.safeParse({
      name: "Garlic-Lime Salmon Rice Bowl",
      mealType: "dinner",
      servings: 1,
      ingredients: [
        {
          name: "salmon fillet",
          quantityGrams: 180,
          measurementState: "raw",
        },
      ],
      instructions: ["Sear salmon and serve over rice with garlic-lime sauce."],
      prepMinutes: 10,
      cookMinutes: 12,
      source: { type: "ai_original", provider: "gemini", model: "gemini-2.5-flash" },
    });
    expect(parsed.success).toBe(true);

    const missingGrams = RecipeCandidateSchema.safeParse({
      name: "Bad",
      mealType: "dinner",
      servings: 1,
      ingredients: [{ name: "rice", measurementState: "cooked" }],
      instructions: ["Cook"],
      prepMinutes: 1,
      cookMinutes: 1,
      source: { type: "ai_original", provider: "gemini", model: "x" },
    });
    expect(missingGrams.success).toBe(false);
  });
});
