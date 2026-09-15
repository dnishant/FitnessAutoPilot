import { describe, expect, it } from "vitest";
import {
  chooseOnboardingCookingStyle,
  continueFromCookingStyle,
  continueFromFinishTime,
  createOnboardingView,
  showsDinnerPrepQuestion,
  showsFinishTimeQuestion,
  startCookingPreferencesOnboarding,
  visibleCookingPreferenceFields,
} from "@fitness-autopilot/domain";

describe("cooking preference conditional UI", () => {
  it("hides finish-time for mostly_ready and never asks dinner-prep", () => {
    let view = startCookingPreferencesOnboarding(createOnboardingView());
    expect(visibleCookingPreferenceFields(view.draft.cookingStyle)).toContain("maxFinishMinutes");
    expect(showsFinishTimeQuestion(view.draft.cookingStyle)).toBe(true);
    expect(showsDinnerPrepQuestion(view.draft.cookingStyle)).toBe(false);
    expect(visibleCookingPreferenceFields(view.draft.cookingStyle)).not.toContain(
      "useDinnerPrepForNextLunch",
    );

    view = chooseOnboardingCookingStyle(view, "mostly_ready");
    expect(showsFinishTimeQuestion(view.draft.cookingStyle)).toBe(false);
    expect(showsDinnerPrepQuestion(view.draft.cookingStyle)).toBe(false);
    expect(visibleCookingPreferenceFields(view.draft.cookingStyle)).not.toContain("maxFinishMinutes");

    const completed = continueFromCookingStyle(view);
    expect(completed.cookingPreferences?.maxFinishMinutes).toBe(0);
    expect(completed.step).not.toBe("finish_time");
    expect(completed.step).not.toBe("dinner_prep");

    view = chooseOnboardingCookingStyle(view, "ready_lunch_fresh_dinner");
    const fresh = continueFromCookingStyle(view);
    expect(fresh.step).toBe("finish_time");
    expect(showsFinishTimeQuestion(fresh.draft.cookingStyle)).toBe(true);
    expect(showsDinnerPrepQuestion(fresh.draft.cookingStyle)).toBe(false);

    const finished = continueFromFinishTime(fresh);
    expect(finished.cookingPreferences).toBeTruthy();
    expect(finished.step).not.toBe("dinner_prep");
  });
});
