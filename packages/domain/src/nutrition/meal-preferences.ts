import type {
  CuisineValue,
  ExperienceValue,
  MealPreferences,
  MealPreferencesInput,
  ProteinValue,
  VarietyLevel,
} from "@fitness-autopilot/contracts";
import {
  CuisineValueSchema,
  ExperienceValueSchema,
  MealPreferencesInputSchema,
  ProteinValueSchema,
  VARIETY_OPTIONS,
  VarietyLevelSchema,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";

export const DEFAULT_VARIETY_LEVEL: VarietyLevel = "balanced";
export const SURPRISE_ME_CUISINE = "surprise_me" as const satisfies CuisineValue;

export type MealPreferenceError = {
  code: "invalid_input";
  field?:
    | "cuisines"
    | "proteinPreferences"
    | "allergies"
    | "dietaryRestrictions"
    | "dislikes"
    | "experiencePreferences"
    | "varietyLevel";
  message: string;
};

export type MealPreferencesDraft = MealPreferencesInput;

function uniquePreserveOrder<T extends string>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  const next: T[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(value);
  }
  return next;
}

function normalizeTag(value: string): Result<string, MealPreferenceError> {
  const trimmed = value.trim();
  if (trimmed === "") {
    return err({
      code: "invalid_input",
      message: "Enter a food name before adding it.",
    });
  }
  if (trimmed.length > 80) {
    return err({
      code: "invalid_input",
      message: "Keep each food tag under 80 characters.",
    });
  }
  return ok(trimmed);
}

export function toggleSelection<T extends string>(current: readonly T[], value: T): T[] {
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }
  return [...current, value];
}

export function toggleCuisine(current: readonly CuisineValue[], value: CuisineValue): CuisineValue[] {
  return toggleSelection(current, value);
}

export function createMealPreferencesDraft(
  overrides: Partial<MealPreferencesDraft> = {},
): MealPreferencesDraft {
  return {
    cuisines: [],
    proteinPreferences: [],
    allergies: [],
    dietaryRestrictions: [],
    dislikes: [],
    experiencePreferences: [],
    varietyLevel: DEFAULT_VARIETY_LEVEL,
    ...overrides,
  };
}

export function validateMealPreferences(
  input: MealPreferencesDraft,
): Result<MealPreferencesDraft, MealPreferenceError> {
  const parsed = MealPreferencesInputSchema.safeParse({
    ...input,
    cuisines: uniquePreserveOrder(input.cuisines),
    proteinPreferences: uniquePreserveOrder(input.proteinPreferences),
    allergies: uniquePreserveOrder(input.allergies.map((tag) => tag.trim()).filter(Boolean)),
    dietaryRestrictions: uniquePreserveOrder(
      input.dietaryRestrictions.map((tag) => tag.trim()).filter(Boolean),
    ),
    dislikes: uniquePreserveOrder(input.dislikes.map((tag) => tag.trim()).filter(Boolean)),
    experiencePreferences: uniquePreserveOrder(input.experiencePreferences),
    varietyLevel: input.varietyLevel || DEFAULT_VARIETY_LEVEL,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path[0];
    const field =
      path === "varietyLevel" ||
      path === "cuisines" ||
      path === "proteinPreferences" ||
      path === "experiencePreferences" ||
      path === "allergies" ||
      path === "dietaryRestrictions" ||
      path === "dislikes"
        ? path
        : "varietyLevel";
    return err({
      code: "invalid_input",
      field,
      message:
        field === "varietyLevel"
          ? "Choose Keep it simple, Balanced, or Lots of variety."
          : "Choose from the supported meal preference options.",
    });
  }
  return ok(parsed.data);
}

export function addPreferenceTag(
  current: readonly string[],
  value: string,
): Result<string[], MealPreferenceError> {
  const tag = normalizeTag(value);
  if (!tag.ok) {
    return tag;
  }
  return ok(uniquePreserveOrder([...current, tag.value]));
}

export function removePreferenceTag(current: readonly string[], value: string): string[] {
  return current.filter((item) => item.toLowerCase() !== value.trim().toLowerCase());
}

export function isSupportedCuisine(value: string): value is CuisineValue {
  return CuisineValueSchema.safeParse(value).success;
}

export function isSupportedProtein(value: string): value is ProteinValue {
  return ProteinValueSchema.safeParse(value).success;
}

export function isSupportedExperience(value: string): value is ExperienceValue {
  return ExperienceValueSchema.safeParse(value).success;
}

export function isSupportedVariety(value: string): value is VarietyLevel {
  return VarietyLevelSchema.safeParse(value).success;
}

export function upsertCurrentMealPreferences(input: {
  userId: string;
  current: MealPreferences | null;
  next: MealPreferencesDraft;
  asOf?: Date;
}): Result<MealPreferences, MealPreferenceError> {
  const validated = validateMealPreferences(input.next);
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

export function varietyOptionDetail(level: VarietyLevel): string {
  return VARIETY_OPTIONS.find((option) => option.value === level)?.detail ?? level;
}

export function hasCompletedMealPreferences(
  completedAt: string | null | undefined,
): boolean {
  return typeof completedAt === "string" && completedAt.trim() !== "";
}

export function mealPreferenceDbColumns(
  draft: MealPreferencesDraft,
  completedAt: string,
): {
  cuisine_preferences: MealPreferencesDraft["cuisines"];
  protein_preferences: MealPreferencesDraft["proteinPreferences"];
  allergies: string[];
  dietary_restrictions: string[];
  disliked_foods: string[];
  experience_preferences: MealPreferencesDraft["experiencePreferences"];
  variety_level: VarietyLevel;
  meal_preferences_completed_at: string;
} {
  return {
    cuisine_preferences: draft.cuisines,
    protein_preferences: draft.proteinPreferences,
    allergies: draft.allergies,
    dietary_restrictions: draft.dietaryRestrictions,
    disliked_foods: draft.dislikes,
    experience_preferences: draft.experiencePreferences,
    variety_level: draft.varietyLevel,
    meal_preferences_completed_at: completedAt,
  };
}
