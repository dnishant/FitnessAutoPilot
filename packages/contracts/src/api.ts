import { z } from "zod";
import { UserProfileSchema } from "./profile";
import { GoalTypeSchema } from "./goal";
import { GenerateRecipeRequestSchema } from "./recipe-generation";

export const UpsertProfileRequestSchema = UserProfileSchema.omit({ userId: true }).partial({
  cuisinePreferences: true,
  proteinPreferences: true,
  allergies: true,
  dietaryRestrictions: true,
  dislikedFoods: true,
  preferredFoods: true,
  experiencePreferences: true,
  varietyLevel: true,
  cookingEquipment: true,
  safetyRestrictions: true,
}).extend({
  // userId comes from auth context server-side
});

export const CreateGoalRequestSchema = z.object({
  goalType: GoalTypeSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetWeightKg: z.number().positive().max(500).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  desiredRateKgPerWeek: z.number().min(-2).max(2).optional(),
});

export const GenerateDailyPlanRequestSchema = z.object({
  planDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Edge Function body for POST /generate-recipe (PLAN-003). */
export { GenerateRecipeRequestSchema };

export type UpsertProfileRequest = z.infer<typeof UpsertProfileRequestSchema>;
export type CreateGoalRequest = z.infer<typeof CreateGoalRequestSchema>;
export type GenerateDailyPlanRequest = z.infer<typeof GenerateDailyPlanRequestSchema>;
