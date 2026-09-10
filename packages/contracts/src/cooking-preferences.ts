import { z } from "zod";

export const PrepFrequencySchema = z.enum([
  "once_weekly",
  "twice_weekly",
  "throughout_week",
]);

export const MaxPrepSessionMinutesSchema = z.union([
  z.literal(45),
  z.literal(60),
  z.literal(90),
  z.literal(120),
  z.null(),
]);

export const WeeklyCookingStyleSchema = z.enum([
  "mostly_ready",
  "ready_lunch_fresh_dinner",
  "fresh_focused",
]);

export const FreshFinishMinutesSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(20),
]);

export const MaxFinishMinutesSchema = z.union([z.literal(0), FreshFinishMinutesSchema]);

export const PREP_FREQUENCY_OPTIONS = [
  {
    value: "once_weekly",
    label: "One main prep session",
    detail: "Do most prep in one session.",
  },
  {
    value: "twice_weekly",
    label: "Two smaller prep sessions",
    detail: "Fresher food, shorter sessions.",
  },
  {
    value: "throughout_week",
    label: "Prep ingredients and cook as I go",
    detail: "Less batch cooking.",
  },
] as const satisfies ReadonlyArray<{
  value: z.infer<typeof PrepFrequencySchema>;
  label: string;
  detail: string;
}>;

export const PREP_SESSION_TIME_OPTIONS = [
  { value: 45, label: "45 min" },
  { value: 60, label: "60 min" },
  { value: 90, label: "90 min" },
  { value: 120, label: "2 hours" },
  { value: null, label: "Flexible" },
] as const satisfies ReadonlyArray<{
  value: z.infer<typeof MaxPrepSessionMinutesSchema>;
  label: string;
}>;

export const WEEKLY_COOKING_STYLE_OPTIONS = [
  {
    value: "mostly_ready",
    label: "Mostly ready to eat",
    detail: "Prepare most lunches/dinners ahead; minimal weekday cooking.",
    recommended: false,
  },
  {
    value: "ready_lunch_fresh_dinner",
    label: "Ready lunches + quick fresh dinners",
    detail: "Keep lunches convenient; finish some dinners fresh in a few minutes.",
    recommended: true,
  },
  {
    value: "fresh_focused",
    label: "Prep ingredients, cook more fresh",
    detail: "Less batch cooking; more meals made from prepped components.",
    recommended: false,
  },
] as const satisfies ReadonlyArray<{
  value: z.infer<typeof WeeklyCookingStyleSchema>;
  label: string;
  detail: string;
  recommended: boolean;
}>;

export const FINISH_TIME_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
] as const satisfies ReadonlyArray<{
  value: z.infer<typeof FreshFinishMinutesSchema>;
  label: string;
}>;

/**
 * Future weekly-planner lunch strategies. Documented only in PLAN-002.
 * Do not persist or expose this setting.
 */
export const LunchPreparationStrategySchema = z.enum([
  "independent_meal_prep",
  "piggyback_prep",
  "direct_leftover",
]);

/** Future default leftover policy. Not collected or enforced in PLAN-002. */
export const MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK = 1;

const CookingPreferenceFieldsSchema = z.object({
  userId: z.string().uuid(),
  prepFrequency: PrepFrequencySchema,
  maxPrepSessionMinutes: MaxPrepSessionMinutesSchema,
  cookingStyle: WeeklyCookingStyleSchema,
  maxFinishMinutes: MaxFinishMinutesSchema,
  useDinnerPrepForNextLunch: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

function refineCookingPreferenceRules<
  T extends {
    cookingStyle: z.infer<typeof WeeklyCookingStyleSchema>;
    maxFinishMinutes: z.infer<typeof MaxFinishMinutesSchema>;
    useDinnerPrepForNextLunch: boolean;
  },
>(value: T, ctx: z.RefinementCtx) {
  if (value.cookingStyle === "mostly_ready") {
    if (value.maxFinishMinutes !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxFinishMinutes"],
        message: "Mostly ready meals persist a 0-minute finish time.",
      });
    }
    if (value.useDinnerPrepForNextLunch !== false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["useDinnerPrepForNextLunch"],
        message: "Mostly ready meals do not use dinner prep for tomorrow's lunch.",
      });
    }
    return;
  }
  if (!FreshFinishMinutesSchema.safeParse(value.maxFinishMinutes).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxFinishMinutes"],
      message: "Choose 5, 10, 15, or 20 minutes to finish a meal.",
    });
  }
}

export const CookingPreferencesSchema = CookingPreferenceFieldsSchema.superRefine(
  refineCookingPreferenceRules,
);

export const CookingPreferencesInputSchema = CookingPreferenceFieldsSchema.omit({
  userId: true,
  createdAt: true,
  updatedAt: true,
}).superRefine(refineCookingPreferenceRules);

export type PrepFrequency = z.infer<typeof PrepFrequencySchema>;
export type MaxPrepSessionMinutes = z.infer<typeof MaxPrepSessionMinutesSchema>;
export type WeeklyCookingStyle = z.infer<typeof WeeklyCookingStyleSchema>;
export type FreshFinishMinutes = z.infer<typeof FreshFinishMinutesSchema>;
export type MaxFinishMinutes = z.infer<typeof MaxFinishMinutesSchema>;
export type CookingPreferences = z.infer<typeof CookingPreferencesSchema>;
export type CookingPreferencesInput = z.infer<typeof CookingPreferencesInputSchema>;
export type LunchPreparationStrategy = z.infer<typeof LunchPreparationStrategySchema>;
