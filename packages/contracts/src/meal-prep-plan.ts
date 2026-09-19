import { z } from "zod";
import { DayOfWeekSchema } from "./weekly-strategy";
import { PrepIntentSchema } from "./weekly-strategy";
import {
  MaxFinishMinutesSchema,
  MaxPrepSessionMinutesSchema,
  PrepFrequencySchema,
  WeeklyCookingStyleSchema,
} from "./cooking-preferences";
import { CulinaryMeasurementStateSchema } from "./recipe-resolution";

/**
 * PLAN-013: Meal Prep Execution Plan contracts.
 *
 * Consumes finalized weekly nutrition + resolved recipes + grocery demand.
 * Owns PREP / SCHEDULE / COOK / STORE / FINISH-LATER — not nutrition or grocery demand.
 */

export const MEAL_PREP_POLICY_VERSION = "meal-prep-policy-v1" as const;
export const CULINARY_PREP_INTERPRETATION_VERSION = "culinary-prep-interpretation-v1" as const;

export const PrepTaskTypeSchema = z.enum([
  "mise_en_place",
  "advance_prep",
  "cook",
  "portion_and_store",
  "fresh_finish",
]);

export const PrepEquipmentSchema = z.enum([
  "stovetop_burner",
  "oven",
  "air_fryer",
  "pressure_cooker",
  "sheet_pan",
  "pot",
  "skillet",
  "blender",
  "mixing_bowl",
  "cutting_board",
  "other",
]);

export const StorageDispositionSchema = z.enum([
  "refrigerate",
  "freeze",
  "keep_at_room_temperature",
  "fresh_finish_later",
  "consume_immediately",
]);

export const FuturePrepActionTypeSchema = z.enum([
  "thaw",
  "fresh_finish",
  "reheat",
  "assemble",
  "other",
]);

export const MealPrepPlanLifecycleSchema = z.enum([
  "not_generated",
  "generating",
  "ready",
  "in_progress",
  "completed",
  "failed",
]);

export const MealPrepFailureCodeSchema = z.enum([
  "MISSING_FINALIZED_PLAN",
  "MISSING_PREP_PROFILE",
  "MISSING_STORAGE_PROFILE",
  "MISSING_TASK_DEPENDENCY",
  "UNSUPPORTED_BATCH_SCALING",
  "EQUIPMENT_CONFLICT",
  "INVALID_TASK_GRAPH",
  "UNSAFE_STORAGE_HORIZON",
  "EMPTY_PLAN",
  "STALE_PLAN_LINK",
  "INGREDIENT_RECONCILIATION_FAILED",
]);

export const PrepTransformationKindSchema = z.enum([
  "raw",
  "washed",
  "peeled",
  "trimmed",
  "cut",
  "measured",
  "marinated",
  "cooked",
  "portioned",
  "other",
]);

/** Normalized knife-work / prep form — incompatible forms must not consolidate. */
export const PrepCutFormSchema = z.enum([
  "whole",
  "peeled",
  "washed",
  "trimmed",
  "diced",
  "minced",
  "sliced",
  "cubed",
  "chopped",
  "julienned",
  "crushed",
  "grated",
  "portioned",
  "mixed",
  "other",
]);

export const TaskIngredientRequirementSchema = z.object({
  ingredientId: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(200),
  /** Exact required quantity for this task (authoritative). */
  quantity: z.number().finite().positive(),
  unit: z.string().trim().min(1).max(40),
  measurementState: CulinaryMeasurementStateSchema.optional(),
  preparation: z.string().trim().min(1).max(200).nullable().optional(),
  cutForm: PrepCutFormSchema.optional(),
  canonicalFoodId: z.string().uuid().nullable().optional(),
  /** Practical display — never mutates quantity. */
  displayQuantityLabel: z.string().trim().min(1).max(80).optional(),
  recipeId: z.string().trim().min(1).max(80).optional(),
  coreMealId: z.string().trim().min(1).max(80).optional(),
});

export const PrepOutputSchema = z.object({
  outputId: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  recipeIds: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  coreMealIds: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  quantityServings: z.number().finite().positive().optional(),
});

export const TaskTimingSchema = z.object({
  /** Minutes from prep-session start when this task begins. */
  startOffsetMinutes: z.number().int().nonnegative().max(24 * 60),
  endOffsetMinutes: z.number().int().nonnegative().max(24 * 60),
  /** Concurrent task ids during this window (same schedule). */
  parallelTaskIds: z.array(z.string().trim().min(1).max(120)).max(16).default([]),
});

