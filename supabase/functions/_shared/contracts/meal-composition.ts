import { z } from "zod";
import { RankedCulinaryCandidateSchema } from "./candidate-ranking.ts";
import { CulinaryDiscoveryCandidateSchema } from "./culinary-discovery.ts";
import {
  FoodResolutionResultSchema,
  IngredientNutritionSchema,
  RecipeNutritionResultSchema,
} from "./food-resolution.ts";
import { ResolvedRecipeSchema } from "./recipe-resolution.ts";

/**
 * Meal composition contracts.
 *
 * Lightweight complete-meal concepts (prompt `meal-composition-v2`) run after
 * ranking and before weekly strategy. Detailed component recipes remain a
 * selected-only downstream step (PLAN-009.5 resolution, prompt `component-recipe-v1`).
 * Culinary plate completion only — never authoritative nutrition or personalized quantities.
 */

export const MEAL_COMPOSITION_PROMPT_VERSION_V1 = "meal-composition-v1" as const;
export const MEAL_COMPOSITION_PROMPT_VERSION = "meal-composition-v2" as const;
export const MEAL_COMPOSITION_POLICY_VERSION = "meal-composition-v1" as const;
export const COMPONENT_RECIPE_PROMPT_VERSION = "component-recipe-v1" as const;
export const FIBER_POLICY_VERSION = "fiber-policy-v1" as const;

/** Default bounded concurrency for unique-main weekly composition. */
export const DEFAULT_MEAL_COMPOSITION_CONCURRENCY = 2;

export const CompositionMealTypeSchema = z.enum(["lunch", "dinner"]);

export const MealComponentRoleSchema = z.enum([
  "main",
  "carbohydrate",
  "vegetable",
  "fruit",
  "legume",
  "sauce_condiment",
  "fat",
  "garnish",
]);

/** Roles Gemini may add — never a second main protein dish. */
export const AddableMealComponentRoleSchema = z.enum([
  "carbohydrate",
  "vegetable",
  "fruit",
  "legume",
  "sauce_condiment",
  "fat",
  "garnish",
]);

export const CompleteMealComponentRelationshipSchema = z.enum([
  "intrinsic",
  "required_companion",
  "recommended",
]);

export const MealComponentSourceSchema = z.enum([
  "main_recipe",
  "existing_recipe_component",
  "composition_engine",
]);

/** Lightweight concept sources — the plate idea, before recipes exist. */
export const MealConceptComponentSourceSchema = z.enum([
  "candidate",
  "existing_candidate_component",
  "composition_engine",
]);

export const MealComponentQuantityModeSchema = z.enum([
  "recipe_defined",
  "solver_determined",
]);

export const ComponentDefinitionKindSchema = z.enum(["atomic_food", "recipe_component"]);

export const CompositionPresenceSchema = z.enum(["low", "meaningful", "high"]);

export const CompositionNutritionSignalsSchema = z.object({
  proteinPresence: CompositionPresenceSchema,
  carbohydratePresence: CompositionPresenceSchema,
  fiberPresence: CompositionPresenceSchema,
});

export const MealCompositionProfileSchema = z.object({
  hasPrimaryProtein: z.boolean(),
  hasMeaningfulCarbohydrate: z.boolean(),
  hasMeaningfulVegetableOrFruit: z.boolean(),
  hasMeaningfulFiberSource: z.boolean(),
  hasSauceOrMoistureComponent: z.boolean(),
  addedComponentRoles: z.array(MealComponentRoleSchema).max(12).default([]),
});

/**
 * Lightweight multi-ingredient definition for compound sides (kachumber, chutney, slaw).
 * Not a fake single USDA food. Quantities here are culinary base ratios only —
 * not personalized solver portions.
 */
export const ComponentRecipeIngredientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().finite().positive().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  role: z.string().trim().min(1).max(40).optional(),
  preparation: z.string().trim().min(1).max(200).nullable().optional(),
});

