import { describe, expect, it } from "vitest";
import {
  addPreferenceTag,
  createMealPreferencesDraft,
  DEFAULT_VARIETY_LEVEL,
  SURPRISE_ME_CUISINE,
  toggleCuisine,
  toggleSelection,
  upsertCurrentMealPreferences,
  validateMealPreferences,
} from "./meal-preferences";

const userId = "11111111-1111-1111-1111-111111111111";

describe("meal preference drafts", () => {
  it("defaults variety to balanced and treats empty lists as valid", () => {
    const draft = createMealPreferencesDraft();
    expect(draft.varietyLevel).toBe(DEFAULT_VARIETY_LEVEL);
    expect(draft.varietyLevel).toBe("balanced");
    const validated = validateMealPreferences(draft);
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    expect(validated.value.cuisines).toEqual([]);
    expect(validated.value.proteinPreferences).toEqual([]);
    expect(validated.value.experiencePreferences).toEqual([]);
    expect(validated.value.allergies).toEqual([]);
    expect(validated.value.dietaryRestrictions).toEqual([]);
    expect(validated.value.dislikes).toEqual([]);
  });

  it("allows multiple cuisine selections and keeps Surprise me from clearing others", () => {
    const selected = toggleCuisine(["indian"], "mexican");
    const withSurprise = toggleCuisine(selected, SURPRISE_ME_CUISINE);
    expect(withSurprise).toEqual(["indian", "mexican", "surprise_me"]);
    const validated = validateMealPreferences(
      createMealPreferencesDraft({ cuisines: withSurprise }),
    );
    expect(validated.ok).toBe(true);
  });

  it("allows multiple protein preferences without treating omitted proteins as refusals", () => {
    const selected = toggleSelection(["chicken"], "paneer");
    const validated = validateMealPreferences(
      createMealPreferencesDraft({ proteinPreferences: selected }),
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    expect(validated.value.proteinPreferences).toEqual(["chicken", "paneer"]);
    expect(validated.value.proteinPreferences).not.toContain("beef");
  });

  it("allows multiple experience preferences", () => {
    const selected = toggleSelection(["saucy_flavorful"], "spicy");
    const validated = validateMealPreferences(
      createMealPreferencesDraft({ experiencePreferences: selected }),
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    expect(validated.value.experiencePreferences).toEqual(["saucy_flavorful", "spicy"]);
  });

  it("stores allergies separately from dietary restrictions and dislikes", () => {
    const allergies = addPreferenceTag([], "Peanuts");
    const restrictions = addPreferenceTag([], "Pork");
    const dislikes = addPreferenceTag([], "Olives");
    expect(allergies.ok && restrictions.ok && dislikes.ok).toBe(true);
    if (!allergies.ok || !restrictions.ok || !dislikes.ok) {
      return;
    }
    const validated = validateMealPreferences(
      createMealPreferencesDraft({
        allergies: allergies.value,
        dietaryRestrictions: restrictions.value,
        dislikes: dislikes.value,
      }),
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    expect(validated.value.allergies).toEqual(["Peanuts"]);
    expect(validated.value.dietaryRestrictions).toEqual(["Pork"]);
    expect(validated.value.dislikes).toEqual(["Olives"]);
    expect(validated.value.allergies).not.toEqual(validated.value.dietaryRestrictions);
    expect(validated.value.dietaryRestrictions).not.toEqual(validated.value.dislikes);
  });

  it("accepts simple, balanced, and high variety values", () => {
    for (const varietyLevel of ["simple", "balanced", "high"] as const) {
      const validated = validateMealPreferences(createMealPreferencesDraft({ varietyLevel }));
      expect(validated.ok).toBe(true);
    }
  });

  it("rejects unsupported variety values", () => {
    const validated = validateMealPreferences(
      createMealPreferencesDraft({ varietyLevel: "2_unique_recipes" as never }),
    );
    expect(validated.ok).toBe(false);
  });

  it("loads and edits the current preference profile without creating a second one", () => {
    const first = upsertCurrentMealPreferences({
      userId,
      current: null,
      next: createMealPreferencesDraft({
        cuisines: ["indian"],
        proteinPreferences: ["chicken"],
        allergies: ["Peanuts"],
        varietyLevel: "simple",
      }),
      asOf: new Date("2026-09-08T00:00:00.000Z"),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const edited = upsertCurrentMealPreferences({
      userId,
      current: first.value,
      next: {
        ...first.value,
        cuisines: ["indian", "mexican"],
        proteinPreferences: ["chicken", "tofu"],
        varietyLevel: "high",
      },
      asOf: new Date("2026-09-08T01:00:00.000Z"),
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) {
      return;
    }
    expect(edited.value.createdAt).toBe(first.value.createdAt);
    expect(edited.value.updatedAt).toBe("2026-09-08T01:00:00.000Z");
    expect(edited.value.cuisines).toEqual(["indian", "mexican"]);
    expect(edited.value.userId).toBe(userId);
  });
});
