import type {
  CulinaryDiscoveryCandidate,
  MealCompositionProfile,
  MealConceptComponent,
  MealComponentRole,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import {
  buildNormalizedComponentKey,
  looksLikeCompoundComponent,
} from "./component-identity";
import {
  detectExistingMealRoles,
  type DetectedExistingComponent,
} from "./role-detection";

const TACO_RE = /\b(taco|tacos|burrito|quesadilla|enchilada)\b/i;
const PASTA_RE = /\b(pasta|lasagna|spaghetti|penne|noodle bowl)\b/i;
const CURRY_RE = /\b(curry)\b/i;
const BOWL_RE = /\b(bowl|bibimbap|poke)\b/i;

function blobFor(candidate: CulinaryDiscoveryCandidate): string {
  return [
    candidate.name,
    candidate.dishFormat,
    candidate.experienceTags.join(" "),
    candidate.textureTags.join(" "),
  ].join(" ");
}

function conceptComponent(input: {
  componentId: string;
  role: MealComponentRole;
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

function applyRole(
  profile: Omit<MealCompositionProfile, "addedComponentRoles">,
  role: MealComponentRole,
): void {
  if (role === "main") profile.hasPrimaryProtein = true;
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

export type DetectedCandidateRoles = {
  profile: MealCompositionProfile;
  existingComponents: MealConceptComponent[];
};

/**
 * Heuristic intrinsic-plate detection from PLAN-005/006 candidate metadata.
 * Used when no PLAN-008 recipe exists yet. Gemini may still override gaps.
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
  const seen = new Set(existingComponents.map((c) => c.normalizedComponentKey));

  const add = (
    role: MealComponentRole,
    name: string,
    reason: string,
    relationship: MealConceptComponent["relationship"] = "intrinsic",
  ) => {
    const key = buildNormalizedComponentKey(role, name);
    if (seen.has(key)) return;
    seen.add(key);
    applyRole(profile, role);
    existingComponents.push(
      conceptComponent({
        componentId: `candidate-${existingComponents.length}-${role}`,
        role,
        name,
        relationship,
        source: "existing_candidate_component",
        reason,
      }),
    );
  };

  const blob = blobFor(candidate);

  if (TACO_RE.test(blob)) {
    add("carbohydrate", "corn tortillas", "Taco / burrito format already includes a tortilla vessel");
    add("vegetable", "cabbage slaw", "Taco plates typically include a crisp slaw or similar vegetable");
    add("sauce_condiment", "salsa", "Taco plates typically include salsa or a similar condiment");
  } else if (PASTA_RE.test(blob)) {
    add("carbohydrate", candidate.name, "Pasta / noodle dishes already include a carbohydrate structure");
    add("sauce_condiment", "pasta sauce", "Pasta dishes typically include an intrinsic sauce");
  } else if (CURRY_RE.test(blob)) {
    add("vegetable", "curry vegetables", "Curries typically already contain vegetables in the sauce");
    add("sauce_condiment", "curry sauce", "Curry dishes are intrinsically saucy");
  } else if (BOWL_RE.test(blob)) {
    add("carbohydrate", "bowl base", "Bowl formats typically already include a grain or noodle base");
    add("vegetable", "bowl vegetables", "Bowl formats typically already include vegetables");
  }

  if (/\bsaucy\b/i.test(blob) || candidate.experienceTags.includes("saucy_flavorful")) {
    profile.hasSauceOrMoistureComponent = true;
  }

  return {
    profile: { ...profile, addedComponentRoles: [] },
    existingComponents,
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
  }));
}

export function detectRolesForCompositionRequest(input: {
  candidate: CulinaryDiscoveryCandidate;
  recipe?: ResolvedRecipe;
}): {
  profile: MealCompositionProfile;
  existingComponents: MealConceptComponent[];
} {
  if (input.recipe) {
    const detected = detectExistingMealRoles(input.recipe);
    return {
      profile: detected.profile,
      existingComponents: detectedRecipeComponentsToConcepts(detected.existingComponents),
    };
  }
  return detectExistingCandidateRoles(input.candidate);
}
