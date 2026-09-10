import type {
  CookingPreferences,
  CookingPreferencesInput,
  FreshFinishMinutes,
  MaxFinishMinutes,
  MaxPrepSessionMinutes,
  PrepFrequency,
  WeeklyCookingStyle,
} from "../../contracts/index.ts";
import {
  CookingPreferencesInputSchema,
  FreshFinishMinutesSchema,
  MaxPrepSessionMinutesSchema,
  PrepFrequencySchema,
  WEEKLY_COOKING_STYLE_OPTIONS,
  WeeklyCookingStyleSchema,
} from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";

export const DEFAULT_PREP_FREQUENCY: PrepFrequency = "once_weekly";
export const DEFAULT_MAX_PREP_SESSION_MINUTES: MaxPrepSessionMinutes = 90;
export const DEFAULT_COOKING_STYLE: WeeklyCookingStyle = "ready_lunch_fresh_dinner";
export const DEFAULT_MAX_FINISH_MINUTES: FreshFinishMinutes = 10;
export const DEFAULT_USE_DINNER_PREP_FOR_NEXT_LUNCH = true;

export type CookingPreferenceError = {
  code: "invalid_input";
  field?:
    | "prepFrequency"
    | "maxPrepSessionMinutes"
    | "cookingStyle"
    | "maxFinishMinutes"
    | "useDinnerPrepForNextLunch";
  message: string;
};

export type CookingPreferencesDraft = CookingPreferencesInput;

export type CookingPreferenceField =
  | "prepFrequency"
  | "maxPrepSessionMinutes"
  | "cookingStyle"
  | "maxFinishMinutes"
  | "useDinnerPrepForNextLunch";

const COOKING_FIELD_MESSAGES: Record<CookingPreferenceField, string> = {
  prepFrequency: "Choose one main prep session, two smaller sessions, or cook as you go.",
  maxPrepSessionMinutes: "Choose 45 minutes, 60 minutes, 90 minutes, 2 hours, or Flexible.",
  cookingStyle: "Choose mostly ready, ready lunches with fresh dinners, or more fresh cooking.",
  maxFinishMinutes: "Choose 5, 10, 15, or 20 minutes to finish a meal.",
  useDinnerPrepForNextLunch: "Choose whether dinner prep can help tomorrow's lunch.",
};

export function isFreshEnabledCookingStyle(
  cookingStyle: WeeklyCookingStyle,
): cookingStyle is Exclude<WeeklyCookingStyle, "mostly_ready"> {
  return cookingStyle === "ready_lunch_fresh_dinner" || cookingStyle === "fresh_focused";
}

export function showsFinishTimeQuestion(cookingStyle: WeeklyCookingStyle): boolean {
  return isFreshEnabledCookingStyle(cookingStyle);
}

export function showsDinnerPrepQuestion(cookingStyle: WeeklyCookingStyle): boolean {
  return isFreshEnabledCookingStyle(cookingStyle);
}

export function visibleCookingPreferenceFields(
  cookingStyle: WeeklyCookingStyle,
): CookingPreferenceField[] {
  const fields: CookingPreferenceField[] = [
    "prepFrequency",
    "maxPrepSessionMinutes",
    "cookingStyle",
  ];
  if (showsFinishTimeQuestion(cookingStyle)) {
    fields.push("maxFinishMinutes");
  }
  if (showsDinnerPrepQuestion(cookingStyle)) {
    fields.push("useDinnerPrepForNextLunch");
  }
  return fields;
}

export function isFreshFinishMinutes(value: unknown): value is FreshFinishMinutes {
  return FreshFinishMinutesSchema.safeParse(value).success;
}

export function applyCookingPreferenceDefaults(
  input: Partial<CookingPreferencesDraft> = {},
): CookingPreferencesDraft {
  const cookingStyle = input.cookingStyle ?? DEFAULT_COOKING_STYLE;
  const omittedFinish = input.maxFinishMinutes === undefined;
  const omittedDinner = input.useDinnerPrepForNextLunch === undefined;
  return {
    prepFrequency: input.prepFrequency ?? DEFAULT_PREP_FREQUENCY,
    maxPrepSessionMinutes:
      input.maxPrepSessionMinutes === undefined
        ? DEFAULT_MAX_PREP_SESSION_MINUTES
        : input.maxPrepSessionMinutes,
    cookingStyle,
    maxFinishMinutes: omittedFinish
      ? cookingStyle === "mostly_ready"
        ? 0
        : DEFAULT_MAX_FINISH_MINUTES
      : input.maxFinishMinutes,
    useDinnerPrepForNextLunch: omittedDinner
      ? cookingStyle === "mostly_ready"
        ? false
        : DEFAULT_USE_DINNER_PREP_FOR_NEXT_LUNCH
      : input.useDinnerPrepForNextLunch,
  };
}

