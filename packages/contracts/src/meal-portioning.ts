import { z } from "zod";
import { IngredientNutritionSchema, NutrientsPer100gSchema } from "./food-resolution";
import { MealComponentRoleSchema } from "./meal-composition";
import { PersonalizedMealNutritionSchema } from "./consumer-plan";

/**
 * PLAN-010: Deterministic complete-meal portion solver contracts.
 *
 * Culinary composition decides WHAT is on the plate.
 * This module decides HOW MUCH of those foods belong on the plate.
 * LLMs must never choose serving sizes, grams, calories, macros, or fiber.
 */

export const MEAL_PORTION_POLICY_VERSION = "meal-portion-policy-v1" as const;
export const MEAL_PORTION_SOLVER_VERSION = "meal-portion-solver-v1" as const;

export const MealPortionFlexibilitySchema = z.enum(["fixed", "tight", "moderate", "wide"]);
export const MealPortionNutritionalPrioritySchema = z.enum(["low", "medium", "high"]);

export const MealNutritionIntentPrioritiesSchema = z.object({
  calories: z.number().finite().nonnegative().optional(),
  protein: z.number().finite().nonnegative().optional(),
  carbs: z.number().finite().nonnegative().optional(),
  fat: z.number().finite().nonnegative().optional(),
  fiber: z.number().finite().nonnegative().optional(),
});

/**
 * Meal-level nutrition objective supplied by an upstream allocator (future PLAN-011)
 * or a clearly labeled developer/test intent. PLAN-010 does not own daily allocation.
 */
export const MealNutritionIntentSchema = z.object({
  targetCaloriesKcal: z.number().finite().positive(),
  targetProteinGrams: z.number().finite().nonnegative().optional(),
  targetCarbsGrams: z.number().finite().nonnegative().optional(),
  targetFatGrams: z.number().finite().nonnegative().optional(),
  targetFiberGrams: z.number().finite().nonnegative().optional(),
  priorities: MealNutritionIntentPrioritiesSchema.optional(),
  /** When true, UI/dev surfaces must label this as a test intent — not production allocation. */
  isDeveloperTestIntent: z.boolean().optional(),
  label: z.string().trim().min(1).max(160).optional(),
});

export const ComponentScalingPolicySchema = z.object({
  role: MealComponentRoleSchema,
  flexibility: MealPortionFlexibilitySchema,
  nutritionalPriority: MealPortionNutritionalPrioritySchema,
  /** Soft penalty weight for deviation from preferred portion (higher = stick closer). */
  deviationPenalty: z.number().finite().nonnegative(),
  /**
   * Preferred culinary center as a fraction/multiplier of reference serving (recipe_scale)
   * or preferred grams when overridden by atomic preferredGrams in policy.
   */
  preferredScale: z.number().finite().positive().default(1),
  minScale: z.number().finite().positive(),
  maxScale: z.number().finite().positive(),
  /** Preferred grams for atomic / food_grams variables when role policy supplies defaults. */
  preferredGrams: z.number().finite().positive().optional(),
  minGrams: z.number().finite().positive().optional(),
  maxGrams: z.number().finite().positive().optional(),
  /** Discrete count defaults (tortillas, eggs). */
  preferredCount: z.number().finite().positive().optional(),
  minCount: z.number().finite().positive().optional(),
  maxCount: z.number().finite().positive().optional(),
  quantityStep: z.number().finite().positive().optional(),
});

export const MealPortionObjectiveWeightsSchema = z.object({
  calories: z.number().finite().nonnegative(),
  protein: z.number().finite().nonnegative(),
  carbs: z.number().finite().nonnegative(),
  fat: z.number().finite().nonnegative(),
  fiber: z.number().finite().nonnegative(),
  culinary: z.number().finite().nonnegative(),
});

export const MealPortionPolicySchema = z.object({
  version: z.literal(MEAL_PORTION_POLICY_VERSION),
  rolePolicies: z.array(ComponentScalingPolicySchema).min(1).max(16),
  objectiveWeights: MealPortionObjectiveWeightsSchema,
  /**
   * Relative calorie error at or below this fraction may be classified as `solved`
   * when protein is also acceptable; otherwise `best_feasible`.
   */
  solvedCalorieToleranceFraction: z.number().finite().positive().max(0.25),
  solvedProteinUndershootFraction: z.number().finite().nonnegative().max(0.5),
  /**
   * If minimum portions already exceed target calories by more than this fraction,
   * treat as hard infeasible (blocked).
   */
  hardCalorieOvershootFraction: z.number().finite().positive(),
});

export const PortionVariableKindSchema = z.enum([
  "recipe_scale",
  "food_grams",
  "count",
  "fixed",
]);

