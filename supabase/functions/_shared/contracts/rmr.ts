import { z } from "zod";

/**
 * Product input bounds for V1 RMR collection.
 * These are software validation ranges, not medical limits.
 */
export const RmrValidationPolicy = {
  heightCm: { min: 50, max: 300 },
  weightKg: { min: 20, max: 500 },
  rmrKcal: { min: 400, max: 5000 },
  ageYears: { min: 0, max: 120 },
} as const;

export const RmrBiologicalSexSchema = z.enum(["female", "male"]);
export const RmrSourceSchema = z.enum([
  "user_reported_dexa",
  "estimated_mifflin_st_jeor",
]);
export const RmrAlgorithmNameSchema = z.literal("mifflin_st_jeor");
export const RmrAlgorithmVersionSchema = z.literal("rmr-v1");

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ProfileBasicsSchema = z.object({
  userId: z.string().uuid(),
  dateOfBirth: IsoDateSchema,
  biologicalSex: RmrBiologicalSexSchema,
  heightCm: z
    .number()
    .gt(0)
    .min(RmrValidationPolicy.heightCm.min)
    .max(RmrValidationPolicy.heightCm.max),
  weightKg: z
    .number()
    .gt(0)
    .min(RmrValidationPolicy.weightKg.min)
    .max(RmrValidationPolicy.weightKg.max),
});

export const EstimatedRmrInputSnapshotSchema = z.object({
  dateOfBirth: IsoDateSchema,
  biologicalSex: RmrBiologicalSexSchema,
  heightCm: z.number(),
  weightKg: z.number(),
  ageYears: z.number().int(),
});

export const RmrEstimateSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  rmrKcal: z.number().int().positive(),
  source: RmrSourceSchema,
  algorithmName: RmrAlgorithmNameSchema.nullable(),
  algorithmVersion: RmrAlgorithmVersionSchema.nullable(),
  inputSnapshot: EstimatedRmrInputSnapshotSchema.nullable(),
  reportedOrMeasuredAt: IsoDateSchema.nullable(),
  calculatedAt: z.string(),
  createdAt: z.string(),
});

export const CompleteRmrOnboardingRequestSchema = z.object({
  dateOfBirth: IsoDateSchema,
  biologicalSex: RmrBiologicalSexSchema,
  heightCm: z.number(),
  weightKg: z.number(),
  source: RmrSourceSchema,
  reportedRmrKcal: z.number().optional(),
  reportDate: IsoDateSchema.optional(),
});

export type RmrBiologicalSex = z.infer<typeof RmrBiologicalSexSchema>;
export type RmrSource = z.infer<typeof RmrSourceSchema>;
export type ProfileBasics = z.infer<typeof ProfileBasicsSchema>;
export type EstimatedRmrInputSnapshot = z.infer<typeof EstimatedRmrInputSnapshotSchema>;
export type RmrEstimate = z.infer<typeof RmrEstimateSchema>;
export type CompleteRmrOnboardingRequest = z.infer<
  typeof CompleteRmrOnboardingRequestSchema
>;
