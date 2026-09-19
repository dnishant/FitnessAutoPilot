import type {
  CompleteMeal,
  CompleteMealComponent,
  CulinaryMeasurementState,
  PersonalizedMealPortion,
  PersonalizedWeeklyMealInstance,
  PersonalizedWeeklyNutritionPlan,
  RecipeNutritionResult,
  ResolvedRecipe,
  ResolvedRecipeIngredient,
} from "../../contracts/index.ts";
import { isEdibleFoodIdentity } from "../meal-composition/edible-identity.ts";
import { buildGroceryIdentityKey } from "./identity.ts";
import { isNonPurchasedGroceryIngredient } from "./policy.ts";
import type { GroceryDerivationIssue, IngredientRequirement, RecipeDemandBucket } from "./types.ts";

export type GroceryDerivationContext = {
  personalizedWeeklyPlan: PersonalizedWeeklyNutritionPlan;
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  completeMealsByCandidateId: Record<string, CompleteMeal>;
  /** Optional PLAN-009 nutrition for foodId / category enrichment. */
  nutritionByCandidateId?: Record<string, RecipeNutritionResult>;
  generatedAt?: string;
};

type AtomicDemand = {
  portion: PersonalizedMealPortion;
  meal: PersonalizedWeeklyMealInstance;
  component?: CompleteMealComponent;
};

/**
 * Collect recipe-scale demand buckets (aggregate personalServings first)
 * and atomic/count/fixed demands.
 */
export function collectGroceryDemands(ctx: GroceryDerivationContext): {
  recipeBuckets: RecipeDemandBucket[];
  atomicDemands: AtomicDemand[];
  issues: GroceryDerivationIssue[];
} {
  const buckets = new Map<string, RecipeDemandBucket>();
  const atomicDemands: AtomicDemand[] = [];
  const issues: GroceryDerivationIssue[] = [];
  const plan = ctx.personalizedWeeklyPlan;

  for (const day of plan.days) {
    for (const meal of day.meals) {
      if (meal.status === "blocked" || !meal.personalizedPlan) continue;
      const completeMeal =
        ctx.completeMealsByCandidateId[meal.candidateId] ??
        (meal.completeMealId
          ? Object.values(ctx.completeMealsByCandidateId).find((m) => m.mealId === meal.completeMealId)
          : undefined);
      const mainRecipe = ctx.recipesByCandidateId[meal.candidateId];

      for (const portion of meal.personalizedPlan.portions) {
        const component = completeMeal?.components.find((c) => c.componentId === portion.componentId);

        // Culinary needs never become groceries.
        if (component && !isEdibleFoodIdentity(component.name) && component.role !== "main") {
          continue;
        }
        if (!isEdibleFoodIdentity(portion.displayName) && portion.role !== "main") {
          continue;
        }

        const unit = portion.unit.toLowerCase();
        const isRecipeScale =
          unit === "servings" ||
          unit === "serving" ||
          portion.personalServings != null ||
          portion.internalScale != null;

        const personalServings =
          portion.personalServings ??
          portion.internalScale ??
          (isRecipeScale ? portion.amount : undefined);

        const definition = component?.definition ?? component?.resolution?.definition;
        const isCompoundSide =
          component != null &&
          component.role !== "main" &&
          (component.definitionKind === "recipe_component" ||
            definition?.kind === "recipe_component");

        if (isCompoundSide && personalServings != null && definition?.kind === "recipe_component") {
          const baseServings = definition.baseServings ?? 1;
          if (!(baseServings > 0)) {
            issues.push({
              code: "MISSING_RECIPE_YIELD",
              message: `Component recipe "${component.name}" has no trustworthy baseServings.`,
              mealInstanceId: meal.mealInstanceId,
              componentId: component.componentId,
              preservable: false,
            });
            continue;
          }
          if (!definition.ingredients?.length) {
            issues.push({
              code: "MISSING_RECIPE_INGREDIENTS",
              message: `Component recipe "${component.name}" has no ingredients.`,
              mealInstanceId: meal.mealInstanceId,
              componentId: component.componentId,
              preservable: false,
            });
            continue;
          }
          const demandKey = `component:${completeMeal?.mealId ?? meal.candidateId}:${component.componentId}`;
          addRecipeBucket(buckets, {
            demandKey,
            kind: "component_recipe",
            recipeId: demandKey,
            recipeName: definition.name || component.name,
            personalServings,
            baseServings,
            mealInstanceId: meal.mealInstanceId,
            mealName: meal.mealName,
            componentId: component.componentId,
          });
          continue;
        }

        // Main (or independent recipe_scale without compound definition) → resolved recipe.
        if (personalServings != null && (portion.role === "main" || isRecipeScale) && !isCompoundSide) {
          if (!mainRecipe) {
            issues.push({
              code: "MISSING_RECIPE_INGREDIENTS",
              message: `No resolved recipe for candidate ${meal.candidateId}.`,
              mealInstanceId: meal.mealInstanceId,
              preservable: false,
            });
            continue;
          }
          if (!mainRecipe.ingredients?.length) {
            issues.push({
              code: "MISSING_RECIPE_INGREDIENTS",
              message: `Resolved recipe "${mainRecipe.name}" has no ingredients.`,
              mealInstanceId: meal.mealInstanceId,
              recipeId: mainRecipe.recipeId,
              preservable: false,
            });
            continue;
          }
          if (!(mainRecipe.baseServings > 0)) {
            issues.push({
              code: "MISSING_RECIPE_YIELD",
              message: `Resolved recipe "${mainRecipe.name}" has no trustworthy baseServings.`,
              mealInstanceId: meal.mealInstanceId,
              recipeId: mainRecipe.recipeId,
              preservable: false,
            });
            continue;
          }
          const demandKey = `recipe:${mainRecipe.recipeId}`;
          addRecipeBucket(buckets, {
            demandKey,
            kind: "resolved_recipe",
            recipeId: mainRecipe.recipeId,
            recipeName: mainRecipe.name,
            personalServings,
            baseServings: mainRecipe.baseServings,
            mealInstanceId: meal.mealInstanceId,
            mealName: meal.mealName,
            componentId: portion.componentId,
          });
          continue;
        }

        // Atomic / count / fixed / food_grams
        atomicDemands.push({ portion, meal, component });
      }
    }
  }

  return {
    recipeBuckets: [...buckets.values()],
    atomicDemands,
    issues,
  };
}

