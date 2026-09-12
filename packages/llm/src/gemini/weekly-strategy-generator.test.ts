import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { WeeklyStrategyRequest } from "@fitness-autopilot/contracts";
import {
  WEEKLY_STRATEGY_PROMPT_VERSION,
  calculateWeeklyStrategyStats,
  type WeeklyStrategyGenerator,
} from "@fitness-autopilot/domain";
import {
  DEFAULT_GEMINI_MODEL,
  GeminiWeeklyStrategyGenerator,
  createWeeklyStrategyGenerator,
  type GeminiContentClient,
} from "../index";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const sampleRequest: WeeklyStrategyRequest = {
  nutrition: {
    targetCaloriesPerDay: 2200,
    targetProteinGramsPerDay: 160,
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

function concept(params: {
  conceptId: string;
  name: string;
  mealType: "breakfast" | "lunch" | "snack" | "dinner";
  cuisineFamily?: string;
  primaryProtein?: string;
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

function buildModelPayload() {
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
    uniqueConceptCount: 999,
    planningNotes: ["Avoid direct leftovers as the primary strategy."],
  };
}

function mockClient(
  impl: GeminiContentClient["generateContent"],
): GeminiContentClient {
  return { generateContent: impl };
}

describe("GeminiWeeklyStrategyGenerator", () => {
  it("implements WeeklyStrategyGenerator and returns a full week from one Gemini call", async () => {
    const spy = vi.fn(async () => ({ text: JSON.stringify(buildModelPayload()) }));
    const generator: WeeklyStrategyGenerator = new GeminiWeeklyStrategyGenerator({
      model: "gemini-test-flash",
      client: mockClient(spy),
    });
    const strategy = await generator.generateWeeklyStrategy(sampleRequest);
    expect(spy).toHaveBeenCalledOnce();
    expect(strategy.days).toHaveLength(7);
    expect(strategy.uniqueConceptCount).toBe(8);
    expect(strategy.uniqueConceptCount).not.toBe(999);
  });

  it("does not call individual recipe generation", async () => {
    const client = mockClient(async () => ({ text: JSON.stringify(buildModelPayload()) }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    const strategy = await generator.generateWeeklyStrategy(sampleRequest);
    expect(strategy.days[0]?.lunch?.name).toBeTruthy();
    expect(JSON.stringify(strategy)).not.toMatch(/quantityGrams|instructions|servings/i);
    expect(generator).not.toHaveProperty("generateRecipe");
  });

  it("passes PLAN-001/002 preferences, variety, cooking, nutrition, and hard constraints into Gemini context", async () => {
    let userPrompt = "";
    let systemInstruction = "";
    const client = mockClient(async (params) => {
      userPrompt = params.contents;
      systemInstruction = params.systemInstruction;
      return { text: JSON.stringify(buildModelPayload()) };
    });
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    await generator.generateWeeklyStrategy(sampleRequest);
    expect(userPrompt).toContain("cuisines: Indian, Mexican, Mediterranean, East Asian");
    expect(userPrompt).toContain("proteinPreferences: Chicken, Fish");
    expect(userPrompt).toContain("varietyLevel: balanced");
    expect(userPrompt).toContain("prepFrequency: once_weekly");
    expect(userPrompt).toContain("cookingStyle: ready_lunch_fresh_dinner");
    expect(userPrompt).toContain("maxFinishMinutes: 10");
    expect(userPrompt).toContain("useDinnerPrepForNextLunch: true");
    expect(userPrompt).toContain("targetCaloriesPerDay: 2200");
    expect(userPrompt).toContain("targetProteinGramsPerDay: 160");
    expect(userPrompt).toContain("allergies (hard exclude): Peanuts");
    expect(userPrompt).toContain("dietaryRestrictions (hard exclude): Shellfish");
    expect(systemInstruction).toContain(WEEKLY_STRATEGY_PROMPT_VERSION);
  });

  it("maps Gemini API errors to typed LLM_PROVIDER_ERROR", async () => {
    const client = mockClient(async () => {
      throw new Error("429 quota exceeded");
    });
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    await expect(generator.generateWeeklyStrategy(sampleRequest)).rejects.toMatchObject({
      code: "LLM_PROVIDER_ERROR",
      message: "429 quota exceeded",
    });
  });

  it("fails safely on malformed Gemini JSON", async () => {
    const client = mockClient(async () => ({ text: "not-json{" }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    await expect(generator.generateWeeklyStrategy(sampleRequest)).rejects.toMatchObject({
      code: "LLM_INVALID_STRUCTURED_OUTPUT",
    });
  });

  it("fails when structured output fails weekly strategy validation", async () => {
    const payload = buildModelPayload();
    payload.days = payload.days.slice(0, 5) as typeof payload.days;
    const client = mockClient(async () => ({ text: JSON.stringify(payload) }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    await expect(generator.generateWeeklyStrategy(sampleRequest)).rejects.toMatchObject({
      code: "WEEKLY_STRATEGY_VALIDATION_FAILED",
    });
  });

  it("calculates strategy stats after generation", async () => {
    const client = mockClient(async () => ({ text: JSON.stringify(buildModelPayload()) }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    const strategy = await generator.generateWeeklyStrategy(sampleRequest);
    const stats = calculateWeeklyStrategyStats(strategy);
    expect(stats.totalMealSlots).toBe(28);
    expect(stats.uniqueConcepts).toBe(strategy.uniqueConceptCount);
  });

  it("logs operational metadata without secrets", async () => {
    const logs: Array<Record<string, unknown>> = [];
    const client = mockClient(async () => ({
      text: JSON.stringify(buildModelPayload()),
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: "gemini-logged",
      client,
      requestIdFactory: () => "ws_test",
      now: (() => {
        let t = 1000;
        return () => {
          t += 5;
          return t;
        };
      })(),
      onLog: (event) => logs.push(event as unknown as Record<string, unknown>),
    });
    await generator.generateWeeklyStrategy(sampleRequest);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      provider: "gemini",
      model: "gemini-logged",
      promptVersion: WEEKLY_STRATEGY_PROMPT_VERSION,
      requestId: "ws_test",
      success: true,
      varietyLevel: "balanced",
      cookingStyle: "ready_lunch_fresh_dinner",
    });
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toMatch(/api[_-]?key/i);
    expect(serialized).not.toContain("test-key");
  });

  it("throws LLM_CONFIGURATION_ERROR when API key missing", () => {
    try {
      createWeeklyStrategyGenerator({
        env: () => undefined,
      });
      expect.fail("expected configuration error");
    } catch (error) {
      expect(error).toMatchObject({
        code: "LLM_CONFIGURATION_ERROR",
      });
    }
  });
});

describe("weekly strategy architecture boundaries", () => {
  it("keeps Gemini SDK out of domain weekly-strategy module", () => {
    const domainSrc = readFileSync(
      join(repoRoot, "packages/domain/src/planning/weekly-strategy.ts"),
      "utf8",
    );
    expect(domainSrc).not.toContain("@google/genai");
    expect(domainSrc).not.toContain("GoogleGenAI");
    expect(domainSrc).not.toContain("generateRecipe");
  });

  it("never exposes Gemini API key to the mobile client", () => {
    const envExample = readFileSync(join(repoRoot, "apps/mobile/.env.example"), "utf8");
    expect(envExample).not.toMatch(/GEMINI/);
    expect(envExample).not.toMatch(/LLM_PROVIDER/);

    const mobilePackage = JSON.parse(
      readFileSync(join(repoRoot, "apps/mobile/package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(mobilePackage.dependencies?.["@fitness-autopilot/llm"]).toBeUndefined();
    expect(mobilePackage.dependencies?.["@google/genai"]).toBeUndefined();
  });

  it("uses a mocked Gemini client — this suite does not call the live API", async () => {
    const spy = vi.fn(async () => ({ text: JSON.stringify(buildModelPayload()) }));
    const generator = new GeminiWeeklyStrategyGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(spy),
    });
    await generator.generateWeeklyStrategy(sampleRequest);
    expect(spy).toHaveBeenCalledOnce();
  });
});
