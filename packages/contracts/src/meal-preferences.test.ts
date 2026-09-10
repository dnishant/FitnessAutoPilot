import { describe, expect, it } from "vitest";
import {
  CUISINE_OPTIONS,
  EXPERIENCE_OPTIONS,
  MealPreferencesInputSchema,
  MealPreferencesSchema,
  PROTEIN_OPTIONS,
  VARIETY_OPTIONS,
  VarietyLevelSchema,
} from "./meal-preferences";

const userId = "11111111-1111-1111-1111-111111111111";

describe("meal preference option catalogs", () => {
  it("keeps cuisine, protein, experience, and variety values in one place", () => {
    expect(CUISINE_OPTIONS.map((option) => option.value)).toEqual([
      "indian",
      "mexican",
      "mediterranean",
      "italian",
      "east_asian",
      "american",
      "middle_eastern",
      "other",
      "surprise_me",
    ]);
    expect(PROTEIN_OPTIONS.map((option) => option.value)).toContain("beans_lentils");
    expect(EXPERIENCE_OPTIONS.map((option) => option.label)).toContain("Saucy & flavorful");
    expect(VARIETY_OPTIONS.map((option) => option.value)).toEqual(["simple", "balanced", "high"]);
  });
});

describe("MealPreferencesSchema", () => {
  it("accepts multiple cuisines, proteins, and experience preferences", () => {
    const result = MealPreferencesSchema.safeParse({
      userId,
      cuisines: ["indian", "mexican", "surprise_me"],
      proteinPreferences: ["chicken", "paneer", "beans_lentils"],
      allergies: ["Peanuts"],
      dietaryRestrictions: ["Pork"],
      dislikes: ["Olives"],
      experiencePreferences: ["saucy_flavorful", "spicy"],
      varietyLevel: "balanced",
      createdAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("keeps allergies, dietary restrictions, and dislikes as separate arrays", () => {
    const result = MealPreferencesInputSchema.parse({
      cuisines: [],
      proteinPreferences: [],
      allergies: ["Peanuts"],
      dietaryRestrictions: ["Pork"],
      dislikes: ["Olives"],
      experiencePreferences: [],
      varietyLevel: "simple",
    });
    expect(result.allergies).toEqual(["Peanuts"]);
    expect(result.dietaryRestrictions).toEqual(["Pork"]);
    expect(result.dislikes).toEqual(["Olives"]);
  });

  it("accepts empty preference selections", () => {
    const result = MealPreferencesInputSchema.safeParse({
      cuisines: [],
      proteinPreferences: [],
      allergies: [],
      dietaryRestrictions: [],
      dislikes: [],
      experiencePreferences: [],
      varietyLevel: "high",
    });
    expect(result.success).toBe(true);
  });

  it("accepts simple, balanced, and high variety values", () => {
    expect(VarietyLevelSchema.safeParse("simple").success).toBe(true);
    expect(VarietyLevelSchema.safeParse("balanced").success).toBe(true);
    expect(VarietyLevelSchema.safeParse("high").success).toBe(true);
  });

  it("rejects unsupported variety values", () => {
    expect(VarietyLevelSchema.safeParse("2_unique_recipes").success).toBe(false);
    expect(VarietyLevelSchema.safeParse("medium").success).toBe(false);
    expect(
      MealPreferencesInputSchema.safeParse({
        cuisines: [],
        proteinPreferences: [],
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
        experiencePreferences: [],
        varietyLevel: "extreme",
      }).success,
    ).toBe(false);
  });
});