function addRecipeBucket(
  buckets: Map<string, RecipeDemandBucket>,
  input: {
    demandKey: string;
    kind: RecipeDemandBucket["kind"];
    recipeId: string;
    recipeName: string;
    personalServings: number;
    baseServings: number;
    mealInstanceId: string;
    mealName: string;
    componentId?: string;
  },
): void {
  const existing = buckets.get(input.demandKey);
  if (!existing) {
    buckets.set(input.demandKey, {
      demandKey: input.demandKey,
      kind: input.kind,
      recipeId: input.recipeId,
      recipeName: input.recipeName,
      totalPersonalServings: input.personalServings,
      baseServings: input.baseServings,
      mealInstanceIds: [input.mealInstanceId],
      mealNames: [input.mealName],
      mealPersonalServings: [input.personalServings],
      componentId: input.componentId,
    });
    return;
  }
  existing.totalPersonalServings += input.personalServings;
  if (!existing.mealInstanceIds.includes(input.mealInstanceId)) {
    existing.mealInstanceIds.push(input.mealInstanceId);
    existing.mealNames.push(input.mealName);
    existing.mealPersonalServings.push(input.personalServings);
  } else {
    const idx = existing.mealInstanceIds.indexOf(input.mealInstanceId);
    existing.mealPersonalServings[idx] =
      (existing.mealPersonalServings[idx] ?? 0) + input.personalServings;
  }
}

/**
 * Expand aggregated recipe demand + atomic demands into ingredient requirements.
 * Parent-owned substructure is NOT expanded separately — main recipe ingredients cover it.
 * Component recipes expand once from their own definition.
 */
