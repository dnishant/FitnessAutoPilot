import { describe, expect, it, vi } from "vitest";
import {
  createRecipeDiscoveryProvider,
  EdamamRecipeDiscoveryProvider,
  normalizeEdamamHit,
  parseEdamamSearchResponse,
  sanitizeEdamamLogText,
  type EdamamHttpClient,
  type EdamamHttpResponse,
} from "../index";

const SAMPLE_URI =
  "http://www.edamam.com/ontologies/edamam.owl#recipe_b79327d05b8e5b838ad6cfd9576b30b6";

function hit(overrides: Record<string, unknown> = {}) {
  return {
    recipe: {
      uri: SAMPLE_URI,
      label: "Chicken Tikka Masala",
      image: "https://www.edamam.com/web-img/abc/chicken-tikka-masala.jpg",
      source: "BBC Good Food",
      url: "https://www.bbcgoodfood.com/recipes/chicken-tikka-masala",
      yield: 4,
      dietLabels: ["High-Protein"],
      healthLabels: ["Gluten-Free", "Peanut-Free"],
      cuisineType: ["indian"],
      mealType: ["lunch/dinner"],
      dishType: ["main course"],
      ingredientLines: ["chicken", "yogurt", "spices"],
      calories: 1800,
      totalNutrients: {
        PROCNT: { quantity: 140 },
        CHOCDF: { quantity: 80 },
        FAT: { quantity: 60 },
      },
      ...overrides,
    },
  };
}

function jsonResponse(body: unknown, status = 200): EdamamHttpResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    bodyText: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function mockClient(
  handler: (url: string) => Promise<EdamamHttpResponse> | EdamamHttpResponse,
): EdamamHttpClient {
  return {
    request: async ({ url }) => handler(url),
  };
}

const config = {
  appId: "test-app-id",
  appKey: "test-app-key-secret",
  baseUrl: "https://api.edamam.com/api/recipes/v2",
  timeoutMs: 5_000,
};

describe("normalizeEdamamHit", () => {
  it("normalizes provider response fields including attribution and nutrition", () => {
    const candidate = normalizeEdamamHit(hit());
    expect(candidate).toMatchObject({
      provider: "edamam",
      externalId: "b79327d05b8e5b838ad6cfd9576b30b6",
      name: "Chicken Tikka Masala",
      sourceName: "BBC Good Food",
      sourceUrl: "https://www.bbcgoodfood.com/recipes/chicken-tikka-masala",
      imageUrl: "https://www.edamam.com/web-img/abc/chicken-tikka-masala.jpg",
      cuisineLabels: ["indian"],
      mealTypeLabels: ["lunch/dinner"],
      servings: 4,
      caloriesPerServing: 450,
      proteinGramsPerServing: 35,
      carbsGramsPerServing: 20,
      fatGramsPerServing: 15,
    });
  });

  it("tolerates missing optional provider fields", () => {
    const candidate = normalizeEdamamHit({
      recipe: {
        uri: SAMPLE_URI,
        label: "Sparse Recipe",
      },
    });
    expect(candidate).toMatchObject({
      provider: "edamam",
      externalId: "b79327d05b8e5b838ad6cfd9576b30b6",
      name: "Sparse Recipe",
      cuisineLabels: [],
      ingredientLines: [],
    });
    expect(candidate?.sourceUrl).toBeUndefined();
    expect(candidate?.caloriesPerServing).toBeUndefined();
  });
});

describe("parseEdamamSearchResponse", () => {
  it("fails safely on malformed JSON", () => {
    const parsed = parseEdamamSearchResponse("{not-json");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("PROVIDER_BAD_RESPONSE");
    }
  });

  it("fails when hits is not an array", () => {
    const parsed = parseEdamamSearchResponse(JSON.stringify({ hits: "nope" }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("PROVIDER_BAD_RESPONSE");
    }
  });
});