const PortionVariableBaseSchema = z.object({
  componentId: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(160),
  role: MealComponentRoleSchema,
  quantityStep: z.number().finite().positive().optional(),
});

export const RecipeScalePortionVariableSchema = PortionVariableBaseSchema.extend({
  kind: z.literal("recipe_scale"),
  preferredScale: z.number().finite().positive(),
  minScale: z.number().finite().positive(),
  maxScale: z.number().finite().positive(),
  /** Nutrition at scale = 1.0 (one reference serving of the component recipe / main). */
  baseNutrition: IngredientNutritionSchema,
  /** Grams corresponding to scale = 1.0 when known — enables gram display. */
  referenceYieldGrams: z.number().finite().positive().optional(),
  baseServings: z.number().finite().positive().optional(),
});

export const FoodGramsPortionVariableSchema = PortionVariableBaseSchema.extend({
  kind: z.literal("food_grams"),
  preferredGrams: z.number().finite().positive(),
  minGrams: z.number().finite().positive(),
  maxGrams: z.number().finite().positive(),
  nutritionPer100g: NutrientsPer100gSchema,
});

export const CountPortionVariableSchema = PortionVariableBaseSchema.extend({
  kind: z.literal("count"),
  preferredCount: z.number().finite().positive(),
  minCount: z.number().finite().positive(),
  maxCount: z.number().finite().positive(),
  nutritionPerUnit: IngredientNutritionSchema,
  unitLabel: z.string().trim().min(1).max(40).default("piece"),
});

export const FixedPortionVariableSchema = PortionVariableBaseSchema.extend({
  kind: z.literal("fixed"),
  amount: z.number().finite().positive(),
  unit: z.string().trim().min(1).max(40),
  nutrition: IngredientNutritionSchema,
});

export const PortionVariableSchema = z.discriminatedUnion("kind", [
  RecipeScalePortionVariableSchema,
  FoodGramsPortionVariableSchema,
  CountPortionVariableSchema,
  FixedPortionVariableSchema,
]);

export const PersonalizedMealPortionSchema = z.object({
  componentId: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(160),
  role: MealComponentRoleSchema,
  amount: z.number().finite().positive(),
  unit: z.string().trim().min(1).max(40),
  /** Internal scale relative to reference (recipe_scale); diagnostic / provenance. */
  internalScale: z.number().finite().positive().optional(),
  nutrition: IngredientNutritionSchema,
});

export const PortionSolverStatusSchema = z.enum(["solved", "best_feasible", "blocked"]);

export const PortionSolverBlockReasonSchema = z.enum([
  "missing_reference_yield",
  "missing_canonical_nutrition",
  "invalid_constraints",
  "invalid_intent",
  "no_valid_combination",
  "minimum_exceeds_calorie_ceiling",
  "unquantifiable_component",
]);

export const PortionVariableDiagnosticSchema = z.object({
  componentId: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(160),
  role: MealComponentRoleSchema,
  kind: PortionVariableKindSchema,
  preferred: z.number().finite(),
  selected: z.number().finite(),
  min: z.number().finite(),
  max: z.number().finite(),
  unit: z.string().trim().min(1).max(40),
  deviationFromPreferred: z.number().finite(),
});

export const PortionSolverDiagnosticsSchema = z.object({
  mealName: z.string().trim().min(1).max(160).optional(),
  status: PortionSolverStatusSchema,
  blockReason: PortionSolverBlockReasonSchema.optional(),
  message: z.string().trim().min(1).max(600).optional(),
  variables: z.array(PortionVariableDiagnosticSchema).max(16).default([]),
  calorieDeviationKcal: z.number().finite().optional(),
  proteinDeviationGrams: z.number().finite().optional(),
  carbsDeviationGrams: z.number().finite().optional(),
  fatDeviationGrams: z.number().finite().optional(),
  fiberDeviationGrams: z.number().finite().optional(),
  objectiveScore: z.number().finite().optional(),
  candidatesEvaluated: z.number().int().nonnegative().optional(),
  solveTimeMs: z.number().finite().nonnegative().optional(),
  policyVersion: z.literal(MEAL_PORTION_POLICY_VERSION),
  solverVersion: z.literal(MEAL_PORTION_SOLVER_VERSION),
});

export const PersonalizedMealPlanSchema = z.object({
  mealId: z.string().trim().min(1).max(80),
  mealName: z.string().trim().min(1).max(160).optional(),
  sourceCompleteMealId: z.string().trim().min(1).max(80).optional(),
  portions: z.array(PersonalizedMealPortionSchema).min(1).max(16),
  nutrition: PersonalizedMealNutritionSchema,
  intent: MealNutritionIntentSchema,
  status: PortionSolverStatusSchema,
  diagnostics: PortionSolverDiagnosticsSchema,
  policyVersion: z.literal(MEAL_PORTION_POLICY_VERSION),
  solverVersion: z.literal(MEAL_PORTION_SOLVER_VERSION),
  nutritionSourceVersion: z.string().trim().min(1).max(80).optional(),
  generatedAt: z.string().min(1),
});

