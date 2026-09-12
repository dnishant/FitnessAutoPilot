import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CulinaryDiscoveryRequest, CulinaryDiscoveryResult } from "@fitness-autopilot/contracts";
import {
  ANTI_REPETITION_RECENT_JSON,
  CULINARY_DISCOVERY_FUNCTION_NAME,
  CULINARY_DISCOVERY_PREVIEW_ROUTE,
  CULINARY_DISCOVERY_PREVIEW_TITLE,
  beginCulinaryDiscovery,
  buildCulinaryDiscoveryRequest,
  canStartCulinaryDiscovery,
  createCulinaryDiscoveryPreviewUiState,
  failCulinaryDiscovery,
  invokeCulinaryDiscovery,
  succeedCulinaryDiscovery,
} from "./culinary-discovery-preview";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");

const sampleResult: CulinaryDiscoveryResult = {
  candidates: [
    {
      candidateId: "c1",
      name: "Chicken Chettinad",
      source: {
        name: "Specialist Kitchen",
        url: "https://example.com/chicken-chettinad",
        author: null,
      },
      cuisineFamily: "Indian",
      regionalStyle: "Tamil Nadu",
      primaryProtein: "Chicken",
      dishFormat: "skillet curry",
      flavorFamilies: ["peppery"],
      cookingTechniques: ["roasted spices"],
      textureTags: [],
      experienceTags: [],
      whyItIsInteresting: "Pepper-forward South Indian chicken.",
      fitnessAdaptability: "excellent",
      fitnessAdaptabilityReason: "Portions adjust.",
      mealPrepAdaptability: "component_prepped",
      estimatedFinishMinutesAfterPrep: 10,
      noveltyReason: "Regional.",
      discoveryConfidence: "high",
    },
  ],
  discoveryMetadata: {
    provider: "gemini",
    model: "gemini-3.6-flash",
    promptVersion: "culinary-discovery-v1",
    requestedCandidateCount: 20,
    returnedCandidateCount: 1,
    searchQueries: ["South Indian chicken Chettinad"],
    uniqueDomainCount: 1,
    durationMs: 1200,
    requestId: "cd_test",
  },
};

describe("culinary discovery preview", () => {
  it("preview route and screen exist", () => {
    const screen = readFileSync(
      join(appRoot, "app/culinary-discovery-preview.tsx"),
      "utf8",
    );
    const layout = readFileSync(join(appRoot, "app/_layout.tsx"), "utf8");
    const today = readFileSync(join(appRoot, "app/today.tsx"), "utf8");
    expect(screen).toContain("CULINARY_DISCOVERY_PREVIEW_TITLE");
    expect(screen).toContain("Discover Again");
    expect(screen).toContain("Discovery Details");
    expect(CULINARY_DISCOVERY_PREVIEW_TITLE).toBe("Dev: Culinary Discovery");
    expect(layout).toContain("culinary-discovery-preview");
    expect(today).toContain("/culinary-discovery-preview");
    expect(CULINARY_DISCOVERY_PREVIEW_ROUTE).toBe("/culinary-discovery-preview");
  });

  it("builds request and calls server endpoint via invoke helper", async () => {
    const state = createCulinaryDiscoveryPreviewUiState();
    const built = buildCulinaryDiscoveryRequest(state.form, {
      mealPreferences: null,
      cookingPreferences: null,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    let calledName = "";
    const invoked = await invokeCulinaryDiscovery(async (functionName, options) => {
      calledName = functionName;
      expect(options.body.mealType).toBe("dinner");
      return {
        data: { result: sampleResult, meta: { requestId: "cd_test", promptVersion: "culinary-discovery-v1", provider: "gemini", model: "gemini-3.6-flash" } },
        error: null,
      };
    }, built.request);

    expect(calledName).toBe(CULINARY_DISCOVERY_FUNCTION_NAME);
    expect(invoked.ok).toBe(true);
  });

  it("supports repeated discovery for the same query", () => {
    const request: CulinaryDiscoveryRequest = {
      mealType: "dinner",
      cuisines: ["Indian"],
      proteinPreferences: ["Chicken"],
      allergies: [],
      dietaryRestrictions: [],
      dislikes: [],
      targetCandidateCount: 20,
    };
    let state = createCulinaryDiscoveryPreviewUiState();
    expect(canStartCulinaryDiscovery(state)).toBe(true);
    state = beginCulinaryDiscovery(state, request);
    expect(state.status).toBe("loading");
    expect(state.lastRequest).toEqual(request);
    state = succeedCulinaryDiscovery(state, sampleResult, {
      requestId: "cd_1",
      promptVersion: "culinary-discovery-v1",
      provider: "gemini",
      model: "gemini-3.6-flash",
    });
    expect(state.status).toBe("success");
    expect(state.history).toHaveLength(1);
    // Discover Again reuses lastRequest
    state = beginCulinaryDiscovery(state, state.lastRequest!);
    expect(state.lastRequest?.cuisines).toEqual(["Indian"]);
    state = failCulinaryDiscovery(state, { message: "boom", code: "LLM_PROVIDER_ERROR" });
    expect(state.status).toBe("error");
  });

  it("loads anti-repetition sample JSON", () => {
    expect(ANTI_REPETITION_RECENT_JSON).toContain("Chicken Tikka Masala");
  });

  it("keeps Gemini API key off the client", () => {
    const session = readFileSync(join(appRoot, "src/state/session.tsx"), "utf8");
    const lib = readFileSync(join(here, "culinary-discovery-preview.ts"), "utf8");
    expect(session).toContain("discoverCulinaryCandidates");
    expect(session).toContain("culinary-discovery");
    expect(session).not.toMatch(/GEMINI_API_KEY\s*=/);
    expect(lib).not.toContain("@google/genai");
    expect(lib).not.toContain("AIza");
  });
});