describe("EdamamRecipeDiscoveryProvider", () => {
  it("searches, dedupes, and caps results without calling Gemini", async () => {
    const urls: string[] = [];
    const client = mockClient((url) => {
      urls.push(url);
      expect(url).not.toContain("generativelanguage.googleapis.com");
      expect(url).not.toContain("gemini");
      return jsonResponse({
        hits: [
          hit(),
          hit(), // duplicate same external id
          hit({
            uri: "http://www.edamam.com/ontologies/edamam.owl#recipe_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            label: "Fish Curry",
            source: "Serious Eats",
            url: "https://www.seriouseats.com/fish-curry",
          }),
          hit({
            uri: "http://www.edamam.com/ontologies/edamam.owl#recipe_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            label: "Paneer Bhurji",
          }),
        ],
      });
    });

    const provider = new EdamamRecipeDiscoveryProvider({
      config,
      httpClient: client,
    });

    const result = await provider.search({
      mealType: "dinner",
      cuisines: ["indian"],
      proteins: ["chicken"],
      highProteinPreferred: true,
      maxResults: 2,
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.metadata.totalReturned).toBe(2);
    expect(result.metadata.externalRequestsMade).toBe(1);
    expect(result.metadata.provider).toBe("edamam");
    expect(result.candidates[0]?.sourceName).toBe("BBC Good Food");
    expect(urls[0]).toContain("q=chicken");
    expect(urls[0]).toContain("cuisineType=indian");
    expect(urls[0]).toContain("mealType=lunch%2Fdinner");
    expect(urls[0]).toContain("diet=high-protein");
    expect(urls[0]).toContain("app_id=test-app-id");
  });

  it("maps auth failures to PROVIDER_AUTH_FAILED", async () => {
    const provider = new EdamamRecipeDiscoveryProvider({
      config,
      httpClient: mockClient(() => jsonResponse({ message: "unauthorized" }, 401)),
    });
    await expect(
      provider.search({ mealType: "dinner", proteins: ["chicken"] }),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });
  });

  it("maps rate-limit responses to PROVIDER_RATE_LIMITED", async () => {
    const provider = new EdamamRecipeDiscoveryProvider({
      config,
      httpClient: mockClient(() => jsonResponse({ message: "rate limit" }, 429)),
    });
    await expect(
      provider.search({ mealType: "dinner", proteins: ["chicken"] }),
    ).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
  });

  it("maps malformed provider bodies to PROVIDER_BAD_RESPONSE", async () => {
    const provider = new EdamamRecipeDiscoveryProvider({
      config,
      httpClient: mockClient(() => jsonResponse("not-json", 200)),
    });
    await expect(
      provider.search({ mealType: "dinner", proteins: ["chicken"] }),
    ).rejects.toMatchObject({ code: "PROVIDER_BAD_RESPONSE" });
  });

  it("never includes credentials in log output", async () => {
    const logs: Array<Record<string, unknown>> = [];
    const provider = new EdamamRecipeDiscoveryProvider({
      config,
      httpClient: mockClient(() =>
        jsonResponse(
          {
            error: `bad key app_key=${config.appKey} url=https://api.edamam.com/api/recipes/v2?app_id=${config.appId}&app_key=${config.appKey}`,
          },
          401,
        ),
      ),
      onLog: (event) => logs.push(event as unknown as Record<string, unknown>),
    });

    await expect(
      provider.search({ mealType: "dinner", proteins: ["chicken"] }),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });

    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(config.appKey);
    expect(serialized).not.toContain(`app_key=${config.appKey}`);
    expect(sanitizeEdamamLogText(`app_key=${config.appKey}`)).toContain(
      "app_key=[redacted]",
    );
  });

  it("issues at most one external search per protein and never calls Gemini", async () => {
    const generateContent = vi.fn();
    const urls: string[] = [];
    const provider = new EdamamRecipeDiscoveryProvider({
      config,
      httpClient: mockClient((url) => {
        urls.push(url);
        return jsonResponse({ hits: [hit({ label: `Recipe ${urls.length}` })] });
      }),
    });

    const result = await provider.search({
      mealType: "dinner",
      cuisines: ["mexican"],
      proteins: ["chicken", "fish"],
      highProteinPreferred: true,
    });

    expect(result.metadata.externalRequestsMade).toBe(2);
    expect(urls).toHaveLength(2);
    expect(urls.every((url) => url.includes("cuisineType=mexican"))).toBe(true);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("reports applied vs unsupported constraints in metadata", async () => {
    const provider = new EdamamRecipeDiscoveryProvider({
      config,
      httpClient: mockClient(() => jsonResponse({ hits: [hit()] })),
    });
    const result = await provider.search({
      mealType: "dinner",
      cuisines: ["indian"],
      proteins: ["chicken"],
      allergies: ["Peanuts"],
      dietaryRestrictions: ["halal"],
      dislikes: ["Olives"],
      highProteinPreferred: true,
    });
    expect(result.metadata.appliedConstraints).toEqual(
      expect.arrayContaining([
        expect.stringContaining("peanut-free"),
        "diet:high-protein",
      ]),
    );
    expect(result.metadata.unsupportedConstraints).toEqual(
      expect.arrayContaining(["restriction:halal", "dislike:Olives"]),
    );
  });
});

describe("createRecipeDiscoveryProvider", () => {
  it("loads server config from env and does not require Gemini", () => {
    const provider = createRecipeDiscoveryProvider({
      env: (key) => {
        if (key === "EDAMAM_APP_ID") return "id";
        if (key === "EDAMAM_APP_KEY") return "key";
        if (key === "GEMINI_API_KEY") return undefined;
        return undefined;
      },
      httpClient: mockClient(() => jsonResponse({ hits: [hit()] })),
    });
    expect(provider).toBeInstanceOf(EdamamRecipeDiscoveryProvider);
  });

  it("throws configuration error when Edamam credentials are missing", () => {
    expect(() =>
      createRecipeDiscoveryProvider({
        env: () => undefined,
      }),
    ).toThrowError(/EDAMAM_APP_ID/);
  });
});
