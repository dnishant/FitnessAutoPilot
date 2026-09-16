import type {
  CompleteMeal,
  CompleteMealComponent,
  ComposeMealsRequest,
  MealCompositionDiagnostics,
  MealCompositionFailure,
  MealCompositionProposal,
  MealCompositionRequest,
  WeeklyMealCompositionResult,
} from "../../contracts/index.ts";
import {
  DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
  FIBER_POLICY_VERSION,
  MEAL_COMPOSITION_POLICY_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
} from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";
import type { FoodResolver } from "../food-resolution/food-resolver.ts";
import { calculateFiberTarget } from "../nutrition/fiber.ts";
import { mapWithConcurrency } from "../recipes/recipe-resolution.ts";
import {
  buildNormalizedComponentKey,
  namesLikelyEquivalent,
} from "./component-identity.ts";
import { buildComponentDefinition, resolveAddedComponent } from "./component-resolution.ts";
import type { MealCompositionProvider } from "./provider.ts";
import {
  detectExistingMealRoles,
  missingRolesFromProfile,
  type DetectedExistingComponent,
} from "./role-detection.ts";
import {
  mealCompositionError,
  validateMealCompositionProposal,
  type MealCompositionError,
} from "./validate.ts";

export {
  DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
  MEAL_COMPOSITION_POLICY_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
};
export { buildMealCompositionPrompt } from "./prompt.ts";
export type { MealCompositionProvider } from "./provider.ts";
export {
  detectExistingMealRoles,
  missingRolesFromProfile,
} from "./role-detection.ts";
export {
  validateMealCompositionProposal,
  mealCompositionError,
  stripCompositionNutrition,
  type MealCompositionError,
  type MealCompositionErrorCode,
} from "./validate.ts";
export {
  buildNormalizedComponentKey,
  normalizeComponentName,
  looksLikeCompoundComponent,
  namesLikelyEquivalent,
  mapPlan008TypeToRole,
} from "./component-identity.ts";
export { buildComponentDefinition, resolveAddedComponent } from "./component-resolution.ts";

function toCompleteComponents(
  existing: DetectedExistingComponent[],
): CompleteMealComponent[] {
  return existing.map((c) => ({
    componentId: c.componentId,
    role: c.role,
    name: c.name,
    relationship: c.relationship,
    source: c.source,
    reason: c.reason,
    quantityMode: c.quantityMode,
    definitionKind: c.definitionKind,
    normalizedComponentKey: c.normalizedComponentKey,
    resolution: {
      status: "skipped_intrinsic" as const,
      note:
        c.source === "main_recipe"
          ? "Main / intrinsic recipe coverage."
          : "PLAN-008 meal component retained.",
    },
  }));
}

