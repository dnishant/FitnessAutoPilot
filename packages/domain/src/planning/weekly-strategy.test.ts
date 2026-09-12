import { describe, expect, it } from "vitest";
import type { WeeklyDayStrategy, WeeklyStrategyRequest } from "@fitness-autopilot/contracts";
import {
  WEEKLY_STRATEGY_PROMPT_VERSION,
  buildWeeklyStrategyPrompt,
  calculateUniqueConceptCount,
  calculateWeeklyStrategyStats,
  parseWeeklyStrategyRequest,
  validateWeeklyMealStrategy,
  withDeterministicUniqueConceptCount,
} from "./weekly-strategy";

const sampleRequest: WeeklyStrategyRequest = {
  nutrition: {
    targetCaloriesPerDay: 2200,
    targetProteinGramsPerDay: 160,
    targetCarbsGramsPerDay: 220,
    targetFatGramsPerDay: 70,
  },
  foodPreferences: {
    cuisines: ["Indian", "Mexican", "Mediterranean", "East Asian"],
    proteinPreferences: ["Chicken", "Fish"],
    experiencePreferences: ["Saucy & flavorful"],
    allergies: ["Peanuts"],
    dietaryRestrictions: ["Shellfish"],
    dislikes: ["Olives"],
    varietyLevel: "balanced",
  },
  cookingPreferences: {
    prepFrequency: "once_weekly",
    maxPrepSessionMinutes: 90,
    cookingStyle: "ready_lunch_fresh_dinner",
    maxFinishMinutes: 10,
    useDinnerPrepForNextLunch: true,
  },
};

function concept(
  overrides: Partial<{
    conceptId: string;
    name: string;
    mealType: "breakfast" | "lunch" | "snack" | "dinner";
    cuisineFamily: string;
    primaryProtein: string;
    prepIntent: "fully_prepped" | "component_prepped" | "fresh";
    estimatedFinishMinutes: number;
    repeatOfConceptId: string | null;
  }> & { conceptId: string; name: string; mealType: "breakfast" | "lunch" | "snack" | "dinner" },
) {
  return {
    prepIntent:
      overrides.mealType === "lunch" || overrides.mealType === "breakfast"
        ? ("fully_prepped" as const)
        : ("component_prepped" as const),
    ...overrides,
  };
}

function buildValidDays(): WeeklyDayStrategy[] {
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
    prepIntent: "fresh",
    estimatedFinishMinutes: 10,
  });
  const basil = concept({
    conceptId: "dinner-thai-basil-1",
    name: "Thai Basil Chicken",
    mealType: "dinner",
    cuisineFamily: "East Asian",
    primaryProtein: "Chicken",
    prepIntent: "fresh",
    estimatedFinishMinutes: 10,
  });
  const salmon = concept({
    conceptId: "dinner-salmon-1",
    name: "Garlic-Lime Salmon Rice Bowl",
    mealType: "dinner",
    cuisineFamily: "Mediterranean",
    primaryProtein: "Fish",
    prepIntent: "component_prepped",
    estimatedFinishMinutes: 10,
  });
  const eggs = concept({
    conceptId: "breakfast-masala-eggs-1",
    name: "Masala Eggs + Toast",
    mealType: "breakfast",
    cuisineFamily: "Indian",
    primaryProtein: "Eggs",
  });

  return [
    {
      day: "monday",
      breakfast: smoothie,
      lunch: tikka,
      snack: yogurt,
      dinner: fajitas,
    },
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
    {
      day: "friday",
      breakfast: eggs,
      lunch: tikka,
      snack: yogurt,
      dinner: basil,
    },
    {
      day: "saturday",
      breakfast: smoothie,
      lunch: couscous,
      snack: yogurt,
      dinner: salmon,
    },
    {
      day: "sunday",
      breakfast: { ...eggs, repeatOfConceptId: "breakfast-masala-eggs-1" },
      lunch: { ...tikka, repeatOfConceptId: "lunch-tikka-bowl-1" },
      snack: { ...yogurt, repeatOfConceptId: "snack-yogurt-1" },
      dinner: fajitas,
    },
  ];
}

