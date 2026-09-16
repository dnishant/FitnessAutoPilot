import type { CulinaryDiscoveryCandidate, MealCompositionRequest } from "@fitness-autopilot/contracts";
import {
  COMPONENT_RECIPE_PROMPT_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
} from "@fitness-autopilot/contracts";
import { candidateFromResolvedRecipe } from "./candidate-role-detection";

export type MealCompositionPrompt = {
  version: typeof MEAL_COMPOSITION_PROMPT_VERSION;
  systemInstruction: string;
  userPrompt: string;
};

export function subjectCandidateFromRequest(
  request: MealCompositionRequest,
): CulinaryDiscoveryCandidate {
  if (request.candidate) return request.candidate;
  if (request.ranked) return request.ranked.candidate;
  if (request.recipe) return candidateFromResolvedRecipe(request.recipe);
  throw new Error("Meal composition request is missing a candidate.");
}

export function buildMealCompositionPrompt(
  request: MealCompositionRequest,
): MealCompositionPrompt {
  const candidate = subjectCandidateFromRequest(request);
  const systemInstruction = [
    "You are the Fitness Autopilot meal composition engine.",
    "Given a ranked meal candidate, describe the complete lunch or dinner concept.",
    "Determine what components are already intrinsic to the candidate.",
    "Add only the components needed for a satisfying, culturally coherent complete meal.",
    "Return component concepts only.",
    "Do not generate ingredient quantities.",
    "Do not generate cooking instructions.",
    "Do not calculate nutrition.",
    "Do not assign portions.",
    "Do not add generic fitness-food sides (no default broccoli, brown rice, or low-carb wraps).",
    "Do not add components merely to increase the number of food groups.",
    "Preserve the culinary identity of the selected dish.",
    "Do not replace the main dish. Do not add a second main protein.",
    "If the meal already looks complete (tacos with tortillas+slaw+salsa, pasta with sauce+veg, curry with vegetables already in the sauce), set noAdditionsNeeded=true and addedComponents=[].",
    "Atomic staples (steamed rice, plain yogurt) use definitionKind=atomic_food.",
    "Compound sides (kachumber, mint-yogurt chutney, slaw, salsa, thoran, pachadi, rice and peas) use definitionKind=recipe_component.",
    "Do not invent a second carbohydrate when tortillas, noodles, or another starch are already intrinsic.",
    "Do not invent another vegetable when the dish already contains a meaningful vegetable component.",
    "When weekly existingComponentKeys are provided, reuse the same component name when culinary fit is strong — reuse is not meal repetition.",
    `Prompt version: ${MEAL_COMPOSITION_PROMPT_VERSION}`,
  ].join("\n");

  const profile = request.compositionContext?.existingRoles;
  const signals = request.compositionContext?.nutritionSignals;

  const userPrompt = JSON.stringify(
    {
      mealType: request.mealType,
      candidate: {
        candidateId: candidate.candidateId,
        name: candidate.name,
        cuisineFamily: request.cuisineFamily ?? candidate.cuisineFamily,
        regionalStyle: request.regionalStyle ?? candidate.regionalStyle ?? null,
        primaryProtein: candidate.primaryProtein,
        dishFormat: candidate.dishFormat,
        flavorFamilies: candidate.flavorFamilies,
        cookingTechniques: candidate.cookingTechniques,
        textureTags: candidate.textureTags,
        experienceTags: candidate.experienceTags,
        mealPrepAdaptability: candidate.mealPrepAdaptability,
      },
      deterministicRoleDetection: profile ?? null,
      nutritionSignals: signals ?? null,
      knownIntrinsicHints: request.recipe
        ? {
            mealComponents: request.recipe.mealComponents.map((c) => ({
              name: c.name,
              type: c.type,
              relationship: c.relationship,
              required: c.required,
              purpose: c.purpose,
            })),
          }
        : null,
      constraints: {
        allergies: request.allergies,
        dietaryRestrictions: request.dietaryRestrictions,
        dislikes: request.dislikes,
      },
      weeklyReuseHints: {
        otherSelectedMealNames: request.compositionContext?.otherSelectedMealNames ?? [],
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

export type ComponentRecipePrompt = {
  version: typeof COMPONENT_RECIPE_PROMPT_VERSION;
  systemInstruction: string;
  userPrompt: string;
};

export function buildComponentRecipePrompt(input: {
  name: string;
  role: string;
  reason: string;
  cuisineFamily: string;
  mealName: string;
  definitionKind: "atomic_food" | "recipe_component";
}): ComponentRecipePrompt {
  const systemInstruction = [
    "You are the Fitness Autopilot component recipe resolver.",
    "A weekly planner already selected this complete-meal concept.",
    "Produce a structured culinary definition for ONE side/sauce/staple component.",
    "Culinary base ratios only — not personalized portions.",
    "Do not calculate nutrition, calories, macros, or fiber values.",
    "Do not assign user serving sizes.",
    "Atomic staples may be identity-only (name + preparation).",
    "Compound sides need at least 2 ingredients and optional short instructions.",
    `Prompt version: ${COMPONENT_RECIPE_PROMPT_VERSION}`,
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      mealName: input.mealName,
      cuisineFamily: input.cuisineFamily,
      component: {
        name: input.name,
        role: input.role,
        reason: input.reason,
        definitionKind: input.definitionKind,
      },
      responseShape:
        input.definitionKind === "atomic_food"
          ? {
              kind: "atomic_food",
              name: "string",
              preparation: "optional",
              measurementState: "cooked|raw|prepared|unknown",
            }
          : {
              kind: "recipe_component",
              name: "string",
              description: "optional",
              ingredients: [{ name: "string", quantity: "optional number", unit: "optional", role: "optional" }],
              instructions: ["optional string"],
            },
    },
    null,
    2,
  );

  return {
    version: COMPONENT_RECIPE_PROMPT_VERSION,
    systemInstruction,
    userPrompt,
  };
}
