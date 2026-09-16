import { describe, expect, it } from "vitest";
import {
  CompleteMealSchema,
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
});
