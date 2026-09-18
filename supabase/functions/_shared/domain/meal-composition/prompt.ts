import type { CulinaryDiscoveryCandidate, MealCompositionRequest } from "../../contracts/index.ts";
import {
  COMPONENT_RECIPE_PROMPT_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
} from "../../contracts/index.ts";
import { candidateFromResolvedRecipe } from "./candidate-role-detection.ts";
import { detectRolesForCompositionRequest } from "./candidate-role-detection.ts";

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
  const detected = detectRolesForCompositionRequest({
    candidate,
    recipe: request.recipe,
  });

  const systemInstruction = [
    "You are the Culinary Meal Architect for Fitness Autopilot.",
    "Combine the judgment of a knowledgeable chef and food expert with structured meal-planning reasoning.",
    "",
    "CORE PRINCIPLE:",
    "Prefer the minimum number of components necessary to preserve the identity and intended eating experience of the dish while making it a satisfying lunch or dinner.",
    "Do not add food merely because an abstract meal role is absent.",
    "Before proposing ANY addition, ask: Would a knowledgeable chef normally serve this as an additional component, or is this need already satisfied by the existing dish?",
    "Zero additions is a valid and often ideal result.",
    "",
    "YOUR JOB IS NOT: Find missing meal roles and add food.",
    "YOUR JOB IS: Understand what this recipe actually produces, how a knowledgeable person would naturally eat it, what is already included, and whether anything else is genuinely needed.",
    "",
    "Preserve: culinary identity, cuisine coherence, intended eating experience, taste, texture, moisture, practicality, meal-prep suitability.",
    "Prefer simplicity over unnecessary embellishment.",
    "",
    "REASONING ORDER (mandatory):",
    "1. Understand what dish this actually is",
    "2. Understand how it is intended to be eaten",
    "3. Identify what is already contained in the dish",
    "4. Identify existing intrinsic / required / recommended companions",
    "5. Decide whether this is already a satisfying meal",
    "6. Identify genuine missing culinary need(s), if any",
    "7. Add the minimum appropriate companion(s), if any",
    "",
    "Do NOT start from protein?/carb?/vegetable?/sauce? checkboxes and fill empty boxes.",
    "Culinary completeness is semantic. Many dishes are already standalone meals (grain bowls, pasta, biryani, curry-and-rice composites, loaded tacos, substantial salads, sandwiches, casseroles, stews, etc.). Reason about arbitrary dishes — do not use an allowlist.",
    "",
    "Distinguish integrated parts of ONE recipe from separately eaten companions.",
    "culinaryNeeds are abstract recommendations (purpose text) — NOT edible food.",
    "When fulfilling a need, emit a concrete edible food name in addedComponents and leave the need itself out of the edible plate.",
    "One edible addition may satisfy multiple culinaryNeeds. Optional/recommended needs may remain unused.",
    "Existing recommended_side / required_companion edible components already count — do not add a semantic duplicate with a slightly different name.",
    "Do not treat ingredient overlap as automatic duplication (yogurt marinade ≠ cucumber raita; cooked tomatoes in curry ≠ fresh tomato salad).",
    "",
    "Nutrition / calorie / macro targets must NEVER drive additions. Culinary structure first; personalized nutrition is a separate downstream stage.",
    "",
    "Return structured mealUnderstanding BEFORE deciding additions.",
    "If additionsRecommended=false, addedComponents must be [].",
    "Every addition must justify a genuine missingNeed (satisfiesMissingNeed + culinaryReason).",
    "Do not invent generic placeholders (bowl base, vegetable side, carb side, pasta sauce as a blank role, etc.) — only real edible food names.",
    "Do not generate ingredient quantities, cooking instructions, nutrition, or portions.",
    "Do not replace the main dish. Do not add a second main protein.",
    "Atomic staples use definitionKind=atomic_food; compound sides use definitionKind=recipe_component.",
    "When weekly existingComponentKeys are provided, reuse the same component name when culinary fit is strong.",
    `Prompt version: ${MEAL_COMPOSITION_PROMPT_VERSION}`,
  ].join("\n");

  const profile = request.compositionContext?.existingRoles ?? detected.profile;

  const userPrompt = JSON.stringify(
    {
      mealType: request.mealType,
      candidate: {
        candidateId: candidate.candidateId,
        name: candidate.name,
        description: candidate.whyItIsInteresting,
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
      deterministicRoleHints: {
        profile,
        // Real detected edible components only — never purpose-text needs.
        existingComponents: detected.existingComponents.map((c) => ({
          name: c.name,
          role: c.role,
          relationship: c.relationship,
          source: c.source,
          purpose: c.reason,
        })),
        culinaryNeeds: detected.culinaryNeeds.map((n) => ({
          needId: n.needId,
          role: n.role,
          purpose: n.purpose,
          required: n.required,
          relationship: n.relationship,
        })),
      },
      knownRecipeStructure: request.recipe
        ? {
            name: request.recipe.name,
            description: request.recipe.description,
            ingredients: request.recipe.ingredients.map((i) => ({
              name: i.name,
              role: i.role,
              quantity: i.quantity,
              unit: i.unit,
              preparation: i.preparation ?? null,
            })),
            mealComponents: request.recipe.mealComponents.map((c) => ({
              name: c.name,
              type: c.type,
              relationship: c.relationship,
              required: c.required,
              purpose: c.purpose,
            })),
            preparationSummary: {
              prepTimeMinutes: request.recipe.prepTimeMinutes,
              cookTimeMinutes: request.recipe.cookTimeMinutes,
              instructionsPreview: request.recipe.instructions.slice(0, 4),
            },
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
        mealUnderstanding: {
          mealForm:
            "complete_composite|main_only|main_with_existing_companions|multi_component|assembly|other",
          isStandaloneMeal: "boolean",
          dishSummary: "string",
          howItIsEaten: "string",
          existingComponents: [
            {
              name: "string",
              role: "optional",
              relationship: "optional",
              integration: "integrated_in_dish|separately_eaten|unclear",
              purpose: "optional",
            },
          ],
          satisfiedNeeds: [
            "protein_structure|carbohydrate_accompaniment|fresh_vegetable_accompaniment|moisture_sauce|textural_contrast|completeness_other",
          ],
          missingNeeds: ["..."],
          additionsRecommended: "boolean",
          confidence: "high|medium|low",
        },
        addedComponents: [
          {
            name: "real edible food name only",
            role: "carbohydrate|vegetable|fruit|legume|sauce_condiment|fat|garnish",
            relationship: "required_companion|recommended",
            reason: "string",
            culinaryReason: "string",
            satisfiesMissingNeed: "MealNeed",
            definitionKind: "atomic_food|recipe_component",
          },
        ],
        compositionSummary: "string",
        noAdditionsNeeded: "boolean",
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
