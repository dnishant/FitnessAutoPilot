import { describe, expect, it } from "vitest";
import type { CulinaryDiscoveryCandidate, CulinaryDiscoveryRequest } from "@fitness-autopilot/contracts";
import {
  CULINARY_DISCOVERY_PROMPT_VERSION,
  GUIDED_CULINARY_SEARCH_QUERY_RANGE,
  assertDiscoveryWasGrounded,
  buildCulinaryDiscoveryPrompt,
  buildDiscoveryMetadata,
  calculateUniqueDomainCount,
  calculateUniqueSourceCount,
  candidateHasGroundingCorrelation,
  classifyCulinarySearchQuery,
  deriveCulinaryDiscoveryQualityStats,
  fitnessAdaptabilityReasonPrescribesModification,
  isCommunityOrSocialSourceUrl,
  isGenericHomepageOrRootUrl,
  isPreferredCanonicalSourceUrl,
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
  dietaryRestrictions: ["shellfish"],
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
  targetCandidateCount: 20,
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
  fitnessAdaptability: "easy",
  fitnessAdaptabilityReason:
    "Protein and starch portions can be scaled independently while preserving the sauce and core flavor profile.",
  mealPrepAdaptability: "component_prepped",
  estimatedFinishMinutesAfterPrep: 12,
  noveltyReason: "Regional discovery.",
  discoveryConfidence: "high",
};

const chettinadGrounding = {
  webSearchQueries: ["regional South Indian chicken recipes pepper curry leaves"],
  groundingChunks: [
    { web: { uri: "https://example.com/chicken-chettinad", title: "example.com" } },
  ],
};