export const ComponentRecipeDefinitionSchema = z.object({
  kind: z.literal("recipe_component"),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(400).optional(),
  ingredients: z.array(ComponentRecipeIngredientSchema).min(1).max(20),
  instructions: z.array(z.string().trim().min(1).max(400)).max(12).optional(),
});

export const AtomicFoodDefinitionSchema = z.object({
  kind: z.literal("atomic_food"),
  name: z.string().trim().min(1).max(160),
  preparation: z.string().trim().min(1).max(200).nullable().optional(),
  measurementState: z
    .enum(["raw", "cooked", "as_purchased", "prepared", "unknown"])
    .optional(),
});

export const ComponentDefinitionSchema = z.discriminatedUnion("kind", [
  AtomicFoodDefinitionSchema,
  ComponentRecipeDefinitionSchema,
]);

export const ComponentResolutionStatusSchema = z.enum([
  "canonical_food_resolved",
  "component_recipe_resolved",
  "pending_quantity",
  "unresolved",
  "skipped_intrinsic",
]);

export const ComponentResolutionSchema = z.object({
  status: ComponentResolutionStatusSchema,
  definition: ComponentDefinitionSchema.optional(),
  foodResolution: FoodResolutionResultSchema.optional(),
  /** Ingredient-level nutrition only when base culinary quantities exist — never personalized. */
  ingredientNutrition: IngredientNutritionSchema.optional(),
  note: z.string().trim().min(1).max(400).optional(),
});

/**
 * PLAN-009.5 meal component — distinct from PLAN-008 MealComponent.
 * PLAN-008 owns intrinsic recipe structure; PLAN-009.5 owns plate completion.
 */
export const CompleteMealComponentSchema = z.object({
  componentId: z.string().trim().min(1).max(80),
  role: MealComponentRoleSchema,
  name: z.string().trim().min(1).max(160),
  relationship: CompleteMealComponentRelationshipSchema,
  source: MealComponentSourceSchema,
  reason: z.string().trim().min(1).max(400),
  quantityMode: MealComponentQuantityModeSchema,
  definitionKind: ComponentDefinitionKindSchema,
  /** Stable key for weekly dedup / future prep reuse (PLAN-012). */
  normalizedComponentKey: z.string().trim().min(1).max(200),
  definition: ComponentDefinitionSchema.optional(),
  resolution: ComponentResolutionSchema.optional(),
});

export const MealCompositionPromptVersionSchema = z.enum([
  MEAL_COMPOSITION_PROMPT_VERSION_V1,
  MEAL_COMPOSITION_PROMPT_VERSION,
]);

export const MealCompositionMetadataSchema = z.object({
  provider: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  promptVersion: MealCompositionPromptVersionSchema,
  policyVersion: z.literal(MEAL_COMPOSITION_POLICY_VERSION),
  componentRecipePromptVersion: z.literal(COMPONENT_RECIPE_PROMPT_VERSION).optional(),
  requestId: z.string().trim().min(1).max(120).optional(),
  durationMs: z.number().nonnegative().optional(),
  createdAt: z.string().min(1),
});

/**
 * Lightweight complete-plate component. Names and roles only —
 * no culinary quantities, instructions, USDA foods, or nutrition.
 */
export const MealConceptComponentSchema = z.object({
  componentId: z.string().trim().min(1).max(80),
  role: MealComponentRoleSchema,
  name: z.string().trim().min(1).max(160),
  relationship: CompleteMealComponentRelationshipSchema,
  source: MealConceptComponentSourceSchema,
  reason: z.string().trim().min(1).max(400),
  /** Routing hint for later selected-only resolution (atomic staple vs compound side). */
  definitionKind: ComponentDefinitionKindSchema,
  normalizedComponentKey: z.string().trim().min(1).max(200),
});