export function expandIngredientRequirements(
  ctx: GroceryDerivationContext,
  recipeBuckets: RecipeDemandBucket[],
  atomicDemands: AtomicDemand[],
): { requirements: IngredientRequirement[]; issues: GroceryDerivationIssue[] } {
  const requirements: IngredientRequirement[] = [];
  const issues: GroceryDerivationIssue[] = [];
  const visitedRecipes = new Set<string>();

  for (const bucket of recipeBuckets) {
    if (visitedRecipes.has(bucket.demandKey)) {
      // Cycle / double-expand guard
      continue;
    }
    visitedRecipes.add(bucket.demandKey);

    const scale = bucket.totalPersonalServings / bucket.baseServings;
    if (!(scale > 0) || !Number.isFinite(scale)) {
      issues.push({
        code: "MISSING_RECIPE_YIELD",
        message: `Invalid scale for recipe demand ${bucket.demandKey}.`,
        recipeId: bucket.recipeId,
        preservable: false,
      });
      continue;
    }

    if (bucket.kind === "resolved_recipe") {
      const recipe = Object.values(ctx.recipesByCandidateId).find(
        (r) => r.recipeId === bucket.recipeId,
      );
      if (!recipe) {
        issues.push({
          code: "MISSING_RECIPE_INGREDIENTS",
          message: `Missing resolved recipe ${bucket.recipeId} during expansion.`,
          recipeId: bucket.recipeId,
          preservable: false,
        });
        continue;
      }
      const nutrition = ctx.nutritionByCandidateId?.[recipe.candidateId];
      for (const ingredient of recipe.ingredients) {
        pushScaledIngredient({
          requirements,
          issues,
          ingredient,
          scale,
          bucket,
          nutritionIngredient: nutrition?.ingredients.find(
            (row) => row.recipeIngredient.ingredientId === ingredient.ingredientId,
          ),
        });
      }
      continue;
    }

    // component_recipe
    const completeMeal = Object.values(ctx.completeMealsByCandidateId).find((meal) =>
      meal.components.some((c) => {
        const key = `component:${meal.mealId}:${c.componentId}`;
        return key === bucket.demandKey;
      }),
    );
    const component = completeMeal?.components.find((c) => c.componentId === bucket.componentId);
    const definition = component?.definition ?? component?.resolution?.definition;
    if (!definition || definition.kind !== "recipe_component") {
      issues.push({
        code: "MISSING_RECIPE_INGREDIENTS",
        message: `Missing component recipe definition for ${bucket.demandKey}.`,
        componentId: bucket.componentId,
        preservable: false,
      });
      continue;
    }
    for (let i = 0; i < definition.ingredients.length; i += 1) {
      const ing = definition.ingredients[i]!;
      if (ing.quantity == null || !(ing.quantity > 0) || !ing.unit) {
        issues.push({
          code: "UNSUPPORTED_INGREDIENT_QUANTITY",
          message: `Ingredient "${ing.name}" in ${bucket.recipeName} lacks a usable quantity.`,
          componentId: bucket.componentId,
          ingredientName: ing.name,
          preservable: false,
        });
        continue;
      }
      const synthetic: ResolvedRecipeIngredient = {
        ingredientId: `comp_${i}_${ing.name}`,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        preparation: ing.preparation ?? null,
        role: "other",
        scalingBehavior: "primary_scalable",
      };
      pushScaledIngredient({
        requirements,
        issues,
        ingredient: synthetic,
        scale,
        bucket,
      });
    }
  }

  for (const atomic of atomicDemands) {
    const { portion, meal, component } = atomic;
    if (!(portion.amount > 0) || !portion.unit) {
      issues.push({
        code: "UNSUPPORTED_INGREDIENT_QUANTITY",
        message: `Atomic portion "${portion.displayName}" has no usable quantity.`,
        mealInstanceId: meal.mealInstanceId,
        componentId: portion.componentId,
        preservable: false,
      });
      continue;
    }
    const foodResolution = component?.resolution?.foodResolution;
    const food =
      foodResolution?.status === "resolved" ? foodResolution.food : undefined;
    const measurementState =
      (component?.definition?.kind === "atomic_food"
        ? component.definition.measurementState
        : undefined) ?? "unknown";
    const displayName = food?.canonicalName ?? portion.displayName;
    const identityKey = buildGroceryIdentityKey({
      canonicalFoodId: food?.foodId,
      displayName,
      measurementState,
    });
    const excluded = isNonPurchasedGroceryIngredient({
      displayName,
      canonicalFoodId: food?.foodId,
    });
    requirements.push({
      requirementId: `${meal.mealInstanceId}:${portion.componentId}:atomic`,
      canonicalFoodId: food?.foodId ?? null,
      identityKey,
      displayName,
      measurementState,
      foodCategory: food?.metadata?.foodCategory,
      quantity: portion.amount,
      unit: portion.unit,
      sourceMealInstanceId: meal.mealInstanceId,
      sourceMealInstanceIds: [meal.mealInstanceId],
      sourceMealName: meal.mealName,
      sourceMealNames: [meal.mealName],
      sourceComponentId: portion.componentId,
      sourceRecipeName: portion.displayName,
      excludedAsNonPurchased: excluded || undefined,
      conversionConfidence: "high",
    });
  }

  return { requirements, issues };
}

