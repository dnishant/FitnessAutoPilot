import type {
  CulinaryDiscoveryCandidate,
  MealCompositionProfile,
  MealConceptComponent,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import {
  buildNormalizedComponentKey,
  looksLikeCompoundComponent,
} from "./component-identity";
import {
  detectExistingMealRoles,
  type DetectedCulinaryNeed,
  type DetectedExistingComponent,
} from "./role-detection";

function conceptComponent(input: {
  componentId: string;
  role: MealConceptComponent["role"];
  name: string;
  relationship: MealConceptComponent["relationship"];
  source: MealConceptComponent["source"];
  reason: string;
}): MealConceptComponent {
  return {
    componentId: input.componentId,
    role: input.role,
    name: input.name,
    relationship: input.relationship,
    source: input.source,
    reason: input.reason,
    definitionKind: looksLikeCompoundComponent(input.name) ? "recipe_component" : "atomic_food",
    normalizedComponentKey: buildNormalizedComponentKey(input.role, input.name),
    nutritionOwnership: input.role === "main" ? "independent" : "parent_owned",
  };
}

function emptyProfile(): Omit<MealCompositionProfile, "addedComponentRoles"> {
  return {
    hasPrimaryProtein: true,
    hasMeaningfulCarbohydrate: false,
    hasMeaningfulVegetableOrFruit: false,
    hasMeaningfulFiberSource: false,
    hasSauceOrMoistureComponent: false,
  };
}

export type DetectedCandidateRoles = {
  profile: MealCompositionProfile;
  existingComponents: MealConceptComponent[];
  culinaryNeeds: DetectedCulinaryNeed[];
};

/**
 * Candidate-only intrinsic detection BEFORE a PLAN-008 recipe exists.
 *
 * Intentionally minimal: only the main dish. Do NOT invent dish-format
 * placeholders (bowl base, tortillas, pasta sauce, curry vegetables, …).
 * Culinary Meal Architect understands completeness from candidate metadata
 * and later from the resolved recipe's real mealComponents / ingredients.
 */
export function detectExistingCandidateRoles(
  candidate: CulinaryDiscoveryCandidate,
): DetectedCandidateRoles {
  const profile = emptyProfile();
  const existingComponents: MealConceptComponent[] = [
    conceptComponent({
      componentId: "main",
      role: "main",
      name: candidate.name,
      relationship: "intrinsic",
      source: "candidate",
      reason: "Ranked main-dish candidate",
    }),
  ];

  return {
    profile: { ...profile, addedComponentRoles: [] },
    existingComponents,
    culinaryNeeds: [],
  };
}

export function candidateFromResolvedRecipe(recipe: ResolvedRecipe): CulinaryDiscoveryCandidate {
  return {
    candidateId: recipe.candidateId,
    name: recipe.name,
    source: {
      name: recipe.source.name,
      url: recipe.source.url ?? "https://example.com/recipe",
      author: recipe.source.author ?? null,
    },
    cuisineFamily: recipe.flavorProfile.cuisineFamily,
    regionalStyle: recipe.flavorProfile.regionalStyle ?? null,
    primaryProtein: null,
    dishFormat: recipe.flavorProfile.cookingTechniques[0] ?? "plate",
    flavorFamilies: [...recipe.flavorProfile.flavorFamilies],
    cookingTechniques: [...recipe.flavorProfile.cookingTechniques],
    textureTags: [...recipe.experienceProfile.textureTags],
    experienceTags: [recipe.experienceProfile.moistureLevel],
    whyItIsInteresting: recipe.description.slice(0, 600),
    fitnessAdaptability: "moderate",
    fitnessAdaptabilityReason: "Derived from an already-resolved recipe for composition tests.",
    mealPrepAdaptability: "component_prepped",
    estimatedFinishMinutesAfterPrep: recipe.cookTimeMinutes,
    noveltyReason: "Resolved recipe subject.",
    discoveryConfidence: "high",
  };
}

export function detectedRecipeComponentsToConcepts(
  existing: DetectedExistingComponent[],
): MealConceptComponent[] {
  return existing.map((c) => ({
    componentId: c.componentId,
    role: c.role,
    name: c.name,
    relationship: c.relationship,
    source:
      c.source === "existing_recipe_component"
        ? "existing_candidate_component"
        : "candidate",
    reason: c.reason,
    definitionKind: c.definitionKind,
    normalizedComponentKey: c.normalizedComponentKey,
    nutritionOwnership:
      c.relationship === "intrinsic" || c.role === "main" ? (c.role === "main" ? "independent" : "parent_owned") : "independent",
  }));
}

export function detectRolesForCompositionRequest(input: {
  candidate: CulinaryDiscoveryCandidate;
  recipe?: ResolvedRecipe;
}): {
  profile: MealCompositionProfile;
  existingComponents: MealConceptComponent[];
  culinaryNeeds: DetectedCulinaryNeed[];
} {
  if (input.recipe) {
    const detected = detectExistingMealRoles(input.recipe);
    return {
      profile: detected.profile,
      existingComponents: detectedRecipeComponentsToConcepts(detected.existingComponents),
      culinaryNeeds: detected.culinaryNeeds,
    };
  }
  return detectExistingCandidateRoles(input.candidate);
}
