import { describe, expect, it } from "vitest";
import {
  applyCookingStyleChange,
  createCookingPreferencesDraft,
  DEFAULT_COOKING_STYLE,
  DEFAULT_MAX_FINISH_MINUTES,
  DEFAULT_MAX_PREP_SESSION_MINUTES,
  DEFAULT_PREP_FREQUENCY,
  DEFAULT_USE_DINNER_PREP_FOR_NEXT_LUNCH,
  showsDinnerPrepQuestion,
  showsFinishTimeQuestion,
  upsertCurrentCookingPreferences,
  validateCookingPreferences,
  visibleCookingPreferenceFields,
} from "./cooking-preferences";

const userId = "11111111-1111-1111-1111-111111111111";

describe("cooking preference drafts", () => {
  it("defaults to once weekly, 90 minutes, ready lunches + fresh dinners, 10 minutes", () => {
    const draft = createCookingPreferencesDraft();
    expect(draft.prepFrequency).toBe(DEFAULT_PREP_FREQUENCY);
    expect(draft.prepFrequency).toBe("once_weekly");
    expect(draft.maxPrepSessionMinutes).toBe(DEFAULT_MAX_PREP_SESSION_MINUTES);
    expect(draft.maxPrepSessionMinutes).toBe(90);
    expect(draft.cookingStyle).toBe(DEFAULT_COOKING_STYLE);
    expect(draft.cookingStyle).toBe("ready_lunch_fresh_dinner");
    expect(draft.maxFinishMinutes).toBe(DEFAULT_MAX_FINISH_MINUTES);
    expect(draft.maxFinishMinutes).toBe(10);
    // Deprecated storage flag — always true for fresh styles; ignored by planner.
    expect(draft.useDinnerPrepForNextLunch).toBe(DEFAULT_USE_DINNER_PREP_FOR_NEXT_LUNCH);
    expect(draft.useDinnerPrepForNextLunch).toBe(true);
    expect(validateCookingPreferences(draft).ok).toBe(true);
  });

  it("accepts all valid prep frequencies", () => {
    for (const prepFrequency of ["once_weekly", "twice_weekly", "throughout_week"] as const) {
      const validated = validateCookingPreferences(createCookingPreferencesDraft({ prepFrequency }));
      expect(validated.ok).toBe(true);
      if (validated.ok) {
        expect(validated.value.prepFrequency).toBe(prepFrequency);
      }
    }
  });

  it("rejects an unsupported prep frequency", () => {
    const validated = validateCookingPreferences(
      createCookingPreferencesDraft({ prepFrequency: "every_sunday" as never }),
    );
    expect(validated.ok).toBe(false);
  });

  it("accepts 45, 60, 90, 120, and null prep-session times", () => {
    for (const maxPrepSessionMinutes of [45, 60, 90, 120, null] as const) {
      const validated = validateCookingPreferences(
        createCookingPreferencesDraft({ maxPrepSessionMinutes }),
      );
      expect(validated.ok).toBe(true);
      if (validated.ok) {
        expect(validated.value.maxPrepSessionMinutes).toBe(maxPrepSessionMinutes);
      }
    }
  });

  it("accepts all valid cooking styles", () => {
    for (const cookingStyle of [
      "mostly_ready",
      "ready_lunch_fresh_dinner",
      "fresh_focused",
    ] as const) {
      const validated = validateCookingPreferences(createCookingPreferencesDraft({ cookingStyle }));
      expect(validated.ok).toBe(true);
    }
  });

  it("rejects an unsupported cooking style", () => {
    const validated = validateCookingPreferences(
      createCookingPreferencesDraft({ cookingStyle: "batch_only" as never }),
    );
    expect(validated.ok).toBe(false);
  });

  it("normalizes mostly_ready to a 0-minute finish time and storage-compat dinner-prep=false", () => {
    const validated = validateCookingPreferences({
      cookingStyle: "mostly_ready",
      maxFinishMinutes: 10,
      useDinnerPrepForNextLunch: true,
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    expect(validated.value.maxFinishMinutes).toBe(0);
    expect(validated.value.useDinnerPrepForNextLunch).toBe(false);
  });

  it("accepts 5, 10, 15, and 20 minute finish times on fresh styles", () => {
    for (const cookingStyle of ["ready_lunch_fresh_dinner", "fresh_focused"] as const) {
      for (const maxFinishMinutes of [5, 10, 15, 20] as const) {
        const validated = validateCookingPreferences(
          createCookingPreferencesDraft({ cookingStyle, maxFinishMinutes }),
        );
        expect(validated.ok).toBe(true);
        if (validated.ok) {
          expect(validated.value.maxFinishMinutes).toBe(maxFinishMinutes);
        }
      }
    }
  });

  it("rejects invalid finish times on a fresh cooking style", () => {
    expect(
      validateCookingPreferences(
        createCookingPreferencesDraft({
          cookingStyle: "ready_lunch_fresh_dinner",
          maxFinishMinutes: 0,
        }),
      ).ok,
    ).toBe(false);
    expect(
      validateCookingPreferences(
        createCookingPreferencesDraft({
          cookingStyle: "fresh_focused",
          maxFinishMinutes: 7 as never,
        }),
      ).ok,
    ).toBe(false);
  });

  it("ignores user-supplied dinner-prep flag and always stores planner-compat value", () => {
    const disabledAttempt = validateCookingPreferences(
      createCookingPreferencesDraft({
        cookingStyle: "fresh_focused",
        useDinnerPrepForNextLunch: false,
      }),
    );
    expect(disabledAttempt.ok).toBe(true);
    if (!disabledAttempt.ok) {
      return;
    }
    // PLAN-008: old persisted false no longer controls planning; storage writes true for fresh.
    expect(disabledAttempt.value.useDinnerPrepForNextLunch).toBe(true);
  });

  it("loads and edits the current cooking-preference profile without creating a second one", () => {
    const first = upsertCurrentCookingPreferences({
      userId,
      current: null,
      next: createCookingPreferencesDraft({
        prepFrequency: "twice_weekly",
        maxPrepSessionMinutes: 60,
        cookingStyle: "fresh_focused",
        maxFinishMinutes: 15,
        useDinnerPrepForNextLunch: false,
      }),
      asOf: new Date("2026-09-10T00:00:00.000Z"),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.value.useDinnerPrepForNextLunch).toBe(true);
    const edited = upsertCurrentCookingPreferences({
      userId,
      current: first.value,
      next: {
        ...first.value,
        prepFrequency: "once_weekly",
        maxPrepSessionMinutes: 90,
        cookingStyle: "ready_lunch_fresh_dinner",
        maxFinishMinutes: 10,
        useDinnerPrepForNextLunch: false,
      },
      asOf: new Date("2026-09-10T01:00:00.000Z"),
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) {
      return;
    }
    expect(edited.value.createdAt).toBe(first.value.createdAt);
    expect(edited.value.updatedAt).toBe("2026-09-10T01:00:00.000Z");
    expect(edited.value.prepFrequency).toBe("once_weekly");
    expect(edited.value.useDinnerPrepForNextLunch).toBe(true);
    expect(edited.value.userId).toBe(userId);
  });

  it("never asks dinner-prep; shows finish-time only for fresh styles", () => {
    expect(showsFinishTimeQuestion("mostly_ready")).toBe(false);
    expect(showsDinnerPrepQuestion("mostly_ready")).toBe(false);
    expect(visibleCookingPreferenceFields("mostly_ready")).toEqual([
      "prepFrequency",
      "maxPrepSessionMinutes",
      "cookingStyle",
    ]);
    expect(showsFinishTimeQuestion("ready_lunch_fresh_dinner")).toBe(true);
    expect(showsDinnerPrepQuestion("fresh_focused")).toBe(false);
    expect(visibleCookingPreferenceFields("fresh_focused")).toEqual([
      "prepFrequency",
      "maxPrepSessionMinutes",
      "cookingStyle",
      "maxFinishMinutes",
    ]);
  });

  it("restores a remembered finish time when leaving mostly_ready, otherwise uses 10", () => {
    const remembered = applyCookingStyleChange({
      current: createCookingPreferencesDraft({
        cookingStyle: "ready_lunch_fresh_dinner",
        maxFinishMinutes: 15,
      }),
      nextStyle: "mostly_ready",
    });
    expect(remembered.draft.maxFinishMinutes).toBe(0);
    expect(remembered.draft.useDinnerPrepForNextLunch).toBe(false);
    expect(remembered.rememberedMaxFinishMinutes).toBe(15);

    const restored = applyCookingStyleChange({
      current: remembered.draft,
      nextStyle: "fresh_focused",
      rememberedMaxFinishMinutes: remembered.rememberedMaxFinishMinutes,
    });
    expect(restored.draft.maxFinishMinutes).toBe(15);
    expect(restored.draft.useDinnerPrepForNextLunch).toBe(true);

    const fallback = applyCookingStyleChange({
      current: createCookingPreferencesDraft({ cookingStyle: "mostly_ready" }),
      nextStyle: "ready_lunch_fresh_dinner",
    });
    expect(fallback.draft.maxFinishMinutes).toBe(10);
  });
});