function pushScaledIngredient(input: {
  requirements: IngredientRequirement[];
  issues: GroceryDerivationIssue[];
  ingredient: ResolvedRecipeIngredient;
  scale: number;
  bucket: RecipeDemandBucket;
  nutritionIngredient?: RecipeNutritionResult["ingredients"][number];
}): void {
  const { ingredient, scale, bucket } = input;
  if (!(ingredient.quantity > 0) || !ingredient.unit) {
    input.issues.push({
      code: "UNSUPPORTED_INGREDIENT_QUANTITY",
      message: `Ingredient "${ingredient.name}" has no usable quantity.`,
      recipeId: bucket.recipeId,
      ingredientName: ingredient.name,
      preservable: false,
    });
    return;
  }

  const foodResolution = input.nutritionIngredient?.foodResolution;
  const food = foodResolution?.status === "resolved" ? foodResolution.food : undefined;
  const measurementState: CulinaryMeasurementState =
    ingredient.measurementState ??
    (input.nutritionIngredient
      ? (ingredient.measurementState ?? "unknown")
      : "unknown");
  const displayName = food?.canonicalName ?? ingredient.name;
  const quantity = ingredient.quantity * scale;
  const identityKey = buildGroceryIdentityKey({
    canonicalFoodId: food?.foodId,
    displayName,
    measurementState,
    preparation: ingredient.preparation,
  });
  const excluded = isNonPurchasedGroceryIngredient({
    displayName,
    canonicalFoodId: food?.foodId,
  });

  // One requirement with FULL scaled demand (recipe demand already aggregated).
  const primaryMealId = bucket.mealInstanceIds[0]!;
  const mealContributionQuantities = bucket.mealPersonalServings.map(
    (servings) => ingredient.quantity * (servings / bucket.baseServings),
  );
  input.requirements.push({
    requirementId: `${bucket.demandKey}:${ingredient.ingredientId}`,
    canonicalFoodId: food?.foodId ?? null,
    identityKey,
    displayName,
    measurementState,
    foodCategory: food?.metadata?.foodCategory,
    quantity,
    unit: ingredient.unit,
    sourceRecipeId: bucket.recipeId,
    sourceRecipeName: bucket.recipeName,
    sourceMealInstanceId: primaryMealId,
    sourceMealInstanceIds: [...bucket.mealInstanceIds],
    mealContributionQuantities,
    sourceMealName: bucket.mealNames[0],
    sourceMealNames: [...bucket.mealNames],
    sourceComponentId: bucket.componentId,
    excludedAsNonPurchased: excluded || undefined,
    conversionConfidence:
      input.nutritionIngredient?.normalizedQuantity?.confidence ?? "none",
  });
}
