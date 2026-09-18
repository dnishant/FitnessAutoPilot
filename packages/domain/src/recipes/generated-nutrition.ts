import type {
  GeneratedRecipeNutrition,
  IngredientNutrition,
  RecipeMacroTotals,
  RecipeNutrition,
  RecipeNutritionResult,
  RecipeOptimization,
  ResolvedRecipe,
  ResolvedRecipeIngredient,
} from "@fitness-autopilot/contracts";
import {
  FOOD_RESOLUTION_POLICY_VERSION,
  GENERATED_RECIPE_NUTRITION_SOURCE,
  GeneratedRecipeNutritionSchema,
  NUTRITION_CALCULATION_POLICY_VERSION,
  QUANTITY_NORMALIZATION_POLICY_VERSION,
  RecipeOptimizationSchema,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";

/** Default calorie consistency tolerance (±20%). */
export const MACRO_CALORIE_TOLERANCE_FRACTION = 0.2;

/** Total vs perServing × baseServings consistency tolerance. */
export const TOTAL_PER_SERVING_TOLERANCE_FRACTION = 0.08;

export type GeneratedNutritionValidationCode =
  | "MISSING_NUTRITION"
  | "INVALID_NUTRITION_SHAPE"
  | "NEGATIVE_MACROS"
  | "INVALID_BASE_SERVINGS"
  | "TOTAL_PER_SERVING_MISMATCH"
  | "CALORIE_MACRO_INCONSISTENCY"
  | "IMPLAUSIBLE_MACROS";

export type GeneratedNutritionValidationError = {
  code: GeneratedNutritionValidationCode;
  message: string;
  details?: unknown;
};

/**
 * Reusable taste-first nutrition optimization instructions for recipe generation / resolution.
 * Prefer importing this fragment rather than duplicating across prompts.
 */
export const TASTE_FIRST_NUTRITION_OPTIMIZATION_INSTRUCTIONS = [
  "Create a genuinely enjoyable version of the requested dish.",
  "Taste, cuisine identity, texture, and authenticity are important.",
  "Priority order: (1) taste, (2) authenticity / culinary identity, (3) user preference, (4) nutrition optimization.",
  "You may make reasonable nutrition-conscious modifications when they have minimal impact on the identity and eating experience of the dish.",
  "Prefer improvements such as: reducing excessive oil; air frying / baking where appropriate; higher-protein versions of equivalent ingredients; leaner meat; Greek yogurt where culinarily appropriate; increasing lean protein; modestly increasing vegetables; reducing calorie-heavy garnish that contributes little.",
  "Do NOT transform the meal into diet food.",
  "Do NOT substitute foundational ingredients simply to improve macros unless the user specifically requests it.",
  "Do NOT replace rice with cauliflower rice, pasta with zucchini noodles, paratha with lettuce, eliminate all oil from Indian cooking, replace paneer with tofu without support, remove sauces central to the dish, or turn every recipe into grilled protein + vegetables.",
  "Individual recipes do not need perfect bodybuilding macros — the weekly planner balances the day.",
  "Pipeline: generate culinary recipe → optimize within taste constraints → finalize ingredient quantities → estimate macros from the FINAL ingredients → return structured nutrition.",
  "Never calculate macros before optimization and then mutate ingredients afterward.",
  "Nutrition must correspond to the final recipe exactly — do not invent macros that ignore substantial ingredients (bread, rice, oil, cheese, etc.).",
  "Estimate by ingredient-aware arithmetic: for each ingredient estimate calories/protein/carbs/fat from the exact quantity used, sum them, then perServing = total / baseServings.",
  "Do not reverse-engineer ingredient quantities to hit a requested macro target unless explicitly asked.",
].join(" ");

export function estimatedCaloriesFromMacros(macros: RecipeMacroTotals): number {
  return macros.proteinGrams * 4 + macros.carbohydrateGrams * 4 + macros.fatGrams * 9;
}

export function scaleMacros(macros: RecipeMacroTotals, multiplier: number): RecipeMacroTotals {
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new Error("multiplier must be a finite non-negative number");
  }
  const scaled: RecipeMacroTotals = {
    caloriesKcal: macros.caloriesKcal * multiplier,
    proteinGrams: macros.proteinGrams * multiplier,
    carbohydrateGrams: macros.carbohydrateGrams * multiplier,
    fatGrams: macros.fatGrams * multiplier,
  };
  if (macros.fiberGrams !== undefined) {
    scaled.fiberGrams = macros.fiberGrams * multiplier;
  }
  return scaled;
}

