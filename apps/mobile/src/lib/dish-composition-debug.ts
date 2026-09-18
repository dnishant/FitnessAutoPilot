import type {
  ConsumerMealSlot,
  ConsumerWeeklyPlan,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";

/**
 * Compact diagnostic payload for meal detail — enough to spot inflated macros
 * (e.g. chicken structural fallback applied to curd rice).
 */
export type DishCompositionDebug = {
  diagnosis: {
    recipeHasLlmNutrition: boolean;
    nutritionSource: "llm_estimate" | "missing_on_recipe" | "unknown";
    suspectedStructuralMainFallback: boolean;
    note: string;
  };
  recipe: {
    candidateId: string;
    name: string;
    baseServings: number;
    nutrition: ResolvedRecipe["nutrition"] | null;
    ingredients: Array<{
      name: string;
      quantity: number;
      unit: string;
      role?: string;
    }>;
    mealComponents: ResolvedRecipe["mealComponents"];
  } | null;
  consumerSlot: {
    mealInstanceId?: string;
    personalServings?: number;
    personalizedNutrition?: ConsumerMealSlot["personalizedNutrition"];
    personalizationStatus?: ConsumerMealSlot["personalizationStatus"];
    components: ConsumerMealSlot["components"];
  };
  solverPortions: Array<{
    componentId: string;
    displayName: string;
    role: string;
    amount: number;
    unit: string;
    personalServings?: number;
    internalScale?: number;
    nutrition: {
      caloriesKcal: number;
      proteinGrams: number;
      carbohydrateGrams: number;
      fatGrams: number;
      fiberGrams?: number;
    };
  }> | null;
  mealTotals: ConsumerMealSlot["personalizedNutrition"] | null;
};

/** Heuristic: lean-chicken structural main is ~25g P / 100g at ~170g (~42.5g P) with near-zero carbs. */
function looksLikeStructuralChickenMain(portion: {
  role: string;
  nutrition: { proteinGrams: number; carbohydrateGrams: number; caloriesKcal: number };
}): boolean {
  if (portion.role !== "main") return false;
  const { proteinGrams: p, carbohydrateGrams: c, caloriesKcal: kcal } = portion.nutrition;
  // At ~1.0–1.3 scale of 170g chicken: ~40–55g P, carbs usually < 6g, kcal ~280–360
  return p >= 35 && c <= 8 && kcal >= 250 && kcal <= 400;
}

export function buildDishCompositionDebug(input: {
  meal: ConsumerMealSlot;
  weeklyPlan: ConsumerWeeklyPlan | null | undefined;
}): DishCompositionDebug {
  const recipe = input.weeklyPlan?.recipesByCandidateId?.[input.meal.candidateId];
  const hasLlm = recipe?.nutrition?.source === "llm_estimate";

  const instanceId =
    input.meal.mealInstanceId ??
    (input.weeklyPlan?.generatedPlanId
      ? `${input.weeklyPlan.generatedPlanId}:${input.meal.day}:${input.meal.mealType}`
      : undefined);

  let solverPortions: DishCompositionDebug["solverPortions"] = null;
  if (instanceId && input.weeklyPlan?.personalizedWeeklyPlan) {
    for (const day of input.weeklyPlan.personalizedWeeklyPlan.days) {
      const match = day.meals.find((m) => m.mealInstanceId === instanceId);
      if (match?.personalizedPlan?.portions) {
        solverPortions = match.personalizedPlan.portions.map((p) => ({
          componentId: p.componentId,
          displayName: p.displayName,
          role: p.role,
          amount: p.amount,
          unit: p.unit,
          personalServings: p.personalServings,
          internalScale: p.internalScale,
          nutrition: p.nutrition,
        }));
        break;
      }
    }
  }

  const mainPortion = solverPortions?.find((p) => p.role === "main");
  const suspectedStructural =
    !hasLlm && mainPortion != null && looksLikeStructuralChickenMain(mainPortion);

  let note =
    "Inspect solverPortions[].nutrition — meal totals are the sum of those rows.";
  if (!recipe) {
    note = "No resolved recipe on the weekly plan for this candidate.";
  } else if (!hasLlm) {
    note =
      "Recipe has no llm_estimate nutrition. Main macros may be role-structural lean-chicken fallback (~42g protein / serving), which inflates protein on rice/veg dishes.";
  } else if (suspectedStructural) {
    note =
      "Main macros resemble structural chicken estimates despite recipe.nutrition presence — verify coefficient source.";
  }

  return {
    diagnosis: {
      recipeHasLlmNutrition: hasLlm,
      nutritionSource: hasLlm ? "llm_estimate" : recipe ? "missing_on_recipe" : "unknown",
      suspectedStructuralMainFallback: suspectedStructural,
      note,
    },
    recipe: recipe
      ? {
          candidateId: recipe.candidateId,
          name: recipe.name,
          baseServings: recipe.baseServings,
          nutrition: recipe.nutrition ?? null,
          ingredients: recipe.ingredients.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            role: i.role,
          })),
          mealComponents: recipe.mealComponents,
        }
      : null,
    consumerSlot: {
      mealInstanceId: input.meal.mealInstanceId,
      personalServings: input.meal.personalServings,
      personalizedNutrition: input.meal.personalizedNutrition,
      personalizationStatus: input.meal.personalizationStatus,
      components: input.meal.components,
    },
    solverPortions,
    mealTotals: input.meal.personalizedNutrition ?? null,
  };
}
