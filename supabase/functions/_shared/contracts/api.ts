import { z } from "zod";
import { UserProfileSchema } from "./profile.ts";
import { GoalTypeSchema } from "./goal.ts";
import { GenerateRecipeRequestSchema } from "./recipe-generation.ts";
import { RecipeDiscoverySearchRequestSchema } from "./recipe-discovery.ts";
import { GenerateWeeklyStrategyRequestSchema } from "./weekly-strategy.ts";

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

/** Edge Function body for POST /recipe-discovery-search (PLAN-005). */
export { RecipeDiscoverySearchRequestSchema };

/** Edge Function body for POST /generate-weekly-strategy (PLAN-004). */
export { GenerateWeeklyStrategyRequestSchema };

export type UpsertProfileRequest = z.infer<typeof UpsertProfileRequestSchema>;
export type CreateGoalRequest = z.infer<typeof CreateGoalRequestSchema>;
export type GenerateDailyPlanRequest = z.infer<typeof GenerateDailyPlanRequestSchema>;
