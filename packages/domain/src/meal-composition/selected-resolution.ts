import type {
  CompleteMeal,
  CompleteMealComponent,
  CulinaryDiscoveryCandidate,
  MealConcept,
  MealConceptComponent,
  MealCompositionDiagnostics,
  MealCompositionFailure,
  ResolvedRecipe,
  WeeklyMealCompositionResult,
} from "@fitness-autopilot/contracts";
import {
  COMPONENT_RECIPE_PROMPT_VERSION,
  DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
  FIBER_POLICY_VERSION,
  MEAL_COMPOSITION_POLICY_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
} from "@fitness-autopilot/contracts";
import { calculateFiberTarget } from "../nutrition/fiber";
import type { FoodResolver } from "../food-resolution/food-resolver";
import { mapWithConcurrency } from "../recipes/recipe-resolution";
import { buildNormalizedComponentKey, namesLikelyEquivalent } from "./component-identity";
import {
  MockComponentRecipeProvider,
  type ComponentRecipeProvider,
  validateComponentDefinition,
} from "./component-recipe";
import { resolveAddedComponent } from "./component-resolution";
import {
  applyOwnershipToCompleteMeal,
  resolveNutritionOwnership,
} from "./nutrition-ownership";
import { isEdibleFoodIdentity } from "./edible-identity";
import { isUnresolvedPlaceholderName } from "./placeholders";
import { summarizeMealConceptRepertoire } from "./repertoire";
import { validateCompleteMealStructure } from "./structure-validation";
import { resolveCompleteMealNutrition } from "../meal-portioning/complete-meal-nutrition";

export type ResolveSelectedCompleteMealsInput = {
  concepts: readonly MealConcept[] | Record<string, MealConcept>;
  selectedCandidateIds: readonly string[];
  recipesByCandidateId?: Record<string, ResolvedRecipe>;
  candidatesById?:
    | ReadonlyMap<string, CulinaryDiscoveryCandidate>
    | Record<string, CulinaryDiscoveryCandidate>;
  componentRecipeProvider?: ComponentRecipeProvider;
  foodResolver?: FoodResolver | null;
  resolveAddedComponents?: boolean;
  concurrency?: number;
  slotCount?: number;
  targetCalories?: number;
};

function asConceptList(
  concepts: readonly MealConcept[] | Record<string, MealConcept>,
): MealConcept[] {
  return Array.isArray(concepts) ? [...concepts] : Object.values(concepts);
}

function lookupCandidate(
  id: string,
  lookup:
    | ReadonlyMap<string, CulinaryDiscoveryCandidate>
    | Record<string, CulinaryDiscoveryCandidate>
    | undefined,
): CulinaryDiscoveryCandidate | undefined {
  if (!lookup) return undefined;
  if (typeof (lookup as Map<string, CulinaryDiscoveryCandidate>).get === "function") {
    return (lookup as Map<string, CulinaryDiscoveryCandidate>).get(id);
  }
  return (lookup as Record<string, CulinaryDiscoveryCandidate>)[id];
}

function mapConceptSource(source: MealConceptComponent["source"]): CompleteMealComponent["source"] {
  if (source === "composition_engine") return "composition_engine";
  if (source === "existing_candidate_component") return "existing_recipe_component";
  return "main_recipe";
}

function conceptComponentToComplete(
  component: MealConceptComponent,
  understanding: MealConcept["mealUnderstanding"],
): CompleteMealComponent {
  const source = mapConceptSource(component.source);
  return {
    componentId: component.componentId,
    role: component.role,
    name: component.name,
    relationship: component.relationship,
    source,
    reason: component.reason,
    quantityMode:
      component.source === "composition_engine" ? "solver_determined" : "recipe_defined",
    definitionKind: component.definitionKind,
    normalizedComponentKey: component.normalizedComponentKey,
    nutritionOwnership:
      component.nutritionOwnership ??
      resolveNutritionOwnership({ component, understanding }),
    resolution:
      component.source === "composition_engine"
        ? undefined
        : {
            status: "skipped_intrinsic",
            note:
              source === "main_recipe"
                ? "Main / intrinsic recipe coverage."
                : "Existing candidate or PLAN-008 component retained.",
          },
  };
}