export const PrepTaskSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: PrepTaskTypeSchema,
  title: z.string().trim().min(1).max(200),
  durationMinutes: z.number().int().nonnegative().max(24 * 60),
  passiveMinutes: z.number().int().nonnegative().max(24 * 60).optional(),
  dependencies: z.array(z.string().trim().min(1).max(120)).max(32).default([]),
  recipeIds: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  coreMealIds: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  mealInstanceIds: z.array(z.string().trim().min(1).max(120)).max(16).default([]),
  ingredients: z.array(TaskIngredientRequirementSchema).max(40).default([]),
  equipment: z.array(PrepEquipmentSchema).max(8).default([]),
  canRunInParallel: z.boolean().default(true),
  requiresAttention: z.boolean().default(false),
  output: PrepOutputSchema.optional(),
  timing: TaskTimingSchema.optional(),
  instructions: z.array(z.string().trim().min(1).max(600)).max(20).default([]),
  /** Allocation breakdown for consolidated mise tasks. */
  allocations: z
    .array(
      z.object({
        coreMealId: z.string().trim().min(1).max(80),
        mealName: z.string().trim().min(1).max(160).optional(),
        quantityLabel: z.string().trim().min(1).max(80),
      }),
    )
    .max(8)
    .optional(),
  phaseGroup: z
    .enum(["produce", "proteins", "sauces_marinades", "grains", "other"])
    .optional(),
  ovenTemperatureF: z.number().int().positive().max(600).optional(),
});

export const WeeklyCookingRequirementSchema = z.object({
  coreMealId: z.string().trim().min(1).max(80),
  candidateId: z.string().trim().min(1).max(80),
  recipeId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  mealInstanceIds: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
  weeklyInstanceCount: z.number().int().positive().max(12),
  /** Exact sum of personalized main-recipe servings for the week. */
  requiredOutputServings: z.number().finite().positive(),
  /** Reference recipe baseServings (yield of one cook of the reference recipe). */
  referenceYieldServings: z.number().finite().positive(),
  /** Practical batch the cook will produce (may exceed required). */
  plannedCookOutputServings: z.number().finite().positive(),
  expectedExcessServings: z.number().finite().nonnegative(),
  prepIntent: PrepIntentSchema.optional(),
  instanceServings: z
    .array(
      z.object({
        mealInstanceId: z.string().trim().min(1).max(120),
        day: DayOfWeekSchema,
        mealType: z.enum(["lunch", "dinner"]),
        personalServings: z.number().finite().positive(),
      }),
    )
    .min(1)
    .max(12),
});

export const PortionStorageAssignmentSchema = z.object({
  id: z.string().trim().min(1).max(120),
  mealInstanceId: z.string().trim().min(1).max(120),
  coreMealId: z.string().trim().min(1).max(80),
  recipeId: z.string().trim().min(1).max(80),
  mealName: z.string().trim().min(1).max(160),
  day: DayOfWeekSchema,
  mealType: z.enum(["lunch", "dinner"]),
  personalServings: z.number().finite().positive(),
  disposition: StorageDispositionSchema,
  /** Why this disposition was chosen (metadata-backed). */
  reason: z.string().trim().min(1).max(400),
  fridgeLifeDaysUsed: z.number().int().positive().max(14).optional(),
  daysUntilEat: z.number().int().nonnegative().max(14),
  futureActionId: z.string().trim().min(1).max(120).optional(),
  keepComponentsSeparate: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
});

export const FuturePrepActionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: FuturePrepActionTypeSchema,
  /** Relative day the action should happen (usually day before eat for thaw). */
  scheduledDay: DayOfWeekSchema,
  /** Coarse timing hint for PLAN-014 — not a notification. */
  scheduledWindow: z.enum(["morning", "afternoon", "evening", "before_meal"]).default("evening"),
  mealInstanceId: z.string().trim().min(1).max(120),
  coreMealId: z.string().trim().min(1).max(80).optional(),
  mealName: z.string().trim().min(1).max(160).optional(),
  durationMinutes: z.number().int().nonnegative().max(180).optional(),
  instructions: z.array(z.string().trim().min(1).max(400)).max(12).default([]),
  relatedStorageAssignmentId: z.string().trim().min(1).max(120).optional(),
});

export const MealPrepScheduleSummarySchema = z.object({
  /** Critical-path elapsed minutes including passive waits. */
  elapsedMinutes: z.number().int().nonnegative().max(24 * 60),
  /** Sum of active attention windows (no double-count of parallel passive). */
  handsOnMinutes: z.number().int().nonnegative().max(24 * 60),
  /** Naive sum of all task duration+passive — for savings reporting only. */
  naiveSummedMinutes: z.number().int().nonnegative().max(48 * 60),
  scheduledTaskCount: z.number().int().nonnegative(),
});

export const MealPrepReconciliationSchema = z.object({
  weeklyRecipeDemandMismatches: z.number().int().nonnegative(),
  duplicatedIngredientDemand: z.number().int().nonnegative(),
  missingIngredientDemand: z.number().int().nonnegative(),
  orphanPrepTasks: z.number().int().nonnegative(),
  missingDependencies: z.number().int().nonnegative(),
  dependencyCycles: z.number().int().nonnegative(),
  unsupportedStorageAssignments: z.number().int().nonnegative(),
  orphanFutureActions: z.number().int().nonnegative(),
  stalePlanLinks: z.number().int().nonnegative(),
  intentionalExcessServingsTotal: z.number().finite().nonnegative(),
});

