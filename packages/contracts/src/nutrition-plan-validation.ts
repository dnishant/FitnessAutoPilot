import { z } from "zod";
import { PersonalizedMealNutritionSchema } from "./consumer-plan";
import { NutritionBudgetSchema } from "./meal-portioning";

/**
 * PLAN-011: Weekly nutrition plan validation & finalization contracts.
 *
 * PLAN-010 owns allocate → portion → reconcile.
 * PLAN-011 owns validate → classify → finalize.
 * PLAN-011 never invents portions, meals, or nutrition coefficients.
 */

export const NUTRITION_PLAN_VALIDATION_POLICY_VERSION =
  "nutrition-validation-policy-v1" as const;

export const ValidationRuleSeveritySchema = z.enum([
  "pass",
  "warning",
  "repairable_failure",
  "hard_failure",
]);

/**
 * Stable rule IDs for diagnostics. Prefer codes over meal names.
 */
export const ValidationRuleIdSchema = z.enum([
  // Structural
  "STRUCTURE_MEAL_INSTANCE_MISSING",
  "STRUCTURE_CANONICAL_MEAL_MISSING",
  "STRUCTURE_MEAL_NOT_EXECUTABLE",
  "STRUCTURE_PERSONALIZATION_MISSING",
  "STRUCTURE_PERSONALIZATION_STATUS_BLOCKED",
  "STRUCTURE_COMPONENT_OWNER_MISSING",
  "STRUCTURE_DUPLICATE_NUTRITION_OWNER",
  "STRUCTURE_CULINARY_NEED_AS_FOOD",
  "STRUCTURE_UNSELECTED_OPTION_OWNING_NUTRITION",
  "STRUCTURE_PARENT_CHILD_DOUBLE_COUNT",
  "STRUCTURE_MEAL_INSTANCE_MISMATCH",
  "STRUCTURE_STALE_PLAN_LINKAGE",
  "STRUCTURE_WEEK_INCOMPLETE",
  "STRUCTURE_DUPLICATE_MEAL_INSTANCE",
  "STRUCTURE_ORPHAN_PERSONALIZED_MEAL",

  // Nutrition provenance / arithmetic
  "NUTRITION_LLM_SOURCE_NOT_AUTHORITATIVE",
  "NUTRITION_MEAL_TOTAL_MISMATCH",
  "NUTRITION_DAILY_TOTAL_MISMATCH",
  "NUTRITION_WEEKLY_TOTAL_MISMATCH",
  "NUTRITION_MACRO_ENERGY_MISMATCH",
  "NUTRITION_AUTHORITY_MISSING",

  // Targets
  "TARGET_DAILY_CALORIES_OUTSIDE_PREFERRED",
  "TARGET_DAILY_CALORIES_OUTSIDE_HARD",
  "TARGET_DAILY_PROTEIN_LOW_PREFERRED",
  "TARGET_DAILY_PROTEIN_LOW_HARD",
  "TARGET_DAILY_PROTEIN_HIGH_GUARDRAIL",
  "TARGET_DAILY_CARBS_PATHOLOGICAL",
  "TARGET_DAILY_FAT_PATHOLOGICAL",
  "TARGET_DAILY_FIBER_MODERATE_LOW",
  "TARGET_DAILY_FIBER_SEVERE_LOW",
  "TARGET_WEEKLY_CALORIES_OUTSIDE_PREFERRED",
  "TARGET_WEEKLY_CALORIES_OUTSIDE_HARD",
  "TARGET_WEEKLY_PROTEIN_LOW",
  "TARGET_WEEKLY_FIBER_LOW",

  // Reserved breakfast/snack budget
  "RESERVED_NUTRITION_NEGATIVE",
  "RESERVED_NUTRITION_EXCEEDS_TARGET",
  "RESERVED_NUTRITION_RECONCILE_GAP",

  // Portions
  "PORTION_INVALID_NUMBER",
  "PORTION_HARD_BOUND_VIOLATION",
  "PORTION_DISCRETE_STEP_VIOLATION",
  "PORTION_FIXED_QUANTITY_MISMATCH",
  "PORTION_ZERO_REQUIRED",
  "PORTION_PREFERRED_RANGE_DEVIATION",
]);

export const ValidationRuleResultSchema = z.object({
  ruleId: ValidationRuleIdSchema,
  severity: ValidationRuleSeveritySchema,
  message: z.string().trim().min(1).max(600),
  day: z
    .enum([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ])
    .optional(),
  mealInstanceId: z.string().trim().min(1).max(120).optional(),
  componentId: z.string().trim().min(1).max(80).optional(),
  observed: z.union([z.number().finite(), z.string().max(120)]).optional(),
  expected: z.union([z.number().finite(), z.string().max(160)]).optional(),
  repairable: z.boolean(),
});

export const DayNutritionDeviationsSchema = z.object({
  calorieDeltaKcal: z.number().finite(),
  calorieDeltaPct: z.number().finite(),
  proteinDeltaGrams: z.number().finite(),
  proteinDeltaPct: z.number().finite(),
  carbsDeltaGrams: z.number().finite().optional(),
  fatDeltaGrams: z.number().finite().optional(),
  fiberDeltaGrams: z.number().finite().optional(),
});

