import type {
  PrepEquipment,
  PrepTask,
  ResolvedRecipe,
  ResolvedRecipeIngredient,
  TaskIngredientRequirement,
  WeeklyCookingRequirement,
} from "../../contracts/index.ts";
import { formatGroceryDisplay } from "../grocery/units.ts";
import {
  cutFormVerb,
  extractOvenTempF,
  extractPassiveMinutesFromText,
  inferCutForm,
  looksLikeMarinade,
  looksLikeSauceOrDressing,
  normalizeIngredientKey,
} from "./preparation-identity.ts";
import { scaleFactorForRequirement } from "./weekly-requirements.ts";

function scaleIngredient(
  ing: ResolvedRecipeIngredient,
  scale: number,
  meta: { recipeId: string; coreMealId: string },
): TaskIngredientRequirement {
  const quantity = ing.quantity * scale;
  const display = formatGroceryDisplay({ quantity, unit: ing.unit });
  return {
    ingredientId: ing.ingredientId,
    displayName: ing.name,
    quantity,
    unit: ing.unit,
    measurementState: ing.measurementState,
    preparation: ing.preparation ?? null,
    cutForm: inferCutForm(ing.preparation),
    displayQuantityLabel: display.displayLabel,
    recipeId: meta.recipeId,
    coreMealId: meta.coreMealId,
  };
}

function inferEquipment(recipe: ResolvedRecipe): PrepEquipment[] {
  const text = [
    ...recipe.instructions.map((i) => i.text),
    ...recipe.flavorProfile.cookingTechniques,
  ]
    .join(" ")
    .toLowerCase();
  const out: PrepEquipment[] = [];
  if (/oven|bake|roast|broil/.test(text)) out.push("oven");
  if (/air\s*fry/.test(text)) out.push("air_fryer");
  if (/instant\s*pot|pressure\s*cook/.test(text)) out.push("pressure_cooker");
  if (/skillet|saute|sauté|pan-fry|brown/.test(text)) out.push("skillet");
  if (/pot|simmer|boil|steam/.test(text)) out.push("pot");
  if (/blend|blender|puree|purée/.test(text)) out.push("blender");
  if (/sheet\s*pan|baking\s*sheet/.test(text)) out.push("sheet_pan");
  if (/stovetop|stove|burner/.test(text) || out.includes("skillet") || out.includes("pot")) {
    if (!out.includes("stovetop_burner")) out.push("stovetop_burner");
  }
  if (out.length === 0) out.push("other");
  return out;
}

function selectPrepMode(recipe: ResolvedRecipe, prepIntent?: string) {
  if (prepIntent) {
    const match = recipe.supportedPrepModes.find((m) => m.mode === prepIntent);
    if (match) return match;
  }
  // Prefer batch-friendly modes for prep session.
  return (
    recipe.supportedPrepModes.find((m) => m.mode === "fully_prepped") ??
    recipe.supportedPrepModes.find((m) => m.mode === "component_prepped") ??
    recipe.supportedPrepModes[0]
  );
}

function misePhaseGroup(ing: TaskIngredientRequirement): PrepTask["phaseGroup"] {
  const name = normalizeIngredientKey(ing.displayName);
  if (/chicken|beef|pork|lamb|fish|salmon|shrimp|turkey|tofu/.test(name)) return "proteins";
  if (/onion|garlic|ginger|pepper|tomato|cabbage|lettuce|herb|cilantro|parsley|carrot|celery|lemon|lime/.test(name)) {
    return "produce";
  }
  if (/spice|cumin|paprika|chili|salt|pepper|yogurt|oil|vinegar|sauce|marinade/.test(name)) {
    return "sauces_marinades";
  }
  if (/rice|quinoa|pasta|tortilla|bread|noodle/.test(name)) return "grains";
  return "other";
}

/**
 * Extract per-recipe prep tasks from resolved recipe truth + weekly scale.
 * Quantities always come from scaled recipe ingredients — never LLM invention.
 */
