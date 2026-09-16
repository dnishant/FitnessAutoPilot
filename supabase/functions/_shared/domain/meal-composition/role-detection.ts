import type {
  CompositionNutritionSignals,
  CompositionPresence,
  MealCompositionProfile,
  MealComponentRole,
  RecipeNutritionResult,
  ResolvedRecipe,
} from "../../contracts/index.ts";
import {
  buildNormalizedComponentKey,
  ingredientSuggestsRole,
  isMeaningfulIngredientQuantity,
  mapPlan008TypeToRole,
  namesLikelyEquivalent,
} from "./component-identity.ts";

export type DetectedExistingComponent = {
  componentId: string;
  role: MealComponentRole;
  name: string;
  relationship: "intrinsic" | "required_companion" | "recommended";
  source: "main_recipe" | "existing_recipe_component";
  reason: string;
  quantityMode: "recipe_defined" | "solver_determined";
  definitionKind: "atomic_food" | "recipe_component";
  normalizedComponentKey: string;
};

function presenceFromMacros(input: {
  proteinGrams: number;
  carbohydrateGrams: number;
  fiberGrams: number | null | undefined;
  caloriesKcal: number;
}): CompositionNutritionSignals {
  const calories = Math.max(input.caloriesKcal, 1);
  const proteinShare = (input.proteinGrams * 4) / calories;
  const carbShare = (input.carbohydrateGrams * 4) / calories;
  const fiber = input.fiberGrams;

  const proteinPresence: CompositionPresence =
    proteinShare >= 0.35 || input.proteinGrams >= 35
      ? "high"
      : proteinShare >= 0.15 || input.proteinGrams >= 15
        ? "meaningful"
        : "low";

  const carbohydratePresence: CompositionPresence =
    carbShare >= 0.4 || input.carbohydrateGrams >= 45
      ? "high"
      : carbShare >= 0.15 || input.carbohydrateGrams >= 20
        ? "meaningful"
        : "low";

  let fiberPresence: CompositionPresence = "low";
  if (fiber != null && Number.isFinite(fiber)) {
    fiberPresence = fiber >= 8 ? "high" : fiber >= 3 ? "meaningful" : "low";
  }

  return { proteinPresence, carbohydratePresence, fiberPresence };
}

/**
 * Deterministic role detection for the existing plate (recipe + PLAN-008 components).
 * Uses meaningful-quantity heuristics and trusted PLAN-009 nutrition when available.
 */