function fallbackCandidate(concept: MealConcept): CulinaryDiscoveryCandidate {
  return {
    candidateId: concept.candidateId,
    name: concept.name,
    source: { name: "unknown", url: "https://example.com/component" },
    cuisineFamily: "unknown",
    dishFormat: "plate",
    flavorFamilies: ["savory"],
    cookingTechniques: ["saute"],
    textureTags: [],
    experienceTags: [],
    whyItIsInteresting: concept.name,
    fitnessAdaptability: "moderate",
    fitnessAdaptabilityReason: "Selected meal component resolution.",
    mealPrepAdaptability: "component_prepped",
    noveltyReason: "Selected component.",
    discoveryConfidence: "medium",
  };
}

type UniqueAddedComponent = {
  key: string;
  component: MealConceptComponent;
  concept: MealConcept;
};

function collectUniqueAddedComponents(concepts: readonly MealConcept[]): UniqueAddedComponent[] {
  const unique: UniqueAddedComponent[] = [];
  const seen = new Set<string>();
  for (const concept of concepts) {
    for (const component of concept.components) {
      if (component.source !== "composition_engine") continue;
      if ((component.nutritionOwnership ?? "independent") !== "independent") continue;
      if (seen.has(component.normalizedComponentKey)) continue;
      seen.add(component.normalizedComponentKey);
      unique.push({ key: component.normalizedComponentKey, component, concept });
    }
  }
  return unique;
}

function mergeRecipeCompanions(
  complete: CompleteMealComponent[],
  recipe: ResolvedRecipe | undefined,
  understanding: MealConcept["mealUnderstanding"],
): CompleteMealComponent[] {
  if (!recipe) return complete;
  const next = [...complete];
  for (const mc of recipe.mealComponents) {
    if (mc.type === "main") continue;
    // Culinary needs / purpose prose are never edible CompleteMeal companions.
    if (mc.kind === "culinary_need") continue;
    if (!isEdibleFoodIdentity(mc.name) || isUnresolvedPlaceholderName(mc.name)) continue;
    const role =
      mc.type === "carb_side"
        ? "carbohydrate"
        : mc.type === "vegetable_side"
          ? "vegetable"
          : mc.type === "sauce" || mc.type === "condiment"
            ? "sauce_condiment"
            : mc.type === "garnish"
              ? "garnish"
              : "garnish";
    const key = buildNormalizedComponentKey(role, mc.name);
    if (
      next.some(
        (c) => c.normalizedComponentKey === key || namesLikelyEquivalent(c.name, mc.name),
      )
    ) {
      continue;
    }
    const relationship =
      mc.relationship === "intrinsic"
        ? "intrinsic"
        : mc.required
          ? "required_companion"
          : "recommended";
    next.push({
      componentId: mc.componentId,
      role,
      name: mc.name,
      relationship,
      source: "existing_recipe_component",
      reason: mc.purpose,
      quantityMode: mc.relationship === "intrinsic" ? "recipe_defined" : "solver_determined",
      definitionKind: "atomic_food",
      normalizedComponentKey: key,
      nutritionOwnership: resolveNutritionOwnership({
        component: {
          role,
          relationship,
          source: "existing_recipe_component",
        },
        understanding,
      }),
      resolution: {
        status: "skipped_intrinsic",
        note: "PLAN-008 edible meal component retained.",
      },
    });
  }
  return next;
}