/**
 * Macros for a personal portion: personalServings × recipe.nutrition.perServing.
 * 1.0 = one authored serving (never × baseServings).
 */
export function macrosForServings(
  recipe: Pick<ResolvedRecipe, "nutrition">,
  personalServings: number,
): RecipeMacroTotals {
  const perServing = recipe.nutrition?.perServing;
  if (!perServing) {
    throw new Error("recipe.nutrition.perServing is required to scale macros");
  }
  return scaleMacros(perServing, personalServings);
}

/**
 * Ingredient scale factor: personalServings / baseServings.
 * Example: 1.25 servings of a 4-serving batch → 1.25/4 = 0.3125 of batch quantities.
 */
export function ingredientScaleFactor(
  baseServings: number,
  personalServings: number,
): number {
  if (!Number.isFinite(baseServings) || baseServings <= 0) {
    throw new Error("baseServings must be a finite number greater than 0");
  }
  if (!Number.isFinite(personalServings) || personalServings < 0) {
    throw new Error("personalServings must be a finite non-negative number");
  }
  return personalServings / baseServings;
}

export type ScaledIngredientQuantity = {
  calculatedQuantity: number;
  unit: string;
  /** Heuristic: eggs, tortillas, parathas, etc. — UI may round later. */
  discrete: boolean;
};

const DISCRETE_UNIT =
  /\b(egg|eggs|tortilla|tortillas|paratha|parathas|roti|rotis|chapati|chapatis|bun|buns|wrap|wraps|pita|pitas|breast|breasts|piece|pieces|slice|slices|clove|cloves)\b/i;

export function isDiscreteIngredientUnit(unit: string, name?: string): boolean {
  return DISCRETE_UNIT.test(unit) || (name != null && DISCRETE_UNIT.test(name));
}

export function ingredientQuantityForServings(
  ingredient: Pick<ResolvedRecipeIngredient, "quantity" | "unit" | "name">,
  baseServings: number,
  personalServings: number,
): ScaledIngredientQuantity {
  const factor = ingredientScaleFactor(baseServings, personalServings);
  const calculatedQuantity = ingredient.quantity * factor;
  return {
    calculatedQuantity: Number(calculatedQuantity.toFixed(4)),
    unit: ingredient.unit,
    discrete: isDiscreteIngredientUnit(ingredient.unit, ingredient.name),
  };
}

function macrosNonNegative(macros: RecipeMacroTotals): boolean {
  return (
    macros.caloriesKcal >= 0 &&
    macros.proteinGrams >= 0 &&
    macros.carbohydrateGrams >= 0 &&
    macros.fatGrams >= 0 &&
    (macros.fiberGrams === undefined || macros.fiberGrams >= 0)
  );
}

function approximatelyEqual(a: number, b: number, toleranceFraction: number): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= scale * toleranceFraction;
}

/**
 * Lightweight plausibility: catch obviously impossible LLM output.
 * Not a full nutrition engine — only flag extreme contradictions with the ingredient list.
 */
function checkIngredientPlausibility(
  ingredients: readonly ResolvedRecipeIngredient[],
  total: RecipeMacroTotals,
): GeneratedNutritionValidationError | null {
  const names = ingredients.map((i) => i.name.toLowerCase()).join(" ");
  const hasSubstantialOil = ingredients.some((i) => {
    const n = i.name.toLowerCase();
    const oilLike = /\b(oil|ghee|butter|lard)\b/.test(n);
    if (!oilLike) return false;
    const q = i.quantity;
    const u = i.unit.toLowerCase();
    if (u.includes("tbsp") || u.includes("tablespoon")) return q >= 1;
    if (u.includes("tsp") || u.includes("teaspoon")) return q >= 3;
    if (u === "ml" || u === "g") return q >= 10;
    return q >= 1;
  });
  if (hasSubstantialOil && total.fatGrams < 3 && total.caloriesKcal < 80) {
    return {
      code: "IMPLAUSIBLE_MACROS",
      message:
        "Recipe lists substantial cooking oil/fat but total fat/calories are near zero.",
    };
  }

  const hasParathaOrBread = /\b(paratha|roti|chapati|tortilla|wrap|bread|naan|bun)\b/.test(
    names,
  );
  if (hasParathaOrBread && total.carbohydrateGrams < 8 && total.caloriesKcal < 150) {
    return {
      code: "IMPLAUSIBLE_MACROS",
      message:
        "Recipe lists substantial bread/wrap carbohydrate but total carbs/calories are implausibly low.",
    };
  }

  const paneer = ingredients.find((i) => /\bpaneer\b/i.test(i.name));
  if (paneer) {
    const u = paneer.unit.toLowerCase();
    const gramsApprox =
      u === "g" || u === "gram" || u === "grams"
        ? paneer.quantity
        : u.includes("oz")
          ? paneer.quantity * 28
          : null;
    if (gramsApprox != null && gramsApprox >= 200 && total.caloriesKcal < 250) {
      return {
        code: "IMPLAUSIBLE_MACROS",
        message: `Recipe lists ~${Math.round(gramsApprox)} g paneer but total calories are implausibly low.`,
      };
    }
  }

  return null;
}

