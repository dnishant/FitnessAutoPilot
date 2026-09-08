import { z } from "zod";
import { WeightChangePaceSchema } from "./calorie-target";
import { OnboardingGoalTypeSchema } from "./goal";
import { IsoDateSchema, RmrSourceSchema } from "./rmr";

/**
 * Product input bounds for V1 wearable TDEE collection.
 * These are software validation ranges, not medical limits.
 */
export const TdeeValidationPolicy = {
  wearableCaloriesKcal: { min: 100, max: 8000 },
  tdeeKcal: { min: 400, max: 10000 },
} as const;

export const WearableSchema = z.enum(["apple_watch", "whoop"]);

export const WEARABLE_OPTIONS = [
  { type: "apple_watch", label: "Apple Watch" },
  { type: "whoop", label: "Whoop" },
] as const satisfies ReadonlyArray<{ type: z.infer<typeof WearableSchema>; label: string }>;
export const TdeeSourceSchema = z.enum([
  "whoop_daily_calories",
  "apple_watch_active_plus_rmr",
]);
export const TdeeAlgorithmNameSchema = z.literal("apple_watch_active_plus_rmr");
export const TdeeAlgorithmVersionSchema = z.literal("tdee-v1");

export const TdeeInputSnapshotSchema = z.object({
  wearable: WearableSchema,
  wearableCaloriesKcal: z.number().int(),
  rmrKcal: z.number().int(),
  rmrSource: RmrSourceSchema,
  goalType: OnboardingGoalTypeSchema,
});

export const TdeeEstimateSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tdeeKcal: z.number().int().positive(),
  source: TdeeSourceSchema,
  wearable: WearableSchema,
  wearableCaloriesKcal: z.number().int().positive(),
  rmrKcalUsed: z.number().int().positive().nullable(),
  algorithmName: TdeeAlgorithmNameSchema.nullable(),
  algorithmVersion: TdeeAlgorithmVersionSchema.nullable(),
  inputSnapshot: TdeeInputSnapshotSchema,
  calculatedAt: z.string(),
  createdAt: z.string(),
});

export const CompleteOnboardingRequestSchema = z.object({
  dateOfBirth: IsoDateSchema,
  biologicalSex: z.enum(["female", "male"]),
  heightCm: z.number(),
  weightKg: z.number(),
  source: RmrSourceSchema,
  reportedRmrKcal: z.number().optional(),
  reportDate: IsoDateSchema.optional(),
  goalType: OnboardingGoalTypeSchema,
  wearable: WearableSchema,
  wearableCaloriesKcal: z.number(),
  pace: WeightChangePaceSchema.optional(),
});

export type Wearable = z.infer<typeof WearableSchema>;
export type TdeeSource = z.infer<typeof TdeeSourceSchema>;
export type TdeeInputSnapshot = z.infer<typeof TdeeInputSnapshotSchema>;
export type TdeeEstimate = z.infer<typeof TdeeEstimateSchema>;
export type CompleteOnboardingRequest = z.infer<typeof CompleteOnboardingRequestSchema>;
