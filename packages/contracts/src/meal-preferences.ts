import { z } from "zod";

export const VarietyLevelSchema = z.enum(["simple", "balanced", "high"]);

export const CUISINE_OPTIONS = [
  { value: "indian", label: "Indian" },
  { value: "mexican", label: "Mexican" },
  { value: "mediterranean", label: "Mediterranean" },
  { value: "italian", label: "Italian" },
  { value: "east_asian", label: "East Asian" },
  { value: "american", label: "American" },
  { value: "middle_eastern", label: "Middle Eastern" },
  { value: "other", label: "Other" },
  { value: "surprise_me", label: "Surprise me" },
] as const;

export const PROTEIN_OPTIONS = [
  { value: "chicken", label: "Chicken" },
  { value: "turkey", label: "Turkey" },
  { value: "eggs", label: "Eggs" },
  { value: "beef", label: "Beef" },
  { value: "fish", label: "Fish" },
  { value: "shrimp", label: "Shrimp" },
  { value: "paneer", label: "Paneer" },
  { value: "tofu", label: "Tofu" },
  { value: "beans_lentils", label: "Beans / Lentils" },
] as const;

export const EXPERIENCE_OPTIONS = [
  { value: "saucy_flavorful", label: "Saucy & flavorful" },
  { value: "crispy_textured", label: "Crispy / textured" },
  { value: "fresh", label: "Fresh" },
  { value: "comforting", label: "Comforting" },
  { value: "spicy", label: "Spicy" },
  { value: "light_refreshing", label: "Light & refreshing" },
] as const;

export const VARIETY_OPTIONS = [
  {
    value: "simple",
    label: "Keep it simple",
    detail: "Some repeats and less complexity.",
  },
  {
    value: "balanced",
    label: "Balanced",
    detail: "Good variety without excessive prep.",
  },
  {
    value: "high",
    label: "Lots of variety",
    detail: "More different meals throughout the week.",
  },
] as const;

export const CuisineValueSchema = z.enum(
  CUISINE_OPTIONS.map((option) => option.value) as [
    (typeof CUISINE_OPTIONS)[number]["value"],
    ...(typeof CUISINE_OPTIONS)[number]["value"][],
  ],
);
export const ProteinValueSchema = z.enum(
  PROTEIN_OPTIONS.map((option) => option.value) as [
    (typeof PROTEIN_OPTIONS)[number]["value"],
    ...(typeof PROTEIN_OPTIONS)[number]["value"][],
  ],
);
export const ExperienceValueSchema = z.enum(
  EXPERIENCE_OPTIONS.map((option) => option.value) as [
    (typeof EXPERIENCE_OPTIONS)[number]["value"],
    ...(typeof EXPERIENCE_OPTIONS)[number]["value"][],
  ],
);

const PreferenceTagSchema = z.string().trim().min(1).max(80);

export const MealPreferencesSchema = z.object({
  userId: z.string().uuid(),
  cuisines: z.array(CuisineValueSchema),
  proteinPreferences: z.array(ProteinValueSchema),
  allergies: z.array(PreferenceTagSchema),
  dietaryRestrictions: z.array(PreferenceTagSchema),
  dislikes: z.array(PreferenceTagSchema),
  experiencePreferences: z.array(ExperienceValueSchema),
  varietyLevel: VarietyLevelSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const MealPreferencesInputSchema = MealPreferencesSchema.omit({
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export type VarietyLevel = z.infer<typeof VarietyLevelSchema>;
export type CuisineValue = z.infer<typeof CuisineValueSchema>;
export type ProteinValue = z.infer<typeof ProteinValueSchema>;
export type ExperienceValue = z.infer<typeof ExperienceValueSchema>;
export type MealPreferences = z.infer<typeof MealPreferencesSchema>;
export type MealPreferencesInput = z.infer<typeof MealPreferencesInputSchema>;
