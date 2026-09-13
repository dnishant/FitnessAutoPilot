import { describe, expect, it } from "vitest";
import type { CulinaryDiscoveryCandidate, CulinaryDiscoveryRequest } from "@fitness-autopilot/contracts";
import {
  CULINARY_DISCOVERY_PROMPT_VERSION,
  assertDiscoveryWasGrounded,
  buildCulinaryDiscoveryPrompt,
  buildDiscoveryMetadata,
  calculateUniqueDomainCount,
  calculateUniqueSourceCount,
  normalizeDiscoveryCandidates,
  parseCulinaryDiscoveryRequest,
  validateCulinaryDiscoveryCandidate,
} from "./culinary-discovery";

const baseRequest: CulinaryDiscoveryRequest = {
  mealType: "dinner",
  cuisines: ["Indian"],
  proteinPreferences: ["Chicken"],
  experiencePreferences: ["Saucy & flavorful"],
  allergies: ["peanut"],
  dietaryRestrictions: [],
  dislikes: ["liver"],
  cookingPreferences: {
    cookingStyle: "ready_lunch_fresh_dinner",
    maxFinishMinutes: 15,
  },
  recentConcepts: [
    {
      name: "Chicken Tikka Masala",
      timesSuggestedLast30Days: 3,
      lastSuggestedDaysAgo: 2,
    },
  ],
  rejectedConcepts: ["Generic Rice Bowl"],
  targetCandidateCount: 12,
};

const validCandidate: CulinaryDiscoveryCandidate = {
  candidateId: "c1",
  name: "Chicken Chettinad",
  source: {
    name: "Specialist Kitchen",
    url: "https://example.com/chicken-chettinad",
    author: "A. Author",
  },
  cuisineFamily: "Indian",
  regionalStyle: "Tamil Nadu",
  primaryProtein: "Chicken",
  dishFormat: "skillet curry",
  flavorFamilies: ["peppery", "aromatic"],
  cookingTechniques: ["roasted spices"],
  textureTags: ["saucy"],
  experienceTags: ["bold"],
  whyItIsInteresting: "Pepper-forward South Indian chicken.",
  fitnessAdaptability: "excellent",
  fitnessAdaptabilityReason: "Portions adjust cleanly.",
  mealPrepAdaptability: "component_prepped",
  estimatedFinishMinutesAfterPrep: 12,
  noveltyReason: "Regional discovery.",
  discoveryConfidence: "high",
};

describe("culinary discovery domain", () => {
  it("parses discovery requests", () => {
    const parsed = parseCulinaryDiscoveryRequest({
      mealType: "lunch",
      allergies: [],
      dietaryRestrictions: [],
      dislikes: [],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.targetCandidateCount).toBe(20);
    }
  });

  it("rejects invalid discovery requests", () => {
    const parsed = parseCulinaryDiscoveryRequest({ mealType: "brunch" });
    expect(parsed.ok).toBe(false);
  });

  it("validates grounded candidates and rejects invalid URL", () => {
    expect(validateCulinaryDiscoveryCandidate(validCandidate).ok).toBe(true);
    expect(
      validateCulinaryDiscoveryCandidate({
        ...validCandidate,
        source: { name: "X", url: "not-a-url" },
      }).ok,
    ).toBe(false);
  });

  it("rejects duplicate candidate IDs during normalize", () => {
    const result = normalizeDiscoveryCandidates(
      [
        validCandidate,
        { ...validCandidate, name: "Other Dish" },
      ],
      {
        request: baseRequest,
        groundingMetadata: {
          webSearchQueries: ["chettinad"],
          groundingChunks: [
            { web: { uri: "https://example.com/chicken-chettinad", title: "example.com" } },
          ],
        },
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
    }
  });

  it("rejects invalid adaptability during normalize", () => {
    const result = normalizeDiscoveryCandidates(
      [
        {
          ...validCandidate,
          fitnessAdaptability: "amazing" as CulinaryDiscoveryCandidate["fitnessAdaptability"],
        },
      ],
      { request: { ...baseRequest, allergies: [] } },
    );
    expect(result.ok).toBe(false);
  });

  it("builds prompt with cuisine, protein, recent history, rejected, count, and version", () => {
    const prompt = buildCulinaryDiscoveryPrompt(baseRequest);
    expect(prompt.version).toBe(CULINARY_DISCOVERY_PROMPT_VERSION);
    expect(prompt.systemInstruction).toContain("Culinary Discovery Engine");
    expect(prompt.systemInstruction).toContain("SEARCH FIRST");
    expect(prompt.systemInstruction).toContain("DO NOT search primarily for healthy");
    expect(prompt.userPrompt).toContain("Indian");
    expect(prompt.userPrompt).toContain("Chicken");
    expect(prompt.userPrompt).toContain("peanut");
    expect(prompt.userPrompt).toContain("Saucy & flavorful");
    expect(prompt.userPrompt).toContain("Chicken Tikka Masala");
    expect(prompt.userPrompt).toContain("suggestedLast30Days=3");
    expect(prompt.userPrompt).toContain("Generic Rice Bowl");
    expect(prompt.userPrompt).toContain("Target candidate count: 12");
    expect(prompt.userPrompt).toContain(CULINARY_DISCOVERY_PROMPT_VERSION);
    expect(prompt.userPrompt).toContain("finish fresh in a short weekday window");
    expect(prompt.userPrompt).toContain("Max finish minutes after prep: 15");
  });

  it("asserts grounding presence", () => {
    expect(assertDiscoveryWasGrounded(undefined).ok).toBe(false);
    expect(
      assertDiscoveryWasGrounded({ webSearchQueries: ["regional indian chicken"] }).ok,
    ).toBe(true);
    expect(assertDiscoveryWasGrounded({ hasSearchEntryPoint: true }).ok).toBe(true);
    expect(assertDiscoveryWasGrounded({ groundingChunks: [] }).ok).toBe(false);
  });

  it("calculates unique source/domain counts locally", () => {
    const candidates = [
      validCandidate,
      {
        ...validCandidate,
        candidateId: "c2",
        name: "Goan Chicken Cafreal",
        source: {
          name: "Other",
          url: "https://other.example.org/cafreal",
          author: null,
        },
      },
    ];
    expect(calculateUniqueSourceCount(candidates)).toBe(2);
    expect(calculateUniqueDomainCount(candidates)).toBe(2);
  });

  it("builds discovery metadata with coverage", () => {
    const grounding = {
      webSearchQueries: ["chettinad chicken"],
      groundingChunks: [
        { web: { uri: "https://example.com/chicken-chettinad", title: "example.com" } },
      ],
    };
    const meta = buildDiscoveryMetadata({
      model: "gemini-3.6-flash",
      request: baseRequest,
      candidates: [validCandidate],
      groundingMetadata: grounding,
      requestId: "cd_test",
      durationMs: 1234,
    });
    expect(meta.promptVersion).toBe(CULINARY_DISCOVERY_PROMPT_VERSION);
    expect(meta.returnedCandidateCount).toBe(1);
    expect(meta.uniqueDomainCount).toBe(1);
    expect(meta.groundedCandidateCount).toBe(1);
  });
});
