import type { MealCompositionRequest } from "@fitness-autopilot/contracts";
import { MEAL_COMPOSITION_PROMPT_VERSION } from "@fitness-autopilot/contracts";

export type MealCompositionPrompt = {
  version: typeof MEAL_COMPOSITION_PROMPT_VERSION;
  systemInstruction: string;
  userPrompt: string;
};

export function buildMealCompositionPrompt(
  request: MealCompositionRequest,
): MealCompositionPrompt {
  const systemInstruction = [
    "You are the Fitness Autopilot meal composition engine.",
    "Complete this dish into a satisfying lunch or dinner.",
    "First determine which meal roles are already meaningfully satisfied by the resolved recipe and its existing components.",
    "Then add only the components needed to make the meal complete.",
    "Components must be culturally and culinarily appropriate to the dish.",
    "Do not use generic fitness-food defaults (no default broccoli, brown rice, or low-carb wraps).",
    "Do not add components merely to increase the number of food groups.",
    "Do not assign personalized serving quantities.",
    "Do not calculate calories or macros or fiber values.",
    "Preserve the culinary identity of the selected dish.",
    "Do not replace the main dish. Do not add a second main protein.",
    "Prefer meaningful vegetable/fiber components and traditional sauces when the dish is dry and traditionally accompanied.",
    "If the meal is already substantially complete (e.g. tacos with tortillas+slaw+salsa, pasta with sauce+veg), set noAdditionsNeeded=true and addedComponents=[].",
    "Atomic staples (steamed rice, plain yogurt) use definitionKind=atomic_food.",
    "Compound sides (kachumber, mint-yogurt chutney, slaw, salsa) use definitionKind=recipe_component with at least 2 ingredients.",
    "When weekly existingComponentKeys are provided, reuse the same component name when culinary fit is strong.",
    `Prompt version: ${MEAL_COMPOSITION_PROMPT_VERSION}`,
  ].join("\n");

  const profile = request.compositionContext?.existingRoles;
  const signals = request.compositionContext?.nutritionSignals;

  const userPrompt = JSON.stringify(
    {
      mealType: request.mealType,
      recipe: {
        recipeId: request.recipe.recipeId,
        candidateId: request.recipe.candidateId,
        name: request.recipe.name,
        description: request.recipe.description,
        cuisineFamily:
          request.cuisineFamily ?? request.recipe.flavorProfile.cuisineFamily,
        regionalStyle:
          request.regionalStyle ?? request.recipe.flavorProfile.regionalStyle ?? null,
        flavorFamilies: request.recipe.flavorProfile.flavorFamilies,
        primarySauce: request.recipe.flavorProfile.primarySauce ?? null,
        cookingTechniques: request.recipe.flavorProfile.cookingTechniques,
        moistureLevel: request.recipe.experienceProfile.moistureLevel,
        ingredients: request.recipe.ingredients.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          role: i.role,
          preparation: i.preparation ?? null,
        })),
        mealComponents: request.recipe.mealComponents.map((c) => ({
          name: c.name,
          type: c.type,
          relationship: c.relationship,
          required: c.required,
          purpose: c.purpose,
        })),
      },
      deterministicRoleDetection: profile ?? null,
      nutritionSignals: signals ?? null,
      constraints: {
        allergies: request.allergies,
        dietaryRestrictions: request.dietaryRestrictions,
        dislikes: request.dislikes,
      },
      weeklyReuseHints: {
        otherSelectedMealNames:
          request.compositionContext?.otherSelectedMealNames ?? [],
        existingComponentKeys: request.compositionContext?.existingComponentKeys ?? [],
      },
      experiencePreferences: request.experiencePreferences ?? [],
      cookingStyleHint: request.cookingStyleHint ?? null,
      responseShape: {
        mealName: "string",
        alreadySatisfiedRoles: ["main", "carbohydrate", "..."],
        missingRoles: ["vegetable", "..."],
        addedComponents: [
          {
            name: "string",
            role: "carbohydrate|vegetable|fruit|legume|sauce_condiment|fat|garnish",
            relationship: "required_companion|recommended",
            reason: "string",
            definitionKind: "atomic_food|recipe_component",
            preparation: "optional",
            measurementState: "optional cooked|raw|...",
            recipeIngredients: "required when recipe_component: [{name, quantity?, unit?, role?}]",
            instructions: "optional string[]",
          },
        ],
        compositionSummary: "string",
        noAdditionsNeeded: "boolean optional",
      },
    },
    null,
    2,
  );

  return {
    version: MEAL_COMPOSITION_PROMPT_VERSION,
    systemInstruction,
    userPrompt,
  };
}