export const MealConceptMetadataSchema = z.object({
  provider: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  promptVersion: z.literal(MEAL_COMPOSITION_PROMPT_VERSION),
  policyVersion: z.literal(MEAL_COMPOSITION_POLICY_VERSION),
  requestId: z.string().trim().min(1).max(120).optional(),
  durationMs: z.number().nonnegative().optional(),
  createdAt: z.string().min(1),
  providerCalled: z.boolean().optional(),
});

export const MealConceptSchema = z.object({
  candidateId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  mealType: CompositionMealTypeSchema.optional(),
  main: MealConceptComponentSchema,
  components: z.array(MealConceptComponentSchema).max(16),
  compositionProfile: MealCompositionProfileSchema,
  compositionSummary: z.string().trim().min(1).max(600).optional(),
  metadata: MealConceptMetadataSchema,
});

export const CompleteMealSchema = z.object({
  mealId: z.string().trim().min(1).max(80),
  candidateId: z.string().trim().min(1).max(80),
  mainRecipeId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  mealType: CompositionMealTypeSchema.optional(),
  components: z.array(CompleteMealComponentSchema).min(1).max(16),
  compositionProfile: MealCompositionProfileSchema,
  nutritionSignals: CompositionNutritionSignalsSchema.optional(),
  metadata: MealCompositionMetadataSchema,
});

export const MealCompositionRequestSchema = z
  .object({
    mealType: CompositionMealTypeSchema.optional().default("dinner"),
    /** Ranked/discovered candidate — primary input for meal-composition-v2. */
    candidate: CulinaryDiscoveryCandidateSchema.optional(),
    ranked: RankedCulinaryCandidateSchema.optional(),
    /** Optional PLAN-008 recipe. Used only to recognize already-listed intrinsic components. */
    recipe: ResolvedRecipeSchema.optional(),
    recipeNutrition: RecipeNutritionResultSchema.optional(),
    cuisineFamily: z.string().trim().min(1).max(80).optional(),
    regionalStyle: z.string().trim().min(1).max(120).nullable().optional(),
    experiencePreferences: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    allergies: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
    dietaryRestrictions: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
    dislikes: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
    /** Optional cooking-style hint (e.g. mostly_ready) — not full CookingPreferences. */
    cookingStyleHint: z.string().trim().min(1).max(80).optional(),
    compositionContext: z
      .object({
        existingRoles: MealCompositionProfileSchema,
        nutritionSignals: CompositionNutritionSignalsSchema.optional(),
        /** Other ranked meal names in this repertoire (reuse hints only). */
        otherSelectedMealNames: z.array(z.string().trim().min(1).max(160)).max(40).optional(),
        /** Existing normalized component keys already composed in this repertoire. */
        existingComponentKeys: z.array(z.string().trim().min(1).max(200)).max(80).optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.candidate && !value.recipe && !value.ranked) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Meal composition requires a candidate, ranked candidate, or recipe.",
      });
    }
  });

/**
 * Provider proposal for lightweight composition (meal-composition-v2).
 * Culinary additions only — no ingredient quantities, instructions, or nutrition.
 */
export const MealCompositionAddedComponentProposalSchema = z.object({
  name: z.string().trim().min(1).max(160),
  role: AddableMealComponentRoleSchema,
  relationship: z.enum(["required_companion", "recommended"]),
  reason: z.string().trim().min(1).max(400),
  definitionKind: ComponentDefinitionKindSchema,
  preparation: z.string().trim().min(1).max(200).nullable().optional(),
  measurementState: z
    .enum(["raw", "cooked", "as_purchased", "prepared", "unknown"])
    .optional(),
});

export const MealCompositionProposalSchema = z.object({
  mealName: z.string().trim().min(1).max(160),
  alreadySatisfiedRoles: z.array(MealComponentRoleSchema).max(12),
  missingRoles: z.array(MealComponentRoleSchema).max(12),
  addedComponents: z.array(MealCompositionAddedComponentProposalSchema).max(8),
  compositionSummary: z.string().trim().min(1).max(600),
  noAdditionsNeeded: z.boolean().optional(),
});

