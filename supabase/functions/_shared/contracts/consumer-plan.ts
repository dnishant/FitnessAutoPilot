import { z } from "zod";
import { DayOfWeekSchema, PrepIntentSchema } from "./weekly-strategy.ts";
import { MealConceptSchema } from "./meal-composition.ts";
import { ResolvedRecipeSchema } from "./recipe-resolution.ts";
import { RankedWeeklyStrategySchema } from "./ranked-weekly-strategy.ts";
import { GroceryListSchema } from "./grocery.ts";

/**
 * Consumer-facing weekly plan + PLAN-010 personalized portion shapes.
 *
 * Personalized nutrition/portions are optional so the UI can hide them until
 * an authoritative PLAN-010 result exists — never invent values in the client.
 */

/** Consumer-facing portion readiness — never expose solver diagnostics. */
export const MealPortionStatusSchema = z.enum(["available", "pending", "blocked"]);

export const PersonalizedMealNutritionSchema = z.object({
  caloriesKcal: z.number().finite().nonnegative(),
  proteinGrams: z.number().finite().nonnegative(),
  carbsGrams: z.number().finite().nonnegative(),
  fatGrams: z.number().finite().nonnegative(),
  fiberGrams: z.number().finite().nonnegative().optional(),
});

export const PersonalizedMealComponentSchema = z.object({
  componentId: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(160),
  amount: z.number().finite().positive().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
});

export const ConsumerMealComponentSchema = z.object({
  componentId: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(40).optional(),
  /** Present only when PLAN-010 (or equivalent) provides authoritative amounts. */
  amount: z.number().finite().positive().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
});

export const ConsumerMealSlotSchema = z.object({
  day: DayOfWeekSchema,
  mealType: z.enum(["lunch", "dinner"]),
  candidateId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  prepIntent: PrepIntentSchema,
  finishTimeMinutes: z.number().int().nonnegative().max(180).optional(),
  cuisineFamily: z.string().trim().min(1).max(80).optional(),
  flavorTags: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  experienceTags: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  components: z.array(ConsumerMealComponentSchema).max(16),
  /** Hide in UI until personalized / authoritative. */
  personalizedNutrition: PersonalizedMealNutritionSchema.optional(),
  /**
   * PLAN-010 readiness for this meal slot.
   * - available: authoritative portions + nutrition attached
   * - pending: solve still in progress (async); do not invent quantities
   * - blocked: solver could not produce portions; show graceful empty state
   * Absent means no PLAN-010 attempt / no trusted coefficients for this meal.
   */
  portionStatus: MealPortionStatusSchema.optional(),
});

export const ConsumerWeeklyPlanStatusSchema = z.enum([
  "idle",
  "generating",
  "ready",
  "failed",
]);

export const ConsumerPlanGenerationStageSchema = z.enum([
  "understanding_preferences",
  "finding_meals",
  "building_complete_meals",
  "creating_week",
  "finalizing_recipes",
  "complete",
]);

export const ConsumerWeeklyPlanSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: ConsumerWeeklyPlanStatusSchema,
  generatedAt: z.string().optional(),
  errorMessage: z.string().trim().min(1).max(600).optional(),
  generationStage: ConsumerPlanGenerationStageSchema.optional(),
  strategy: RankedWeeklyStrategySchema.optional(),
  conceptsByCandidateId: z.record(z.string(), MealConceptSchema).optional(),
  recipesByCandidateId: z.record(z.string(), ResolvedRecipeSchema).optional(),
  meals: z.array(ConsumerMealSlotSchema).max(14).optional(),
  /** Grocery aggregation is future — usually absent / unavailable. */
  groceryList: GroceryListSchema.optional(),
});

export type PersonalizedMealNutrition = z.infer<typeof PersonalizedMealNutritionSchema>;
export type PersonalizedMealComponent = z.infer<typeof PersonalizedMealComponentSchema>;
export type ConsumerMealComponent = z.infer<typeof ConsumerMealComponentSchema>;
export type MealPortionStatus = z.infer<typeof MealPortionStatusSchema>;
export type ConsumerMealSlot = z.infer<typeof ConsumerMealSlotSchema>;
export type ConsumerWeeklyPlanStatus = z.infer<typeof ConsumerWeeklyPlanStatusSchema>;
export type ConsumerPlanGenerationStage = z.infer<typeof ConsumerPlanGenerationStageSchema>;
export type ConsumerWeeklyPlan = z.infer<typeof ConsumerWeeklyPlanSchema>;
