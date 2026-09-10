import { describe, expect, it } from "vitest";
import {
  chooseOnboardingCookingStyle,
  continueFromCookingStyle,
  createOnboardingView,
  showsDinnerPrepQuestion,
  showsFinishTimeQuestion,
  startCookingPreferencesOnboarding,
  visibleCookingPreferenceFields,
} from "@fitness-autopilot/domain";

describe("cooking preference conditional UI", () => {
  it("hides finish-time and dinner-prep fields for mostly_ready and shows them for fresh styles", () => {
    let view = startCookingPreferencesOnboarding(createOnboardingView());
    expect(visibleCookingPreferenceFields(view.draft.cookingStyle)).toContain("maxFinishMinutes");
    expect(showsFinishTimeQuestion(view.draft.cookingStyle)).toBe(true);

    view = chooseOnboardingCookingStyle(view, "mostly_ready");
    expect(showsFinishTimeQuestion(view.draft.cookingStyle)).toBe(false);
    expect(showsDinnerPrepQuestion(view.draft.cookingStyle)).toBe(false);
    expect(visibleCookingPreferenceFields(view.draft.cookingStyle)).not.toContain("maxFinishMinutes");
    expect(visibleCookingPreferenceFields(view.draft.cookingStyle)).not.toContain(
      "useDinnerPrepForNextLunch",
    );

    const completed = continueFromCookingStyle(view);
    expect(completed.cookingPreferences?.maxFinishMinutes).toBe(0);
    expect(completed.step).not.toBe("finish_time");
    expect(completed.step).not.toBe("dinner_prep");

    view = chooseOnboardingCookingStyle(view, "ready_lunch_fresh_dinner");
    const fresh = continueFromCookingStyle(view);
    expect(fresh.step).toBe("finish_time");
    expect(showsFinishTimeQuestion(fresh.draft.cookingStyle)).toBe(true);
    expect(showsDinnerPrepQuestion(fresh.draft.cookingStyle)).toBe(true);
  });
});
