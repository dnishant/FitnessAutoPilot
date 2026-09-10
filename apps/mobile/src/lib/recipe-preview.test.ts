import { describe, expect, it, vi } from "vitest";
import type {
  CookingPreferences,
  MealPreferences,
  NutritionTarget,
  RecipeCandidate,
} from "@fitness-autopilot/contracts";
import {
  assertSafeForClientDisplay,
  beginRecipeGeneration,
  buildAiDetailsRows,
  buildGenerationContextRows,
  buildRecipeGenerationRequest,
  canStartGeneration,
  createRecipePreviewUiState,
  failRecipeGeneration,
  formatIngredientLine,
  formatRecipeTotalMinutes,
  invokeGenerateRecipe,
  mealTypeLabel,
  parseGenerateRecipeFailure,
  selectHistoryEntry,
  succeedRecipeGeneration,
  sanitizeDiagnosticText,
} from "./recipe-preview";

const nutritionTarget = {
  id: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
  goalId: "33333333-3333-3333-3333-333333333333",
  estimatedMaintenanceCalories: 2500,
  targetCalories: 2000,
  proteinG: 150,
  fatMinG: 60,
  fatMaxG: 80,
  carbohydrateG: 200,
  desiredRateKgPerWeek: -0.5,
  algorithmName: "nutrition-target",
  algorithmVersion: "nutrition-target-v1",
  inputSnapshot: {},
  validFrom: "2026-09-10T00:00:00.000Z",
  createdAt: "2026-09-10T00:00:00.000Z",
} satisfies NutritionTarget;

const mealPreferences = {
  userId: "22222222-2222-2222-2222-222222222222",
  cuisines: ["indian", "mexican"],
  proteinPreferences: ["chicken", "fish"],
  allergies: ["Peanuts"],
  dietaryRestrictions: ["Pork"],
  dislikes: ["Olives"],
  experiencePreferences: ["saucy_flavorful", "spicy"],
  varietyLevel: "balanced",
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
} satisfies MealPreferences;

const cookingPreferences = {
  userId: "22222222-2222-2222-2222-222222222222",
  prepFrequency: "once_weekly",
  maxPrepSessionMinutes: 90,
  cookingStyle: "ready_lunch_fresh_dinner",
  maxFinishMinutes: 10,
  useDinnerPrepForNextLunch: true,
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
} satisfies CookingPreferences;

const sampleRecipe = {
  name: "Chicken Tikka Rice Bowl with Mint-Yogurt Chutney",
  description: "Spiced chicken with rice and mint-yogurt chutney.",
  mealType: "dinner",
  cuisineFamily: "Indian",
  servings: 2,
  ingredients: [
    {
      name: "boneless skinless chicken breast",
      quantityGrams: 400,
      measurementState: "raw",
    },
    {
      name: "basmati rice",
      quantityGrams: 400,
      measurementState: "cooked",
      preparationNote: "warmed",
    },
  ],
  instructions: [
    "Marinate chicken in yogurt and spices.",
    "Cook chicken and serve over rice with chutney.",
  ],
  prepMinutes: 15,
  cookMinutes: 20,
  source: {
    type: "ai_original",
    provider: "gemini",
    model: "gemini-2.5-flash",
  },
} satisfies RecipeCandidate;

describe("recipe preview request building", () => {
  it("populates generation request from stored nutrition and PLAN-001/002 preferences", () => {
    const request = buildRecipeGenerationRequest("dinner", {
      nutritionTarget,
      mealPreferences,
      cookingPreferences,
    });
    expect(request.mealType).toBe("dinner");
    expect(request.targetCalories).toBe(600); // 2000 * 0.3
    expect(request.targetProteinGrams).toBe(45); // 150 * 0.3
    expect(request.cuisines).toEqual(["indian", "mexican"]);
    expect(request.proteinPreferences).toEqual(["chicken", "fish"]);
    expect(request.experiencePreferences).toEqual(["saucy_flavorful", "spicy"]);
    expect(request.allergies).toEqual(["Peanuts"]);
    expect(request.dietaryRestrictions).toEqual(["Pork"]);
    expect(request.dislikes).toEqual(["Olives"]);
    expect(request.varietyLevel).toBe("balanced");
    expect(request.cookingStyle).toBe("ready_lunch_fresh_dinner");
    expect(request.maxFinishMinutes).toBe(10);
  });

  it("supports meal-type selection including default dinner label", () => {
    expect(mealTypeLabel("dinner")).toBe("Dinner");
    const lunch = buildRecipeGenerationRequest("lunch", {
      nutritionTarget,
      mealPreferences,
      cookingPreferences,
    });
    expect(lunch.mealType).toBe("lunch");
    expect(lunch.targetCalories).toBe(700); // 2000 * 0.35
  });
});

