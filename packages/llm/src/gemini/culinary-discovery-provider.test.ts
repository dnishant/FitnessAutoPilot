import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { CulinaryDiscoveryRequest } from "@fitness-autopilot/contracts";
import {
  CULINARY_DISCOVERY_PROMPT_VERSION,
  type CulinaryDiscoveryProvider,
} from "@fitness-autopilot/domain";
import {
  DEFAULT_GEMINI_MODEL,
  GeminiGroundedCulinaryDiscoveryProvider,
  coerceDiscoveryCandidatePayload,
  createCulinaryDiscoveryProvider,
  extractJsonObjectFromModelText,
  mapGeminiGroundingMetadataForTests,
  type GeminiContentClient,
} from "../index";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const sampleRequest: CulinaryDiscoveryRequest = {
  mealType: "dinner",
  cuisines: ["Indian"],
  proteinPreferences: ["Chicken"],
  experiencePreferences: ["Spicy"],
  allergies: [],
  dietaryRestrictions: [],
  dislikes: [],
  recentConcepts: [
    {
      name: "Chicken Tikka",
      timesSuggestedLast30Days: 2,
      lastSuggestedDaysAgo: 5,
    },
  ],
  rejectedConcepts: ["Butter Chicken"],
  targetCandidateCount: 5,
};

const modelCandidate = {
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
  whyItIsInteresting: "Pepper-forward South Indian chicken.",
  fitnessAdaptability: "easy",
  fitnessAdaptabilityReason:
    "Protein and starch portions can be scaled independently while preserving the sauce.",
  mealPrepAdaptability: "component_prepped",
  noveltyReason: "Regional discovery.",
  discoveryConfidence: "high",
};

const grounding = {
  webSearchQueries: [
    "South Indian chicken Chettinad recipe",
    "Kerala chicken pepper fry",
  ],
  groundingChunks: [
    {
      web: {
        uri: "https://example.com/chicken-chettinad",
        title: "example.com",
      },
    },
  ],
  groundingSupports: [
    {
      groundingChunkIndices: [0],
      segment: { startIndex: 0, endIndex: 20, text: "Chicken Chettinad" },
    },
  ],
};

function mockClient(
  impl: GeminiContentClient["generateContent"],
): GeminiContentClient {
  return { generateContent: impl };
}

