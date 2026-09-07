import { z } from "zod";

export const BiologicalSexSchema = z.enum(["female", "male", "other"]);
export const FitnessExperienceSchema = z.enum([
  "sedentary",
  "beginner",
  "intermediate",
  "advanced",
]);
export const DietaryPreferenceSchema = z.enum([
  "omnivore",
  "vegetarian",
  "vegan",
  "pescatarian",
  "halal",
  "none",
]);
export const CookingSkillSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const MealPrepAvailabilitySchema = z.enum([
  "none",
  "weekends",
  "few_weeknights",
  "most_days",
]);

export const SafetyRestrictionSchema = z.enum([
  "pregnancy",
  "eating_disorder",
  "clinically_significant_underweight",
  "renal_disease",
  "cardiovascular_disease",
  "serious_injury",
  "other_professional_management",
]);

/** Current body-weight in kg. DB column remains `weight_kg`. */
export const UserProfileSchema = z.object({
  userId: z.string().uuid(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  biologicalSex: BiologicalSexSchema,
  heightCm: z.number().positive().max(300),
  weightKg: z.number().positive().max(500),
  fitnessExperience: FitnessExperienceSchema,
  dietaryPreference: DietaryPreferenceSchema,
  cuisinePreferences: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  dislikedFoods: z.array(z.string()).default([]),
  preferredFoods: z.array(z.string()).default([]),
  typicalEatingHabits: z.string().max(2000).optional(),
  mealPrepAvailability: MealPrepAvailabilitySchema,
  cookingSkill: CookingSkillSchema,
  cookingEquipment: z.array(z.string()).default([]),
  maxMealPrepMinutes: z.number().int().nonnegative().max(24 * 60),
  safetyRestrictions: z.array(SafetyRestrictionSchema).default([]),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type BiologicalSex = z.infer<typeof BiologicalSexSchema>;
export type FitnessExperience = z.infer<typeof FitnessExperienceSchema>;
export type DietaryPreference = z.infer<typeof DietaryPreferenceSchema>;
export type SafetyRestriction = z.infer<typeof SafetyRestrictionSchema>;