describe("recipe preview API invoke", () => {
  it("calls the PLAN-003 generate-recipe function with the request body", async () => {
    const invoke = vi.fn(async () => ({
      data: {
        recipe: sampleRecipe,
        meta: {
          requestId: "req_1",
          promptVersion: "recipe-generation-v1",
          provider: "gemini",
          model: "gemini-2.5-flash",
          durationMs: 1234,
        },
      },
      error: null,
    }));
    const request = buildRecipeGenerationRequest("dinner", {
      nutritionTarget,
      mealPreferences,
      cookingPreferences,
    });
    const result = await invokeGenerateRecipe(invoke, request);
    expect(invoke).toHaveBeenCalledWith("generate-recipe", { body: request });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.recipe.name).toContain("Chicken Tikka");
    expect(result.meta?.promptVersion).toBe("recipe-generation-v1");
  });

  it("maps API errors with code and safe diagnostics", () => {
    const parsed = parseGenerateRecipeFailure({
      errorMessage: "Edge Function returned a non-2xx status code",
      data: {
        error: {
          code: "LLM_PROVIDER_ERROR",
          message: "Gemini quota exceeded",
          details: { reason: "quota" },
        },
      },
    });
    expect(parsed.code).toBe("LLM_PROVIDER_ERROR");
    expect(parsed.message).toBe("Gemini quota exceeded");
    expect(parsed.diagnostics).toContain("quota");
  });

  it("never surfaces API key-looking diagnostics", () => {
    const sanitized = sanitizeDiagnosticText({
      GEMINI_API_KEY: "secret-key-value",
      Authorization: "Bearer abc.def",
    });
    expect(sanitized).toContain("omitted");
    expect(assertSafeForClientDisplay(sanitized ?? "")).toBe(true);
  });
});

describe("recipe preview formatting", () => {
  it("renders ingredient grams, measurement state, and instructions fields", () => {
    expect(formatIngredientLine(sampleRecipe.ingredients[0]!)).toBe(
      "400 g boneless skinless chicken breast — raw",
    );
    expect(formatIngredientLine(sampleRecipe.ingredients[1]!)).toBe(
      "400 g basmati rice — cooked (warmed)",
    );
    expect(formatRecipeTotalMinutes(sampleRecipe)).toBe(35);
    expect(sampleRecipe.instructions).toHaveLength(2);
  });

  it("builds generation context and AI metadata rows", () => {
    const request = buildRecipeGenerationRequest("dinner", {
      nutritionTarget,
      mealPreferences,
      cookingPreferences,
    });
    const context = buildGenerationContextRows(request);
    expect(context.find((row) => row.label === "Meal type")?.value).toBe("Dinner");
    expect(context.find((row) => row.label === "Requested target calories")?.value).toContain(
      "600 kcal",
    );
    expect(context.find((row) => row.label === "Cuisine preferences")?.value).toContain("Indian");
    expect(context.find((row) => row.label === "Allergies")?.value).toBe("Peanuts");
    expect(context.find((row) => row.label === "Cooking style")?.value).toContain("Ready lunches");

    const ai = buildAiDetailsRows(sampleRecipe, {
      requestId: "req_1",
      promptVersion: "recipe-generation-v1",
      provider: "gemini",
      model: "gemini-2.5-flash",
      durationMs: 900,
    });
    expect(ai.find((row) => row.label === "Provider")?.value).toBe("gemini");
    expect(ai.find((row) => row.label === "Model")?.value).toBe("gemini-2.5-flash");
    expect(ai.find((row) => row.label === "Prompt")?.value).toBe("recipe-generation-v1");
  });
});

describe("recipe preview UI state machine", () => {
  it("starts with dinner selected and allows generate when idle", () => {
    const state = createRecipePreviewUiState();
    expect(state.mealType).toBe("dinner");
    expect(canStartGeneration(state)).toBe(true);
  });

  it("enters loading and blocks duplicate requests", () => {
    const loading = beginRecipeGeneration(createRecipePreviewUiState());
    expect(loading.busy).toBe(true);
    expect(canStartGeneration(loading)).toBe(false);
    expect(beginRecipeGeneration(loading)).toBe(loading);
  });

  it("keeps prior result visible on failure and supports retry transition", () => {
    const request = buildRecipeGenerationRequest("dinner", {
      nutritionTarget,
      mealPreferences,
      cookingPreferences,
    });
    let state = succeedRecipeGeneration(createRecipePreviewUiState(), {
      request,
      recipe: sampleRecipe,
      meta: {
        requestId: "req_1",
        promptVersion: "recipe-generation-v1",
        provider: "gemini",
        model: "gemini-2.5-flash",
      },
    });
    expect(state.current?.recipe.name).toContain("Chicken Tikka");
    expect(JSON.stringify(state.current?.recipe, null, 2)).toContain("quantityGrams");

    state = beginRecipeGeneration(state);
    expect(state.busy).toBe(true);
    expect(state.current?.recipe.name).toContain("Chicken Tikka");

    state = failRecipeGeneration(state, {
      code: "LLM_PROVIDER_ERROR",
      message: "Temporary failure",
    });
    expect(state.busy).toBe(false);
    expect(state.error?.code).toBe("LLM_PROVIDER_ERROR");
    expect(state.current).not.toBeNull();
    expect(canStartGeneration(state)).toBe(true);
  });

  it("retains session history and allows selecting prior generations", () => {
    const request = buildRecipeGenerationRequest("dinner", {
      nutritionTarget,
      mealPreferences,
      cookingPreferences,
    });
    let state = succeedRecipeGeneration(createRecipePreviewUiState(), {
      request,
      recipe: sampleRecipe,
    });
    state = succeedRecipeGeneration(state, {
      request,
      recipe: { ...sampleRecipe, name: "Thai Basil Chicken with Jasmine Rice" },
    });
    expect(state.history).toHaveLength(2);
    expect(state.current?.label).toBe("Generation 2");
    state = selectHistoryEntry(state, state.history[0]!.id);
    expect(state.current?.recipe.name).toContain("Chicken Tikka");
  });
});
