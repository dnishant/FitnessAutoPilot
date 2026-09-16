import { describe, expect, it } from "vitest";
import {
  CompleteMealSchema,
  ComposeMealsRequestSchema,
  FIBER_POLICY_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
  MealConceptSchema,
  MealCompositionProposalSchema,
} from "./meal-composition";

describe("PLAN-009.5 meal composition contracts", () => {
  it("rejects authoritative nutrition on composition proposals", () => {
    const parsed = MealCompositionProposalSchema.safeParse({
      mealName: "Chicken Tikka",
      alreadySatisfiedRoles: ["main"],
      missingRoles: ["carbohydrate"],
      addedComponents: [
        {
          name: "basmati rice",
          role: "carbohydrate",
          relationship: "required_companion",
          reason: "Traditional accompaniment",
          definitionKind: "atomic_food",
          caloriesKcal: 200,
        },
      ],
      compositionSummary: "Add rice",
    });
    // Zod strips unknown keys by default — ensure schema itself has no nutrition fields.
    expect(MealCompositionProposalSchema.shape.addedComponents).toBeDefined();
    expect(JSON.stringify(MealCompositionProposalSchema.shape)).not.toMatch(/calories|proteinGrams|fiberGrams/);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.addedComponents[0]).not.toHaveProperty("caloriesKcal");
    }
  });

  it("accepts a complete meal without personalized quantities on engine additions", () => {
    const meal = CompleteMealSchema.parse({
      mealId: "meal-tikka",
      candidateId: "tikka-chicken",
      mainRecipeId: "recipe-tikka",
      name: "Chicken Tikka plate",
      components: [
        {
          componentId: "main",
          role: "main",
          name: "Chicken Tikka",
          relationship: "intrinsic",
          source: "main_recipe",
          reason: "Selected main dish",
          quantityMode: "recipe_defined",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:chicken-tikka",
        },
        {
          componentId: "carb",
          role: "carbohydrate",
          name: "basmati rice",
          relationship: "required_companion",
          source: "composition_engine",
          reason: "Traditional starch",
          quantityMode: "solver_determined",
          definitionKind: "atomic_food",
          normalizedComponentKey: "carbohydrate:basmati-rice",
          definition: {
            kind: "atomic_food",
            name: "basmati rice",
            preparation: "steamed",
            measurementState: "cooked",
          },
          resolution: {
            status: "pending_quantity",
            note: "Quantity owned by PLAN-010",
          },
        },
      ],
      compositionProfile: {
        hasPrimaryProtein: true,
        hasMeaningfulCarbohydrate: true,
        hasMeaningfulVegetableOrFruit: false,
        hasMeaningfulFiberSource: false,
        hasSauceOrMoistureComponent: true,
        addedComponentRoles: ["carbohydrate"],
      },
      metadata: {
        promptVersion: MEAL_COMPOSITION_PROMPT_VERSION,
        policyVersion: "meal-composition-v1",
        createdAt: "2026-09-16T00:00:00.000Z",
      },
    });
    expect(meal.components[1]?.quantityMode).toBe("solver_determined");
    expect(FIBER_POLICY_VERSION).toBe("fiber-policy-v1");
  });

  it("accepts a lightweight meal concept without quantities or instructions", () => {
    expect(MEAL_COMPOSITION_PROMPT_VERSION).toBe("meal-composition-v2");
    const concept = MealConceptSchema.parse({
      candidateId: "tikka-chicken",
      name: "Chicken Tikka",
      main: {
        componentId: "main",
        role: "main",
        name: "Chicken Tikka",
        relationship: "intrinsic",
        source: "candidate",
        reason: "Ranked main-dish candidate",
        definitionKind: "recipe_component",
        normalizedComponentKey: "main:chicken tikka",
      },
      components: [
        {
          componentId: "rice",
          role: "carbohydrate",
          name: "basmati rice",
          relationship: "required_companion",
          source: "composition_engine",
          reason: "Traditional starch",
          definitionKind: "atomic_food",
          normalizedComponentKey: "carbohydrate:basmati rice",
          quantity: 1,
          unit: "cup",
          instructions: ["steam rice"],
        },
      ],
      compositionProfile: {
        hasPrimaryProtein: true,
        hasMeaningfulCarbohydrate: true,
        hasMeaningfulVegetableOrFruit: false,
        hasMeaningfulFiberSource: false,
        hasSauceOrMoistureComponent: false,
        addedComponentRoles: ["carbohydrate"],
      },
      metadata: {
        promptVersion: "meal-composition-v2",
        policyVersion: "meal-composition-v1",
        createdAt: "2026-09-16T00:00:00.000Z",
      },
    });
    expect(concept.components[0]).not.toHaveProperty("quantity");
    expect(concept.components[0]).not.toHaveProperty("instructions");
    expect(JSON.stringify(MealConceptSchema.shape.components)).not.toMatch(
      /instructions|recipeIngredients|quantity/,
    );
  });

  it("accepts compose-meals concept requests with rankedCandidates and no recipes", () => {
    const parsed = ComposeMealsRequestSchema.safeParse({
      stage: "concepts",
      mealType: "dinner",
      rankedCandidates: [
        {
          candidate: {
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
            flavorFamilies: ["tandoori"],
            cookingTechniques: ["tandoor grill"],
            textureTags: ["charred"],
            experienceTags: ["spicy"],
            whyItIsInteresting: "Classic Punjabi yogurt-chili marinade with tandoor char.",
            fitnessAdaptability: "easy",
            fitnessAdaptabilityReason: "Portions can be scaled later.",
            mealPrepAdaptability: "component_prepped",
            estimatedFinishMinutesAfterPrep: 8,
            noveltyReason: "Recognizable tandoori classic.",
            discoveryConfidence: "high",
          },
          score: 90,
          baseScore: 90,
          scoreBreakdown: {
            userPreferenceFit: 0.7,
            culinaryInterest: 0.7,
            sourceQuality: 0.7,
            prepFit: 0.7,
            fitnessAdaptability: 0.7,
            novelty: 0.7,
            repetitionPenalty: 0,
            similarityPenalty: 0,
          },
          rank: 1,
          decision: "selected",
          reasons: ["Ranked #1"],
        },
      ],
      targetCalories: 2250,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.recipes).toBeUndefined();
      expect(parsed.data.rankedCandidates).toHaveLength(1);
    }
  });

  it("does not report recipes as required when rankedCandidates are missing", () => {
    const parsed = ComposeMealsRequestSchema.safeParse({
      stage: "concepts",
      mealType: "dinner",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      expect(flattened.fieldErrors.recipes).toBeUndefined();
      expect(flattened.fieldErrors.rankedCandidates?.[0]).toMatch(/rankedCandidates or recipes/);
    }
  });
});
