import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type {
  CookingPreferences,
  MealPreferences,
  NutritionTarget,
  WeeklyMealStrategy,
  WeeklyStrategyStats,
} from "@fitness-autopilot/contracts";
import { assertSafeForClientDisplay, sanitizeDiagnosticText } from "./recipe-preview";
import {
  WEEKLY_STRATEGY_FUNCTION_NAME,
  WEEKLY_STRATEGY_PREVIEW_LOADING,
  WEEKLY_STRATEGY_PREVIEW_ROUTE,
  WEEKLY_STRATEGY_PREVIEW_TITLE,
  beginWeeklyStrategyGeneration,
  buildPlanningContextRows,
  buildStrategyStatsRows,
  buildStrategySummaryRows,
  buildWeeklyDayViews,
  buildWeeklyStrategyAiDetailsRows,
  buildWeeklyStrategyRequest,
  canBuildWeeklyStrategyRequest,
  canStartWeeklyStrategyGeneration,
  createWeeklyStrategyPreviewUiState,
  failWeeklyStrategyGeneration,
  humanizeWeeklyStrategyError,
  invokeGenerateWeeklyStrategy,
  parseGenerateWeeklyStrategyFailure,
  repeatStatusLabel,
  selectWeeklyStrategyHistoryEntry,
  succeedWeeklyStrategyGeneration,
  weeklyStrategyPreviewContainsSecrets,
} from "./weekly-strategy-preview";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const nutritionTarget = {
  id: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
  goalId: "33333333-3333-3333-3333-333333333333",
  estimatedMaintenanceCalories: 2500,
  targetCalories: 2200,
  proteinG: 160,
  fatG: 70,
  fatMinG: 60,
  fatMaxG: 80,
  carbohydrateG: 220,
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

function concept(params: {
  conceptId: string;
  name: string;
  mealType: "breakfast" | "lunch" | "snack" | "dinner";
  cuisineFamily?: string;
  primaryProtein?: string;
  flavorFamilies?: string[];
  experienceTags?: string[];
  prepIntent?: "fully_prepped" | "component_prepped" | "fresh";
  estimatedFinishMinutes?: number;
  repeatOfConceptId?: string | null;
}) {
  return {
    prepIntent:
      params.mealType === "dinner" ? ("fresh" as const) : ("fully_prepped" as const),
    estimatedFinishMinutes: params.mealType === "dinner" ? 10 : undefined,
    ...params,
  };
}

function sampleStrategy(): WeeklyMealStrategy {
  const smoothie = concept({
    conceptId: "breakfast-smoothie-1",
    name: "Berry Protein Smoothie",
    mealType: "breakfast",
    cuisineFamily: "American",
    primaryProtein: "Greek yogurt",
  });
  const yogurt = concept({
    conceptId: "snack-yogurt-1",
    name: "Greek Yogurt + Berries",
    mealType: "snack",
    primaryProtein: "Greek yogurt",
  });
  const tikka = concept({
    conceptId: "lunch-tikka-bowl-1",
    name: "Chicken Tikka Rice Bowl",
    mealType: "lunch",
    cuisineFamily: "Indian",
    primaryProtein: "Chicken",
    flavorFamilies: ["tikka", "smoky"],
    experienceTags: ["saucy"],
  });
  const couscous = concept({
    conceptId: "lunch-couscous-1",
    name: "Mediterranean Chickpea Couscous",
    mealType: "lunch",
    cuisineFamily: "Mediterranean",
    primaryProtein: "Chickpeas",
  });
  const fajitas = concept({
    conceptId: "dinner-fajitas-1",
    name: "Chipotle Chicken Fajitas",
    mealType: "dinner",
    cuisineFamily: "Mexican",
    primaryProtein: "Chicken",
  });
  const basil = concept({
    conceptId: "dinner-thai-basil-1",
    name: "Thai Basil Chicken",
    mealType: "dinner",
    cuisineFamily: "East Asian",
    primaryProtein: "Chicken",
  });
  const salmon = concept({
    conceptId: "dinner-salmon-1",
    name: "Garlic-Lime Salmon Rice Bowl",
    mealType: "dinner",
    cuisineFamily: "Mediterranean",
    primaryProtein: "Fish",
  });
  const eggs = concept({
    conceptId: "breakfast-masala-eggs-1",
    name: "Masala Eggs + Toast",
    mealType: "breakfast",
    cuisineFamily: "Indian",
    primaryProtein: "Eggs",
  });

  return {
    strategySummary: {
      varietyLevel: "balanced",
      breakfastPattern: "Two rotating breakfasts.",
      lunchPattern: "Ready lunch bowls with strategic repeats.",
      dinnerPattern: "Quick fresh dinners across preferred cuisines.",
      snackPattern: "Repeated yogurt snack.",
      prepApproach: "Once-weekly prep for lunches; dinners finish in ~10 minutes.",
    },
    days: [
      { day: "monday", breakfast: smoothie, lunch: tikka, snack: yogurt, dinner: fajitas },
      {
        day: "tuesday",
        breakfast: { ...smoothie, repeatOfConceptId: "breakfast-smoothie-1" },
        lunch: couscous,
        snack: { ...yogurt, repeatOfConceptId: "snack-yogurt-1" },
        dinner: basil,
      },
      {
        day: "wednesday",
        breakfast: eggs,
        lunch: { ...tikka, repeatOfConceptId: "lunch-tikka-bowl-1" },
        snack: yogurt,
        dinner: salmon,
      },
      {
        day: "thursday",
        breakfast: { ...smoothie, repeatOfConceptId: "breakfast-smoothie-1" },
        lunch: couscous,
        snack: { ...yogurt, repeatOfConceptId: "snack-yogurt-1" },
        dinner: fajitas,
      },
      { day: "friday", breakfast: eggs, lunch: tikka, snack: yogurt, dinner: basil },
      { day: "saturday", breakfast: smoothie, lunch: couscous, snack: yogurt, dinner: salmon },
      {
        day: "sunday",
        breakfast: { ...eggs, repeatOfConceptId: "breakfast-masala-eggs-1" },
        lunch: { ...tikka, repeatOfConceptId: "lunch-tikka-bowl-1" },
        snack: { ...yogurt, repeatOfConceptId: "snack-yogurt-1" },
        dinner: fajitas,
      },
    ],
    sharedIngredientIntents: ["chicken", "rice", "Greek yogurt", "garlic", "lime"],
    uniqueConceptCount: 8,
    planningNotes: ["Avoid direct leftovers as the primary strategy."],
  };
}

const sampleStats: WeeklyStrategyStats = {
  totalMealSlots: 28,
  uniqueConcepts: 8,
  uniqueBreakfastConcepts: 2,
  uniqueLunchConcepts: 2,
  uniqueSnackConcepts: 1,
  uniqueDinnerConcepts: 3,
  repeatedMealSlots: 10,
  cuisineFamilies: ["American", "East Asian", "Indian", "Mediterranean", "Mexican"],
  primaryProteins: ["Chicken", "Chickpeas", "Eggs", "Fish", "Greek yogurt"],
};

describe("weekly strategy preview route", () => {
  it("registers a reachable Weekly Strategy Preview route and Today entry", () => {
    const layout = readFileSync(join(mobileRoot, "app/_layout.tsx"), "utf8");
    const today = readFileSync(join(mobileRoot, "app/today.tsx"), "utf8");
    const screen = readFileSync(join(mobileRoot, "app/weekly-strategy-preview.tsx"), "utf8");
    expect(WEEKLY_STRATEGY_PREVIEW_ROUTE).toBe("/weekly-strategy-preview");
    expect(WEEKLY_STRATEGY_PREVIEW_TITLE).toBe("Dev: Weekly Strategy Preview");
    expect(layout).toContain("weekly-strategy-preview");
    expect(today).toContain(WEEKLY_STRATEGY_PREVIEW_ROUTE);
    expect(today).toContain(WEEKLY_STRATEGY_PREVIEW_TITLE);
    expect(screen).toContain("WEEKLY_STRATEGY_PREVIEW_TITLE");
    expect(screen).toContain("WEEKLY_STRATEGY_PREVIEW_LOADING");
    expect(screen).toContain("Retry");
    expect(screen).toContain("Raw WeeklyMealStrategy");
    expect(screen).toContain("Planning Context");
    expect(screen).toContain("AI Details");
    expect(screen).toContain("Potential shared ingredients");
    expect(screen).not.toContain("Your grocery list");
    expect(screen).not.toContain("generateRecipe");
    expect(screen).not.toContain("@google/genai");
    expect(screen).not.toContain("GEMINI_API_KEY=");
  });
});

describe("weekly strategy preview request building", () => {
  it("loads current user nutrition and PLAN-001/002 preferences into the request", () => {
    expect(
      canBuildWeeklyStrategyRequest({
        nutritionTarget,
        mealPreferences,
        cookingPreferences,
      }),
    ).toBe(true);
    const request = buildWeeklyStrategyRequest({
      nutritionTarget,
      mealPreferences,
      cookingPreferences,
    });
    expect(request).not.toBeNull();
    if (!request) {
      return;
    }
    expect(request.nutrition.targetCaloriesPerDay).toBe(2200);
    expect(request.nutrition.targetProteinGramsPerDay).toBe(160);
    expect(request.nutrition.targetCarbsGramsPerDay).toBe(220);
    expect(request.nutrition.targetFatGramsPerDay).toBe(70);
    expect(request.foodPreferences.cuisines).toEqual(["indian", "mexican"]);
    expect(request.foodPreferences.proteinPreferences).toEqual(["chicken", "fish"]);
    expect(request.foodPreferences.experiencePreferences).toEqual([
      "saucy_flavorful",
      "spicy",
    ]);
    expect(request.foodPreferences.allergies).toEqual(["Peanuts"]);
    expect(request.foodPreferences.dietaryRestrictions).toEqual(["Pork"]);
    expect(request.foodPreferences.dislikes).toEqual(["Olives"]);
    expect(request.foodPreferences.varietyLevel).toBe("balanced");
    expect(request.cookingPreferences.prepFrequency).toBe("once_weekly");
    expect(request.cookingPreferences.maxPrepSessionMinutes).toBe(90);
    expect(request.cookingPreferences.cookingStyle).toBe("ready_lunch_fresh_dinner");
    expect(request.cookingPreferences.maxFinishMinutes).toBe(10);
    expect(request.cookingPreferences.useDinnerPrepForNextLunch).toBe(true);
  });

  it("does not invent a request when nutrition targets are missing", () => {
    expect(
      canBuildWeeklyStrategyRequest({
        nutritionTarget: null,
        mealPreferences,
        cookingPreferences,
      }),
    ).toBe(false);
    expect(
      buildWeeklyStrategyRequest({
        nutritionTarget: null,
        mealPreferences,
        cookingPreferences,
      }),
    ).toBeNull();
  });
});

describe("weekly strategy preview API invoke", () => {
  it("calls the PLAN-004 generate-weekly-strategy function once with the request body", async () => {
    const invoke = vi.fn(async () => ({
      data: {
        strategy: sampleStrategy(),
        stats: sampleStats,
        meta: {
          requestId: "ws_1",
          promptVersion: "weekly-strategy-v1",
          provider: "gemini",
          model: "gemini-3.6-flash",
          durationMs: 2400,
        },
      },
      error: null,
    }));
    const request = buildWeeklyStrategyRequest({
      nutritionTarget,
      mealPreferences,
      cookingPreferences,
    });
    expect(request).not.toBeNull();
    if (!request) {
      return;
    }
    const result = await invokeGenerateWeeklyStrategy(invoke, request);
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith(WEEKLY_STRATEGY_FUNCTION_NAME, { body: request });
    expect(invoke).not.toHaveBeenCalledWith("generate-recipe", expect.anything());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.strategy.days).toHaveLength(7);
    expect(result.stats.uniqueConcepts).toBe(8);
    expect(result.meta?.promptVersion).toBe("weekly-strategy-v1");
  });

  it("maps API errors with code and safe diagnostics", () => {
    const parsed = parseGenerateWeeklyStrategyFailure({
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

  it("humanizes unreachable Edge Function / CORS failures", () => {
    expect(
      humanizeWeeklyStrategyError("Failed to send a request to the Edge Function"),
    ).toContain("generate-weekly-strategy");
    const parsed = parseGenerateWeeklyStrategyFailure({
      errorMessage: "Failed to send a request to the Edge Function",
      data: null,
    });
    expect(parsed.message).toContain("Deploy");
    expect(parsed.message).not.toBe("Failed to send a request to the Edge Function");
  });

  it("never surfaces API key-looking diagnostics", () => {
    const sanitized = sanitizeDiagnosticText({
      GEMINI_API_KEY: "secret-key-value",
      Authorization: "Bearer abc.def",
    });
    expect(sanitized).toContain("omitted");
    expect(assertSafeForClientDisplay(sanitized ?? "")).toBe(true);
    expect(weeklyStrategyPreviewContainsSecrets(sanitized ?? "")).toBe(false);
  });
});

describe("weekly strategy preview rendering model", () => {
  it("renders seven days, concepts, cuisine/protein, prep intent, and explicit repeats", () => {
    const days = buildWeeklyDayViews(sampleStrategy().days);
    expect(days).toHaveLength(7);
    expect(days.map((day) => day.day)).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
    const mondayLunch = days[0]?.slots.find((slot) => slot.mealType === "lunch");
    expect(mondayLunch?.name).toBe("Chicken Tikka Rice Bowl");
    expect(mondayLunch?.metaLine).toBe("Indian • Chicken");
    expect(mondayLunch?.flavorLine).toContain("tikka");
    expect(mondayLunch?.experienceLine).toContain("saucy");
    expect(mondayLunch?.prepLine).toContain("Fully prepped");
    expect(mondayLunch?.isRepeat).toBe(false);

    const tuesdayBreakfast = days[1]?.slots.find((slot) => slot.mealType === "breakfast");
    expect(tuesdayBreakfast?.isRepeat).toBe(true);
    expect(tuesdayBreakfast?.repeatLabel).toBe("Same as Monday breakfast");

    const tuesdayDinner = days[1]?.slots.find((slot) => slot.mealType === "dinner");
    expect(tuesdayDinner?.prepLine).toContain("Fresh");
    expect(tuesdayDinner?.prepLine).toContain("≤10 min finish");

    const tuesdaySmoothie = sampleStrategy().days[1]?.breakfast;
    expect(tuesdaySmoothie).toBeTruthy();
    if (tuesdaySmoothie) {
      expect(repeatStatusLabel(tuesdaySmoothie, sampleStrategy().days)).toBe(
        "Same as Monday breakfast",
      );
    }
  });

  it("renders strategy summary, deterministic stats, shared ingredients, context, AI metadata, and raw JSON", () => {
    const request = buildWeeklyStrategyRequest({
      nutritionTarget,
      mealPreferences,
      cookingPreferences,
    });
    expect(request).not.toBeNull();
    if (!request) {
      return;
    }
    const context = buildPlanningContextRows(request);
    expect(context.find((row) => row.label === "Daily calorie target")?.value).toBe(
      "2200 kcal",
    );
    expect(context.find((row) => row.label === "Variety level")?.value).toContain("Balanced");
    expect(context.find((row) => row.label === "Cuisine preferences")?.value).toContain(
      "Indian",
    );
    expect(context.find((row) => row.label === "Allergies")?.value).toBe("Peanuts");
    expect(context.find((row) => row.label === "Prep frequency")?.value).toContain(
      "One main prep session",
    );
    expect(context.find((row) => row.label === "Dinner prep → next lunch")?.value).toBe("Yes");

    const summary = buildStrategySummaryRows(sampleStrategy());
    expect(summary.find((row) => row.label === "Variety")?.value).toContain("Balanced");
    expect(summary.find((row) => row.label === "Breakfast pattern")?.value).toContain(
      "rotating breakfasts",
    );

    const stats = buildStrategyStatsRows(sampleStats);
    expect(stats.find((row) => row.label === "Total meal slots")?.value).toBe("28");
    expect(stats.find((row) => row.label === "Unique concepts")?.value).toBe("8");
    expect(stats.find((row) => row.label === "Repeated meal slots")?.value).toBe("10");
    expect(stats.find((row) => row.label === "Unique breakfasts")?.value).toBe("2");
    expect(stats.find((row) => row.label === "Cuisine families")?.value).toContain("Indian");

    expect(sampleStrategy().sharedIngredientIntents).toEqual(
      expect.arrayContaining(["chicken", "Greek yogurt"]),
    );

    const ai = buildWeeklyStrategyAiDetailsRows({
      requestId: "ws_1",
      promptVersion: "weekly-strategy-v1",
      provider: "gemini",
      model: "gemini-3.6-flash",
      durationMs: 2400,
      usageMetadata: { totalTokenCount: 1800 },
    });
    expect(ai.find((row) => row.label === "Provider")?.value).toBe("gemini");
    expect(ai.find((row) => row.label === "Model")?.value).toBe("gemini-3.6-flash");
    expect(ai.find((row) => row.label === "Prompt")?.value).toBe("weekly-strategy-v1");
    expect(ai.find((row) => row.label === "Usage")?.value).toContain("1800");

    const raw = JSON.stringify({ strategy: sampleStrategy(), stats: sampleStats }, null, 2);
    expect(raw).toContain("conceptId");
    expect(raw).toContain("repeatOfConceptId");
    expect(raw).toContain("sharedIngredientIntents");
    expect(weeklyStrategyPreviewContainsSecrets(raw)).toBe(false);
  });
});

describe("weekly strategy preview UI state machine", () => {
  it("enters loading, blocks duplicate requests, and keeps prior result visible", () => {
    const request = buildWeeklyStrategyRequest({
      nutritionTarget,
      mealPreferences,
      cookingPreferences,
    });
    expect(request).not.toBeNull();
    if (!request) {
      return;
    }
    let state = createWeeklyStrategyPreviewUiState();
    expect(canStartWeeklyStrategyGeneration(state)).toBe(true);
    expect(WEEKLY_STRATEGY_PREVIEW_LOADING).toBe("Planning your week...");

    state = beginWeeklyStrategyGeneration(state);
    expect(state.busy).toBe(true);
    expect(canStartWeeklyStrategyGeneration(state)).toBe(false);
    expect(beginWeeklyStrategyGeneration(state)).toBe(state);

    state = succeedWeeklyStrategyGeneration(state, {
      request,
      strategy: sampleStrategy(),
      stats: sampleStats,
      meta: {
        requestId: "ws_1",
        promptVersion: "weekly-strategy-v1",
        provider: "gemini",
        model: "gemini-3.6-flash",
      },
    });
    expect(state.current?.label).toBe("Week 1");
    expect(state.current?.strategy.days).toHaveLength(7);

    state = beginWeeklyStrategyGeneration(state);
    expect(state.busy).toBe(true);
    expect(state.current?.strategy.days[0]?.lunch?.name).toBe("Chicken Tikka Rice Bowl");

    state = failWeeklyStrategyGeneration(state, {
      code: "LLM_PROVIDER_ERROR",
      message: "Temporary failure",
    });
    expect(state.error?.code).toBe("LLM_PROVIDER_ERROR");
    expect(state.current).not.toBeNull();
    expect(canStartWeeklyStrategyGeneration(state)).toBe(true);

    state = succeedWeeklyStrategyGeneration(state, {
      request,
      strategy: {
        ...sampleStrategy(),
        strategySummary: {
          ...sampleStrategy().strategySummary,
          breakfastPattern: "Different second week.",
        },
      },
      stats: sampleStats,
    });
    expect(state.history).toHaveLength(2);
    expect(state.current?.label).toBe("Week 2");
    state = selectWeeklyStrategyHistoryEntry(state, state.history[0]!.id);
    expect(state.current?.strategy.strategySummary.breakfastPattern).toContain(
      "rotating breakfasts",
    );
  });
});

describe("weekly strategy preview architecture boundaries", () => {
  it("does not call Gemini or PLAN-003 recipe generation from the preview layer", () => {
    const lib = readFileSync(join(mobileRoot, "src/lib/weekly-strategy-preview.ts"), "utf8");
    const session = readFileSync(join(mobileRoot, "src/state/session.tsx"), "utf8");
    expect(lib).not.toContain("@google/genai");
    expect(lib).not.toContain("GoogleGenAI");
    expect(lib).not.toContain("generate-recipe");
    expect(lib).not.toContain("generateRecipe");
    expect(lib).toContain(WEEKLY_STRATEGY_FUNCTION_NAME);
    expect(session).toContain("generateWeeklyStrategy");
    expect(session).toContain("invokeGenerateWeeklyStrategy");
    expect(session).not.toContain("@google/genai");
  });

  it("serves generate-weekly-strategy with CORS like generate-recipe", () => {
    const weekly = readFileSync(
      join(mobileRoot, "../../supabase/functions/generate-weekly-strategy/index.ts"),
      "utf8",
    );
    const recipe = readFileSync(
      join(mobileRoot, "../../supabase/functions/generate-recipe/index.ts"),
      "utf8",
    );
    const config = readFileSync(join(mobileRoot, "../../supabase/config.toml"), "utf8");
    expect(weekly).toContain("serveWithCors");
    expect(weekly).not.toContain("Deno.serve");
    expect(recipe).toContain("serveWithCors");
    expect(config).toContain("[functions.generate-weekly-strategy]");
    expect(config).toMatch(
      /\[functions\.generate-weekly-strategy\][\s\S]*?verify_jwt\s*=\s*false/,
    );
  });
});