export const FiberTargetSchema = z.object({
  fiberGrams: z.number().finite().nonnegative(),
  targetCalories: z.number().finite().positive(),
  policyVersion: z.literal(FIBER_POLICY_VERSION),
  /** Display-friendly rounded grams (policy still stores full precision in fiberGrams). */
  displayFiberGrams: z.number().int().nonnegative(),
});

export const CompositionComplexitySignalSchema = z.enum([
  "compact_reusable",
  "mixed",
  "high_unique_sides",
  "unknown",
]);

export const ComponentReuseEntrySchema = z.object({
  normalizedComponentKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(160),
  role: MealComponentRoleSchema,
  usedByCandidateIds: z.array(z.string().trim().min(1).max(80)).min(1).max(40),
  usedByNames: z.array(z.string().trim().min(1).max(160)).min(1).max(40),
});

export const CandidateCompositionTraceSchema = z.object({
  candidateId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  composed: z.boolean(),
  selected: z.boolean().optional(),
  providerCalled: z.boolean(),
  componentNames: z.array(z.string().trim().min(1).max(160)).max(16),
});

export const MealCompositionDiagnosticsSchema = z.object({
  weeklyMealSlots: z.number().int().nonnegative(),
  rankedCandidates: z.number().int().nonnegative().optional(),
  uniqueCandidatesComposed: z.number().int().nonnegative().optional(),
  uniqueMainRecipes: z.number().int().nonnegative(),
  compositionProviderCalls: z.number().int().nonnegative(),
  weeklyCandidatesSelected: z.number().int().nonnegative().optional(),
  uniqueMainRecipesResolved: z.number().int().nonnegative().optional(),
  uniqueComponentRecipesResolved: z.number().int().nonnegative().optional(),
  uniqueComponentsInSelectedWeek: z.number().int().nonnegative().optional(),
  reusedComponentsInSelectedWeek: z.number().int().nonnegative().optional(),
  mealsAlreadyComplete: z.number().int().nonnegative(),
  mealsWithAddedComponents: z.number().int().nonnegative(),
  totalAddedComponents: z.number().int().nonnegative(),
  uniqueAddedComponents: z.number().int().nonnegative(),
  reusedComponents: z.number().int().nonnegative(),
  atomicComponents: z.number().int().nonnegative(),
  recipeComponents: z.number().int().nonnegative(),
  unresolvedComponents: z.number().int().nonnegative(),
  componentComplexitySignal: CompositionComplexitySignalSchema.optional(),
});

export const WeeklyMealConceptResultSchema = z.object({
  conceptsByCandidateId: z.record(z.string(), MealConceptSchema),
  uniqueCandidateIds: z.array(z.string().trim().min(1).max(80)).max(40),
  sharedComponentKeys: z.array(z.string().trim().min(1).max(200)).max(80),
  componentReuse: z.array(ComponentReuseEntrySchema).max(40),
  conceptCount: z.number().int().nonnegative(),
  diagnostics: MealCompositionDiagnosticsSchema,
  fiberTarget: FiberTargetSchema.optional(),
  candidateTrace: z.array(CandidateCompositionTraceSchema).max(40).optional(),
  policyVersions: z.object({
    mealComposition: z.literal(MEAL_COMPOSITION_POLICY_VERSION),
    prompt: z.literal(MEAL_COMPOSITION_PROMPT_VERSION),
    fiber: z.literal(FIBER_POLICY_VERSION).optional(),
  }),
});

