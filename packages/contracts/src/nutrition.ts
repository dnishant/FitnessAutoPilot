import { z } from "zod";

export const NutritionMacrosSchema = z.object({
  caloriesKcal: z.number().finite().nonnegative(),
  proteinG: z.number().finite().nonnegative(),
  carbsG: z.number().finite().nonnegative(),
  fatG: z.number().finite().nonnegative(),
  /** Daily fiber when present (fiber-policy-v1). Optional for older payloads. */
  fiberG: z.number().finite().nonnegative().optional(),
});

export const MacroPolicyNameSchema = z.literal("macro-policy");
export const MacroPolicyVersionSchema = z.literal("macro-policy-v1");
export const FiberPolicyNameSchema = z.literal("fiber-policy");
export const FiberPolicyVersionSchema = z.literal("fiber-policy-v1");

export const MacroTargetInputSnapshotSchema = z.object({
  bodyWeightKg: z.number().finite().positive(),
  bodyWeightLb: z.number().finite().positive(),
  bodyWeightUnit: z.enum(["kg", "lb"]),
  targetCalories: z.number().finite().positive(),
  proteinGramsPerLb: z.number().finite().positive(),
  fatGramsPerKg: z.number().finite().positive(),
  proteinKcalPerGram: z.number().finite().positive(),
  carbKcalPerGram: z.number().finite().positive(),
  fatKcalPerGram: z.number().finite().positive(),
  policyVersion: MacroPolicyVersionSchema,
  /** Grams fiber per 1000 kcal (fiber-policy-v1). */
  fiberGramsPer1000Kcal: z.number().finite().positive().optional(),
  fiberPolicyVersion: FiberPolicyVersionSchema.optional(),
});

export const NutritionTargetSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  goalId: z.string().uuid(),
  calorieTargetId: z.string().uuid().optional(),
  estimatedMaintenanceCalories: z.number().finite().positive(),
  targetCalories: z.number().finite().positive(),
  proteinG: z.number().finite().nonnegative(),
  fatG: z.number().finite().nonnegative().optional(),
  fatMinG: z.number().finite().nonnegative(),
  fatMaxG: z.number().finite().nonnegative(),
  carbohydrateG: z.number().finite().nonnegative(),
  /** Daily fiber target from fiber-policy-v1. Optional for historical rows. */
  fiberG: z.number().finite().nonnegative().optional(),
  desiredRateKgPerWeek: z.number(),
  algorithmName: z.literal("nutrition-target"),
  algorithmVersion: z.string().min(1),
  macroPolicyName: MacroPolicyNameSchema.optional(),
  macroPolicyVersion: MacroPolicyVersionSchema.optional(),
  fiberPolicyName: FiberPolicyNameSchema.optional(),
  fiberPolicyVersion: FiberPolicyVersionSchema.optional(),
  inputSnapshot: z.record(z.unknown()),
  validFrom: z.string(),
  createdAt: z.string(),
});

export type NutritionMacros = z.infer<typeof NutritionMacrosSchema>;
export type MacroTargetInputSnapshot = z.infer<typeof MacroTargetInputSnapshotSchema>;
export type NutritionTarget = z.infer<typeof NutritionTargetSchema>;
export type FiberPolicyVersion = z.infer<typeof FiberPolicyVersionSchema>;
