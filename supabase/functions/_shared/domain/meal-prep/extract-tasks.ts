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
  return (
    recipe.supportedPrepModes.find((m) => m.mode === "fully_prepped") ??
    recipe.supportedPrepModes.find((m) => m.mode === "component_prepped") ??
    recipe.supportedPrepModes[0]
  );
}

function ingredientGroup(ing: TaskIngredientRequirement): PrepTask["phaseGroup"] {
  const name = normalizeIngredientKey(ing.displayName);
  if (/chicken|beef|pork|lamb|fish|salmon|shrimp|turkey|tofu|paneer/.test(name)) {
    return "proteins";
  }
  if (
    /onion|garlic|ginger|pepper|tomato|cabbage|lettuce|herb|cilantro|parsley|carrot|celery|lemon|lime/.test(
      name,
    )
  ) {
    return "produce";
  }
  if (/spice|cumin|paprika|chili|salt|pepper|yogurt|oil|vinegar|sauce|marinade/.test(name)) {
    return "sauces_marinades";
  }
  if (/rice|quinoa|pasta|tortilla|bread|noodle/.test(name)) return "grains";
  return "other";
}

function needsPhysicalPrep(ing: TaskIngredientRequirement): boolean {
  const cut = ing.cutForm ?? inferCutForm(ing.preparation);
  return Boolean(ing.preparation) || (cut !== "other" && cut !== "whole");
}

function prepInstructionFor(ing: TaskIngredientRequirement): string {
  const cut = ing.cutForm ?? inferCutForm(ing.preparation);
  const verb = cutFormVerb(cut === "other" || cut === "whole" ? "portioned" : cut);
  const qty = ing.displayQuantityLabel ?? `${ing.quantity} ${ing.unit}`;
  if (ing.preparation) {
    return `${verb} ${qty} ${ing.displayName} (${ing.preparation}).`;
  }
  return `${verb} ${qty} ${ing.displayName}.`;
}

function ingredientMentionedInText(ing: TaskIngredientRequirement, text: string): boolean {
  const name = normalizeIngredientKey(ing.displayName);
  const hay = text.toLowerCase();
  if (!name) return false;
  // Match primary token(s) from the ingredient name.
  const tokens = name.split(/\s+/).filter((t) => t.length > 2);
  return tokens.some((t) => hay.includes(t));
}

function isMarinadeInstruction(text: string): boolean {
  return looksLikeMarinade(text) || /marinade|marinate|coat.*and.*rest|rest\s+\d+\s*min/i.test(text);
}

