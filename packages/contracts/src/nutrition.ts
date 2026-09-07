import { z } from "zod";

export const NutritionMacrosSchema = z.object({
  caloriesKcal: z.number().finite().nonnegative(),
  proteinG: z.number().finite().nonnegative(),
  carbsG: z.number().finite().nonnegative(),
  fatG: z.number().finite().nonnegative(),
});

export const NutritionTargetSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  goalId: z.string().uuid(),
  estimatedMaintenanceCalories: z.number().finite().positive(),
  targetCalories: z.number().finite().positive(),
  proteinG: z.number().finite().nonnegative(),
  fatMinG: z.number().finite().nonnegative(),
  fatMaxG: z.number().finite().nonnegative(),
  carbohydrateG: z.number().finite().nonnegative(),
  desiredRateKgPerWeek: z.number(),
  algorithmName: z.literal("nutrition-target"),
  algorithmVersion: z.string().min(1),
  inputSnapshot: z.record(z.unknown()),
  validFrom: z.string(),
  createdAt: z.string(),
});

export type NutritionMacros = z.infer<typeof NutritionMacrosSchema>;
export type NutritionTarget = z.infer<typeof NutritionTargetSchema>;
