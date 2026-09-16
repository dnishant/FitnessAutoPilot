import { describe, expect, it, vi } from "vitest";
import { FoodDataProviderException } from "@fitness-autopilot/domain";
import { mapUsdaFoodDetail, mapUsdaSearchHit } from "./map-usda";
import { UsdaFoodDataProvider } from "./provider";
import { loadUsdaServerConfig } from "./config";

describe("USDA mapping", () => {
  it("maps search hits without leaking USDA-only shapes", () => {
    const hit = mapUsdaSearchHit({
      fdcId: 171413,
      description: "Oil, olive, salad or cooking",
      dataType: "SR Legacy",
      brandOwner: null as unknown as undefined,
      foodCategory: "Fats and Oils",
      score: 50,
    });
    expect(hit).toEqual({
      externalId: "171413",
      description: "Oil, olive, salad or cooking",
      dataType: "SR Legacy",
      brandName: null,
      foodCategory: "Fats and Oils",
      score: 50,
    });
  });

  it("maps food detail nutrients and portions", () => {
    const record = mapUsdaFoodDetail({
      fdcId: 171413,
      description: "Oil, olive, salad or cooking",
      dataType: "SR Legacy",
      foodNutrients: [
        { nutrientId: 1008, unitName: "kcal", value: 884 },
        { nutrientId: 1003, value: 0 },
        { nutrientId: 1005, value: 0 },
        { nutrientId: 1004, value: 100 },
        { nutrientId: 1079, value: 0 },
      ],
      foodPortions: [
        {
          amount: 1,
          modifier: "tablespoon",
          measureUnit: { abbreviation: "tbsp", name: "tablespoon" },
          gramWeight: 13.5,
        },
      ],
    });
    expect(record?.nutrientsPer100g.caloriesKcal).toBe(884);
    expect(record?.measures[0]?.gramWeight).toBe(13.5);
    expect(record?.provider).toBe("usda");
  });

  it("rejects foods missing required nutrients", () => {
    const record = mapUsdaFoodDetail({
      fdcId: 1,
      description: "Incomplete",
      foodNutrients: [{ nutrientId: 1003, value: 1 }],
    });
    expect(record).toBeNull();
  });
});

describe("UsdaFoodDataProvider", () => {
  it("loads config from env", () => {
    const loaded = loadUsdaServerConfig((key) =>
      key === "USDA_API_KEY" ? "test-key" : undefined,
    );
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value.apiKey).toBe("test-key");
  });

  it("retries rate-limited responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate", {
          status: 429,
          headers: { "retry-after": "0" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ foods: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const provider = new UsdaFoodDataProvider({
      config: {
        apiKey: "test",
        baseUrl: "https://api.nal.usda.gov/fdc/v1",
        timeoutMs: 5000,
        maxAttempts: 3,
      },
      fetchImpl,
      sleep: async () => undefined,
    });

    const foods = await provider.searchFoods({ query: "olive oil", pageSize: 5 });
    expect(foods).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps timeout to typed provider error", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const provider = new UsdaFoodDataProvider({
      config: {
        apiKey: "test",
        baseUrl: "https://api.nal.usda.gov/fdc/v1",
        timeoutMs: 10,
        maxAttempts: 1,
      },
      fetchImpl,
      sleep: async () => undefined,
    });
    await expect(provider.searchFoods({ query: "x" })).rejects.toBeInstanceOf(
      FoodDataProviderException,
    );
    await expect(provider.searchFoods({ query: "x" })).rejects.toMatchObject({
      code: "FOOD_PROVIDER_TIMEOUT",
    });
  });
});