export const DayValidationSummarySchema = z.object({
  day: z.enum([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]),
  target: NutritionBudgetSchema,
  plannedMeals: PersonalizedMealNutritionSchema.optional(),
  reservedNutrition: NutritionBudgetSchema,
  total: PersonalizedMealNutritionSchema.optional(),
  recomputedTotal: PersonalizedMealNutritionSchema.optional(),
  deviations: DayNutritionDeviationsSchema.optional(),
  rules: z.array(ValidationRuleResultSchema).max(64),
});

export const WeeklyValidationSummarySchema = z.object({
  target: NutritionBudgetSchema,
  actual: PersonalizedMealNutritionSchema.optional(),
  recomputed: PersonalizedMealNutritionSchema.optional(),
  deviations: DayNutritionDeviationsSchema.optional(),
  rules: z.array(ValidationRuleResultSchema).max(64),
});

export const WeeklyPlanValidationStatusSchema = z.enum([
  "finalized",
  "repair_required",
  "rejected",
]);

export const WeeklyPlanValidationReportSchema = z.object({
  policyVersion: z.literal(NUTRITION_PLAN_VALIDATION_POLICY_VERSION),
  status: WeeklyPlanValidationStatusSchema,
  validatedAt: z.string().min(1),
  overallSeverity: ValidationRuleSeveritySchema,
  days: z.array(DayValidationSummarySchema).max(7),
  weekly: WeeklyValidationSummarySchema,
  structuralRules: z.array(ValidationRuleResultSchema).max(128),
  repairAttempts: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  repairableFailureCount: z.number().int().nonnegative(),
  hardFailureCount: z.number().int().nonnegative(),
});

/**
 * Declarative repair request — diagnoses deviations; PLAN-010 decides portion changes.
 */
export const DayNutritionRepairHintSchema = z.object({
  day: z.enum([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]),
  /** Planned (lunch+dinner+reserved) calories relative to daily target. Negative = under. */
  calorieDeltaPct: z.number().finite(),
  /** Planned protein relative to daily target. Negative = under. */
  proteinDeltaPct: z.number().finite(),
  calorieDeltaKcal: z.number().finite(),
  proteinDeltaGrams: z.number().finite(),
  fiberDeltaGrams: z.number().finite().optional(),
  ruleIds: z.array(ValidationRuleIdSchema).max(16),
});

export const NutritionPlanRepairRequestSchema = z.object({
  policyVersion: z.literal(NUTRITION_PLAN_VALIDATION_POLICY_VERSION),
  /** Allowed repair scope: portion rebalance only — never meal replacement. */
  allowedScope: z.literal("portion_rebalance"),
  days: z.array(DayNutritionRepairHintSchema).min(1).max(7),
  message: z.string().trim().min(1).max(600),
});

export const ValidationFailureSchema = z.object({
  ruleId: ValidationRuleIdSchema,
  message: z.string().trim().min(1).max(600),
  day: z
    .enum([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ])
    .optional(),
  mealInstanceId: z.string().trim().min(1).max(120).optional(),
  componentId: z.string().trim().min(1).max(80).optional(),
});

/**
 * Immutable finalized weekly nutrition prescription (PLAN-011 pass).
 * Same shape as personalized plan plus finalization metadata — versioned, not mutated in place.
 */
export const FinalizedWeeklyNutritionPlanMetaSchema = z.object({
  finalizedAt: z.string().min(1),
  validationPolicyVersion: z.literal(NUTRITION_PLAN_VALIDATION_POLICY_VERSION),
  validationStatus: z.literal("finalized"),
  repairAttempts: z.number().int().nonnegative(),
});

export type ValidationRuleSeverity = z.infer<typeof ValidationRuleSeveritySchema>;
export type ValidationRuleId = z.infer<typeof ValidationRuleIdSchema>;
export type ValidationRuleResult = z.infer<typeof ValidationRuleResultSchema>;
export type DayNutritionDeviations = z.infer<typeof DayNutritionDeviationsSchema>;
export type DayValidationSummary = z.infer<typeof DayValidationSummarySchema>;
export type WeeklyValidationSummary = z.infer<typeof WeeklyValidationSummarySchema>;
export type WeeklyPlanValidationStatus = z.infer<typeof WeeklyPlanValidationStatusSchema>;
export type WeeklyPlanValidationReport = z.infer<typeof WeeklyPlanValidationReportSchema>;
export type DayNutritionRepairHint = z.infer<typeof DayNutritionRepairHintSchema>;
export type NutritionPlanRepairRequest = z.infer<typeof NutritionPlanRepairRequestSchema>;
export type ValidationFailure = z.infer<typeof ValidationFailureSchema>;
export type FinalizedWeeklyNutritionPlanMeta = z.infer<
  typeof FinalizedWeeklyNutritionPlanMetaSchema
>;