function mergeProposalIntoMeal(input: {
  request: MealCompositionRequest;
  proposal: MealCompositionProposal;
  existing: DetectedExistingComponent[];
  providerMeta: {
    provider?: string;
    model?: string;
    requestId?: string;
    durationMs?: number;
  };
  createdAt: string;
}): Result<CompleteMeal, MealCompositionError> {
  const components = toCompleteComponents(input.existing);
  const addedRoles: CompleteMeal["compositionProfile"]["addedComponentRoles"] = [];
  let idx = 0;

  for (const added of input.proposal.addedComponents) {
    // Skip if equivalent already present (belt-and-suspenders).
    if (
      components.some(
        (c) => c.role === added.role && namesLikelyEquivalent(c.name, added.name),
      )
    ) {
      continue;
    }

    const definitionResult = buildComponentDefinition(added);
    if (!definitionResult.ok) return definitionResult;

    const componentId = `added-${idx}-${added.role}`;
    idx += 1;
    addedRoles.push(added.role);
    components.push({
      componentId,
      role: added.role,
      name: added.name,
      relationship: added.relationship,
      source: "composition_engine",
      reason: added.reason,
      quantityMode: "solver_determined",
      definitionKind: added.definitionKind,
      normalizedComponentKey: buildNormalizedComponentKey(added.role, added.name),
      definition: definitionResult.value,
    });
  }

  const profile = {
    ...(input.request.compositionContext?.existingRoles ??
      detectExistingMealRoles(input.request.recipe).profile),
    addedComponentRoles: addedRoles,
  };

  // Recompute completeness flags after additions.
  for (const role of addedRoles) {
    if (role === "carbohydrate") profile.hasMeaningfulCarbohydrate = true;
    if (role === "vegetable" || role === "fruit") {
      profile.hasMeaningfulVegetableOrFruit = true;
      profile.hasMeaningfulFiberSource = true;
    }
    if (role === "legume") {
      profile.hasMeaningfulVegetableOrFruit = true;
      profile.hasMeaningfulFiberSource = true;
      profile.hasMeaningfulCarbohydrate = true;
    }
    if (role === "sauce_condiment") profile.hasSauceOrMoistureComponent = true;
  }

  return ok({
    mealId: `meal-${input.request.recipe.candidateId}`,
    candidateId: input.request.recipe.candidateId,
    mainRecipeId: input.request.recipe.recipeId,
    name: input.proposal.mealName || input.request.recipe.name,
    mealType: input.request.mealType,
    components,
    compositionProfile: profile,
    nutritionSignals: input.request.compositionContext?.nutritionSignals,
    metadata: {
      provider: input.providerMeta.provider,
      model: input.providerMeta.model,
      promptVersion: MEAL_COMPOSITION_PROMPT_VERSION,
      policyVersion: MEAL_COMPOSITION_POLICY_VERSION,
      requestId: input.providerMeta.requestId,
      durationMs: input.providerMeta.durationMs,
      createdAt: input.createdAt,
    },
  });
}

export type ComposeCompleteMealOptions = {
  provider: MealCompositionProvider;
  foodResolver?: FoodResolver | null;
  resolveAddedComponents?: boolean;
  providerMeta?: {
    provider?: string;
    model?: string;
    requestId?: string;
  };
  existingComponentKeys?: string[];
  otherSelectedMealNames?: string[];
  now?: () => Date;
};

export async function composeCompleteMeal(
  request: MealCompositionRequest,
  options: ComposeCompleteMealOptions,
): Promise<Result<CompleteMeal, MealCompositionError>> {
  const detected = detectExistingMealRoles(request.recipe, request.recipeNutrition);
  const enrichedRequest: MealCompositionRequest = {
    ...request,
    compositionContext: {
      otherSelectedMealNames:
        request.compositionContext?.otherSelectedMealNames ??
        options.otherSelectedMealNames,
      existingComponentKeys:
        request.compositionContext?.existingComponentKeys ??
        options.existingComponentKeys,
      existingRoles: request.compositionContext?.existingRoles ?? detected.profile,
      nutritionSignals:
        request.compositionContext?.nutritionSignals ?? detected.nutritionSignals,
    },
  };

  let proposal: MealCompositionProposal;
  const started = Date.now();
  try {
    // If deterministically complete and no missing roles, skip provider (still allow provider override if caller wants — we call provider only when gaps exist OR moisture dry).
    const missing = missingRolesFromProfile(detected.profile, detected.nutritionSignals);
    const likelyComplete =
      missing.length === 0 &&
      detected.profile.hasPrimaryProtein &&
      detected.profile.hasMeaningfulCarbohydrate &&
      detected.profile.hasMeaningfulVegetableOrFruit;

    if (likelyComplete) {
      proposal = {
        mealName: request.recipe.name,
        alreadySatisfiedRoles: [
          "main",
          ...(detected.profile.hasMeaningfulCarbohydrate ? (["carbohydrate"] as const) : []),
          ...(detected.profile.hasMeaningfulVegetableOrFruit ? (["vegetable"] as const) : []),
          ...(detected.profile.hasSauceOrMoistureComponent
            ? (["sauce_condiment"] as const)
            : []),
        ],
        missingRoles: [],
        addedComponents: [],
        compositionSummary: "Meal already substantially complete; no additions required.",
        noAdditionsNeeded: true,
      };
    } else {
      proposal = await options.provider.compose(enrichedRequest);
    }
  } catch (error) {
    return err(
      mealCompositionError(
        "COMPOSITION_PROVIDER_ERROR",
        error instanceof Error ? error.message : "Meal composition provider failed.",
        { candidateId: request.recipe.candidateId },
      ),
    );
  }

  const validated = validateMealCompositionProposal(proposal, enrichedRequest);
  if (!validated.ok) {
    return err({
      ...validated.error,
      candidateId: request.recipe.candidateId,
      candidateName: request.recipe.name,
    });
  }

  const mealResult = mergeProposalIntoMeal({
    request: enrichedRequest,
    proposal: validated.value,
    existing: detected.existingComponents,
    providerMeta: {
      provider: options.providerMeta?.provider ?? "unknown",
      model: options.providerMeta?.model,
      requestId: options.providerMeta?.requestId,
      durationMs: Date.now() - started,
    },
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
  });
  if (!mealResult.ok) return mealResult;

  const resolvedComponents: CompleteMealComponent[] = [];
  for (const component of mealResult.value.components) {
    resolvedComponents.push(
      await resolveAddedComponent(component, {
        foodResolver: options.foodResolver,
        resolveAddedComponents: options.resolveAddedComponents !== false,
      }),
    );
  }

  return ok({
    ...mealResult.value,
    components: resolvedComponents,
  });
}