/**
 * Extract guided execution steps for one core meal.
 *
 * Just-in-time principle: ingredient preparation lives inside the step that uses it
 * (or the immediately preceding marinate/cook step). No global mise-en-place phase.
 * Quantities always come from scaled recipe ingredients.
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

  const instructionTexts = recipe.instructions.map((s) => s.text);
  const marinadeTexts = [
    ...(mode?.advanceTasks ?? []).filter((t) => isMarinadeInstruction(t) || looksLikeSauceOrDressing(t)),
    ...instructionTexts.filter((t) => isMarinadeInstruction(t)),
  ];
  // Prefer mode advance tasks when present; fall back to instruction-derived marinade lines.
  const advanceSource =
    mode?.advanceTasks?.length && mode.advanceTasks.some((t) => isMarinadeInstruction(t))
      ? mode.advanceTasks.filter((t) => isMarinadeInstruction(t) || looksLikeSauceOrDressing(t))
      : marinadeTexts.length > 0
        ? [...new Set(marinadeTexts)]
        : [];

  const hasMarinade = advanceSource.some((t) => isMarinadeInstruction(t));
  const marinadeBlob = advanceSource.join(" ").toLowerCase();

  const proteinIngredients = scaledIngredients.filter((i) => ingredientGroup(i) === "proteins");
  const marinadeIngredients: TaskIngredientRequirement[] = [];
  const cookIngredients: TaskIngredientRequirement[] = [];

  for (const ing of scaledIngredients) {
    if (!hasMarinade) {
      cookIngredients.push(ing);
      continue;
    }
    const forMarinade =
      ingredientGroup(ing) === "proteins" ||
      ingredientMentionedInText(ing, marinadeBlob) ||
      (ingredientGroup(ing) === "sauces_marinades" &&
        /yogurt|lemon|lime|spice|garlic|ginger|oil|salt/.test(normalizeIngredientKey(ing.displayName)));
    // Keep late garnishes / grains / cilantro-like herbs for cook unless named in marinade.
    const lateGarnish =
      /cilantro|parsley|herb|scallion|green onion|tortilla|rice|bread|slaw/.test(
        normalizeIngredientKey(ing.displayName),
      ) && !ingredientMentionedInText(ing, marinadeBlob);
    if (forMarinade && !lateGarnish) {
      marinadeIngredients.push(ing);
    } else {
      cookIngredients.push(ing);
    }
  }

  // Ensure proteins always land on marinade when marinating.
  if (hasMarinade) {
    for (const p of proteinIngredients) {
      if (!marinadeIngredients.some((i) => i.ingredientId === p.ingredientId)) {
        marinadeIngredients.push(p);
        const idx = cookIngredients.findIndex((i) => i.ingredientId === p.ingredientId);
        if (idx >= 0) cookIngredients.splice(idx, 1);
      }
    }
  }

  let previousStepId: string | undefined;

  if (hasMarinade && marinadeIngredients.length > 0) {
    const passive =
      advanceSource
        .map((t) => extractPassiveMinutesFromText(t))
        .find((m) => m != null) ?? 30;
    const prepLines = marinadeIngredients.filter(needsPhysicalPrep).map(prepInstructionFor);
    const doThis = [
      ...prepLines,
      ...advanceSource.map((t) => t.replace(/\.$/, "")),
      `Cover and refrigerate. Let marinate for at least ${passive} minutes.`,
    ];
    const marinateId = `${prefix}_marinate`;
    tasks.push({
      id: marinateId,
      type: "advance_prep",
      title: summarizeMarinateTitle(requirement.name, proteinIngredients[0]?.displayName),
      durationMinutes: Math.max(5, prepLines.length * 2 + 3),
      passiveMinutes: passive,
      dependencies: [],
      recipeIds: [recipe.recipeId],
      coreMealIds: [requirement.coreMealId],
      mealInstanceIds: [...requirement.mealInstanceIds],
      ingredients: marinadeIngredients,
      equipment: uniqueEquipment(["cutting_board", "mixing_bowl"]),
      canRunInParallel: true,
      requiresAttention: false,
      instructions: doThis.slice(0, 20),
      phaseGroup: "sauces_marinades",
      output: {
        outputId: `${prefix}_marinated`,
        label: `Marinated ${proteinIngredients[0]?.displayName ?? requirement.name}`,
        recipeIds: [recipe.recipeId],
        coreMealIds: [requirement.coreMealId],
        quantityServings: requirement.plannedCookOutputServings,
      },
    });
    previousStepId = marinateId;
  }

  const deferCook = shouldDeferPrimaryCook({
    prepIntent: requirement.prepIntent ?? mode?.mode,
    cookingStyle: input.cookingStyle,
    mealPrepQuality: recipe.experienceProfile.mealPrepQuality,
    maxFinishMinutes: input.maxFinishMinutes,
    finishTimeMinutes: mode?.finishTimeMinutes,
  });

  const cookInstructionSource = instructionTexts.filter((t) => !isMarinadeInstruction(t));
  const cookLines =
    cookInstructionSource.length > 0
      ? cookInstructionSource
      : recipe.instructions.map((s) => s.text).filter((t) => !isMarinadeInstruction(t));

  if (!deferCook) {
    const jitPrep = cookIngredients.filter(needsPhysicalPrep).map(prepInstructionFor);
    const doThis = [
      ...(jitPrep.length > 0 ? ["Prepare ingredients:", ...jitPrep] : []),
      ...(previousStepId
        ? [`Use the marinated ${proteinIngredients[0]?.displayName ?? "protein"} from the previous step.`]
        : []),
      ...cookLines,
    ].slice(0, 20);

    const cookId = `${prefix}_cook`;
    const cookDeps = previousStepId ? [previousStepId] : [];
    const activeMinutes = Math.max(
      8,
      Math.round(recipe.cookTimeMinutes * Math.min(scale, 1.25) * 0.45) + jitPrep.length * 2,
    );
    const passiveMinutes =
      recipe.cookTimeMinutes >= 15
        ? Math.max(5, Math.round(recipe.cookTimeMinutes * 0.55))
        : undefined;

    tasks.push({
      id: cookId,
      type: "cook",
      title: cookStepTitle(requirement.name),
      durationMinutes: activeMinutes,
      passiveMinutes,
      dependencies: cookDeps,
      recipeIds: [recipe.recipeId],
      coreMealIds: [requirement.coreMealId],
      mealInstanceIds: [...requirement.mealInstanceIds],
      ingredients: cookIngredients,
      equipment,
      canRunInParallel: !equipment.includes("stovetop_burner") || equipment.includes("oven"),
      requiresAttention:
        equipment.includes("skillet") ||
        equipment.includes("stovetop_burner") ||
        equipment.includes("pot") ||
        (!equipment.includes("oven") &&
          !equipment.includes("air_fryer") &&
          !equipment.includes("pressure_cooker")),
      ovenTemperatureF: ovenTemp,
      instructions: doThis,
      output: {
        outputId: `${prefix}_output`,
        label: requirement.name,
        recipeIds: [recipe.recipeId],
        coreMealIds: [requirement.coreMealId],
        quantityServings: requirement.plannedCookOutputServings,
      },
    });
    previousStepId = cookId;

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
    // Component / fresh finish: prep now (JIT inside component steps), cook later.
    const componentIngredients = [...marinadeIngredients, ...cookIngredients];
    const uniqueById = new Map(componentIngredients.map((i) => [i.ingredientId, i]));
    const components = [...uniqueById.values()];
    const jitPrep = components.filter(needsPhysicalPrep).map(prepInstructionFor);
    const componentId = `${prefix}_prep_components`;
    const componentDeps = previousStepId ? [previousStepId] : [];
    tasks.push({
      id: componentId,
      type: "advance_prep",
      title: `Prep components for ${requirement.name}`,
      durationMinutes: Math.max(8, jitPrep.length * 3 + 4),
      dependencies: componentDeps,
      recipeIds: [recipe.recipeId],
      coreMealIds: [requirement.coreMealId],
      mealInstanceIds: [...requirement.mealInstanceIds],
      ingredients: components,
      equipment: uniqueEquipment(["cutting_board", "mixing_bowl", ...equipment.slice(0, 2)]),
      canRunInParallel: true,
      requiresAttention: false,
      instructions: [
        ...jitPrep,
        ...(mode?.advanceTasks?.length
          ? mode.advanceTasks
          : ["Prep and store components for cooking on the eating day."]),
        "Store components separately. Finish cooking on the eating day.",
      ].slice(0, 20),
      phaseGroup: "other",
      output: {
        outputId: `${prefix}_components`,
        label: `${requirement.name} components`,
        recipeIds: [recipe.recipeId],
        coreMealIds: [requirement.coreMealId],
        quantityServings: requirement.plannedCookOutputServings,
      },
    });

    tasks.push({
      id: `${prefix}_store_components`,
      type: "portion_and_store",
      title: `Store prepped components for ${requirement.name}`,
      durationMinutes: 5,
      dependencies: [componentId],
      recipeIds: [recipe.recipeId],
      coreMealIds: [requirement.coreMealId],
      mealInstanceIds: [...requirement.mealInstanceIds],
      ingredients: [],
      equipment: [],
      canRunInParallel: true,
      requiresAttention: false,
      instructions: [
        "Label and refrigerate or freeze components per the storage plan. Finish cooking on the eating day.",
      ],
    });

    const finishTasks =
      mode?.finishTasks?.length ? mode.finishTasks : ["Cook and finish fresh", "Assemble and serve"];
    for (const inst of requirement.instanceServings) {
      tasks.push({
        id: `${prefix}_finish_${inst.mealInstanceId}`,
        type: "fresh_finish",
        title: `Finish ${requirement.name} (${inst.day} ${inst.mealType})`,
        durationMinutes: mode?.finishTimeMinutes ?? 12,
        dependencies: [componentId],
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
  }

  return tasks;
}

function uniqueEquipment(items: PrepEquipment[]): PrepEquipment[] {
  const out: PrepEquipment[] = [];
  for (const item of items) {
    if (!out.includes(item)) out.push(item);
  }
  return out.length > 0 ? out : ["other"];
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

  if (input.prepIntent === "component_prepped") return true;
  if (input.prepIntent === "fresh") return true;
  if (input.prepIntent === "quick_fresh_finish") {
    if (maxFinish === 0) return false;
    const budget = maxFinish ?? 20;
    return finish <= budget;
  }

  if (input.cookingStyle === "mostly_ready") return false;
  if (input.cookingStyle === "fresh_focused") {
    return input.mealPrepQuality === "poor";
  }
  if (input.mealPrepQuality === "poor") return true;
  return false;
}

function summarizeMarinateTitle(mealName: string, proteinName?: string): string {
  if (proteinName) return `Marinate the ${proteinName}`;
  return `Marinate for ${mealName}`;
}

function cookStepTitle(mealName: string): string {
  return `Cook ${mealName}`;
}

// Re-export helpers used by tests / consolidate
export { needsPhysicalPrep, prepInstructionFor, ingredientGroup };