export const WeeklyMealCompositionResultSchema = z.object({
  mealsByCandidateId: z.record(z.string(), CompleteMealSchema),
  uniqueCandidateIds: z.array(z.string().trim().min(1).max(80)).max(14),
  /** Shared component registry keyed by normalizedComponentKey for prep reuse. */
  sharedComponentsByKey: z.record(z.string(), CompleteMealComponentSchema),
  mealCount: z.number().int().nonnegative(),
  slotCount: z.number().int().nonnegative(),
  diagnostics: MealCompositionDiagnosticsSchema,
  fiberTarget: FiberTargetSchema.optional(),
  policyVersions: z.object({
    mealComposition: z.literal(MEAL_COMPOSITION_POLICY_VERSION),
    prompt: MealCompositionPromptVersionSchema,
    componentRecipe: z.literal(COMPONENT_RECIPE_PROMPT_VERSION).optional(),
    fiber: z.literal(FIBER_POLICY_VERSION).optional(),
  }),
  mealConceptsByCandidateId: z.record(z.string(), MealConceptSchema).optional(),
});

export const MealCompositionFailureSchema = z.object({
  candidateId: z.string().trim().min(1).max(80).optional(),
  candidateName: z.string().trim().min(1).max(160).optional(),
  code: z.enum([
    "COMPOSITION_PROVIDER_ERROR",
    "INVALID_COMPOSITION",
    "HARD_CONSTRAINT_CONFLICT",
    "COMPONENT_RESOLUTION_FAILED",
    "INVALID_COMPOSITION_REQUEST",
    "LLM_CONFIGURATION_ERROR",
    "RATE_LIMITED",
  ]),
  message: z.string().trim().min(1).max(600),
  details: z.unknown().optional(),
});

export const ComposeMealsStageSchema = z.enum(["concepts", "selected_resolution"]);

export const ComposeMealsRequestSchema = z
  .object({
    stage: ComposeMealsStageSchema.optional().default("concepts"),
    rankedCandidates: z.array(RankedCulinaryCandidateSchema).max(40).optional(),
    recipes: z.array(ResolvedRecipeSchema).max(14).optional(),
    mealConcepts: z.array(MealConceptSchema).max(40).optional(),
    nutritionByCandidateId: z.record(z.string(), RecipeNutritionResultSchema).optional(),
    uniqueCandidateIds: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
    selectedCandidateIds: z.array(z.string().trim().min(1).max(80)).max(14).optional(),
    mealType: CompositionMealTypeSchema.optional().default("dinner"),
    allergies: z.array(z.string().trim().min(1).max(80)).max(40).optional().default([]),
    dietaryRestrictions: z.array(z.string().trim().min(1).max(80)).max(40).optional().default([]),
    dislikes: z.array(z.string().trim().min(1).max(80)).max(40).optional().default([]),
    cookingStyleHint: z.string().trim().min(1).max(80).optional(),
    /** Daily calorie target used to derive fiber-policy-v1 (optional preview). */
    targetCalories: z.number().finite().positive().optional(),
    concurrency: z.number().int().positive().max(8).optional(),
    /** When false, skip USDA routing for added atomic components. */
    resolveAddedComponents: z.boolean().optional().default(false),
    slotCount: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    const stage = value.stage ?? "concepts";
    if (stage === "concepts") {
      const hasRanked = (value.rankedCandidates?.length ?? 0) > 0;
      const hasRecipes = (value.recipes?.length ?? 0) > 0;
      if (!hasRanked && !hasRecipes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Concept composition requires rankedCandidates or recipes.",
        });
      }
    }
    if (stage === "selected_resolution") {
      if (!value.mealConcepts || value.mealConcepts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selected resolution requires mealConcepts.",
        });
      }
      if (!value.selectedCandidateIds || value.selectedCandidateIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selected resolution requires selectedCandidateIds.",
        });
      }
    }
  });