describe("culinary discovery domain", () => {
  it("parses discovery requests with target count as a default maximum", () => {
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
        groundingMetadata: chettinadGrounding,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.candidates).toHaveLength(1);
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

  it("allows fewer than the requested candidate count to succeed", () => {
    const extras = Array.from({ length: 2 }, (_, i) => ({
      ...validCandidate,
      candidateId: `keep-${i}`,
      name: `Keep Dish ${i}`,
      source: {
        name: "Specialist Kitchen",
        url: `https://example.com/keep-${i}`,
        author: "A. Author",
      },
    }));
    const result = normalizeDiscoveryCandidates(
      [validCandidate, ...extras],
      {
        request: { ...baseRequest, allergies: [], targetCandidateCount: 20 },
        groundingMetadata: {
          webSearchQueries: ["regional South Indian chicken recipes"],
          groundingChunks: [
            { web: { uri: "https://example.com/chicken-chettinad", title: "example.com" } },
            { web: { uri: "https://example.com/keep-0", title: "example.com" } },
            { web: { uri: "https://example.com/keep-1", title: "example.com" } },
          ],
        },
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.candidates.length).toBe(3);
      expect(result.value.candidates.length).toBeLessThan(20);
    }
  });

  it("treats requested count as a maximum rather than an exact requirement", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...validCandidate,
      candidateId: `c-${i}`,
      name: `Dish ${i}`,
      source: {
        name: "Specialist Kitchen",
        url: `https://example.com/dish-${i}`,
        author: null,
      },
    }));
    const result = normalizeDiscoveryCandidates(many, {
      request: { ...baseRequest, allergies: [], targetCandidateCount: 3 },
      maxCandidateCount: 3,
      groundingMetadata: {
        webSearchQueries: ["regional indian chicken"],
        groundingChunks: many.map((c) => ({
          web: { uri: c.source.url, title: "example.com" },
        })),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.candidates).toHaveLength(3);
    }
  });

  it("honors hard allergies and dietary restrictions", () => {
    const peanutDish = {
      ...validCandidate,
      candidateId: "peanut",
      name: "Chicken with peanut sauce",
      whyItIsInteresting: "Uses a peanut marinade.",
    };
    const result = normalizeDiscoveryCandidates([peanutDish], {
      request: baseRequest,
      groundingMetadata: chettinadGrounding,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/peanut/i);
    }
  });

  it("rejects homepage/root source URLs and keeps article URLs", () => {
    expect(isGenericHomepageOrRootUrl("https://food52.com/")).toBe(true);
    expect(isGenericHomepageOrRootUrl("https://food52.com")).toBe(true);
    expect(isGenericHomepageOrRootUrl("https://www.food52.com/")).toBe(true);
    expect(isGenericHomepageOrRootUrl("https://food52.com/index.html")).toBe(true);
    expect(
      isGenericHomepageOrRootUrl("https://food52.com/recipes/goan-fish-recheado"),
    ).toBe(false);
    expect(
      isGenericHomepageOrRootUrl("https://www.seriouseats.com/kerala-beef-fry-recipe"),
    ).toBe(false);

    const homepageCandidate: CulinaryDiscoveryCandidate = {
      ...validCandidate,
      candidateId: "home",
      name: "Homepage Dish",
      source: { name: "Food52", url: "https://food52.com/", author: null },
    };
    const articleCandidate: CulinaryDiscoveryCandidate = {
      ...validCandidate,
      candidateId: "article",
      name: "Article Dish",
      source: {
        name: "Food52",
        url: "https://food52.com/recipes/goan-fish-recheado",
        author: null,
      },
    };
    const result = normalizeDiscoveryCandidates(
      [homepageCandidate, articleCandidate],
      {
        request: { ...baseRequest, allergies: [] },
        groundingMetadata: {
          webSearchQueries: ["goan seafood recipes spicy tangy"],
          groundingChunks: [
            { web: { uri: "https://food52.com/", title: "food52.com" } },
            {
              web: {
                uri: "https://food52.com/recipes/goan-fish-recheado",
                title: "food52.com",
              },
            },
          ],
        },
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.candidates.map((c) => c.candidateId)).toEqual(["article"]);
      expect(result.value.stats.genericHomepageSourceCount).toBe(1);
    }
  });

  it("rejects a candidate without adequate grounding support", () => {
    const ungrounded: CulinaryDiscoveryCandidate = {
      ...validCandidate,
      candidateId: "ungrounded",
      name: "Mystery Stir Fry",
      source: {
        name: "Random Blog",
        url: "https://other.example.org/mystery-stir-fry",
        author: null,
      },
    };
    const result = normalizeDiscoveryCandidates([validCandidate, ungrounded], {
      request: { ...baseRequest, allergies: [] },
      groundingMetadata: chettinadGrounding,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.candidates).toHaveLength(1);
      expect(result.value.candidates[0]?.candidateId).toBe("c1");
      expect(result.value.stats.rejectedForWeakProvenanceCount).toBe(1);
    }
    expect(candidateHasGroundingCorrelation(ungrounded, chettinadGrounding)).toBe(false);
    expect(candidateHasGroundingCorrelation(validCandidate, chettinadGrounding)).toBe(true);
  });

  it("does not treat social/community hosts as preferred canonical sources", () => {
    expect(isCommunityOrSocialSourceUrl("https://www.reddit.com/r/recipes/foo")).toBe(true);
    expect(isCommunityOrSocialSourceUrl("https://youtube.com/watch?v=abc")).toBe(true);
    expect(isCommunityOrSocialSourceUrl("https://facebook.com/groups/food")).toBe(true);
    expect(isCommunityOrSocialSourceUrl("https://author.substack.com/p/recipe")).toBe(true);
    expect(isPreferredCanonicalSourceUrl("https://www.reddit.com/r/recipes/foo")).toBe(false);
    expect(
      isPreferredCanonicalSourceUrl("https://example.com/chicken-chettinad"),
    ).toBe(true);

    const redditCandidate: CulinaryDiscoveryCandidate = {
      ...validCandidate,
      candidateId: "reddit",
      name: "Forum Chicken Fry",
      source: {
        name: "r/IndianFood",
        url: "https://www.reddit.com/r/IndianFood/comments/abc/chicken-fry",
        author: null,
      },
    };
    const kept = normalizeDiscoveryCandidates([redditCandidate], {
      request: { ...baseRequest, allergies: [] },
      groundingMetadata: {
        webSearchQueries: ["regional kerala chicken fry"],
        groundingChunks: [
          {
            web: {
              uri: "https://www.reddit.com/r/IndianFood/comments/abc/chicken-fry",
              title: "reddit.com",
            },
          },
        ],
      },
    });
    expect(kept.ok).toBe(true);
    if (kept.ok) {
      expect(kept.value.candidates).toHaveLength(1);
      expect(
        deriveCulinaryDiscoveryQualityStats({
          candidates: kept.value.candidates,
          groundingMetadata: {
            groundingChunks: [
              {
                web: {
                  uri: "https://www.reddit.com/r/IndianFood/comments/abc/chicken-fry",
                  title: "reddit.com",
                },
              },
            ],
          },
        }).communitySourceCount,
      ).toBe(1);
    }
  });

  it("builds exploration-first v1.1 prompt with count-as-target and no dish-first or famous-site targeting", () => {
    const prompt = buildCulinaryDiscoveryPrompt(baseRequest);
    const combined = `${prompt.systemInstruction}\n${prompt.userPrompt}`;
    expect(prompt.version).toBe("culinary-discovery-v1.1");
    expect(CULINARY_DISCOVERY_PROMPT_VERSION).toBe("culinary-discovery-v1.1");
    expect(prompt.systemInstruction).toContain("at most 8 one-line bullets");
    expect(prompt.systemInstruction).toContain("EXPLORATION-FIRST SEARCH");
    expect(prompt.systemInstruction).toContain(
      "Do not begin by deciding which dishes you want to return and then searching for those dish names",
    );
    expect(prompt.systemInstruction).toContain("Use broad exploratory searches first");
    expect(prompt.systemInstruction).toContain("Do not preselect a famous publication");
    expect(prompt.systemInstruction).toContain("Do not force all candidates to come from major editorial sites");
    expect(prompt.systemInstruction).not.toMatch(/recipe "Bon Appetit" OR "NYT Cooking"/);
    expect(prompt.systemInstruction).not.toMatch(/recipe "Serious Eats"/);
    expect(prompt.systemInstruction).toContain(
      `Aim for approximately ${GUIDED_CULINARY_SEARCH_QUERY_RANGE.min}–${GUIDED_CULINARY_SEARCH_QUERY_RANGE.max} Google Search queries`,
    );
    expect(prompt.systemInstruction).toContain("Avoid one search per candidate");
    expect(prompt.systemInstruction).toContain("Do not add filler candidates");
    expect(prompt.systemInstruction).toContain("maximum/target, not an exact quota");
    expect(prompt.systemInstruction).toContain("Classify easy | moderate | hard");
    expect(prompt.systemInstruction).toContain("Do NOT prescribe recipe modifications");
    expect(prompt.systemInstruction).toContain("should not normally become the canonical candidate source");
    expect(prompt.systemInstruction).toContain("DO NOT search primarily for healthy");
    expect(prompt.systemInstruction).toContain("Chicken Tikka");
    expect(prompt.systemInstruction).toContain("Changing only the protein does not count");
    expect(prompt.userPrompt).toContain("Indian");
    expect(prompt.userPrompt).toContain("Chicken");
    expect(prompt.userPrompt).toContain("peanut");
    expect(prompt.userPrompt).toContain("shellfish");
    expect(prompt.userPrompt).toContain("liver");
    expect(prompt.userPrompt).toContain("Saucy & flavorful");
    expect(prompt.userPrompt).toContain("Chicken Tikka Masala");
    expect(prompt.userPrompt).toContain("suggestedLast30Days=3");
    expect(prompt.userPrompt).toContain("Generic Rice Bowl");
    expect(prompt.userPrompt).toContain("Target candidate count (maximum/target, not an exact quota): 20");
    expect(prompt.userPrompt).toContain(CULINARY_DISCOVERY_PROMPT_VERSION);
    expect(prompt.userPrompt).toContain("finish fresh in a short weekday window");
    expect(prompt.userPrompt).toContain("Max finish minutes after prep: 15");
    expect(combined).toContain("What genuinely delicious food might this person want to eat?");
    expect(prompt.systemInstruction).toContain("Do NOT recommend replacing ingredients");
  });

  it("does not treat fitness adaptability reasons as recipe substitutions", () => {
    expect(
      fitnessAdaptabilityReasonPrescribesModification(
        "Protein and starch portions can be scaled independently while preserving the sauce and core flavor profile.",
      ),
    ).toBe(false);
    expect(
      fitnessAdaptabilityReasonPrescribesModification(
        "Replace cream with low-fat milk and reduce the oil.",
      ),
    ).toBe(true);
    const prompt = buildCulinaryDiscoveryPrompt(baseRequest);
    expect(prompt.systemInstruction).toContain("Do NOT recommend replacing ingredients");
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

  it("classifies broad vs specific-dish searches without treating publication quotes as dishes", () => {
    expect(
      classifyCulinarySearchQuery("regional South Indian chicken recipes pepper curry leaves"),
    ).toBe("broad");
    expect(classifyCulinarySearchQuery('"Kerala beef fry"')).toBe("specific_dish");
    expect(
      classifyCulinarySearchQuery('recipe "Bon Appetit" OR "NYT Cooking"'),
    ).toBe("broad");
    expect(
      classifyCulinarySearchQuery("Chicken Chettinad recipe", ["Chicken Chettinad"]),
    ).toBe("specific_dish");
  });

  it("builds discovery metadata with coverage distinct from source-quality stats", () => {
    const grounding = {
      webSearchQueries: [
        "regional South Indian chicken recipes pepper curry leaves",
        '"Chicken Chettinad"',
      ],
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
      rejectedForWeakProvenanceCount: 2,
      genericHomepageSourceCount: 1,
    });
    expect(meta.promptVersion).toBe(CULINARY_DISCOVERY_PROMPT_VERSION);
    expect(meta.returnedCandidateCount).toBe(1);
    expect(meta.requestedCandidateCount).toBe(20);
    expect(meta.uniqueDomainCount).toBe(1);
    expect(meta.groundedCandidateCount).toBe(1);
    expect(meta.groundingCoverage).toBe(1);
    expect(meta.searchQueryCount).toBe(2);
    expect(meta.qualityStats?.groundingCoverage).toBe(1);
    expect(meta.qualityStats?.rejectedForWeakProvenanceCount).toBe(2);
    expect(meta.qualityStats?.genericHomepageSourceCount).toBe(1);
    expect(meta.qualityStats?.broadSearchQueryCount).toBe(1);
    expect(meta.qualityStats?.specificDishSearchQueryCount).toBe(1);
    expect(meta.qualityStats?.communitySourceCount).toBe(0);

    const mixedCoverage = deriveCulinaryDiscoveryQualityStats({
      candidates: [
        validCandidate,
        {
          ...validCandidate,
          candidateId: "c2",
          name: "Other",
          source: { name: "Other", url: "https://other.example.org/x", author: null },
        },
      ],
      groundingMetadata: grounding,
    });
    expect(mixedCoverage.groundedCandidateCount).toBe(1);
    expect(mixedCoverage.groundingCoverage).toBe(0.5);
  });
});