function buildValidStrategy(uniqueConceptCount?: number) {
  return {
    strategySummary: {
      varietyLevel: "balanced" as const,
      breakfastPattern: "Two rotating breakfasts with intentional repeats.",
      lunchPattern: "Ready lunches with a few distinct bowl concepts.",
      dinnerPattern: "Quick-finish dinners across Mexican, East Asian, and Mediterranean.",
      snackPattern: "Repeated yogurt snack for simplicity.",
      prepApproach: "One weekly prep for lunch bowls; dinners finish fresh in ~10 minutes.",
    },
    days: buildValidDays(),
    sharedIngredientIntents: [
      "chicken",
      "rice",
      "Greek yogurt",
      "onion",
      "garlic",
      "bell peppers",
      "lime",
      "herbs",
    ],
    ...(uniqueConceptCount !== undefined ? { uniqueConceptCount } : {}),
    planningNotes: ["Direct leftovers kept rare; dinner prep supports next lunch ingredients."],
  };
}

describe("weekly strategy domain", () => {
  it("accepts a valid weekly strategy parse", () => {
    const result = validateWeeklyMealStrategy(buildValidStrategy(), sampleRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.days).toHaveLength(7);
  });

  it("requires exactly seven days", () => {
    const strategy = buildValidStrategy();
    strategy.days = strategy.days.slice(0, 6);
    const result = validateWeeklyMealStrategy(strategy, sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("WEEKLY_STRATEGY_VALIDATION_FAILED");
      expect(result.error.message).toMatch(/7 days/i);
    }
  });

  it("rejects duplicate days", () => {
    const strategy = buildValidStrategy();
    const tuesday = strategy.days[1];
    if (!tuesday) {
      throw new Error("expected tuesday fixture");
    }
    strategy.days[1] = { ...tuesday, day: "monday" };
    const result = validateWeeklyMealStrategy(strategy, sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/Duplicate day/i);
    }
  });

  it("rejects missing days", () => {
    const strategy = buildValidStrategy();
    const sunday = strategy.days[6];
    if (!sunday) {
      throw new Error("expected sunday fixture");
    }
    strategy.days[6] = { ...sunday, day: "monday" };
    // Now sunday is missing and monday duplicated — missing day should surface.
    const result = validateWeeklyMealStrategy(strategy, sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/Duplicate day|Missing day/i);
    }
  });

  it("rejects invalid meal type", () => {
    const strategy = buildValidStrategy();
    (strategy.days[0] as { breakfast: { mealType: string } }).breakfast.mealType =
      "brunch";
    const result = validateWeeklyMealStrategy(strategy, sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/meal type/i);
    }
  });

  it("rejects invalid prep intent", () => {
    const strategy = buildValidStrategy();
    (strategy.days[0] as { lunch: { prepIntent: string } }).lunch.prepIntent = "microwave";
    const result = validateWeeklyMealStrategy(strategy, sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/prep intent/i);
    }
  });

  it("rejects invalid variety level", () => {
    const strategy = buildValidStrategy();
    (strategy.strategySummary as { varietyLevel: string }).varietyLevel = "extreme";
    const result = validateWeeklyMealStrategy(strategy, sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/variety level/i);
    }
  });

  it("requires repeatOfConceptId to point to a valid concept", () => {
    const strategy = buildValidStrategy();
    const tuesday = strategy.days[1];
    if (!tuesday?.breakfast) {
      throw new Error("expected tuesday breakfast fixture");
    }
    tuesday.breakfast = {
      ...tuesday.breakfast,
      conceptId: "missing-concept",
      repeatOfConceptId: "does-not-exist",
    };
    const result = validateWeeklyMealStrategy(strategy, sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/repeatOfConceptId/i);
    }
  });

  it("calculates uniqueConceptCount deterministically and ignores Gemini's value", () => {
    const strategy = buildValidStrategy(999);
    const result = validateWeeklyMealStrategy(strategy, sampleRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const expected = calculateUniqueConceptCount(result.value.days);
    expect(result.value.uniqueConceptCount).toBe(expected);
    expect(result.value.uniqueConceptCount).not.toBe(999);
    expect(
      withDeterministicUniqueConceptCount(strategy).uniqueConceptCount,
    ).toBe(expected);
  });

  it("calculates strategy stats correctly", () => {
    const result = validateWeeklyMealStrategy(buildValidStrategy(), sampleRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const stats = calculateWeeklyStrategyStats(result.value);
    expect(stats.totalMealSlots).toBe(28);
    expect(stats.uniqueConcepts).toBe(result.value.uniqueConceptCount);
    expect(stats.uniqueBreakfastConcepts).toBe(2);
    expect(stats.uniqueSnackConcepts).toBe(1);
    expect(stats.uniqueLunchConcepts).toBe(2);
    expect(stats.uniqueDinnerConcepts).toBe(3);
    expect(stats.repeatedMealSlots).toBeGreaterThan(0);
    expect(stats.cuisineFamilies).toEqual(
      expect.arrayContaining(["Indian", "Mexican", "Mediterranean", "East Asian"]),
    );
    expect(stats.primaryProteins).toEqual(
      expect.arrayContaining(["Chicken", "Fish", "Greek yogurt", "Chickpeas", "Eggs"]),
    );
  });

  it("builds a prompt that carries PLAN-001 preferences, variety, cooking, nutrition, and hard constraints", () => {
    const parsed = parseWeeklyStrategyRequest(sampleRequest);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const prompt = buildWeeklyStrategyPrompt(parsed.value);
    expect(prompt.version).toBe(WEEKLY_STRATEGY_PROMPT_VERSION);
    expect(prompt.systemInstruction).toContain(WEEKLY_STRATEGY_PROMPT_VERSION);

    expect(prompt.userPrompt).toContain("cuisines: Indian, Mexican, Mediterranean, East Asian");
    expect(prompt.userPrompt).toContain("proteinPreferences: Chicken, Fish");
    expect(prompt.userPrompt).toContain("experiencePreferences: Saucy & flavorful");
    expect(prompt.userPrompt).toContain("varietyLevel: balanced");
    expect(prompt.userPrompt).toContain("prepFrequency: once_weekly");
    expect(prompt.userPrompt).toContain("maxPrepSessionMinutes: 90");
    expect(prompt.userPrompt).toContain("cookingStyle: ready_lunch_fresh_dinner");
    expect(prompt.userPrompt).toContain("maxFinishMinutes: 10");
    expect(prompt.userPrompt).toContain("useDinnerPrepForNextLunch: true");
    expect(prompt.userPrompt).toContain("targetCaloriesPerDay: 2200");
    expect(prompt.userPrompt).toContain("targetProteinGramsPerDay: 160");
    expect(prompt.userPrompt).toContain("targetCarbsGramsPerDay: 220");
    expect(prompt.userPrompt).toContain("targetFatGramsPerDay: 70");
    expect(prompt.userPrompt).toContain("allergies (hard exclude): Peanuts");
    expect(prompt.userPrompt).toContain("dietaryRestrictions (hard exclude): Shellfish");
    expect(prompt.userPrompt).toContain("dislikes (strongly avoid): Olives");
    expect(prompt.userPrompt).not.toMatch(/simple\s*=\s*5|balanced\s*=\s*9|high\s*=\s*14/i);
    expect(prompt.systemInstruction).toContain("Do NOT output calories");
    expect(prompt.systemInstruction).toContain("meal CONCEPT");
  });

  it("rejects hard-constraint violations detectable from concept text", () => {
    const strategy = buildValidStrategy();
    const monday = strategy.days[0];
    if (!monday?.dinner) {
      throw new Error("expected monday dinner fixture");
    }
    monday.dinner = {
      ...monday.dinner,
      name: "Spicy Peanut Noodles",
      primaryProtein: "Peanuts",
    };
    const result = validateWeeklyMealStrategy(strategy, sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/Peanuts/i);
    }
  });
});
