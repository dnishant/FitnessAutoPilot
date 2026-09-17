import type {
  CompleteMealComponent,
  ComponentRecipeDefinition,
  ResolvedRecipe,
  ResolvedRecipeIngredient,
} from "../../contracts/index.ts";

/**
 * Adapt a compound component recipe definition into a PLAN-008 ResolvedRecipe
 * so existing resolve-recipe-nutrition can produce trusted per-serving nutrition.
 */
export function resolvedRecipeFromComponentDefinition(input: {
  component: CompleteMealComponent;
  definition: ComponentRecipeDefinition;
}): ResolvedRecipe | null {
  const { component, definition } = input;
  const ingredients: ResolvedRecipeIngredient[] = [];
  for (const [index, ingredient] of definition.ingredients.entries()) {
    if (ingredient.quantity == null || !ingredient.unit) {
      return null;
    }
    ingredients.push({
      ingredientId: `${component.componentId}-ing-${index}`,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      preparation: ingredient.preparation ?? null,
      role:
        ingredient.role === "protein"
          ? "protein"
          : ingredient.role === "carbohydrate"
            ? "carbohydrate"
            : "other",
      scalingBehavior: "primary_scalable",
    });
  }
  if (ingredients.length < 1) return null;

  return {
    recipeId: `component-recipe-${component.componentId}`,
    candidateId: component.componentId,
    name: definition.name,
    description: definition.description ?? `${definition.name} component recipe.`,
    source: {
      name: "component-recipe",
      url: "https://example.com/component-recipe",
    },
    baseServings: definition.baseServings ?? 1,
    ingredients,
    instructions: (definition.instructions ?? ["Prepare component."]).map((text, i) => ({
      stepNumber: i + 1,
      text,
    })),
    prepTimeMinutes: 10,
    cookTimeMinutes: 10,
    supportedPrepModes: [
      {
        mode: "fresh",
        advanceTasks: [],
        finishTasks: ["Prepare and serve"],
        finishTimeMinutes: 15,
      },
    ],
    mealComponents: [
      {
        componentId: component.componentId,
        name: definition.name,
        type: "other",
        required: true,
        purpose: "Culinary plate component.",
        relationship: "intrinsic",
      },
    ],
    flavorProfile: {
      cuisineFamily: "unknown",
      flavorFamilies: ["savory"],
      cookingTechniques: ["mix"],
      textureProfile: [],
    },
    experienceProfile: {
      moistureLevel: "moderate",
      flavorIntensity: "medium",
      textureTags: [],
      mealPrepQuality: "good",
    },
    resolutionMetadata: {
      provider: "component-recipe-adapter",
      model: "deterministic",
      promptVersion: "component-recipe-v1",
    },
  };
}
