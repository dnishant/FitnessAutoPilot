import type {
  CompleteMealComponent,
  ComponentDefinition,
  ComponentRecipeIngredient,
  ComponentResolution,
} from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";
import type { FoodResolver } from "../food-resolution/food-resolver.ts";
import { looksLikeCompoundComponent } from "./component-identity.ts";
import { mealCompositionError, type MealCompositionError } from "./validate.ts";

export type ComponentDefinitionProposal = {
  name: string;
  definitionKind: "atomic_food" | "recipe_component";
  reason?: string;
  preparation?: string | null;
  measurementState?: "raw" | "cooked" | "as_purchased" | "prepared" | "unknown";
  recipeIngredients?: ComponentRecipeIngredient[];
  instructions?: string[];
};

export function buildComponentDefinition(
  proposal: ComponentDefinitionProposal,
): Result<ComponentDefinition, MealCompositionError> {
  if (proposal.definitionKind === "atomic_food") {
    if (looksLikeCompoundComponent(proposal.name)) {
      return err(
        mealCompositionError(
          "COMPONENT_RESOLUTION_FAILED",
          `Refusing to treat compound "${proposal.name}" as an atomic food.`,
        ),
      );
    }
    return ok({
      kind: "atomic_food",
      name: proposal.name,
      preparation: proposal.preparation ?? null,
      measurementState: proposal.measurementState ?? "cooked",
    });
  }

  if (!proposal.recipeIngredients || proposal.recipeIngredients.length < 2) {
    return err(
      mealCompositionError(
        "COMPONENT_RESOLUTION_FAILED",
        `Recipe component "${proposal.name}" needs structured ingredients.`,
      ),
    );
  }

  return ok({
    kind: "recipe_component",
    name: proposal.name,
    description: proposal.reason,
    ingredients: proposal.recipeIngredients,
    instructions: proposal.instructions,
  });
}

/**
 * Route composition additions toward PLAN-009 canonical resolution when possible.
 * Does not invent personalized quantities — atomic matches are identity-only until PLAN-010.
 */
export async function resolveAddedComponent(
  component: CompleteMealComponent,
  options: {
    foodResolver?: FoodResolver | null;
    resolveAddedComponents?: boolean;
  },
): Promise<CompleteMealComponent> {
  if (component.source !== "composition_engine") {
    return {
      ...component,
      resolution: {
        status: "skipped_intrinsic",
        note: "Intrinsic / PLAN-008 component — covered by main recipe resolution.",
      },
    };
  }

  const definition =
    component.definition ??
    (component.definitionKind === "atomic_food"
      ? {
          kind: "atomic_food" as const,
          name: component.name,
          preparation: null,
          measurementState: "cooked" as const,
        }
      : undefined);

  if (!definition) {
    return {
      ...component,
      resolution: {
        status: "unresolved",
        note: "Missing component definition.",
      },
    };
  }

  if (definition.kind === "recipe_component") {
    const resolution: ComponentResolution = {
      status: "component_recipe_resolved",
      definition,
      note: "Compound side represented as a structured recipe component (not a fake USDA food). Ingredient foods resolve via PLAN-009 when quantities exist; serving size is PLAN-010.",
    };
    return { ...component, definition, resolution };
  }

  // Atomic food
  if (!options.resolveAddedComponents || !options.foodResolver) {
    return {
      ...component,
      definition,
      resolution: {
        status: "pending_quantity",
        definition,
        note: "Atomic staple identity deferred; PLAN-010 owns quantity before nutrition totaling.",
      },
    };
  }

  try {
    const foodResolution = await options.foodResolver.resolve({
      ingredientId: component.componentId,
      name: definition.name,
      quantity: 100,
      unit: "g",
      role: component.role === "carbohydrate" ? "carbohydrate" : "other",
      scalingBehavior: "primary_scalable",
      measurementState: definition.measurementState ?? "cooked",
      preparation: definition.preparation ?? undefined,
    });

    if (foodResolution.status === "resolved") {
      return {
        ...component,
        definition,
        resolution: {
          status: "canonical_food_resolved",
          definition,
          foodResolution,
          note: "Canonical food identity resolved; quantity pending PLAN-010.",
        },
      };
    }

    return {
      ...component,
      definition,
      resolution: {
        status: "unresolved",
        definition,
        foodResolution,
        note: "Canonical food identity not resolved.",
      },
    };
  } catch (error) {
    return {
      ...component,
      definition,
      resolution: {
        status: "unresolved",
        definition,
        note: error instanceof Error ? error.message : "Food resolution failed.",
      },
    };
  }
}