export async function resolveSelectedCompleteMeals(
  input: ResolveSelectedCompleteMealsInput,
): Promise<{
  result: WeeklyMealCompositionResult;
  failures: MealCompositionFailure[];
  uniqueMainRecipesResolved: number;
  uniqueComponentRecipesResolved: number;
}> {
  const allConcepts = asConceptList(input.concepts);
  const byId = new Map(allConcepts.map((c) => [c.candidateId, c]));
  const selectedIds = [...new Set(input.selectedCandidateIds)];
  const selectedConcepts = selectedIds
    .map((id) => byId.get(id))
    .filter((c): c is MealConcept => c != null);

  const failures: MealCompositionFailure[] = [];
  for (const id of selectedIds) {
    if (!byId.has(id)) {
      failures.push({
        candidateId: id,
        candidateName: id,
        code: "INVALID_COMPOSITION_REQUEST",
        message: `No meal concept found for selected candidate "${id}".`,
      });
    }
  }

  const provider = input.componentRecipeProvider ?? new MockComponentRecipeProvider();
  const uniqueAdded = collectUniqueAddedComponents(selectedConcepts);
  const concurrency = input.concurrency ?? DEFAULT_MEAL_COMPOSITION_CONCURRENCY;
  const sharedComponentsByKey: Record<string, CompleteMealComponent> = {};

  const resolvedUnique = await mapWithConcurrency(uniqueAdded, concurrency, async (entry) => {
    const mapped = conceptComponentToComplete(entry.component, entry.concept.mealUnderstanding);
    const candidate =
      lookupCandidate(entry.concept.candidateId, input.candidatesById) ??
      fallbackCandidate(entry.concept);
    const definition = await provider.resolve({
      component: entry.component,
      candidate,
      cuisineFamily: candidate.cuisineFamily,
      mealName: entry.concept.name,
    });
    const validated = validateComponentDefinition(definition, entry.component);
    const withDefinition: CompleteMealComponent = {
      ...mapped,
      definition: validated.ok ? validated.value : undefined,
      resolution: validated.ok
        ? undefined
        : { status: "unresolved", note: validated.error.message },
    };
    const resolved = await resolveAddedComponent(withDefinition, {
      foodResolver: input.foodResolver,
      resolveAddedComponents: input.resolveAddedComponents === true,
    });
    return { key: entry.key, resolved, definitionKind: entry.component.definitionKind };
  });

  let uniqueComponentRecipesResolved = 0;
  for (const item of resolvedUnique) {
    sharedComponentsByKey[item.key] = item.resolved;
    if (item.definitionKind === "recipe_component") {
      uniqueComponentRecipesResolved += 1;
    }
  }

  const mealsByCandidateId: Record<string, CompleteMeal> = {};
  for (const concept of selectedConcepts) {
    let complete: CompleteMealComponent[] = [
      conceptComponentToComplete(concept.main, concept.mealUnderstanding),
    ];
    for (const component of concept.components) {
      if (
        !isEdibleFoodIdentity(component.name) ||
        isUnresolvedPlaceholderName(component.name)
      ) {
        continue;
      }
      if (
        complete.some(
          (c) =>
            c.normalizedComponentKey === component.normalizedComponentKey ||
            (c.role === component.role && namesLikelyEquivalent(c.name, component.name)),
        )
      ) {
        continue;
      }
      if (component.source === "composition_engine") {
        const shared = sharedComponentsByKey[component.normalizedComponentKey];
        complete.push(
          shared
            ? {
                ...shared,
                componentId: component.componentId,
                reason: component.reason,
                nutritionOwnership: component.nutritionOwnership ?? "independent",
              }
            : conceptComponentToComplete(component, concept.mealUnderstanding),
        );
      } else {
        complete.push(conceptComponentToComplete(component, concept.mealUnderstanding));
      }
    }
    complete = mergeRecipeCompanions(
      complete,
      input.recipesByCandidateId?.[concept.candidateId],
      concept.mealUnderstanding,
    );

    let meal: CompleteMeal = applyOwnershipToCompleteMeal({
      mealId: `meal-${concept.candidateId}`,
      candidateId: concept.candidateId,
      mainRecipeId:
        input.recipesByCandidateId?.[concept.candidateId]?.recipeId ??
        `pending-${concept.candidateId}`,
      name: concept.name,
      mealType: concept.mealType,
      components: complete,
      compositionProfile: concept.compositionProfile,
      mealUnderstanding: concept.mealUnderstanding,
      metadata: {
        provider: concept.metadata.provider,
        model: concept.metadata.model,
        promptVersion: concept.metadata.promptVersion,
        policyVersion: MEAL_COMPOSITION_POLICY_VERSION,
        componentRecipePromptVersion: COMPONENT_RECIPE_PROMPT_VERSION,
        requestId: concept.metadata.requestId,
        durationMs: concept.metadata.durationMs,
        createdAt: concept.metadata.createdAt,
      },
    });

    const structure = validateCompleteMealStructure(meal);
    if (!structure.ok) {
      failures.push({
        candidateId: concept.candidateId,
        candidateName: concept.name,
        code: structure.error.code,
        message: structure.error.message,
        details: structure.error.details,
      });
      continue;
    }
    meal = structure.value;
    mealsByCandidateId[concept.candidateId] = meal;
  }

  if (input.foodResolver && input.resolveAddedComponents === true) {
    const plate = await resolveCompleteMealNutrition({
      completeMealsByCandidateId: mealsByCandidateId,
      foodResolver: input.foodResolver,
    });
    for (const [id, meal] of Object.entries(plate.completeMealsByCandidateId)) {
      mealsByCandidateId[id] = meal;
    }
  }

  const selectedSummary = summarizeMealConceptRepertoire(selectedConcepts);
  const uniqueMainRecipesResolved = selectedIds.filter(
    (id) => input.recipesByCandidateId?.[id] != null,
  ).length;

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

  const meals = Object.values(mealsByCandidateId);
  const mealsAlreadyComplete = meals.filter((m) =>
    m.components.every((c) => c.source !== "composition_engine"),
  ).length;
  const added = meals.flatMap((m) => m.components.filter((c) => c.source === "composition_engine"));

  const diagnostics: MealCompositionDiagnostics = {
    weeklyMealSlots: input.slotCount ?? selectedIds.length,
    uniqueMainRecipes: selectedConcepts.length,
    uniqueCandidatesComposed: allConcepts.length,
    compositionProviderCalls: 0,
    weeklyCandidatesSelected: selectedConcepts.length,
    uniqueMainRecipesResolved,
    uniqueComponentRecipesResolved,
    uniqueComponentsInSelectedWeek: selectedSummary.uniqueComponents,
    reusedComponentsInSelectedWeek: selectedSummary.reusedComponents,
    mealsAlreadyComplete,
    mealsWithAddedComponents: meals.length - mealsAlreadyComplete,
    totalAddedComponents: added.length,
    uniqueAddedComponents: Object.keys(sharedComponentsByKey).length,
    reusedComponents: selectedSummary.reusedComponents,
    atomicComponents: added.filter((c) => c.definitionKind === "atomic_food").length,
    recipeComponents: added.filter((c) => c.definitionKind === "recipe_component").length,
    unresolvedComponents: added.filter((c) => c.resolution?.status === "unresolved").length,
    componentComplexitySignal: selectedSummary.complexitySignal,
  };

  return {
    result: {
      mealsByCandidateId,
      uniqueCandidateIds: selectedConcepts.map((c) => c.candidateId),
      sharedComponentsByKey,
      mealCount: meals.length,
      slotCount: input.slotCount ?? selectedIds.length,
      diagnostics,
      fiberTarget,
      mealConceptsByCandidateId: Object.fromEntries(
        selectedConcepts.map((c) => [c.candidateId, c]),
      ),
      policyVersions: {
        mealComposition: MEAL_COMPOSITION_POLICY_VERSION,
        prompt: MEAL_COMPOSITION_PROMPT_VERSION,
        componentRecipe: COMPONENT_RECIPE_PROMPT_VERSION,
        fiber: fiberTarget ? FIBER_POLICY_VERSION : undefined,
      },
    },
    failures,
    uniqueMainRecipesResolved,
    uniqueComponentRecipesResolved,
  };
}