export function validateGeneratedRecipeNutrition(input: {
  baseServings: number;
  nutrition: unknown;
  ingredients?: readonly ResolvedRecipeIngredient[];
  calorieToleranceFraction?: number;
}): Result<GeneratedRecipeNutrition, GeneratedNutritionValidationError> {
  if (input.nutrition == null) {
    return err({
      code: "MISSING_NUTRITION",
      message: "Generated recipe nutrition is required for planning.",
    });
  }

  if (!Number.isFinite(input.baseServings) || input.baseServings <= 0) {
    return err({
      code: "INVALID_BASE_SERVINGS",
      message: "baseServings must be greater than 0.",
      details: { baseServings: input.baseServings },
    });
  }

  const parsed = GeneratedRecipeNutritionSchema.safeParse(input.nutrition);
  if (!parsed.success) {
    return err({
      code: "INVALID_NUTRITION_SHAPE",
      message: parsed.error.issues[0]?.message ?? "Invalid generated nutrition shape.",
      details: parsed.error.flatten(),
    });
  }

  const nutrition = parsed.data;
  if (!macrosNonNegative(nutrition.total) || !macrosNonNegative(nutrition.perServing)) {
    return err({
      code: "NEGATIVE_MACROS",
      message: "Macro values cannot be negative.",
    });
  }

  const expectedTotal = scaleMacros(nutrition.perServing, input.baseServings);
  if (
    !approximatelyEqual(
      nutrition.total.caloriesKcal,
      expectedTotal.caloriesKcal,
      TOTAL_PER_SERVING_TOLERANCE_FRACTION,
    ) ||
    !approximatelyEqual(
      nutrition.total.proteinGrams,
      expectedTotal.proteinGrams,
      TOTAL_PER_SERVING_TOLERANCE_FRACTION,
    )
  ) {
    return err({
      code: "TOTAL_PER_SERVING_MISMATCH",
      message:
        "total macros should approximately equal perServing × baseServings.",
      details: {
        total: nutrition.total,
        expectedFromPerServing: expectedTotal,
        baseServings: input.baseServings,
      },
    });
  }

  const tolerance = input.calorieToleranceFraction ?? MACRO_CALORIE_TOLERANCE_FRACTION;
  for (const [label, macros] of [
    ["total", nutrition.total],
    ["perServing", nutrition.perServing],
  ] as const) {
    const derived = estimatedCaloriesFromMacros(macros);
    if (!approximatelyEqual(macros.caloriesKcal, derived, tolerance)) {
      return err({
        code: "CALORIE_MACRO_INCONSISTENCY",
        message: `${label} calories are inconsistent with protein×4 + carbs×4 + fat×9 (tolerance ±${Math.round(tolerance * 100)}%).`,
        details: {
          label,
          statedCalories: macros.caloriesKcal,
          derivedCalories: derived,
          macros,
        },
      });
    }
  }

  if (input.ingredients && input.ingredients.length > 0) {
    const plausibility = checkIngredientPlausibility(input.ingredients, nutrition.total);
    if (plausibility) return err(plausibility);
  }

  return ok(nutrition);
}

