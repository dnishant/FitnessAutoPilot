import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { RecipeGenerationRequest } from "@fitness-autopilot/contracts";
import {
  RECIPE_GENERATION_PROMPT_VERSION,
  type RecipeGenerator,
} from "@fitness-autopilot/domain";
import {
  DEFAULT_GEMINI_MODEL,
  GeminiRecipeGenerator,
  createRecipeGenerator,
  loadLlmServerConfig,
  type GeminiContentClient,
} from "../index";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const sampleRequest: RecipeGenerationRequest = {
  mealType: "dinner",
  targetCalories: 650,
  targetProteinGrams: 50,
  cuisines: ["Indian", "Mexican", "Mediterranean", "East Asian"],
  proteinPreferences: ["Chicken", "Fish"],
  experiencePreferences: ["Saucy & flavorful", "Spicy"],
  allergies: [],
  dietaryRestrictions: [],
  dislikes: [],
  varietyLevel: "balanced",
  cookingStyle: "ready_lunch_fresh_dinner",
  maxFinishMinutes: 10,
};

const modelPayload = {
  name: "Chicken Tikka Rice Bowl with Mint-Yogurt Chutney",
  description: "Spiced tikka chicken over rice with mint-yogurt chutney.",
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
      name: "jasmine rice",
      quantityGrams: 400,
      measurementState: "cooked",
    },
    {
      name: "plain yogurt",
      quantityGrams: 100,
      measurementState: "as_packaged",
    },
    {
      name: "olive oil",
      quantityGrams: 12,
      measurementState: "as_packaged",
    },
  ],
  instructions: [
    "Marinate chicken in yogurt and spices for 20 minutes.",
    "Sear chicken, warm rice, and finish with mint-yogurt chutney.",
  ],
  prepMinutes: 25,
  cookMinutes: 20,
};

function mockClient(
  impl: GeminiContentClient["generateContent"],
): GeminiContentClient {
  return { generateContent: impl };
}

