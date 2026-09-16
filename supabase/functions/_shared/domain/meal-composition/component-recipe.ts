import type {
  ComponentDefinition,
  ComponentRecipeDefinition,
  CulinaryDiscoveryCandidate,
  MealConceptComponent,
} from "../../contracts/index.ts";
import { COMPONENT_RECIPE_PROMPT_VERSION } from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";
import { looksLikeCompoundComponent } from "./component-identity.ts";
import { buildComponentRecipePrompt } from "./prompt.ts";
import { mealCompositionError, type MealCompositionError } from "./validate.ts";

export { COMPONENT_RECIPE_PROMPT_VERSION, buildComponentRecipePrompt };

export type ComponentRecipeRequest = {
  component: MealConceptComponent;
  candidate: CulinaryDiscoveryCandidate;
  cuisineFamily?: string;
  mealName: string;
};

/**
 * Provider-independent selected-only component recipe resolution.
 * Implementations produce culinary structure only — never nutrition.
 */
export interface ComponentRecipeProvider {
  resolve(request: ComponentRecipeRequest): Promise<ComponentDefinition>;
}

export function buildAtomicComponentDefinition(
  component: MealConceptComponent,
): ComponentDefinition {
  return {
    kind: "atomic_food",
    name: component.name,
    preparation: null,
    measurementState: "cooked",
  };
}

export function validateComponentDefinition(
  definition: ComponentDefinition,
  component: MealConceptComponent,
): Result<ComponentDefinition, MealCompositionError> {
  if (definition.kind === "atomic_food") {
    if (looksLikeCompoundComponent(component.name) || looksLikeCompoundComponent(definition.name)) {
      return err(
        mealCompositionError(
          "COMPONENT_RESOLUTION_FAILED",
          `Refusing to treat compound "${component.name}" as an atomic food.`,
        ),
      );
    }
    return ok(definition);
  }
  if (definition.ingredients.length < 2) {
    return err(
      mealCompositionError(
        "COMPONENT_RESOLUTION_FAILED",
        `Recipe component "${component.name}" needs structured ingredients.`,
      ),
    );
  }
  return ok(definition);
}

export class MockComponentRecipeProvider implements ComponentRecipeProvider {
  readonly calls: ComponentRecipeRequest[] = [];

  async resolve(request: ComponentRecipeRequest): Promise<ComponentDefinition> {
    this.calls.push(request);
    const name = request.component.name.toLowerCase();
    if (request.component.definitionKind === "atomic_food" && !looksLikeCompoundComponent(name)) {
      return buildAtomicComponentDefinition(request.component);
    }
    return compoundFixture(request.component.name, request.component.reason);
  }
}

function compoundFixture(name: string, reason: string): ComponentRecipeDefinition {
  const n = name.toLowerCase();
  if (/kachumber/.test(n)) {
    return {
      kind: "recipe_component",
      name,
      description: reason,
      ingredients: [
        { name: "cucumber", quantity: 150, unit: "g", role: "vegetable" },
        { name: "tomato", quantity: 100, unit: "g", role: "vegetable" },
        { name: "onion", quantity: 50, unit: "g", role: "vegetable" },
        { name: "lemon juice", quantity: 15, unit: "g", role: "acid" },
        { name: "cilantro", quantity: 10, unit: "g", role: "garnish" },
      ],
      instructions: ["Dice vegetables", "Toss with lemon and cilantro"],
    };
  }
  if (/chutney|raita|yogurt/.test(n)) {
    return {
      kind: "recipe_component",
      name,
      description: reason,
      ingredients: [
        { name: "plain yogurt", quantity: 120, unit: "g", role: "sauce" },
        { name: "mint leaves", quantity: 20, unit: "g", role: "herb" },
        { name: "cilantro", quantity: 15, unit: "g", role: "herb" },
      ],
    };
  }
  if (/thoran/.test(n)) {
    return {
      kind: "recipe_component",
      name,
      description: reason,
      ingredients: [
        { name: "cabbage", quantity: 200, unit: "g", role: "vegetable" },
        { name: "grated coconut", quantity: 40, unit: "g", role: "garnish" },
        { name: "mustard seeds", quantity: 5, unit: "g", role: "seasoning" },
      ],
    };
  }
  if (/pachadi/.test(n)) {
    return {
      kind: "recipe_component",
      name,
      description: reason,
      ingredients: [
        { name: "cucumber", quantity: 150, unit: "g", role: "vegetable" },
        { name: "yogurt", quantity: 100, unit: "g", role: "sauce" },
      ],
    };
  }
  if (/rice and peas|rice & peas/.test(n)) {
    return {
      kind: "recipe_component",
      name,
      description: reason,
      ingredients: [
        { name: "long-grain rice", quantity: 200, unit: "g", role: "carbohydrate" },
        { name: "pigeon peas", quantity: 100, unit: "g", role: "legume" },
        { name: "coconut milk", quantity: 100, unit: "g", role: "sauce" },
      ],
    };
  }
  if (/slaw/.test(n)) {
    return {
      kind: "recipe_component",
      name,
      description: reason,
      ingredients: [
        { name: "cabbage", quantity: 200, unit: "g", role: "vegetable" },
        { name: "carrot", quantity: 50, unit: "g", role: "vegetable" },
        { name: "vinegar", quantity: 20, unit: "g", role: "acid" },
      ],
    };
  }
  return {
    kind: "recipe_component",
    name,
    description: reason,
    ingredients: [
      { name: "primary ingredient", quantity: 120, unit: "g", role: "vegetable" },
      { name: "acid", quantity: 15, unit: "g", role: "acid" },
    ],
  };
}