export function extractTasksForRequirement(input: {
  requirement: WeeklyCookingRequirement;
  recipe: ResolvedRecipe;
  cookingStyle?: string;
  maxFinishMinutes?: number | null;
}): PrepTask[] {
  const { requirement, recipe } = input;
  const scale = scaleFactorForRequirement(requirement);
  const mode = selectPrepMode(recipe, requirement.prepIntent);
  const equipment = inferEquipment(recipe);
  const ovenTemp = recipe.instructions
    .map((i) => extractOvenTempF(i.text))
    .find((t) => t != null);
  const tasks: PrepTask[] = [];
  const prefix = `prep_${requirement.coreMealId}`;

  const scaledIngredients = recipe.ingredients.map((ing) =>
    scaleIngredient(ing, scale, {
      recipeId: recipe.recipeId,
      coreMealId: requirement.coreMealId,
    }),
  );

  // Mise en place from ingredients with preparation notes (or proteins needing trim/cube).
  for (const ing of scaledIngredients) {
    const cut = ing.cutForm ?? inferCutForm(ing.preparation);
    const needsMise =
      Boolean(ing.preparation) ||
      cut !== "other" ||
      misePhaseGroup(ing) === "proteins";
    if (!needsMise) continue;

    const verb = cutFormVerb(cut === "other" ? "portioned" : cut);
    const title =
      cut === "other" || cut === "whole"
        ? `Prep ${ing.displayName}`
        : `${verb} ${ing.displayName}`;

    tasks.push({
      id: `${prefix}_mise_${ing.ingredientId}`,
      type: "mise_en_place",
      title: `${title} (${ing.displayQuantityLabel ?? `${ing.quantity} ${ing.unit}`})`,
      durationMinutes: estimateMiseMinutes(ing),
      dependencies: [],
      recipeIds: [recipe.recipeId],
      coreMealIds: [requirement.coreMealId],
      mealInstanceIds: [...requirement.mealInstanceIds],
      ingredients: [ing],
      equipment: ["cutting_board"],
      canRunInParallel: true,
      requiresAttention: false,
      instructions: [
        ing.preparation
          ? `${verb} ${ing.displayQuantityLabel ?? `${ing.quantity} ${ing.unit}`} ${ing.displayName} (${ing.preparation}).`
          : `${verb} ${ing.displayQuantityLabel ?? `${ing.quantity} ${ing.unit}`} ${ing.displayName}.`,
      ],
      allocations: [
        {
          coreMealId: requirement.coreMealId,
          mealName: requirement.name,
          quantityLabel: ing.displayQuantityLabel ?? `${ing.quantity} ${ing.unit}`,
        },
      ],
      phaseGroup: misePhaseGroup(ing),
    });
  }

  // Advance prep from prep-mode advance tasks + marinade detection.
  const advanceTexts = mode?.advanceTasks?.length
    ? mode.advanceTasks
    : recipe.instructions
        .filter((s) => looksLikeMarinade(s.text) || looksLikeSauceOrDressing(s.text))
        .map((s) => s.text);

  let previousAdvanceId: string | undefined;
  advanceTexts.forEach((text, idx) => {
    const isMarinade = looksLikeMarinade(text);
    const passive =
      extractPassiveMinutesFromText(text) ??
      (isMarinade ? 30 : undefined);
    const id = `${prefix}_advance_${idx}`;
    const deps: string[] = [];
    // Marinades depend on protein mise when present.
    const proteinMise = tasks.find(
      (t) => t.type === "mise_en_place" && t.phaseGroup === "proteins",
    );
    if (proteinMise && isMarinade) deps.push(proteinMise.id);
    if (previousAdvanceId) deps.push(previousAdvanceId);

    tasks.push({
      id,
      type: "advance_prep",
      title: summarizeAdvanceTitle(text, requirement.name),
      durationMinutes: isMarinade ? 7 : 5,
      passiveMinutes: passive,
      dependencies: deps,
      recipeIds: [recipe.recipeId],
      coreMealIds: [requirement.coreMealId],
      mealInstanceIds: [...requirement.mealInstanceIds],
      ingredients: isMarinade
        ? scaledIngredients.filter((i) => misePhaseGroup(i) === "proteins").slice(0, 2)
        : [],
      equipment: ["mixing_bowl"],
      canRunInParallel: true,
      requiresAttention: false,
      instructions: [text],
      phaseGroup: "sauces_marinades",
    });
    previousAdvanceId = id;
  });

  // Decide cook-now vs fresh-finish from prep intent + cooking style + mealPrepQuality.
  const deferCook = shouldDeferPrimaryCook({
    prepIntent: requirement.prepIntent ?? mode?.mode,
    cookingStyle: input.cookingStyle,
    mealPrepQuality: recipe.experienceProfile.mealPrepQuality,
    maxFinishMinutes: input.maxFinishMinutes,
    finishTimeMinutes: mode?.finishTimeMinutes,
  });

  const cookDeps: string[] = [];
  const lastAdvance = [...tasks].reverse().find((t) => t.type === "advance_prep");
  if (lastAdvance) cookDeps.push(lastAdvance.id);
  // Also depend on mise for this recipe.
  for (const t of tasks) {
    if (t.type === "mise_en_place") cookDeps.push(t.id);
  }

  if (!deferCook) {
    const cookId = `${prefix}_cook`;
    tasks.push({
      id: cookId,
      type: "cook",
      title: `Cook ${requirement.name}`,
      durationMinutes: Math.max(5, Math.round(recipe.cookTimeMinutes * Math.min(scale, 1.25))),
      passiveMinutes: recipe.cookTimeMinutes >= 15 ? Math.round(recipe.cookTimeMinutes * 0.6) : undefined,
      dependencies: unique(cookDeps),
      recipeIds: [recipe.recipeId],
      coreMealIds: [requirement.coreMealId],
      mealInstanceIds: [...requirement.mealInstanceIds],
      ingredients: scaledIngredients,
      equipment,
      canRunInParallel: !equipment.includes("stovetop_burner") || equipment.includes("oven"),
      requiresAttention:
        equipment.includes("skillet") ||
        equipment.includes("stovetop_burner") ||
        equipment.includes("pot") ||
        (!equipment.includes("oven") && !equipment.includes("air_fryer") && !equipment.includes("pressure_cooker")),
      ovenTemperatureF: ovenTemp,
      instructions: recipe.instructions.map((s) => s.text).slice(0, 12),
      output: {
        outputId: `${prefix}_output`,
        label: requirement.name,
        recipeIds: [recipe.recipeId],
        coreMealIds: [requirement.coreMealId],
        quantityServings: requirement.plannedCookOutputServings,
      },
    });

    // Portion & store tasks are created later from storage assignments;
    // add a per-meal store parent that depends on cook.
    tasks.push({
      id: `${prefix}_store`,
      type: "portion_and_store",
      title: `Portion and store ${requirement.name}`,
      durationMinutes: Math.max(3, requirement.weeklyInstanceCount * 2),
      dependencies: [cookId],
      recipeIds: [recipe.recipeId],
      coreMealIds: [requirement.coreMealId],
      mealInstanceIds: [...requirement.mealInstanceIds],
      ingredients: [],
      equipment: [],
      canRunInParallel: true,
      requiresAttention: false,
      instructions: [
        recipe.storageInstructions ??
          mode?.storageInstructions ??
          "Cool, portion into containers, and store per plan.",
      ],
      output: {
        outputId: `${prefix}_portioned`,
        label: `${requirement.name} portions`,
        recipeIds: [recipe.recipeId],
        coreMealIds: [requirement.coreMealId],
        quantityServings: requirement.plannedCookOutputServings,
      },
    });
  } else {
    // Fresh finish: prep components now; cook/assemble later.
    const finishTasks =
      mode?.finishTasks?.length ? mode.finishTasks : ["Cook and finish fresh", "Assemble and serve"];
    for (const inst of requirement.instanceServings) {
      tasks.push({
        id: `${prefix}_finish_${inst.mealInstanceId}`,
        type: "fresh_finish",
        title: `Finish ${requirement.name} (${inst.day} ${inst.mealType})`,
        durationMinutes: mode?.finishTimeMinutes ?? 12,
        dependencies: unique(cookDeps),
        recipeIds: [recipe.recipeId],
        coreMealIds: [requirement.coreMealId],
        mealInstanceIds: [inst.mealInstanceId],
        ingredients: [],
        equipment,
        canRunInParallel: false,
        requiresAttention: true,
        instructions: finishTasks,
      });
    }

    // Still portion any advance-prepped components.
    if (advanceTexts.length > 0 || tasks.some((t) => t.type === "mise_en_place")) {
      const storeDeps = tasks
        .filter((t) => t.type === "advance_prep" || t.type === "mise_en_place")
        .map((t) => t.id);
      tasks.push({
        id: `${prefix}_store_components`,
        type: "portion_and_store",
        title: `Store prepped components for ${requirement.name}`,
        durationMinutes: 5,
        dependencies: unique(storeDeps),
        recipeIds: [recipe.recipeId],
        coreMealIds: [requirement.coreMealId],
        mealInstanceIds: [...requirement.mealInstanceIds],
        ingredients: [],
        equipment: [],
        canRunInParallel: true,
        requiresAttention: false,
        instructions: [
          "Store prepped components separately. Finish cooking on the eating day.",
        ],
      });
    }
  }

  return tasks;
}

