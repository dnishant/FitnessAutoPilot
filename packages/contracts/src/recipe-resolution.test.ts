import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECIPE_RESOLUTION_CONCURRENCY,
  RECIPE_RESOLUTION_PROMPT_VERSION,
  RecipeResolutionRequestSchema,
  ResolvedRecipeSchema,
} from "./recipe-resolution";

const sampleCandidate = {
  candidateId: "tikka-chicken",
  name: "Chicken Tikka",
  source: {
    name: "Serious Eats",
    url: "https://www.seriouseats.com/chicken-tikka",
    author: "Kenji",
  },
  cuisineFamily: "Indian",
  regionalStyle: "Punjab",
  primaryProtein: "Chicken",
  dishFormat: "tikka kebab",
  flavorFamilies: ["tandoori", "yogurt-chili"],
  cookingTechniques: ["marinate", "char"],
  textureTags: ["charred"],
  experienceTags: ["spicy"],
  whyItIsInteresting: "Classic Punjabi yogurt-chili marinade with tandoor char.",
  fitnessAdaptability: "easy" as const,
  fitnessAdaptabilityReason: "Portions scale while keeping marinade identity.",
  mealPrepAdaptability: "component_prepped" as const,
  estimatedFinishMinutesAfterPrep: 8,
  noveltyReason: "Recognizable tandoori classic.",
  discoveryConfidence: "high" as const,
};

function sampleResolvedRecipe(overrides: Record<string, unknown> = {}) {
  return {
    recipeId: "rr_tikka_1",
    candidateId: "tikka-chicken",
    name: "Chicken Tikka",
    source: sampleCandidate.source,
    description: "Yogurt-marinated chicken pieces roasted until lightly charred.",
    baseServings: 4,
    ingredients: [
      {
        ingredientId: "chicken",
        name: "boneless chicken thighs",
        quantity: 680,
        unit: "g",
        preparation: "cut into 4 cm pieces",
        role: "protein",
        scalingBehavior: "primary_scalable",
      },
      {
        ingredientId: "yogurt",
        name: "plain full-fat yogurt",
        quantity: 120,
        unit: "g",
        role: "sauce",
        scalingBehavior: "ratio_bound",
        scalingReferenceIngredientId: "chicken",
      },
    ],
    instructions: [
      {
        stepNumber: 1,
        text: "Whisk yogurt, ginger, garlic, lemon juice and spices until smooth.",
      },
      {
        stepNumber: 2,
        text: "Coat chicken thoroughly and refrigerate at least 2 hours.",
      },
    ],
    prepTimeMinutes: 25,
    cookTimeMinutes: 20,
    supportedPrepModes: [
      {
        mode: "component_prepped",
        advanceTasks: ["Mix marinade", "Marinate chicken", "Prepare chutney"],
        finishTasks: ["Roast or broil until charred", "Warm rice", "Assemble"],
        finishTimeMinutes: 15,
        storageInstructions: "Keep marinated chicken refrigerated up to 24 hours.",
      },
    ],
    storageInstructions: "Refrigerate cooked tikka up to 3 days.",
    reheatingInstructions: "Reheat under a broiler or in a hot skillet to restore char.",
    mealComponents: [
      {
        componentId: "main",
        name: "Chicken Tikka",
        type: "main",
        required: true,
        purpose: "Primary yogurt-marinated grilled chicken.",
        relationship: "intrinsic",
      },
      {
        componentId: "basmati",
        name: "Basmati rice",
        type: "carb_side",
        required: true,
        purpose: "Completes the meal with a neutral aromatic grain.",
        relationship: "recommended_side",
      },
      {
        componentId: "mint-chutney",
        name: "Mint-yogurt chutney",
        type: "condiment",
        required: false,
        purpose: "Cooling herbal contrast to the charred spice.",
        relationship: "recommended_side",
      },
    ],
    flavorProfile: {
      cuisineFamily: "Indian",
      regionalStyle: "Punjab",
      flavorFamilies: ["tandoori", "yogurt-chili", "smoky"],
      primarySauce: "yogurt marinade",
      cookingTechniques: ["marinate", "roast", "char"],
      textureProfile: ["charred", "tender"],
    },
    experienceProfile: {
      moistureLevel: "moderate",
      flavorIntensity: "bold",
      textureTags: ["charred", "tender"],
      mealPrepQuality: "excellent",
    },
    resolutionMetadata: {
      provider: "gemini",
      model: "gemini-3.6-flash",
      promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
    },
    ...overrides,
  };
}

describe("recipe-resolution contracts", () => {
  it("exports recipe-resolution-v1 prompt version and default concurrency", () => {
    expect(RECIPE_RESOLUTION_PROMPT_VERSION).toBe("recipe-resolution-v1");
    expect(DEFAULT_RECIPE_RESOLUTION_CONCURRENCY).toBe(2);
  });

  it("accepts a valid resolution request and resolved recipe", () => {
    expect(RecipeResolutionRequestSchema.safeParse({ candidate: sampleCandidate }).success).toBe(
      true,
    );
    expect(ResolvedRecipeSchema.safeParse(sampleResolvedRecipe()).success).toBe(true);
  });

  it("rejects recipes with empty ingredients, zero quantity, or zero servings", () => {
    expect(
      ResolvedRecipeSchema.safeParse(sampleResolvedRecipe({ ingredients: [] })).success,
    ).toBe(false);
    expect(
      ResolvedRecipeSchema.safeParse(
        sampleResolvedRecipe({
          ingredients: [
            {
              ingredientId: "chicken",
              name: "chicken",
              quantity: 0,
              unit: "g",
              role: "protein",
              scalingBehavior: "primary_scalable",
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(ResolvedRecipeSchema.safeParse(sampleResolvedRecipe({ baseServings: 0 })).success).toBe(
      false,
    );
  });

  it("does not model authoritative nutrition fields on ResolvedRecipe", () => {
    const shape = ResolvedRecipeSchema.shape;
    expect(shape).not.toHaveProperty("calories");
    expect(shape).not.toHaveProperty("proteinGrams");
    expect(shape).not.toHaveProperty("macros");
    expect(shape).not.toHaveProperty("nutrition");
  });
});
