import { z } from "zod";
import { DayOfWeekSchema, PrepIntentSchema } from "./weekly-strategy.ts";
import { MealConceptSchema } from "./meal-composition.ts";
import { ResolvedRecipeSchema } from "./recipe-resolution.ts";
import { RankedWeeklyStrategySchema } from "./ranked-weekly-strategy.ts";
import { GroceryListSchema } from "./grocery.ts";
import type { PersonalizedWeeklyNutritionPlan } from "./meal-portioning.ts";

/**
 * Consumer-facing weekly plan + PLAN-010 personalized nutrition shapes.
 *
 * Personalized nutrition/portions are optional so the UI can hide them until
 * the portion solver produces authoritative values — never invent them in the client.
 */

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
  /** Component contribution used to recompute meal nutrition when the user adjusts counts. */
  nutrition: PersonalizedMealNutritionSchema.optional(),
  /** Discrete staples (tortillas, eggs, …) may be adjusted in Meal Detail. */
  adjustableDiscrete: z.boolean().optional(),
  minAmount: z.number().finite().positive().optional(),
  maxAmount: z.number().finite().positive().optional(),
  quantityStep: z.number().finite().positive().optional(),
  /** When true, amount used a versioned staple estimate rather than USDA. */
  usedStapleEstimate: z.boolean().optional(),
});

export const ConsumerMealSlotSchema = z.object({
  /** Stable instance id for this generated plan slot (day + mealType). */
  mealInstanceId: z.string().trim().min(1).max(120).optional(),
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
  personalizationStatus: z.enum(["solved", "best_feasible", "blocked"]).optional(),
  /** Developer-facing typed failure code when status is blocked — never show raw codes to consumers. */
  personalizationBlockReason: z
    .enum([
      "missing_reference_yield",
      "missing_canonical_nutrition",
      "invalid_constraints",
      "invalid_intent",
      "no_valid_combination",
      "minimum_exceeds_calorie_ceiling",
      "unquantifiable_component",
    ])
    .optional(),
  /** Developer-facing failure detail when status is blocked. */
  personalizationMessage: z.string().trim().min(1).max(600).optional(),
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
  "personalizing_portions",
  "complete",
]);

export const ConsumerWeeklyPlanSchema = z.object({
  /** Unique id for this generation run — prescriptions must stay tied to it. */
  generatedPlanId: z.string().trim().min(1).max(120).optional(),
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
  /**
   * Authoritative PLAN-010 weekly nutrition prescription.
   * Validated at the domain boundary via PersonalizedWeeklyNutritionPlanSchema.
   * Kept as passthrough here to avoid a Zod circular import with meal-portioning.
   */
  personalizedWeeklyPlan: z.custom<PersonalizedWeeklyNutritionPlan>().optional(),
  /** Grocery aggregation is future — usually absent / unavailable. */
  groceryList: GroceryListSchema.optional(),
});

export type PersonalizedMealNutrition = z.infer<typeof PersonalizedMealNutritionSchema>;
export type PersonalizedMealComponent = z.infer<typeof PersonalizedMealComponentSchema>;
export type ConsumerMealComponent = z.infer<typeof ConsumerMealComponentSchema>;
export type ConsumerMealSlot = z.infer<typeof ConsumerMealSlotSchema>;
export type ConsumerWeeklyPlanStatus = z.infer<typeof ConsumerWeeklyPlanStatusSchema>;
export type ConsumerPlanGenerationStage = z.infer<typeof ConsumerPlanGenerationStageSchema>;
export type ConsumerWeeklyPlan = z.infer<typeof ConsumerWeeklyPlanSchema>;