describe("GeminiRecipeGenerator", () => {
  it("implements RecipeGenerator and returns exactly one recipe", async () => {
    const client = mockClient(async () => ({ text: JSON.stringify(modelPayload) }));
    const generator: RecipeGenerator = new GeminiRecipeGenerator({
      model: "gemini-test-flash",
      client,
    });
    const recipe = await generator.generateRecipe(sampleRequest);
    expect(recipe.name).toContain("Chicken Tikka");
    expect(recipe.source).toEqual({
      type: "ai_original",
      provider: "gemini",
      model: "gemini-test-flash",
    });
    expect(Array.isArray(recipe)).toBe(false);
  });

  it("uses configured GEMINI_MODEL and records provenance", async () => {
    let seenModel = "";
    const client = mockClient(async (params) => {
      seenModel = params.model;
      return { text: JSON.stringify(modelPayload) };
    });
    const generator = createRecipeGenerator({
      config: {
        provider: "gemini",
        gemini: { apiKey: "test-key", model: "gemini-custom-flash" },
      },
      geminiClient: client,
    });
    const recipe = await generator.generateRecipe(sampleRequest);
    expect(seenModel).toBe("gemini-custom-flash");
    expect(recipe.source.model).toBe("gemini-custom-flash");
    expect(recipe.source.provider).toBe("gemini");
  });

  it("defaults GEMINI_MODEL when unset", () => {
    const config = loadLlmServerConfig((key) =>
      key === "GEMINI_API_KEY" ? "secret" : undefined,
    );
    expect(config.ok).toBe(true);
    if (!config.ok) {
      return;
    }
    expect(config.value.gemini.model).toBe(DEFAULT_GEMINI_MODEL);
  });

  it("maps Gemini API errors to typed LLM_PROVIDER_ERROR", async () => {
    const client = mockClient(async () => {
      throw new Error("429 quota exceeded");
    });
    const generator = new GeminiRecipeGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    await expect(generator.generateRecipe(sampleRequest)).rejects.toMatchObject({
      code: "LLM_PROVIDER_ERROR",
      message: "429 quota exceeded",
    });
  });

  it("fails safely on malformed Gemini JSON", async () => {
    const client = mockClient(async () => ({ text: "not-json{" }));
    const generator = new GeminiRecipeGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    await expect(generator.generateRecipe(sampleRequest)).rejects.toMatchObject({
      code: "LLM_INVALID_STRUCTURED_OUTPUT",
    });
  });

  it("fails when structured output fails recipe schema validation", async () => {
    const client = mockClient(async () => ({
      text: JSON.stringify({
        ...modelPayload,
        servings: 0,
      }),
    }));
    const generator = new GeminiRecipeGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    await expect(generator.generateRecipe(sampleRequest)).rejects.toMatchObject({
      code: "RECIPE_SCHEMA_VALIDATION_FAILED",
    });
  });

  it("passes PLAN-001/002 preferences into generation context and does not batch by variety", async () => {
    let userPrompt = "";
    let systemInstruction = "";
    const client = mockClient(async (params) => {
      userPrompt = params.contents;
      systemInstruction = params.systemInstruction;
      return { text: JSON.stringify(modelPayload) };
    });
    const generator = new GeminiRecipeGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    const recipe = await generator.generateRecipe({
      ...sampleRequest,
      allergies: ["Peanuts"],
      dietaryRestrictions: ["Shellfish"],
      dislikes: ["Olives"],
      varietyLevel: "high",
    });
    expect(userPrompt).toContain("cuisines: Indian, Mexican, Mediterranean, East Asian");
    expect(userPrompt).toContain("proteinPreferences: Chicken, Fish");
    expect(userPrompt).toContain("experiencePreferences: Saucy & flavorful, Spicy");
    expect(userPrompt).toContain("allergies (hard exclude): Peanuts");
    expect(userPrompt).toContain("dietaryRestrictions (hard exclude): Shellfish");
    expect(userPrompt).toContain("dislikes (strongly avoid): Olives");
    expect(userPrompt).toContain("varietyLevel: high");
    expect(userPrompt).toContain("cookingStyle: ready_lunch_fresh_dinner");
    expect(userPrompt).toContain("maxFinishMinutes: 10");
    expect(userPrompt).toMatch(/exactly one recipe/i);
    expect(userPrompt).not.toMatch(/\b(3|5|7)\s+recipes?\b/i);
    expect(systemInstruction).toContain(RECIPE_GENERATION_PROMPT_VERSION);
    expect(recipe).toBeTruthy();
  });

  it("strips AI nutrition and never treats it as authoritative", async () => {
    const client = mockClient(async () => ({
      text: JSON.stringify({
        ...modelPayload,
        caloriesKcal: 999,
        proteinG: 80,
        nutrition: { caloriesKcal: 999 },
      }),
    }));
    const generator = new GeminiRecipeGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    const recipe = await generator.generateRecipe(sampleRequest);
    expect(recipe).not.toHaveProperty("caloriesKcal");
    expect(recipe).not.toHaveProperty("proteinG");
    expect(recipe).not.toHaveProperty("nutrition");
  });

  it("logs operational metadata without secrets", async () => {
    const logs: Array<Record<string, unknown>> = [];
    const client = mockClient(async () => ({
      text: JSON.stringify(modelPayload),
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    }));
    const generator = new GeminiRecipeGenerator({
      model: "gemini-logged",
      client,
      requestIdFactory: () => "req_test",
      now: (() => {
        let t = 1000;
        return () => {
          t += 5;
          return t;
        };
      })(),
      onLog: (event) => logs.push(event as unknown as Record<string, unknown>),
    });
    await generator.generateRecipe(sampleRequest);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      provider: "gemini",
      model: "gemini-logged",
      promptVersion: RECIPE_GENERATION_PROMPT_VERSION,
      requestId: "req_test",
      success: true,
    });
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toMatch(/api[_-]?key/i);
    expect(serialized).not.toContain("test-key");
  });

  it("throws LLM_CONFIGURATION_ERROR when API key missing", () => {
    try {
      createRecipeGenerator({
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

describe("architecture boundaries", () => {
  it("keeps Gemini SDK out of domain and contracts packages", () => {
    const domainPkg = JSON.parse(
      readFileSync(join(repoRoot, "packages/domain/package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const contractsPkg = JSON.parse(
      readFileSync(join(repoRoot, "packages/contracts/package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(domainPkg.dependencies?.["@google/genai"]).toBeUndefined();
    expect(domainPkg.devDependencies?.["@google/genai"]).toBeUndefined();
    expect(contractsPkg.dependencies?.["@google/genai"]).toBeUndefined();

    const domainSrc = readFileSync(
      join(repoRoot, "packages/domain/src/recipes/generation.ts"),
      "utf8",
    );
    expect(domainSrc).not.toContain("@google/genai");
    expect(domainSrc).not.toContain("GoogleGenAI");
  });

  it("never exposes Gemini API key to the mobile client env example or app code", () => {
    const envExample = readFileSync(join(repoRoot, "apps/mobile/.env.example"), "utf8");
    expect(envExample).not.toMatch(/GEMINI/);
    expect(envExample).not.toMatch(/LLM_PROVIDER/);
    expect(envExample).not.toMatch(/API_KEY/);

    const mobilePackage = JSON.parse(
      readFileSync(join(repoRoot, "apps/mobile/package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(mobilePackage.dependencies?.["@fitness-autopilot/llm"]).toBeUndefined();
    expect(mobilePackage.dependencies?.["@google/genai"]).toBeUndefined();
  });

  it("uses a mocked Gemini client — this suite does not call the live API", async () => {
    const spy = vi.fn(async () => ({ text: JSON.stringify(modelPayload) }));
    const generator = new GeminiRecipeGenerator({
      model: DEFAULT_GEMINI_MODEL,
      client: mockClient(spy),
    });
    await generator.generateRecipe(sampleRequest);
    expect(spy).toHaveBeenCalledOnce();
  });
});
