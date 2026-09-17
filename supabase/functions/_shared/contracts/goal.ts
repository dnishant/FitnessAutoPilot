import { z } from "zod";

export const GoalTypeSchema = z.enum([
  "fat_loss",
  "muscle_gain",
  "recomposition",
  "general_fitness",
]);

export const GoalStatusSchema = z.enum(["active", "completed", "cancelled", "superseded"]);

export const GoalSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  goalType: GoalTypeSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetWeightKg: z.number().positive().max(500).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  desiredRateKgPerWeek: z.number().min(-2).max(2).optional(),
  status: GoalStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const OnboardingGoalTypeSchema = z.enum([
  "muscle_gain",
  "fat_loss",
  "recomposition",
]);

export const ONBOARDING_GOAL_OPTIONS = [
  {
    type: "fat_loss",
    label: "Lose weight",
    detail: "Lose body fat while preserving muscle.",
  },
  {
    type: "recomposition",
    label: "Maintain",
    detail: "Stay around your current weight.",
  },
  {
    type: "muscle_gain",
    label: "Gain weight",
    detail: "Build muscle with a controlled surplus.",
  },
] as const satisfies ReadonlyArray<{
  type: z.infer<typeof OnboardingGoalTypeSchema>;
  label: string;
  detail: string;
}>;

export function onboardingGoalLabel(
  goalType: z.infer<typeof OnboardingGoalTypeSchema>,
): string {
  return ONBOARDING_GOAL_OPTIONS.find((option) => option.type === goalType)?.label ?? goalType;
}

export type Goal = z.infer<typeof GoalSchema>;
export type GoalType = z.infer<typeof GoalTypeSchema>;
export type GoalStatus = z.infer<typeof GoalStatusSchema>;
export type OnboardingGoalType = z.infer<typeof OnboardingGoalTypeSchema>;