function shouldDeferPrimaryCook(input: {
  prepIntent?: string;
  cookingStyle?: string;
  mealPrepQuality: string;
  maxFinishMinutes?: number | null;
  finishTimeMinutes?: number;
}): boolean {
  const finish = input.finishTimeMinutes ?? 15;
  const maxFinish = input.maxFinishMinutes;

  // Component-prepped: always prep/store components now; finish on the eating day.
  if (input.prepIntent === "component_prepped") return true;

  // Fresh / quick finish: defer when the finish fits the user's budget.
  if (input.prepIntent === "fresh") return true;
  if (input.prepIntent === "quick_fresh_finish") {
    if (maxFinish === 0) return false; // mostly_ready — should not be in repertoire
    const budget = maxFinish ?? 20;
    return finish <= budget;
  }

  if (input.cookingStyle === "mostly_ready") return false;
  if (input.cookingStyle === "fresh_focused") {
    return input.mealPrepQuality === "poor";
  }
  // ready_lunch_fresh_dinner / default for fully_prepped: cook ahead.
  if (input.mealPrepQuality === "poor") return true;
  return false;
}

function estimateMiseMinutes(ing: TaskIngredientRequirement): number {
  const group = misePhaseGroup(ing);
  if (group === "proteins") return 8;
  if (group === "produce") return 5;
  if (group === "sauces_marinades") return 3;
  return 4;
}

function summarizeAdvanceTitle(text: string, mealName: string): string {
  if (looksLikeMarinade(text)) return `Marinate for ${mealName}`;
  if (looksLikeSauceOrDressing(text)) {
    const short = text.length > 60 ? `${text.slice(0, 57)}…` : text;
    return short;
  }
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