/**
 * Trusted nutrition coefficients for one plate component, resolved before solving.
 * Do not call USDA / Gemini from inside the optimizer.
 */
export const ComponentNutritionCoefficientSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("recipe_scale"),
    componentId: z.string().trim().min(1).max(80),
    displayName: z.string().trim().min(1).max(160),
    role: MealComponentRoleSchema,
    baseNutrition: IngredientNutritionSchema,
    referenceYieldGrams: z.number().finite().positive().optional(),
    baseServings: z.number().finite().positive().optional(),
    /** When true, missing reference yield must block rather than guess. Defaults to true. */
    requiresReferenceYield: z.boolean().optional(),
    quantityStep: z.number().finite().positive().optional(),
  }),
  z.object({
    kind: z.literal("food_grams"),
    componentId: z.string().trim().min(1).max(80),
    displayName: z.string().trim().min(1).max(160),
    role: MealComponentRoleSchema,
    nutritionPer100g: NutrientsPer100gSchema,
    /** Optional override of role-policy preferred grams. */
    preferredGrams: z.number().finite().positive().optional(),
    minGrams: z.number().finite().positive().optional(),
    maxGrams: z.number().finite().positive().optional(),
    quantityStep: z.number().finite().positive().optional(),
  }),
  z.object({
    kind: z.literal("count"),
    componentId: z.string().trim().min(1).max(80),
    displayName: z.string().trim().min(1).max(160),
    role: MealComponentRoleSchema,
    nutritionPerUnit: IngredientNutritionSchema,
    preferredCount: z.number().finite().positive().optional(),
    minCount: z.number().finite().positive().optional(),
    maxCount: z.number().finite().positive().optional(),
    quantityStep: z.number().finite().positive().default(1),
    unitLabel: z.string().trim().min(1).max(40).default("piece"),
  }),
  z.object({
    kind: z.literal("fixed"),
    componentId: z.string().trim().min(1).max(80),
    displayName: z.string().trim().min(1).max(160),
    role: MealComponentRoleSchema,
    amount: z.number().finite().positive(),
    unit: z.string().trim().min(1).max(40),
    nutrition: IngredientNutritionSchema,
  }),
]);

export const SolveMealPortionsRequestSchema = z.object({
  mealId: z.string().trim().min(1).max(80),
  mealName: z.string().trim().min(1).max(160).optional(),
  sourceCompleteMealId: z.string().trim().min(1).max(80).optional(),
  components: z.array(ComponentNutritionCoefficientSchema).min(1).max(16),
  nutritionIntent: MealNutritionIntentSchema,
  policyVersion: z.literal(MEAL_PORTION_POLICY_VERSION).optional(),
  nutritionSourceVersion: z.string().trim().min(1).max(80).optional(),
  generatedAt: z.string().min(1).optional(),
});

export const SolveMealPortionsResponseSchema = z.object({
  result: PersonalizedMealPlanSchema,
});

export type MealNutritionIntent = z.infer<typeof MealNutritionIntentSchema>;
export type ComponentScalingPolicy = z.infer<typeof ComponentScalingPolicySchema>;
export type MealPortionPolicy = z.infer<typeof MealPortionPolicySchema>;
export type PortionVariable = z.infer<typeof PortionVariableSchema>;
export type PersonalizedMealPortion = z.infer<typeof PersonalizedMealPortionSchema>;
export type PortionSolverStatus = z.infer<typeof PortionSolverStatusSchema>;
export type PortionSolverBlockReason = z.infer<typeof PortionSolverBlockReasonSchema>;
export type PortionSolverDiagnostics = z.infer<typeof PortionSolverDiagnosticsSchema>;
export type PortionVariableDiagnostic = z.infer<typeof PortionVariableDiagnosticSchema>;
export type PersonalizedMealPlan = z.infer<typeof PersonalizedMealPlanSchema>;
export type ComponentNutritionCoefficient = z.infer<typeof ComponentNutritionCoefficientSchema>;
export type SolveMealPortionsRequest = z.infer<typeof SolveMealPortionsRequestSchema>;
export type SolveMealPortionsResponse = z.infer<typeof SolveMealPortionsResponseSchema>;
export type MealPortionFlexibility = z.infer<typeof MealPortionFlexibilitySchema>;
export type MealPortionNutritionalPriority = z.infer<typeof MealPortionNutritionalPrioritySchema>;