describe("GeminiGroundedCulinaryDiscoveryProvider", () => {
  it("implements CulinaryDiscoveryProvider and enables Google Search grounding", async () => {
    const generateContent = vi.fn(async (params) => {
      expect(params.tools).toEqual([{ googleSearch: {} }]);
      // Gemini 3.x drops grounding when responseJsonSchema / mime JSON are set.
      expect(params.responseMimeType).toBeUndefined();
      expect(params.responseJsonSchema).toBeUndefined();
      expect(params.systemInstruction).toContain("EXPLORATION-FIRST SEARCH");
      expect(params.systemInstruction).toContain(
        "Do not begin by deciding which dishes you want to return",
      );
      expect(params.systemInstruction).toContain("Do not preselect a famous publication");
      expect(params.systemInstruction).toContain("Aim for approximately 4–8 Google Search queries");
      expect(params.systemInstruction).toContain("Do not add filler candidates");
      expect(params.contents).toContain("Indian");
      expect(params.contents).toContain("Chicken");
      expect(params.contents).toContain("Chicken Tikka");
      expect(params.contents).toContain("Butter Chicken");
      expect(params.contents).toContain("Target candidate count (maximum/target, not an exact quota): 5");
      expect(params.contents).toContain(CULINARY_DISCOVERY_PROMPT_VERSION);
      return {
        text: [
          "Grounded notes:",
          "- Chicken Chettinad from example.com",
          "```json",
          JSON.stringify({ candidates: [modelCandidate] }),
          "```",
        ].join("\n"),
        groundingMetadata: grounding,
      };
    });
    const client = mockClient(generateContent);
    const provider: CulinaryDiscoveryProvider = new GeminiGroundedCulinaryDiscoveryProvider({
      model: DEFAULT_GEMINI_MODEL,
      client,
    });
    const result = await provider.discover(sampleRequest);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.source.url).toBe("https://example.com/chicken-chettinad");
    expect(result.discoveryMetadata.promptVersion).toBe(CULINARY_DISCOVERY_PROMPT_VERSION);
    expect(result.groundingMetadata?.webSearchQueries).toEqual(grounding.webSearchQueries);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("extracts JSON from fenced model replies", () => {
    const payload = { candidates: [modelCandidate] };
    const text = `Notes from search\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\n`;
    expect(JSON.parse(extractJsonObjectFromModelText(text))).toEqual(payload);
  });

  it("maps provider failures to typed errors", async () => {
    const client = mockClient(async () => {
      throw new Error("upstream timeout");
    });
    const provider = new GeminiGroundedCulinaryDiscoveryProvider({
      model: "gemini-3.6-flash",
      client,
    });
    await expect(provider.discover(sampleRequest)).rejects.toMatchObject({
      code: "LLM_PROVIDER_ERROR",
      message: "upstream timeout",
    });
  });

  it("fails safely on malformed Gemini output", async () => {
    const client = mockClient(async () => ({
      text: "not-json",
      groundingMetadata: grounding,
    }));
    const provider = new GeminiGroundedCulinaryDiscoveryProvider({
      model: "gemini-3.6-flash",
      client,
    });
    await expect(provider.discover(sampleRequest)).rejects.toMatchObject({
      code: "LLM_INVALID_STRUCTURED_OUTPUT",
    });
  });

  it("fails when grounding metadata is missing after retries", async () => {
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify({ candidates: [modelCandidate] }),
    }));
    const client = mockClient(generateContent);
    const provider = new GeminiGroundedCulinaryDiscoveryProvider({
      model: "gemini-3.6-flash",
      client,
    });
    await expect(provider.discover(sampleRequest)).rejects.toMatchObject({
      code: "DISCOVERY_NOT_GROUNDED",
    });
    expect(generateContent).toHaveBeenCalledTimes(3);
    const secondCall = generateContent.mock.calls.at(1)?.at(0) as
      | { contents?: string }
      | undefined;
    expect(secondCall?.contents).toContain("CRITICAL RETRY");
  });

  it("retries when the first Gemini reply is not grounded", async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({ candidates: [modelCandidate] }),
      })
      .mockResolvedValueOnce({
        text: [
          "Grounded notes:",
          "- Chicken Chettinad from example.com",
          "```json",
          JSON.stringify({ candidates: [modelCandidate] }),
          "```",
        ].join("\n"),
        groundingMetadata: grounding,
      });
    const client = mockClient(generateContent);
    const provider = new GeminiGroundedCulinaryDiscoveryProvider({
      model: "gemini-3.6-flash",
      client,
    });
    const result = await provider.discover(sampleRequest);
    expect(result.candidates).toHaveLength(1);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid URL candidates", async () => {
    const client = mockClient(async () => ({
      text: JSON.stringify({
        candidates: [
          {
            ...modelCandidate,
            source: { name: "X", url: "not-a-url" },
          },
        ],
      }),
      groundingMetadata: grounding,
    }));
    const provider = new GeminiGroundedCulinaryDiscoveryProvider({
      model: "gemini-3.6-flash",
      client,
    });
    await expect(provider.discover(sampleRequest)).rejects.toMatchObject({
      code: "DISCOVERY_SCHEMA_VALIDATION_FAILED",
    });
  });

  it("factory creates provider from config and keeps Gemini server-side", () => {
    const provider = createCulinaryDiscoveryProvider({
      config: {
        provider: "gemini",
        gemini: { apiKey: "test-key", model: "gemini-3.6-flash" },
      },
      geminiClient: mockClient(async () => ({
        text: JSON.stringify({ candidates: [modelCandidate] }),
        groundingMetadata: grounding,
      })),
    });
    expect(provider).toBeInstanceOf(GeminiGroundedCulinaryDiscoveryProvider);

    const mobilePkg = readFileSync(join(repoRoot, "apps/mobile/package.json"), "utf8");
    expect(mobilePkg).not.toContain("@google/genai");
    expect(mobilePkg).not.toContain("GEMINI_API_KEY");

    const preview = readFileSync(
      join(repoRoot, "apps/mobile/src/lib/culinary-discovery-preview.ts"),
      "utf8",
    );
    expect(preview).toContain('CULINARY_DISCOVERY_FUNCTION_NAME = "culinary-discovery"');
    expect(preview).not.toMatch(/GEMINI_API_KEY\s*=/);
    expect(preview).not.toContain("@google/genai");
    expect(preview).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);

    const edgeFn = readFileSync(
      join(repoRoot, "supabase/functions/culinary-discovery/index.ts"),
      "utf8",
    );
    expect(edgeFn).toContain("maxGroundingAttempts: 1");
  });

  it("maps grounding metadata safely without HTML entry point", () => {
    const mapped = mapGeminiGroundingMetadataForTests({
      webSearchQueries: ["q1"],
      searchEntryPoint: { renderedContent: "<script>alert(1)</script>" },
      groundingChunks: [{ web: { uri: "https://a.com", title: "a.com" } }],
    });
    expect(mapped?.hasSearchEntryPoint).toBe(true);
    expect(JSON.stringify(mapped)).not.toContain("<script>");
    expect(mapped?.webSearchQueries).toEqual(["q1"]);
  });

  it("succeeds with fewer than the requested candidate count", async () => {
    const client = mockClient(async () => ({
      text: JSON.stringify({ candidates: [modelCandidate] }),
      groundingMetadata: grounding,
    }));
    const provider = new GeminiGroundedCulinaryDiscoveryProvider({
      model: "gemini-3.6-flash",
      client,
    });
    const result = await provider.discover({
      ...sampleRequest,
      targetCandidateCount: 20,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.discoveryMetadata.requestedCandidateCount).toBe(20);
    expect(result.discoveryMetadata.returnedCandidateCount).toBe(1);
    expect(result.discoveryMetadata.searchQueryCount).toBe(2);
    expect(result.discoveryMetadata.qualityStats?.groundingCoverage).toBe(1);
  });

  it("drops homepage source URLs rather than returning them", async () => {
    const client = mockClient(async () => ({
      text: JSON.stringify({
        candidates: [
          {
            ...modelCandidate,
            source: { name: "Food52", url: "https://food52.com/" },
          },
        ],
      }),
      groundingMetadata: {
        webSearchQueries: ["regional goan seafood"],
        groundingChunks: [{ web: { uri: "https://food52.com/", title: "food52.com" } }],
      },
    }));
    const provider = new GeminiGroundedCulinaryDiscoveryProvider({
      model: "gemini-3.6-flash",
      client,
    });
    await expect(provider.discover(sampleRequest)).rejects.toMatchObject({
      code: "DISCOVERY_NOT_GROUNDED",
    });
  });

  it("coerces legacy fitness adaptability values without recommending substitutions", () => {
    const coerced = coerceDiscoveryCandidatePayload({
      ...modelCandidate,
      fitnessAdaptability: "excellent",
      fitnessAdaptabilityReason:
        "Protein and starch portions can be scaled independently while preserving the sauce.",
    }) as { fitnessAdaptability: string; fitnessAdaptabilityReason: string };
    expect(coerced.fitnessAdaptability).toBe("easy");
    expect(coerced.fitnessAdaptabilityReason).not.toMatch(/replace|substitute/i);
  });

  it("can cap grounding attempts for Edge CPU limits", async () => {
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify({ candidates: [modelCandidate] }),
    }));
    const provider = new GeminiGroundedCulinaryDiscoveryProvider({
      model: "gemini-3.6-flash",
      client: mockClient(generateContent),
      maxGroundingAttempts: 1,
    });
    await expect(provider.discover(sampleRequest)).rejects.toMatchObject({
      code: "DISCOVERY_NOT_GROUNDED",
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("does not make live Gemini calls in automated tests", async () => {
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify({ candidates: [modelCandidate] }),
      groundingMetadata: grounding,
    }));
    const provider = new GeminiGroundedCulinaryDiscoveryProvider({
      model: "gemini-3.6-flash",
      client: mockClient(generateContent),
    });
    await provider.discover(sampleRequest);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(vi.isMockFunction(generateContent)).toBe(true);
  });
});