export const MealPrepIssueSchema = z.object({
  code: MealPrepFailureCodeSchema,
  message: z.string().trim().min(1).max(600),
  coreMealId: z.string().trim().min(1).max(80).optional(),
  recipeId: z.string().trim().min(1).max(80).optional(),
  taskId: z.string().trim().min(1).max(120).optional(),
  mealInstanceId: z.string().trim().min(1).max(120).optional(),
  /** When true, plan may still be produced with reduced confidence. */
  preservable: z.boolean(),
});

export const MealPrepPhaseProgressSchema = z.object({
  mise_en_place: z.object({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  }),
  advance_prep: z.object({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  }),
  cook: z.object({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  }),
  portion_and_store: z.object({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  }),
  fresh_finish: z.object({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  }),
});

export const MealPrepPlanSchema = z.object({
  generatedPlanId: z.string().trim().min(1).max(120),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  policyVersion: z.literal(MEAL_PREP_POLICY_VERSION),
  culinaryInterpretationVersion: z.literal(CULINARY_PREP_INTERPRETATION_VERSION),
  lifecycle: MealPrepPlanLifecycleSchema.default("ready"),
  available: z.boolean(),
  generatedAt: z.string().optional(),
  /** Prep session assumed on this day (usually flexible day / Sunday). */
  prepSessionDay: DayOfWeekSchema,
  cookingStyle: WeeklyCookingStyleSchema.optional(),
  prepFrequency: PrepFrequencySchema.optional(),
  maxPrepSessionMinutes: MaxPrepSessionMinutesSchema.optional(),
  maxFinishMinutes: MaxFinishMinutesSchema.optional(),
  coreMealCount: z.number().int().nonnegative(),
  portionCount: z.number().int().nonnegative(),
  coveredDayCount: z.number().int().nonnegative(),
  weeklyRequirements: z.array(WeeklyCookingRequirementSchema).max(8),
  tasks: z.array(PrepTaskSchema).max(200),
  /** Execution order of session tasks (mise → advance → cook → store). */
  sessionTaskOrder: z.array(z.string().trim().min(1).max(120)).max(200),
  storageAssignments: z.array(PortionStorageAssignmentSchema).max(24),
  futureActions: z.array(FuturePrepActionSchema).max(48),
  schedule: MealPrepScheduleSummarySchema,
  reconciliation: MealPrepReconciliationSchema,
  issues: z.array(MealPrepIssueSchema).max(64).default([]),
  phaseProgress: MealPrepPhaseProgressSchema.optional(),
});

export const MealPrepDerivationDiagnosticsSchema = z.object({
  policyVersion: z.literal(MEAL_PREP_POLICY_VERSION),
  culinaryInterpretationVersion: z.literal(CULINARY_PREP_INTERPRETATION_VERSION),
  taskCount: z.number().int().nonnegative(),
  miseTaskCount: z.number().int().nonnegative(),
  advanceTaskCount: z.number().int().nonnegative(),
  cookTaskCount: z.number().int().nonnegative(),
  storeTaskCount: z.number().int().nonnegative(),
  freshFinishTaskCount: z.number().int().nonnegative(),
  futureActionCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative(),
});

export type PrepTaskType = z.infer<typeof PrepTaskTypeSchema>;
export type PrepEquipment = z.infer<typeof PrepEquipmentSchema>;
export type StorageDisposition = z.infer<typeof StorageDispositionSchema>;
export type FuturePrepActionType = z.infer<typeof FuturePrepActionTypeSchema>;
export type MealPrepPlanLifecycle = z.infer<typeof MealPrepPlanLifecycleSchema>;
export type MealPrepFailureCode = z.infer<typeof MealPrepFailureCodeSchema>;
export type PrepCutForm = z.infer<typeof PrepCutFormSchema>;
export type PrepTransformationKind = z.infer<typeof PrepTransformationKindSchema>;
export type TaskIngredientRequirement = z.infer<typeof TaskIngredientRequirementSchema>;
export type PrepOutput = z.infer<typeof PrepOutputSchema>;
export type TaskTiming = z.infer<typeof TaskTimingSchema>;
export type PrepTask = z.infer<typeof PrepTaskSchema>;
export type WeeklyCookingRequirement = z.infer<typeof WeeklyCookingRequirementSchema>;
export type PortionStorageAssignment = z.infer<typeof PortionStorageAssignmentSchema>;
export type FuturePrepAction = z.infer<typeof FuturePrepActionSchema>;
export type MealPrepScheduleSummary = z.infer<typeof MealPrepScheduleSummarySchema>;
export type MealPrepReconciliation = z.infer<typeof MealPrepReconciliationSchema>;
export type MealPrepIssue = z.infer<typeof MealPrepIssueSchema>;
export type MealPrepPhaseProgress = z.infer<typeof MealPrepPhaseProgressSchema>;
export type MealPrepPlan = z.infer<typeof MealPrepPlanSchema>;
export type MealPrepDerivationDiagnostics = z.infer<typeof MealPrepDerivationDiagnosticsSchema>;