export function detectExistingMealRoles(
  recipe: ResolvedRecipe,
  recipeNutrition?: RecipeNutritionResult,
): {
  profile: MealCompositionProfile;
  nutritionSignals: CompositionNutritionSignals;
  existingComponents: DetectedExistingComponent[];
} {
  const roleFlags: Record<
    keyof Omit<MealCompositionProfile, "addedComponentRoles">,
    boolean
  > = {
    hasPrimaryProtein: false,
    hasMeaningfulCarbohydrate: false,
    hasMeaningfulVegetableOrFruit: false,
    hasMeaningfulFiberSource: false,
    hasSauceOrMoistureComponent: false,
  };

  const existingComponents: DetectedExistingComponent[] = [];
  const seenKeys = new Set<string>();

  // Main dish always present.
  const mainKey = buildNormalizedComponentKey("main", recipe.name);
  existingComponents.push({
    componentId: "main",
    role: "main",
    name: recipe.name,
    relationship: "intrinsic",
    source: "main_recipe",
    reason: "Selected weekly main recipe",
    quantityMode: "recipe_defined",
    definitionKind: "recipe_component",
    normalizedComponentKey: mainKey,
  });
  seenKeys.add(mainKey);
  roleFlags.hasPrimaryProtein = true;

  for (const mc of recipe.mealComponents) {
    const role = mapPlan008TypeToRole(mc.type);
    if (role === "main") {
      // Already represented by main recipe entry.
      continue;
    }
    const key = buildNormalizedComponentKey(role, mc.name);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const relationship =
      mc.relationship === "intrinsic"
        ? "intrinsic"
        : mc.required
          ? "required_companion"
          : "recommended";

    existingComponents.push({
      componentId: mc.componentId,
      role,
      name: mc.name,
      relationship,
      source: "existing_recipe_component",
      reason: mc.purpose,
      quantityMode:
        mc.relationship === "intrinsic" ? "recipe_defined" : "solver_determined",
      definitionKind: "atomic_food",
      normalizedComponentKey: key,
    });

    if (role === "carbohydrate") roleFlags.hasMeaningfulCarbohydrate = true;
    if (role === "vegetable" || role === "fruit" || role === "legume") {
      roleFlags.hasMeaningfulVegetableOrFruit = true;
      roleFlags.hasMeaningfulFiberSource = true;
    }
    if (role === "sauce_condiment") roleFlags.hasSauceOrMoistureComponent = true;
    if (role === "legume") roleFlags.hasMeaningfulFiberSource = true;
  }

  for (const ingredient of recipe.ingredients) {
    const suggested = ingredientSuggestsRole(ingredient);
    if (!suggested) continue;
    if (!isMeaningfulIngredientQuantity(ingredient, suggested)) continue;

    if (suggested === "main") {
      roleFlags.hasPrimaryProtein = true;
    }
    if (suggested === "carbohydrate") roleFlags.hasMeaningfulCarbohydrate = true;
    if (suggested === "vegetable" || suggested === "fruit") {
      roleFlags.hasMeaningfulVegetableOrFruit = true;
      roleFlags.hasMeaningfulFiberSource = true;
    }
    if (suggested === "legume") {
      roleFlags.hasMeaningfulVegetableOrFruit = true;
      roleFlags.hasMeaningfulFiberSource = true;
      roleFlags.hasMeaningfulCarbohydrate = true;
    }
    // Sauce ingredients alone (e.g. yogurt marinade) do not imply a table condiment —
    // moisture profile + mealComponents own that signal.

    // Intrinsic ingredient-backed sides (e.g. tortillas in tacos) — surface when not already listed.
    if (suggested === "main") continue;
    const key = buildNormalizedComponentKey(suggested, ingredient.name);
    if (seenKeys.has(key)) continue;
    if (
      existingComponents.some(
        (c) => c.role === suggested && namesLikelyEquivalent(c.name, ingredient.name),
      )
    ) {
      continue;
    }
    // Only promote clear structural ingredients, not every seasoning.
    if (
      suggested === "carbohydrate" ||
      suggested === "vegetable" ||
      suggested === "fruit" ||
      suggested === "legume"
    ) {
      seenKeys.add(key);
      existingComponents.push({
        componentId: `ing-${ingredient.ingredientId}`,
        role: suggested,
        name: ingredient.name,
        relationship: "intrinsic",
        source: "main_recipe",
        reason: `Intrinsic recipe ingredient (${ingredient.role})`,
        quantityMode: "recipe_defined",
        definitionKind: "atomic_food",
        normalizedComponentKey: key,
      });
    }
  }

  // Moisture / sauce from experience profile and PLAN-008 condiment components.
  if (recipe.experienceProfile.moistureLevel === "saucy") {
    roleFlags.hasSauceOrMoistureComponent = true;
  }
  if (
    recipe.flavorProfile.primarySauce != null &&
    recipe.flavorProfile.primarySauce.trim().length > 0
  ) {
    roleFlags.hasSauceOrMoistureComponent = true;
  }

  let nutritionSignals: CompositionNutritionSignals = {
    proteinPresence: roleFlags.hasPrimaryProtein ? "meaningful" : "low",
    carbohydratePresence: roleFlags.hasMeaningfulCarbohydrate ? "meaningful" : "low",
    fiberPresence: roleFlags.hasMeaningfulFiberSource ? "meaningful" : "low",
  };

  const perServing = recipeNutrition?.nutrition?.perBaseServing;
  if (perServing) {
    nutritionSignals = presenceFromMacros({
      proteinGrams: perServing.proteinGrams,
      carbohydrateGrams: perServing.carbohydrateGrams,
      fiberGrams: perServing.fiberGrams,
      caloriesKcal: perServing.caloriesKcal,
    });
    // Trusted fiber data overrides ingredient guessing.
    if (nutritionSignals.fiberPresence !== "low") {
      roleFlags.hasMeaningfulFiberSource = true;
    }
    if (nutritionSignals.carbohydratePresence === "low") {
      // Don't revoke PLAN-008 carb_side / tortilla detection — only reinforce lows when unknown.
    } else {
      roleFlags.hasMeaningfulCarbohydrate = true;
    }
    if (nutritionSignals.proteinPresence !== "low") {
      roleFlags.hasPrimaryProtein = true;
    }
  } else if (recipeNutrition) {
    // Prefer ingredient-level trusted fiber when totals incomplete.
    let fiberSum = 0;
    let fiberKnown = false;
    for (const row of recipeNutrition.ingredients) {
      if (row.nutrition?.fiberGrams != null) {
        fiberSum += row.nutrition.fiberGrams;
        fiberKnown = true;
      }
    }
    if (fiberKnown) {
      const perServingFiber = fiberSum / Math.max(recipe.baseServings, 1);
      nutritionSignals = {
        ...nutritionSignals,
        fiberPresence: perServingFiber >= 8 ? "high" : perServingFiber >= 3 ? "meaningful" : "low",
      };
      if (nutritionSignals.fiberPresence !== "low") {
        roleFlags.hasMeaningfulFiberSource = true;
      }
    }
  }

  // Dry mains without sauce component flag may still need condiment consideration —
  // reflected as hasSauceOrMoistureComponent false when moisture is dry and no sauce roles.
  if (
    recipe.experienceProfile.moistureLevel === "dry" &&
    !recipe.mealComponents.some((c) => c.type === "sauce" || c.type === "condiment")
  ) {
    // leave false unless ingredients already set it
  }

  return {
    profile: {
      ...roleFlags,
      addedComponentRoles: [],
    },
    nutritionSignals,
    existingComponents,
  };
}

export function missingRolesFromProfile(
  profile: MealCompositionProfile,
  nutritionSignals: CompositionNutritionSignals,
): MealComponentRole[] {
  const missing: MealComponentRole[] = [];
  if (!profile.hasMeaningfulCarbohydrate && nutritionSignals.carbohydratePresence === "low") {
    missing.push("carbohydrate");
  }
  if (!profile.hasMeaningfulVegetableOrFruit) {
    missing.push("vegetable");
  }
  if (
    !profile.hasMeaningfulFiberSource &&
    nutritionSignals.fiberPresence === "low" &&
    !missing.includes("vegetable")
  ) {
    // Fiber often arrives via vegetable/legume — signal vegetable if not already.
    missing.push("vegetable");
  }
  if (!profile.hasSauceOrMoistureComponent) {
    missing.push("sauce_condiment");
  }
  return missing;
}