export function parseRecipeOptimization(
  value: unknown,
): RecipeOptimization | undefined {
  if (value == null) return undefined;
  const parsed = RecipeOptimizationSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Bridge LLM recipe.nutrition into the PLAN-010 RecipeNutritionResult shape
 * so the portion solver can consume complete recipes without USDA.
 */
export function recipeNutritionResultFromGenerated(
  recipe: ResolvedRecipe,
): RecipeNutritionResult | null {
  if (!recipe.nutrition || recipe.nutrition.source !== GENERATED_RECIPE_NUTRITION_SOURCE) {
    return null;
  }
  const validated = validateGeneratedRecipeNutrition({
    baseServings: recipe.baseServings,
    nutrition: recipe.nutrition,
    ingredients: recipe.ingredients,
  });
  if (!validated.ok) return null;

  const nutrition: RecipeNutrition = {
    total: validated.value.total,
    perBaseServing: validated.value.perServing,
    ingredientBreakdown: recipe.ingredients.map((ingredient) => ({
      ingredientId: ingredient.ingredientId,
      ingredientName: ingredient.name,
      status: "resolved" as const,
      nutrition: undefined,
    })),
    resolutionQuality: {
      status: "complete",
      totalIngredientCount: recipe.ingredients.length,
      resolvedIngredientCount: recipe.ingredients.length,
      ambiguousIngredientCount: 0,
      unresolvedIngredientCount: 0,
      highConfidenceCount: recipe.ingredients.length,
      mediumConfidenceCount: 0,
      directMassConversionCount: 0,
      providerMeasureConversionCount: 0,
      lowConfidenceConversionCount: 0,
      pendingPortioningComponentCount: 0,
    },
  };

  return {
    recipeId: recipe.recipeId,
    candidateId: recipe.candidateId,
    recipeName: recipe.name,
    baseServings: recipe.baseServings,
    ingredients: [],
    mealComponents: [],
    nutrition,
    resolutionQuality: nutrition.resolutionQuality,
    policyVersions: {
      // Bridge into PLAN-009 RecipeNutritionResult shape for the portion solver.
      // Active source is llm_estimate on ResolvedRecipe; this adapter is not USDA.
      foodResolution: FOOD_RESOLUTION_POLICY_VERSION,
      nutritionCalculation: NUTRITION_CALCULATION_POLICY_VERSION,
      quantityNormalization: QUANTITY_NORMALIZATION_POLICY_VERSION,
    },
  };
}

/**
 * Build nutrition maps for weekly personalization from recipe.nutrition (LLM).
 * Recipes without valid generated nutrition are omitted (caller may fall back).
 */
export function buildNutritionMapsFromGeneratedRecipes(
  recipesByCandidateId: Record<string, ResolvedRecipe>,
): Record<string, RecipeNutritionResult> {
  const out: Record<string, RecipeNutritionResult> = {};
  for (const [candidateId, recipe] of Object.entries(recipesByCandidateId)) {
    const result = recipeNutritionResultFromGenerated(recipe);
    if (result) out[candidateId] = result;
  }
  return out;
}

/** Dev-only diagnostic string for recipe vs planned portion semantics. */
export function formatRecipePortionDiagnostics(input: {
  recipeName: string;
  baseServings: number;
  nutrition?: GeneratedRecipeNutrition | null;
  personalServings?: number;
}): string {
  const lines = [
    input.recipeName,
    "",
    "Recipe:",
    `serves ${input.baseServings}`,
  ];
  if (input.nutrition) {
    lines.push(
      `${Math.round(input.nutrition.total.caloriesKcal)} kcal total`,
      `${Math.round(input.nutrition.perServing.caloriesKcal)} kcal / serving`,
      `source: ${input.nutrition.source}`,
    );
  } else {
    lines.push("(no generated nutrition)");
  }
  if (input.personalServings != null && input.nutrition) {
    const meal = scaleMacros(input.nutrition.perServing, input.personalServings);
    lines.push(
      "",
      "Plan:",
      `${input.personalServings} servings`,
      "",
      "Meal:",
      `${Math.round(meal.caloriesKcal)} kcal`,
      `${Math.round(meal.proteinGrams)} g protein`,
    );
  }
  return lines.join("\n");
}

/** @deprecated USDA path — kept for inactive verification adapters. */
export function usdaPolicyVersionMarker(): string {
  return FOOD_RESOLUTION_POLICY_VERSION;
}

export type { IngredientNutrition };