export type ComposeWeeklyMealsInput = Omit<ComposeMealsRequest, "mealType"> & {
  mealType?: ComposeMealsRequest["mealType"];
  provider: MealCompositionProvider;
  foodResolver?: FoodResolver | null;
  providerMeta?: { provider?: string; model?: string };
};

export async function composeWeeklyMeals(
  input: ComposeWeeklyMealsInput,
): Promise<{
  result: WeeklyMealCompositionResult;
  failures: MealCompositionFailure[];
}> {
  const concurrency = input.concurrency ?? DEFAULT_MEAL_COMPOSITION_CONCURRENCY;
  const ids =
    input.uniqueCandidateIds ??
    [...new Set(input.recipes.map((r) => r.candidateId))];
  const byId = new Map(input.recipes.map((r) => [r.candidateId, r]));
  const selected = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null);

  const otherNames = selected.map((r) => r.name);
  const sharedComponentsByKey: Record<string, CompleteMealComponent> = {};
  const mealsByCandidateId: Record<string, CompleteMeal> = {};
  const failures: MealCompositionFailure[] = [];
  let compositionProviderCalls = 0;
  let mealsAlreadyComplete = 0;
  let mealsWithAddedComponents = 0;
  let totalAddedComponents = 0;
  let reusedComponents = 0;
  let atomicComponents = 0;
  let recipeComponents = 0;
  let unresolvedComponents = 0;

  // Sequential-enough with bounded concurrency, but shared registry needs careful updates.
  // Process with concurrency while collecting; merge shared keys after each meal on the main loop.
  const results = await mapWithConcurrency(selected, concurrency, async (recipe) => {
    const existingKeys = Object.keys(sharedComponentsByKey);
    const request: MealCompositionRequest = {
      mealType: input.mealType ?? "dinner",
      recipe,
      recipeNutrition: input.nutritionByCandidateId?.[recipe.candidateId],
      cuisineFamily: recipe.flavorProfile.cuisineFamily,
      regionalStyle: recipe.flavorProfile.regionalStyle,
      allergies: input.allergies ?? [],
      dietaryRestrictions: input.dietaryRestrictions ?? [],
      dislikes: input.dislikes ?? [],
      cookingStyleHint: input.cookingStyleHint,
      compositionContext: {
        existingRoles: detectExistingMealRoles(
          recipe,
          input.nutritionByCandidateId?.[recipe.candidateId],
        ).profile,
        nutritionSignals: detectExistingMealRoles(
          recipe,
          input.nutritionByCandidateId?.[recipe.candidateId],
        ).nutritionSignals,
        otherSelectedMealNames: otherNames.filter((n) => n !== recipe.name),
        existingComponentKeys: existingKeys,
      },
    };

    const detected = detectExistingMealRoles(
      recipe,
      input.nutritionByCandidateId?.[recipe.candidateId],
    );
    const missing = missingRolesFromProfile(detected.profile, detected.nutritionSignals);
    const willCallProvider = !(
      missing.length === 0 &&
      detected.profile.hasPrimaryProtein &&
      detected.profile.hasMeaningfulCarbohydrate &&
      detected.profile.hasMeaningfulVegetableOrFruit
    );
    if (willCallProvider) compositionProviderCalls += 1;

    const composed = await composeCompleteMeal(request, {
      provider: input.provider,
      foodResolver: input.foodResolver,
      resolveAddedComponents: input.resolveAddedComponents !== false,
      providerMeta: input.providerMeta,
      existingComponentKeys: existingKeys,
      otherSelectedMealNames: otherNames.filter((n) => n !== recipe.name),
    });

    return { recipe, composed, willCallProvider };
  });

  // Fix provider call counting — the concurrent increment races; recount from results.
  compositionProviderCalls = results.filter((r) => r.willCallProvider).length;

  for (const { recipe, composed } of results) {
    if (!composed.ok) {
      failures.push({
        candidateId: recipe.candidateId,
        candidateName: recipe.name,
        code: composed.error.code,
        message: composed.error.message,
        details: composed.error.details,
      });
      continue;
    }

    const meal = composed.value;
    // Reuse shared component identities when keys already exist.
    const remapped = meal.components.map((c) => {
      const existing = sharedComponentsByKey[c.normalizedComponentKey];
      if (existing && c.source === "composition_engine") {
        reusedComponents += 1;
        return { ...c, componentId: existing.componentId, definition: existing.definition ?? c.definition, resolution: existing.resolution ?? c.resolution };
      }
      if (c.source === "composition_engine") {
        sharedComponentsByKey[c.normalizedComponentKey] = c;
      }
      return c;
    });

    const finalMeal = { ...meal, components: remapped };
    mealsByCandidateId[recipe.candidateId] = finalMeal;

    const added = finalMeal.components.filter((c) => c.source === "composition_engine");
    if (added.length === 0) mealsAlreadyComplete += 1;
    else {
      mealsWithAddedComponents += 1;
      totalAddedComponents += added.length;
    }

    for (const c of finalMeal.components) {
      if (c.definitionKind === "atomic_food" && c.source === "composition_engine") {
        atomicComponents += 1;
      }
      if (c.definitionKind === "recipe_component" && c.source === "composition_engine") {
        recipeComponents += 1;
      }
      if (c.resolution?.status === "unresolved") unresolvedComponents += 1;
    }
  }

  const uniqueAddedComponents = Object.keys(sharedComponentsByKey).length;

  let fiberTarget: WeeklyMealCompositionResult["fiberTarget"];
  if (input.targetCalories != null) {
    const fiber = calculateFiberTarget({ targetCalories: input.targetCalories });
    if (fiber.ok) {
      fiberTarget = {
        fiberGrams: fiber.value.fiberGrams,
        targetCalories: fiber.value.targetCalories,
        policyVersion: FIBER_POLICY_VERSION,
        displayFiberGrams: fiber.value.displayFiberGrams,
      };
    }
  }

  const diagnostics: MealCompositionDiagnostics = {
    weeklyMealSlots: input.slotCount ?? input.recipes.length,
    uniqueMainRecipes: selected.length,
    compositionProviderCalls,
    mealsAlreadyComplete,
    mealsWithAddedComponents,
    totalAddedComponents,
    uniqueAddedComponents,
    reusedComponents,
    atomicComponents,
    recipeComponents,
    unresolvedComponents,
  };

  return {
    result: {
      mealsByCandidateId,
      uniqueCandidateIds: selected.map((r) => r.candidateId),
      sharedComponentsByKey,
      mealCount: Object.keys(mealsByCandidateId).length,
      slotCount: input.slotCount ?? input.recipes.length,
      diagnostics,
      fiberTarget,
      policyVersions: {
        mealComposition: MEAL_COMPOSITION_POLICY_VERSION,
        prompt: MEAL_COMPOSITION_PROMPT_VERSION,
        fiber: fiberTarget ? FIBER_POLICY_VERSION : undefined,
      },
    },
    failures,
  };
}
