import { describe, expect, it } from "vitest";
import {
  CookingPreferencesInputSchema,
  FINISH_TIME_OPTIONS,
  MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK,
  PREP_FREQUENCY_OPTIONS,
  PREP_SESSION_TIME_OPTIONS,
  PrepFrequencySchema,
  WEEKLY_COOKING_STYLE_OPTIONS,
  WeeklyCookingStyleSchema,
} from "./cooking-preferences";

describe("cooking preference option catalogs", () => {
  it("keeps prep frequency, session time, cooking style, and finish values in one place", () => {
    expect(PREP_FREQUENCY_OPTIONS.map((option) => option.value)).toEqual([
      "once_weekly",
      "twice_weekly",
      "throughout_week",
    ]);
    expect(PREP_SESSION_TIME_OPTIONS.map((option) => option.value)).toEqual([
      45,
      60,
      90,
      120,
      null,
    ]);
    expect(WEEKLY_COOKING_STYLE_OPTIONS.map((option) => option.value)).toEqual([
      "mostly_ready",
      "ready_lunch_fresh_dinner",
      "fresh_focused",
    ]);
    expect(FINISH_TIME_OPTIONS.map((option) => option.value)).toEqual([5, 10, 15, 20]);
    expect(WEEKLY_COOKING_STYLE_OPTIONS.find((option) => option.recommended)?.value).toBe(
      "ready_lunch_fresh_dinner",
    );
    expect(MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK).toBe(1);
  });
});

describe("CookingPreferencesInputSchema", () => {
  it("accepts all valid prep frequencies", () => {
    for (const prepFrequency of ["once_weekly", "twice_weekly", "throughout_week"] as const) {
      expect(PrepFrequencySchema.safeParse(prepFrequency).success).toBe(true);
    }
  });

  it("rejects an unsupported prep frequency", () => {
    expect(PrepFrequencySchema.safeParse("every_sunday").success).toBe(false);
  });

  it("accepts 45, 60, 90, 120, and null prep-session times", () => {
    for (const maxPrepSessionMinutes of [45, 60, 90, 120, null] as const) {
      expect(
        CookingPreferencesInputSchema.safeParse({
          prepFrequency: "once_weekly",
          maxPrepSessionMinutes,
          cookingStyle: "ready_lunch_fresh_dinner",
          maxFinishMinutes: 10,
          useDinnerPrepForNextLunch: true,
        }).success,
      ).toBe(true);
    }
  });

  it("accepts all valid cooking styles", () => {
    expect(WeeklyCookingStyleSchema.safeParse("mostly_ready").success).toBe(true);
    expect(WeeklyCookingStyleSchema.safeParse("ready_lunch_fresh_dinner").success).toBe(true);
    expect(WeeklyCookingStyleSchema.safeParse("fresh_focused").success).toBe(true);
  });

  it("rejects an unsupported cooking style", () => {
    expect(WeeklyCookingStyleSchema.safeParse("batch_only").success).toBe(false);
  });

  it("rejects mostly_ready with a non-zero finish time", () => {
    expect(
      CookingPreferencesInputSchema.safeParse({
        prepFrequency: "once_weekly",
        maxPrepSessionMinutes: 90,
        cookingStyle: "mostly_ready",
        maxFinishMinutes: 10,
        useDinnerPrepForNextLunch: false,
      }).success,
    ).toBe(false);
  });

  it("accepts fresh styles with 5, 10, 15, or 20 minute finish times", () => {
    for (const cookingStyle of ["ready_lunch_fresh_dinner", "fresh_focused"] as const) {
      for (const maxFinishMinutes of [5, 10, 15, 20] as const) {
        expect(
          CookingPreferencesInputSchema.safeParse({
            prepFrequency: "twice_weekly",
            maxPrepSessionMinutes: 60,
            cookingStyle,
            maxFinishMinutes,
            useDinnerPrepForNextLunch: true,
          }).success,
        ).toBe(true);
      }
    }
  });

  it("rejects invalid finish times on a fresh cooking style", () => {
    expect(
      CookingPreferencesInputSchema.safeParse({
        prepFrequency: "once_weekly",
        maxPrepSessionMinutes: 90,
        cookingStyle: "ready_lunch_fresh_dinner",
        maxFinishMinutes: 0,
        useDinnerPrepForNextLunch: true,
      }).success,
    ).toBe(false);
    expect(
      CookingPreferencesInputSchema.safeParse({
        prepFrequency: "once_weekly",
        maxPrepSessionMinutes: 90,
        cookingStyle: "fresh_focused",
        maxFinishMinutes: 7,
        useDinnerPrepForNextLunch: true,
      }).success,
    ).toBe(false);
  });
});
