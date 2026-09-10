import { describe, expect, it } from "vitest";
import {
  RECIPE_GENERATION_PROMPT_VERSION,
  buildRecipeGenerationPrompt,
  parseRecipeGenerationRequest,
  stripNonAuthoritativeNutrition,
  validateRecipeCandidate,
} from "./generation";

const validCandidate = {
  name: "Chicken Tikka Rice Bowl with Mint-Yogurt Chutney",
  description: "Spiced chicken with basmati and a cool mint-yogurt chutney.",
  mealType: "dinner" as const,
  cuisineFamily: "Indian",
  servings: 2,
  ingredients: [
    {
      name: "boneless skinless chicken breast",
      quantityGrams: 400,
      measurementState: "raw" as const,
    },
    {
      name: "cooked basmati rice",
      quantityGrams: 360,
      measurementState: "cooked" as const,
    },
    {
      name: "plain whole-milk yogurt",
      quantityGrams: 120,
      measurementState: "as_packaged" as const,
    },
    {
      name: "olive oil",
      quantityGrams: 15,
      measurementState: "as_packaged" as const,
    },
  ],
  instructions: [
    "Marinate chicken in yogurt and spices.",
    "Cook chicken, warm rice, and spoon over mint-yogurt chutney.",
  ],
  prepMinutes: 20,
  cookMinutes: 25,
  source: {
    type: "ai_original" as const,
    provider: "gemini" as const,
    model: "gemini-2.5-flash",
  },
};

describe("recipe generation domain", () => {
  it("accepts a valid structured recipe candidate", () => {
    const result = validateRecipeCandidate(validCandidate);
    expect(result.ok).toBe(true);
  });

  it("rejects missing grams", () => {
    const result = validateRecipeCandidate({
      ...validCandidate,
      ingredients: [
        {
          name: "chicken breast",
          measurementState: "raw",
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RECIPE_SCHEMA_VALIDATION_FAILED");
    }
  });

  it("rejects zero or negative quantity grams", () => {
    for (const quantityGrams of [0, -10]) {
      const result = validateRecipeCandidate({
        ...validCandidate,
        ingredients: [
          {
            name: "chicken breast",
            quantityGrams,
            measurementState: "raw",
          },
        ],
      });
      expect(result.ok).toBe(false);
    }
  });

  it("rejects invalid measurement state", () => {
    const result = validateRecipeCandidate({
      ...validCandidate,
      ingredients: [
        {
          name: "chicken breast",
          quantityGrams: 200,
          measurementState: "approx",
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects zero or negative servings", () => {
    for (const servings of [0, -1]) {
      const result = validateRecipeCandidate({
        ...validCandidate,
        servings,
      });
      expect(result.ok).toBe(false);
    }
  });

  it("builds a prompt that carries PLAN-001 and PLAN-002 context without batch sizing", () => {
    const request = parseRecipeGenerationRequest({
      mealType: "dinner",
      targetCalories: 650,
      targetProteinGrams: 50,
      cuisines: ["Indian", "Mexican"],
      proteinPreferences: ["Chicken", "Fish"],
      experiencePreferences: ["Saucy & flavorful", "Spicy"],
      allergies: ["Peanuts"],
      dietaryRestrictions: ["Pork"],
      dislikes: ["Olives"],
      varietyLevel: "balanced",
      cookingStyle: "ready_lunch_fresh_dinner",
      maxFinishMinutes: 10,
    });
    expect(request.ok).toBe(true);
    if (!request.ok) {
      return;
    }
    const prompt = buildRecipeGenerationPrompt(request.value);
    expect(prompt.version).toBe(RECIPE_GENERATION_PROMPT_VERSION);
    expect(prompt.userPrompt).toContain("cuisines: Indian, Mexican");
    expect(prompt.userPrompt).toContain("proteinPreferences: Chicken, Fish");
    expect(prompt.userPrompt).toContain("experiencePreferences: Saucy & flavorful, Spicy");
    expect(prompt.userPrompt).toContain("allergies (hard exclude): Peanuts");
    expect(prompt.userPrompt).toContain("dietaryRestrictions (hard exclude): Pork");
    expect(prompt.userPrompt).toContain("dislikes (strongly avoid): Olives");
    expect(prompt.userPrompt).toContain("varietyLevel: balanced");
    expect(prompt.userPrompt).toContain("exactly one recipe");
    expect(prompt.userPrompt).not.toMatch(/simple\s*=\s*3|balanced\s*=\s*5|high\s*=\s*7/i);
    expect(prompt.userPrompt).toContain("cookingStyle: ready_lunch_fresh_dinner");
    expect(prompt.userPrompt).toContain("maxFinishMinutes: 10");
    expect(prompt.systemInstruction).toContain("Do NOT output calories");
  });

  it("strips AI nutrition fields so they are never treated as authoritative", () => {
    const stripped = stripNonAuthoritativeNutrition({
      ...validCandidate,
      caloriesKcal: 900,
      proteinG: 60,
      nutrition: { caloriesKcal: 900 },
      ingredients: [
        {
          name: "chicken",
          quantityGrams: 200,
          measurementState: "raw",
          calories: 220,
        },
      ],
    }) as Record<string, unknown>;
    expect(stripped.caloriesKcal).toBeUndefined();
    expect(stripped.proteinG).toBeUndefined();
    expect(stripped.nutrition).toBeUndefined();
    const ingredient = (stripped.ingredients as Array<Record<string, unknown>>)[0];
    expect(ingredient?.calories).toBeUndefined();
    expect(ingredient?.quantityGrams).toBe(200);
    const validated = validateRecipeCandidate(stripped);
    expect(validated.ok).toBe(true);
  });
});