export function normalizeCookingPreferences(
  input: CookingPreferencesDraft,
): CookingPreferencesDraft {
  if (input.cookingStyle !== "mostly_ready") {
    return input;
  }
  return {
    ...input,
    maxFinishMinutes: 0,
    useDinnerPrepForNextLunch: false,
  };
}

export function createCookingPreferencesDraft(
  overrides: Partial<CookingPreferencesDraft> = {},
): CookingPreferencesDraft {
  return normalizeCookingPreferences(applyCookingPreferenceDefaults(overrides));
}

export function rememberedFinishMinutes(
  current: MaxFinishMinutes,
  remembered?: FreshFinishMinutes | null,
): FreshFinishMinutes {
  if (isFreshFinishMinutes(current)) {
    return current;
  }
  return remembered && isFreshFinishMinutes(remembered)
    ? remembered
    : DEFAULT_MAX_FINISH_MINUTES;
}

export function applyCookingStyleChange(input: {
  current: CookingPreferencesDraft;
  nextStyle: WeeklyCookingStyle;
  rememberedMaxFinishMinutes?: FreshFinishMinutes | null;
}): {
  draft: CookingPreferencesDraft;
  rememberedMaxFinishMinutes: FreshFinishMinutes;
} {
  const remembered = rememberedFinishMinutes(
    input.current.maxFinishMinutes,
    input.rememberedMaxFinishMinutes,
  );
  if (input.nextStyle === "mostly_ready") {
    return {
      draft: normalizeCookingPreferences({
        ...input.current,
        cookingStyle: "mostly_ready",
      }),
      rememberedMaxFinishMinutes: remembered,
    };
  }
  return {
    draft: {
      ...input.current,
      cookingStyle: input.nextStyle,
      maxFinishMinutes: remembered,
      useDinnerPrepForNextLunch:
        input.current.cookingStyle === "mostly_ready"
          ? DEFAULT_USE_DINNER_PREP_FOR_NEXT_LUNCH
          : input.current.useDinnerPrepForNextLunch,
    },
    rememberedMaxFinishMinutes: remembered,
  };
}

export function validateCookingPreferences(
  input: Partial<CookingPreferencesDraft>,
): Result<CookingPreferencesDraft, CookingPreferenceError> {
  const parsed = CookingPreferencesInputSchema.safeParse(
    normalizeCookingPreferences(applyCookingPreferenceDefaults(input)),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path[0];
    const field =
      path === "prepFrequency" ||
      path === "maxPrepSessionMinutes" ||
      path === "cookingStyle" ||
      path === "maxFinishMinutes" ||
      path === "useDinnerPrepForNextLunch"
        ? path
        : "cookingStyle";
    return err({
      code: "invalid_input",
      field,
      message: COOKING_FIELD_MESSAGES[field],
    });
  }
  return ok(parsed.data);
}

export function isSupportedPrepFrequency(value: string): value is PrepFrequency {
  return PrepFrequencySchema.safeParse(value).success;
}

export function isSupportedCookingStyle(value: string): value is WeeklyCookingStyle {
  return WeeklyCookingStyleSchema.safeParse(value).success;
}

export function isSupportedPrepSessionMinutes(
  value: unknown,
): value is MaxPrepSessionMinutes {
  return MaxPrepSessionMinutesSchema.safeParse(value).success;
}

export function upsertCurrentCookingPreferences(input: {
  userId: string;
  current: CookingPreferences | null;
  next: Partial<CookingPreferencesDraft>;
  asOf?: Date;
}): Result<CookingPreferences, CookingPreferenceError> {
  const validated = validateCookingPreferences(input.next);
  if (!validated.ok) {
    return validated;
  }
  const asOf = (input.asOf ?? new Date()).toISOString();
  return ok({
    userId: input.userId,
    ...validated.value,
    createdAt: input.current?.createdAt ?? asOf,
    updatedAt: asOf,
  });
}

export function cookingStyleOptionDetail(style: WeeklyCookingStyle): string {
  return WEEKLY_COOKING_STYLE_OPTIONS.find((option) => option.value === style)?.detail ?? style;
}

export function hasCompletedCookingPreferences(
  completedAt: string | null | undefined,
): boolean {
  return typeof completedAt === "string" && completedAt.trim() !== "";
}

export function cookingPreferenceDbColumns(
  draft: CookingPreferencesDraft,
  completedAt: string,
): {
  prep_frequency: PrepFrequency;
  max_prep_session_minutes: MaxPrepSessionMinutes;
  cooking_style: WeeklyCookingStyle;
  max_finish_minutes: MaxFinishMinutes;
  use_dinner_prep_for_next_lunch: boolean;
  cooking_preferences_completed_at: string;
} {
  return {
    prep_frequency: draft.prepFrequency,
    max_prep_session_minutes: draft.maxPrepSessionMinutes,
    cooking_style: draft.cookingStyle,
    max_finish_minutes: draft.maxFinishMinutes,
    use_dinner_prep_for_next_lunch: draft.useDinnerPrepForNextLunch,
    cooking_preferences_completed_at: completedAt,
  };
}
