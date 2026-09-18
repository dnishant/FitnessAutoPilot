import type {
  CompleteMeal,
  CompleteMealComponent,
  MealConcept,
  MealConceptComponent,
  MealUnderstanding,
  NutritionOwnership,
} from "../../contracts/index.ts";

/**
 * Assign nutrition ownership from culinary understanding.
 *
 * Parent-owned composite: the main recipe owns all nutrition; intrinsic
 * substructure is informational only.
 *
 * Independent components: separately eaten companions each own their nutrition;
 * the parent must not also contribute whole-recipe nutrition for those parts.
 */
export function resolveNutritionOwnership(input: {
  component: Pick<
    MealConceptComponent | CompleteMealComponent,
    "role" | "relationship" | "source"
  >;
  understanding?: MealUnderstanding | null;
}): NutritionOwnership {
  if (input.component.role === "main") return "independent";

  const understanding = input.understanding;
  if (
    understanding?.isStandaloneMeal ||
    understanding?.mealForm === "complete_composite"
  ) {
    // Intrinsic / existing structure of a standalone composite is parent-owned.
    if (
      input.component.relationship === "intrinsic" ||
      input.component.source === "existing_candidate_component" ||
      input.component.source === "existing_recipe_component" ||
      input.component.source === "candidate" ||
      input.component.source === "main_recipe"
    ) {
      return "parent_owned";
    }
  }

  if (input.component.relationship === "intrinsic") {
    return "parent_owned";
  }

  return "independent";
}

export function applyOwnershipToConceptComponents(
  concept: MealConcept,
): MealConcept {
  const understanding = concept.mealUnderstanding;
  const main: MealConceptComponent = {
    ...concept.main,
    nutritionOwnership: "independent",
  };
  const components = concept.components.map((component) => ({
    ...component,
    nutritionOwnership: resolveNutritionOwnership({ component, understanding }),
  }));

  const hasIndependentCompanions = components.some(
    (c) => c.nutritionOwnership === "independent",
  );

  return {
    ...concept,
    main,
    components,
    // Persist understanding; nutritionModel is CompleteMeal-only.
  };
}

export function applyOwnershipToCompleteMeal(meal: CompleteMeal): CompleteMeal {
  const understanding = meal.mealUnderstanding;
  const components = meal.components.map((component) => ({
    ...component,
    nutritionOwnership: resolveNutritionOwnership({ component, understanding }),
  }));

  const independentNonMain = components.filter(
    (c) => c.role !== "main" && c.nutritionOwnership === "independent",
  );
  const nutritionModel =
    independentNonMain.length === 0 ? "parent_owned_composite" : "independent_components";

  return {
    ...meal,
    components,
    nutritionModel,
  };
}

export function independentNutritionalOwners(
  components: readonly CompleteMealComponent[],
): CompleteMealComponent[] {
  return components.filter((c) => (c.nutritionOwnership ?? "independent") === "independent");
}