export const ComposeMealsResponseSchema = z.object({
  concepts: WeeklyMealConceptResultSchema.optional(),
  result: WeeklyMealCompositionResultSchema.optional(),
  failures: z.array(MealCompositionFailureSchema).max(40).optional(),
  meta: z
    .object({
      requestId: z.string().min(1),
      promptVersion: MealCompositionPromptVersionSchema,
      policyVersion: z.literal(MEAL_COMPOSITION_POLICY_VERSION),
      componentRecipePromptVersion: z.literal(COMPONENT_RECIPE_PROMPT_VERSION).optional(),
      stage: ComposeMealsStageSchema.optional(),
      provider: z.string().min(1),
      model: z.string().min(1).optional(),
      durationMs: z.number().nonnegative().optional(),
      concurrency: z.number().int().positive().optional(),
    })
    .optional(),
});

export type CompositionMealType = z.infer<typeof CompositionMealTypeSchema>;
export type MealComponentRole = z.infer<typeof MealComponentRoleSchema>;
export type AddableMealComponentRole = z.infer<typeof AddableMealComponentRoleSchema>;
export type CompleteMealComponentRelationship = z.infer<
  typeof CompleteMealComponentRelationshipSchema
>;
export type MealComponentSource = z.infer<typeof MealComponentSourceSchema>;
export type MealConceptComponentSource = z.infer<typeof MealConceptComponentSourceSchema>;
export type MealComponentQuantityMode = z.infer<typeof MealComponentQuantityModeSchema>;
export type ComponentDefinitionKind = z.infer<typeof ComponentDefinitionKindSchema>;
export type CompositionPresence = z.infer<typeof CompositionPresenceSchema>;
export type CompositionNutritionSignals = z.infer<typeof CompositionNutritionSignalsSchema>;
export type MealCompositionProfile = z.infer<typeof MealCompositionProfileSchema>;
export type ComponentRecipeIngredient = z.infer<typeof ComponentRecipeIngredientSchema>;
export type ComponentDefinition = z.infer<typeof ComponentDefinitionSchema>;
export type ComponentRecipeDefinition = z.infer<typeof ComponentRecipeDefinitionSchema>;
export type ComponentResolution = z.infer<typeof ComponentResolutionSchema>;
export type CompleteMealComponent = z.infer<typeof CompleteMealComponentSchema>;
export type MealCompositionMetadata = z.infer<typeof MealCompositionMetadataSchema>;
export type MealConceptComponent = z.infer<typeof MealConceptComponentSchema>;
export type MealConceptMetadata = z.infer<typeof MealConceptMetadataSchema>;
export type MealConcept = z.infer<typeof MealConceptSchema>;
export type CompleteMeal = z.infer<typeof CompleteMealSchema>;
export type MealCompositionRequest = z.infer<typeof MealCompositionRequestSchema>;
export type MealCompositionAddedComponentProposal = z.infer<
  typeof MealCompositionAddedComponentProposalSchema
>;
export type MealCompositionProposal = z.infer<typeof MealCompositionProposalSchema>;
export type FiberTarget = z.infer<typeof FiberTargetSchema>;
export type CompositionComplexitySignal = z.infer<typeof CompositionComplexitySignalSchema>;
export type ComponentReuseEntry = z.infer<typeof ComponentReuseEntrySchema>;
export type CandidateCompositionTrace = z.infer<typeof CandidateCompositionTraceSchema>;
export type MealCompositionDiagnostics = z.infer<typeof MealCompositionDiagnosticsSchema>;
export type WeeklyMealConceptResult = z.infer<typeof WeeklyMealConceptResultSchema>;
export type WeeklyMealCompositionResult = z.infer<typeof WeeklyMealCompositionResultSchema>;
export type MealCompositionFailure = z.infer<typeof MealCompositionFailureSchema>;
export type ComposeMealsStage = z.infer<typeof ComposeMealsStageSchema>;
export type ComposeMealsRequest = z.infer<typeof ComposeMealsRequestSchema>;
export type ComposeMealsResponse = z.infer<typeof ComposeMealsResponseSchema>;
export type MealCompositionPromptVersion = z.infer<typeof MealCompositionPromptVersionSchema>;
