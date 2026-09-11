import { z } from "zod";
import { OnboardingGoalTypeSchema } from "./goal.ts";

export const WeightChangeDirectionSchema = z.enum([
  "weight_loss",
  "maintenance",
  "weight_gain",
]);
export const WeightChangePaceSchema = z.enum(["recommended", "faster"]);
export const WeightChangePolicyVersionSchema = z.literal("weight-change-policy-v1");
export const WeightChangePolicyNameSchema = z.literal("weight-change-policy");

/**
 * Product bounds for V1 calorie-target collection.
 * Software validation ranges, not medical limits.
 */
export const CalorieTargetValidationPolicy = {
  weightKg: { min: 20, max: 500 },
  weightLb: { min: 44, max: 1100 },
  tdeeKcal: { min: 400, max: 10000 },
  targetCalories: { min: 400, max: 10000 },
} as const;

export const CalorieTargetInputSnapshotSchema = z.object({
  goalType: OnboardingGoalTypeSchema,
  weightChangeDirection: WeightChangeDirectionSchema,
  pace: WeightChangePaceSchema,
  weightKg: z.number(),
  weightLb: z.number(),
  tdeeKcal: z.number().int(),
  targetRatePerWeek: z.number(),
  policyVersion: WeightChangePolicyVersionSchema,
});

export const CalorieTargetSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  goalId: z.string().uuid(),
  tdeeEstimateId: z.string().uuid(),
  tdeeKcal: z.number().int().positive(),
  bodyWeightKg: z.number().positive(),
  bodyWeightLb: z.number().positive(),
  pace: WeightChangePaceSchema,
  targetRatePerWeek: z.number(),
  targetLbPerWeek: z.number(),
  weeklyCalorieAdjustment: z.number(),
  dailyCalorieAdjustment: z.number().int(),
  targetCalories: z.number().int().positive(),
  policyName: WeightChangePolicyNameSchema,
  policyVersion: WeightChangePolicyVersionSchema,
  inputSnapshot: CalorieTargetInputSnapshotSchema,
  createdAt: z.string(),
});

export type WeightChangeDirection = z.infer<typeof WeightChangeDirectionSchema>;
export type WeightChangePace = z.infer<typeof WeightChangePaceSchema>;
export type CalorieTargetInputSnapshot = z.infer<typeof CalorieTargetInputSnapshotSchema>;
export type CalorieTarget = z.infer<typeof CalorieTargetSchema>;
