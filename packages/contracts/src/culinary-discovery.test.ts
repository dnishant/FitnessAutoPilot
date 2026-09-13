import { describe, expect, it } from "vitest";
import {
  CulinaryDiscoveryCandidateSchema,
  CulinaryDiscoveryRequestSchema,
  CulinaryDiscoveryResultSchema,
  HttpUrlSchema,
} from "./culinary-discovery";

const validCandidate = {
  candidateId: "c1",
  name: "Chicken Chettinad",
  source: {
    name: "Specialist Kitchen",
    url: "https://example.com/chicken-chettinad",
    author: "A. Author",
  },
  cuisineFamily: "Indian",
  regionalStyle: "Tamil Nadu / South Indian",
  primaryProtein: "Chicken",
  dishFormat: "skillet curry",
  flavorFamilies: ["peppery", "aromatic", "spicy"],
  cookingTechniques: ["roasted spices", "skillet"],
  textureTags: ["saucy"],
  experienceTags: ["bold"],
  whyItIsInteresting: "Pepper-forward South Indian chicken with curry leaves.",
  fitnessAdaptability: "easy",
  fitnessAdaptabilityReason:
    "Protein and rice portions can be scaled independently while preserving the sauce.",
  mealPrepAdaptability: "component_prepped",
  estimatedFinishMinutesAfterPrep: 12,
  noveltyReason: "Regional South Indian preparation uncommon in defaults.",
  discoveryConfidence: "high",
};

describe("culinary discovery contracts", () => {
  it("parses a valid discovery request with defaults", () => {
    const parsed = CulinaryDiscoveryRequestSchema.parse({
      mealType: "dinner",
      cuisines: ["Indian"],
      proteinPreferences: ["Chicken"],
    });
    expect(parsed.targetCandidateCount).toBe(20);
    expect(parsed.allergies).toEqual([]);
    expect(parsed.dietaryRestrictions).toEqual([]);
    expect(parsed.dislikes).toEqual([]);
  });

  it("parses a valid grounded candidate", () => {
    expect(CulinaryDiscoveryCandidateSchema.parse(validCandidate).name).toBe(
      "Chicken Chettinad",
    );
  });

  it("rejects malformed candidate missing required fields", () => {
    const result = CulinaryDiscoveryCandidateSchema.safeParse({
      ...validCandidate,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid source URL", () => {
    expect(HttpUrlSchema.safeParse("not-a-url").success).toBe(false);
    expect(HttpUrlSchema.safeParse("ftp://example.com/x").success).toBe(false);
    expect(
      CulinaryDiscoveryCandidateSchema.safeParse({
        ...validCandidate,
        source: { name: "X", url: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
  });

  it("rejects invalid adaptability enums and prefers easy|moderate|hard", () => {
    expect(
      CulinaryDiscoveryCandidateSchema.safeParse({
        ...validCandidate,
        fitnessAdaptability: "amazing",
      }).success,
    ).toBe(false);
    expect(
      CulinaryDiscoveryCandidateSchema.safeParse({
        ...validCandidate,
        fitnessAdaptability: "excellent",
      }).success,
    ).toBe(false);
    expect(
      CulinaryDiscoveryCandidateSchema.safeParse({
        ...validCandidate,
        fitnessAdaptability: "hard",
      }).success,
    ).toBe(true);
    expect(
      CulinaryDiscoveryCandidateSchema.safeParse({
        ...validCandidate,
        mealPrepAdaptability: "microwave",
      }).success,
    ).toBe(false);
  });

  it("parses a discovery result", () => {
    const result = CulinaryDiscoveryResultSchema.parse({
      candidates: [validCandidate],
      discoveryMetadata: {
        provider: "gemini",
        model: "gemini-3.6-flash",
        promptVersion: "culinary-discovery-v1.1",
        requestedCandidateCount: 20,
        returnedCandidateCount: 1,
      },
      groundingMetadata: {
        webSearchQueries: ["South Indian chicken Chettinad recipe"],
        groundingChunks: [
          {
            web: {
              uri: "https://example.com/chicken-chettinad",
              title: "example.com",
            },
          },
        ],
      },
    });
    expect(result.candidates).toHaveLength(1);
  });
});
