import { describe, expect, it, vi } from "vitest";
import { makeChickenTikkaResolvedRecipe } from "@fitness-autopilot/domain";
import { GeminiMealCompositionProvider } from "./meal-composition-provider";
import {
  coerceMealCompositionPayload,
  geminiMealCompositionResponseJsonSchema,
} from "./meal-composition-schema";

describe("meal composition schema", () => {
  it("exposes JSON schema without nutrition fields", () => {
    const schema = JSON.stringify(geminiMealCompositionResponseJsonSchema());
    expect(schema).not.toMatch(/caloriesKcal|proteinGrams|fiberGrams/);
  });

  it("coerces role aliases and strips nutrition", () => {
    const coerced = coerceMealCompositionPayload({
      mealName: "Tikka plate",
      alreadySatisfiedRoles: ["protein"],
      missingRoles: ["carb", "veg"],
      addedComponents: [
        {
          name: "basmati rice",
          role: "carb_side",
          relationship: "recommended_side",
          reason: "starch",
          definitionKind: "atomic",
          caloriesKcal: 200,
          grams: 150,
        },
      ],
      compositionSummary: "ok",
    }) as {
      alreadySatisfiedRoles: string[];
      missingRoles: string[];
      addedComponents: Array<Record<string, unknown>>;
    };
    expect(coerced.missingRoles).toContain("carbohydrate");
    expect(coerced.missingRoles).toContain("vegetable");
    expect(coerced.addedComponents[0]?.role).toBe("carbohydrate");
    expect(coerced.addedComponents[0]?.relationship).toBe("recommended");
    expect(coerced.addedComponents[0]?.definitionKind).toBe("atomic_food");
    expect(coerced.addedComponents[0]).not.toHaveProperty("caloriesKcal");
    expect(coerced.addedComponents[0]).not.toHaveProperty("grams");
  });
});

describe("GeminiMealCompositionProvider", () => {
  it("calls Gemini and returns a culinary proposal (no live network)", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        mealName: "Chicken Tikka plate",
        alreadySatisfiedRoles: ["main"],
        missingRoles: ["vegetable"],
        addedComponents: [
          {
            name: "kachumber",
            role: "vegetable",
            relationship: "required_companion",
            reason: "Fresh salad",
            definitionKind: "recipe_component",
            recipeIngredients: [
              { name: "cucumber", quantity: 100, unit: "g" },
              { name: "tomato", quantity: 80, unit: "g" },
            ],
          },
        ],
        compositionSummary: "Add kachumber",
      }),
    });

    const provider = new GeminiMealCompositionProvider({
      model: "gemini-test",
      client: { generateContent },
    });

    const proposal = await provider.compose({
      mealType: "lunch",
      recipe: makeChickenTikkaResolvedRecipe({
        mealComponents: [
          {
            componentId: "main",
            name: "Chicken Tikka",
            type: "main",
            required: true,
            purpose: "Main",
            relationship: "intrinsic",
          },
        ],
        experienceProfile: {
          moistureLevel: "dry",
          flavorIntensity: "bold",
          textureTags: [],
          mealPrepQuality: "excellent",
        },
      }),
      allergies: [],
      dietaryRestrictions: [],
      dislikes: [],
    });

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(proposal.addedComponents[0]?.name).toBe("kachumber");
    expect(proposal).not.toHaveProperty("caloriesKcal");
  });
});
