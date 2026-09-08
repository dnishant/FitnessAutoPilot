import { describe, expect, it } from "vitest";
import { mapMealPreferencesRow } from "./rmr-mappers";

describe("mapMealPreferencesRow", () => {
  it("returns null until meal preferences are completed", () => {
    expect(
      mapMealPreferencesRow({
        user_id: "11111111-1111-1111-1111-111111111111",
        cuisine_preferences: ["indian"],
        meal_preferences_completed_at: null,
      }),
    ).toBeNull();
  });

  it("restores existing selections for later editing", () => {
    const mapped = mapMealPreferencesRow({
      user_id: "11111111-1111-1111-1111-111111111111",
      cuisine_preferences: ["indian", "surprise_me"],
      protein_preferences: ["chicken", "tofu"],
      allergies: ["Peanuts"],
      dietary_restrictions: ["Pork"],
      disliked_foods: ["Olives"],
      experience_preferences: ["saucy_flavorful", "fresh"],
      variety_level: "simple",
      meal_preferences_completed_at: "2026-09-08T00:00:00.000Z",
      created_at: "2026-09-08T00:00:00.000Z",
      updated_at: "2026-09-08T01:00:00.000Z",
    });
    expect(mapped).toMatchObject({
      cuisines: ["indian", "surprise_me"],
      proteinPreferences: ["chicken", "tofu"],
      allergies: ["Peanuts"],
      dietaryRestrictions: ["Pork"],
      dislikes: ["Olives"],
      experiencePreferences: ["saucy_flavorful", "fresh"],
      varietyLevel: "simple",
    });
  });
});
