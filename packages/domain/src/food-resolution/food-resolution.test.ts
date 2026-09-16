import { describe, expect, it, vi } from "vitest";
import {
  mapExternalNutrientsToCanonicalNutrition,
  scoreFoodCandidates,
  selectFoodCandidate,
  toGrams,
  calculateNutritionForGrams,
  sumIngredientNutrition,
  scaleNutrition,
  buildIngredientResolutionKey,
  DefaultFoodResolver,
  resolveRecipeNutrition,
  resolveWeeklyRecipeNutrition,
  MemoryFoodResolutionStore,
  FoodResolutionMemoryCache,
  emptyDiagnostics,
  matchBuiltinFood,
  makeChickenTikkaResolvedRecipe,
  makeIngredient,
  MOCK_CHICKEN_RAW,
  MOCK_CHICKEN_COOKED,
  MOCK_OLIVE_OIL,
  MOCK_RICE_COOKED,
  MOCK_RICE_RAW,
  MOCK_YOGURT,
  MOCK_GARLIC,
  BRANDED_OLIVE_DRESSING_SEARCH,
  toExternalRecord,
  toSearchResult,
  FoodDataProviderException,
  type FoodDataProvider,
} from "./index";

function mockProvider(overrides?: {
  searchFoods?: FoodDataProvider["searchFoods"];
  getFood?: FoodDataProvider["getFood"];
}): FoodDataProvider & { searchCalls: number; getCalls: number } {
  const state = { searchCalls: 0, getCalls: 0 };
  return {
    providerId: "usda",
    get searchCalls() {
      return state.searchCalls;
    },
    get getCalls() {
      return state.getCalls;
    },
    async searchFoods(query) {
      state.searchCalls += 1;
      if (overrides?.searchFoods) return overrides.searchFoods(query);
      return [];
    },
    async getFood(id) {
      state.getCalls += 1;
      if (overrides?.getFood) return overrides.getFood(id);
      throw new FoodDataProviderException({
        code: "FOOD_PROVIDER_NOT_FOUND",
        message: `missing ${id}`,
      });
    },
  };
}

describe("nutrient mapper", () => {
  it("maps USDA nutrient IDs to canonical nutrition", () => {
    const mapped = mapExternalNutrientsToCanonicalNutrition([
      { nutrientId: 1008, unitName: "kcal", value: 120 },
      { nutrientId: 1003, nutrientName: "Protein", value: 22.5 },
      { nutrientId: 1005, nutrientName: "Carbohydrate, by difference", value: 0 },
      { nutrientId: 1004, nutrientName: "Total lipid (fat)", value: 2.6 },
      { nutrientId: 1079, nutrientName: "Fiber, total dietary", value: 0 },
    ]);
    expect(mapped.missingRequired).toEqual([]);
    expect(mapped.caloriesKcal).toBe(120);
    expect(mapped.proteinGrams).toBe(22.5);
    expect(mapped.fiberGrams).toBe(0);
  });

  it("does not treat missing required nutrients as zero", () => {
    const mapped = mapExternalNutrientsToCanonicalNutrition([
      { nutrientId: 1003, value: 10 },
    ]);
    expect(mapped.caloriesKcal).toBeNull();
    expect(mapped.missingRequired).toContain("caloriesKcal");
    expect(mapped.missingRequired).toContain("carbohydrateGrams");
    expect(mapped.missingRequired).toContain("fatGrams");
  });

  it("ignores energy in kJ when mapping kcal", () => {
    const mapped = mapExternalNutrientsToCanonicalNutrition([
      { nutrientId: 1062, unitName: "kJ", value: 500 },
      { nutrientId: 1008, unitName: "kcal", value: 120 },
      { nutrientId: 1003, value: 1 },
      { nutrientId: 1005, value: 1 },
      { nutrientId: 1004, value: 1 },
    ]);
    expect(mapped.caloriesKcal).toBe(120);
  });
});

describe("candidate scoring", () => {
  it("prefers generic olive oil over branded dressing", () => {
    const scored = scoreFoodCandidates({
      query: "olive oil",
      measurementState: "unknown",
      role: "fat",
      requireGeneric: true,
      candidates: [
        BRANDED_OLIVE_DRESSING_SEARCH,
        toSearchResult(MOCK_OLIVE_OIL),
      ],
    });
    const selection = selectFoodCandidate(scored, { preferGeneric: true });
    expect(selection.kind).toBe("resolved");
    if (selection.kind === "resolved") {
      expect(selection.candidate.externalId).toBe(MOCK_OLIVE_OIL.source.externalId);
      expect(selection.candidate.isBranded).toBe(false);
    }
  });

  it("does not force resolution when candidates are ambiguous", () => {
    const scored = scoreFoodCandidates({
      query: "special sauce",
      measurementState: "unknown",
      role: "sauce",
      candidates: [
        {
          externalId: "1",
          description: "Sauce A mystery blend",
          dataType: "SR Legacy",
          brandName: null,
        },
        {
          externalId: "2",
          description: "Sauce B mystery blend",
          dataType: "SR Legacy",
          brandName: null,
        },
      ],
    });
    const selection = selectFoodCandidate(scored);
    expect(selection.kind === "ambiguous" || selection.kind === "not_found").toBe(true);
  });

  it("penalizes cooked candidate for raw measurement state", () => {
    const scored = scoreFoodCandidates({
      query: "chicken breast",
      measurementState: "raw",
      role: "protein",
      candidates: [toSearchResult(MOCK_CHICKEN_COOKED), toSearchResult(MOCK_CHICKEN_RAW)],
    });
    expect(scored[0]!.externalId).toBe(MOCK_CHICKEN_RAW.source.externalId);
  });

  it("prefers raw garlic over garlic sauce for a simple staple query", () => {
    const scored = scoreFoodCandidates({
      query: "garlic",
      measurementState: "raw",
      role: "aromatic",
      candidates: [
        {
          externalId: "sauce",
          description: "Garlic sauce",
          dataType: "Foundation",
          brandName: null,
        },
        toSearchResult(MOCK_GARLIC),
      ],
    });
    const selection = selectFoodCandidate(scored, { preferGeneric: true });
    expect(selection.kind).toBe("resolved");
    if (selection.kind === "resolved") {
      expect(selection.candidate.externalId).toBe(MOCK_GARLIC.source.externalId);
    }
  });
});

describe("quantity normalization", () => {
  it("converts mass units directly", () => {
    const result = toGrams(1, "kg");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.grams).toBe(1000);
      expect(result.value.method).toBe("direct_mass");
      expect(result.value.confidence).toBe("high");
    }
  });

  it("uses provider measure for tbsp oil, not universal 15g", () => {
    const result = toGrams(1, "tbsp", { food: MOCK_OLIVE_OIL });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.grams).toBe(13.5);
      expect(result.value.method).toBe("provider_measure");
    }
  });

  it("refuses household units without food-specific mapping", () => {
    const result = toGrams(1, "tbsp");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_MEASURE_MAPPING");
    }
  });
});

describe("nutrition arithmetic", () => {
  it("calculates exact nutrition for grams without AI", () => {
    const nutrition = calculateNutritionForGrams(
      {
        caloriesKcal: 100,
        proteinGrams: 10,
        carbohydrateGrams: 5,
        fatGrams: 2,
        fiberGrams: 1,
      },
      250,
    );
    expect(nutrition).toEqual({
      caloriesKcal: 250,
      proteinGrams: 25,
      carbohydrateGrams: 12.5,
      fatGrams: 5,
      fiberGrams: 2.5,
    });
  });

  it("aggregates and divides per base serving", () => {
    const a = calculateNutritionForGrams(MOCK_CHICKEN_RAW.nutrientsPer100g, 680);
    const b = calculateNutritionForGrams(MOCK_YOGURT.nutrientsPer100g, 120);
    const total = sumIngredientNutrition([a, b]);
    const per = scaleNutrition(total, 4);
    expect(per.caloriesKcal).toBeCloseTo(total.caloriesKcal / 4);
    expect(per.proteinGrams).toBeCloseTo(total.proteinGrams / 4);
  });
});

describe("ingredient keys", () => {
  it("keeps raw vs cooked rice distinct", () => {
    const cooked = buildIngredientResolutionKey(
      makeIngredient({
        ingredientId: "r1",
        name: "basmati rice",
        quantity: 200,
        unit: "g",
        measurementState: "cooked",
        role: "carb",
      }),
    );
    const raw = buildIngredientResolutionKey(
      makeIngredient({
        ingredientId: "r2",
        name: "basmati rice",
        quantity: 200,
        unit: "g",
        measurementState: "raw",
        role: "carb",
      }),
    );
    expect(cooked.resolutionKey).not.toBe(raw.resolutionKey);
  });

  it("does not collapse chicken breast and thigh", () => {
    const breast = buildIngredientResolutionKey(
      makeIngredient({
        ingredientId: "a",
        name: "chicken breast",
        quantity: 100,
        unit: "g",
        role: "protein",
      }),
    );
    const thigh = buildIngredientResolutionKey(
      makeIngredient({
        ingredientId: "b",
        name: "chicken thigh",
        quantity: 100,
        unit: "g",
        role: "protein",
      }),
    );
    expect(breast.resolutionKey).not.toBe(thigh.resolutionKey);
  });
});

describe("builtin foods", () => {
  it("resolves water and salt without provider calls", () => {
    expect(matchBuiltinFood("water")?.canonicalName).toBe("Water");
    expect(matchBuiltinFood("kosher salt")?.nutrientsPer100g.caloriesKcal).toBe(0);
  });
});

describe("food resolver", () => {
  it("resolves via deterministic scoring and caches mappings", async () => {
    const provider = mockProvider({
      async searchFoods() {
        return [toSearchResult(MOCK_OLIVE_OIL), BRANDED_OLIVE_DRESSING_SEARCH];
      },
      async getFood() {
        return toExternalRecord(MOCK_OLIVE_OIL);
      },
    });
    const store = new MemoryFoodResolutionStore();
    const cache = new FoodResolutionMemoryCache();
    const diagnostics = emptyDiagnostics();
    const resolver = new DefaultFoodResolver({
      provider,
      store,
      cache,
      diagnostics,
      enableSemanticDisambiguation: false,
      createFoodId: () => MOCK_OLIVE_OIL.foodId,
    });

    const ingredient = makeIngredient({
      ingredientId: "oil",
      name: "olive oil",
      quantity: 15,
      unit: "g",
      role: "fat",
    });

    const first = await resolver.resolve(ingredient);
    const second = await resolver.resolve(ingredient);
    expect(first.status).toBe("resolved");
    expect(second.status).toBe("resolved");
    expect(provider.searchCalls).toBe(1);
    expect(provider.getCalls).toBe(1);
    // Third call after clearing inflight still hits mapping cache via store/memory.
    const diagnostics2 = emptyDiagnostics();
    const resolver2 = new DefaultFoodResolver({
      provider,
      store,
      cache,
      diagnostics: diagnostics2,
      enableSemanticDisambiguation: false,
      createFoodId: () => MOCK_OLIVE_OIL.foodId,
    });
    const third = await resolver2.resolve(ingredient);
    expect(third.status).toBe("resolved");
    expect(provider.searchCalls).toBe(1);
    expect(diagnostics2.mappingCacheHits).toBeGreaterThanOrEqual(1);
  });

  it("distinguishes raw vs cooked rice foods", async () => {
    const provider = mockProvider({
      async searchFoods(query) {
        if (/cooked/i.test(query.query)) {
          return [toSearchResult(MOCK_RICE_COOKED), toSearchResult(MOCK_RICE_RAW)];
        }
        return [toSearchResult(MOCK_RICE_RAW), toSearchResult(MOCK_RICE_COOKED)];
      },
      async getFood(id) {
        if (id === MOCK_RICE_COOKED.source.externalId) return toExternalRecord(MOCK_RICE_COOKED);
        return toExternalRecord(MOCK_RICE_RAW);
      },
    });
    const resolver = new DefaultFoodResolver({
      provider,
      enableSemanticDisambiguation: false,
      createFoodId: () => crypto.randomUUID(),
    });

    const cooked = await resolver.resolve(
      makeIngredient({
        ingredientId: "rice-c",
        name: "basmati rice",
        quantity: 200,
        unit: "g",
        measurementState: "cooked",
        role: "carb",
      }),
    );
    const raw = await resolver.resolve(
      makeIngredient({
        ingredientId: "rice-r",
        name: "basmati rice",
        quantity: 200,
        unit: "g",
        measurementState: "raw",
        role: "carb",
      }),
    );
    expect(cooked.status).toBe("resolved");
    expect(raw.status).toBe("resolved");
    if (cooked.status === "resolved" && raw.status === "resolved") {
      expect(cooked.food.source.externalId).toBe(MOCK_RICE_COOKED.source.externalId);
      expect(raw.food.source.externalId).toBe(MOCK_RICE_RAW.source.externalId);
    }
  });

  it("returns ambiguous rather than forcing a bad match", async () => {
    const provider = mockProvider({
      async searchFoods() {
        return [
          {
            externalId: "1",
            description: "Mystery blend A",
            dataType: "SR Legacy",
            brandName: null,
          },
          {
            externalId: "2",
            description: "Mystery blend B",
            dataType: "SR Legacy",
            brandName: null,
          },
        ];
      },
    });
    const resolver = new DefaultFoodResolver({
      provider,
      enableSemanticDisambiguation: false,
    });
    const result = await resolver.resolve(
      makeIngredient({
        ingredientId: "x",
        name: "special sauce",
        quantity: 10,
        unit: "g",
        role: "sauce",
      }),
    );
    expect(result.status).toBe("ambiguous");
  });

  it("allows semantic disambiguation only among supplied candidates", async () => {
    const provider = mockProvider({
      async searchFoods() {
        return [
          {
            externalId: "1",
            description: "Greek yogurt, plain, nonfat",
            dataType: "SR Legacy",
            brandName: null,
          },
          {
            externalId: "2",
            description: "Yogurt, Greek, plain, whole milk",
            dataType: "SR Legacy",
            brandName: null,
          },
        ];
      },
      async getFood(id) {
        if (id === "2") return toExternalRecord(MOCK_YOGURT);
        return toExternalRecord({
          ...MOCK_YOGURT,
          foodId: "22222222-2222-4222-8222-222222222222",
          source: { provider: "usda", externalId: "1", dataType: "SR Legacy" },
          description: "Greek yogurt, plain, nonfat",
          nutrientsPer100g: {
            caloriesKcal: 59,
            proteinGrams: 10,
            carbohydrateGrams: 3.6,
            fatGrams: 0.4,
          },
        });
      },
    });
    const disambiguator = {
      chooseCandidate: vi.fn(async () => ({
        externalId: "999", // not in list — must be ignored
        reason: "invented",
      })),
    };
    const resolver = new DefaultFoodResolver({
      provider,
      disambiguator,
      enableSemanticDisambiguation: true,
    });
    const result = await resolver.resolve(
      makeIngredient({
        ingredientId: "y",
        name: "plain whole-milk Greek yogurt",
        quantity: 120,
        unit: "g",
        role: "sauce",
      }),
    );
    // Invented ID ignored → remains ambiguous (or resolved only if deterministic won).
    expect(["ambiguous", "resolved"]).toContain(result.status);
    if (result.status === "resolved") {
      expect(result.food.source.externalId).not.toBe("999");
    }
  });

  it("deduplicates identical resolution keys within a request", async () => {
    const provider = mockProvider({
      async searchFoods() {
        return [toSearchResult(MOCK_GARLIC)];
      },
      async getFood() {
        return toExternalRecord(MOCK_GARLIC);
      },
    });
    const resolver = new DefaultFoodResolver({
      provider,
      enableSemanticDisambiguation: false,
      createFoodId: () => MOCK_GARLIC.foodId,
    });
    const a = makeIngredient({
      ingredientId: "g1",
      name: "garlic",
      quantity: 2,
      unit: "clove",
      preparation: "minced",
      role: "aromatic",
    });
    const b = makeIngredient({
      ingredientId: "g2",
      name: "Garlic",
      quantity: 1,
      unit: "clove",
      preparation: "minced",
      role: "aromatic",
    });
    await Promise.all([resolver.resolve(a), resolver.resolve(b)]);
    expect(provider.searchCalls).toBe(1);
  });
});

describe("recipe nutrition service", () => {
  it("aggregates recipe nutrition and marks recommended sides as pending portioning", async () => {
    const foods = new Map([
      [MOCK_CHICKEN_RAW.source.externalId, MOCK_CHICKEN_RAW],
      [MOCK_YOGURT.source.externalId, MOCK_YOGURT],
      [MOCK_OLIVE_OIL.source.externalId, MOCK_OLIVE_OIL],
      [MOCK_GARLIC.source.externalId, MOCK_GARLIC],
    ]);
    const provider = mockProvider({
      async searchFoods(query) {
        const q = query.query.toLowerCase();
        if (q.includes("chicken")) return [toSearchResult(MOCK_CHICKEN_RAW)];
        if (q.includes("yogurt")) return [toSearchResult(MOCK_YOGURT)];
        if (q.includes("oil")) return [toSearchResult(MOCK_OLIVE_OIL)];
        if (q.includes("garlic")) return [toSearchResult(MOCK_GARLIC)];
        return [];
      },
      async getFood(id) {
        const food = foods.get(id);
        if (!food) {
          throw new FoodDataProviderException({
            code: "FOOD_PROVIDER_NOT_FOUND",
            message: id,
          });
        }
        return toExternalRecord(food);
      },
    });
    const resolver = new DefaultFoodResolver({
      provider,
      enableSemanticDisambiguation: false,
      createFoodId: () => crypto.randomUUID(),
    });
    const recipe = makeChickenTikkaResolvedRecipe();
    const result = await resolveRecipeNutrition(recipe, { resolver });
    expect(result.resolutionQuality.status).toBe("partial");
    expect(result.mealComponents.some((c) => c.status === "pending_portioning")).toBe(true);
    expect(result.nutrition?.total.caloriesKcal).toBeGreaterThan(0);
    expect(result.nutrition?.perBaseServing.caloriesKcal).toBeCloseTo(
      (result.nutrition?.total.caloriesKcal ?? 0) / 4,
    );
    const oil = result.ingredients.find((i) => i.recipeIngredient.ingredientId === "oil");
    expect(oil?.normalizedQuantity?.method).toBe("provider_measure");
    expect(oil?.normalizedQuantity?.grams).toBe(13.5);
  });

  it("marks blocked when a required ingredient cannot be resolved", async () => {
    const provider = mockProvider({
      async searchFoods() {
        return [];
      },
    });
    const resolver = new DefaultFoodResolver({
      provider,
      enableSemanticDisambiguation: false,
    });
    const recipe = makeChickenTikkaResolvedRecipe({
      ingredients: [
        makeIngredient({
          ingredientId: "x",
          name: "unknown exotic tuber",
          quantity: 100,
          unit: "g",
          role: "vegetable",
        }),
      ],
      mealComponents: [
        {
          componentId: "main",
          name: "Main",
          type: "main",
          required: true,
          purpose: "main",
          relationship: "intrinsic",
        },
      ],
    });
    const result = await resolveRecipeNutrition(recipe, { resolver });
    expect(result.resolutionQuality.status).toBe("blocked");
  });

  it("resolves weekly unique recipes once (not per slot)", async () => {
    const provider = mockProvider({
      async searchFoods() {
        return [toSearchResult(MOCK_CHICKEN_RAW)];
      },
      async getFood() {
        return toExternalRecord(MOCK_CHICKEN_RAW);
      },
    });
    const resolver = new DefaultFoodResolver({
      provider,
      enableSemanticDisambiguation: false,
      createFoodId: () => MOCK_CHICKEN_RAW.foodId,
    });
    const recipe = makeChickenTikkaResolvedRecipe({
      ingredients: [
        makeIngredient({
          ingredientId: "chicken",
          name: "chicken breast",
          quantity: 100,
          unit: "g",
          measurementState: "raw",
          role: "protein",
        }),
      ],
      mealComponents: [
        {
          componentId: "main",
          name: "Main",
          type: "main",
          required: true,
          purpose: "main",
          relationship: "intrinsic",
        },
      ],
    });
    const weekly = await resolveWeeklyRecipeNutrition({
      recipes: [recipe, recipe, recipe],
      uniqueCandidateIds: ["tikka-chicken"],
      resolver,
      slotCount: 14,
    });
    expect(weekly.recipeCount).toBe(1);
    expect(weekly.slotCount).toBe(14);
    expect(provider.searchCalls).toBe(1);
  });
});

describe("provider errors", () => {
  it("surfaces rate-limit as not_found rather than aborting the batch", async () => {
    const provider = mockProvider({
      async searchFoods() {
        throw new FoodDataProviderException({
          code: "FOOD_PROVIDER_RATE_LIMITED",
          message: "rate limited",
          retryAfterMs: 1000,
        });
      },
    });
    const resolver = new DefaultFoodResolver({
      provider,
      enableSemanticDisambiguation: false,
    });
    const result = await resolver.resolve(
      makeIngredient({
        ingredientId: "x",
        name: "chicken",
        quantity: 100,
        unit: "g",
        role: "protein",
      }),
    );
    expect(result.status).toBe("not_found");
    if (result.status === "not_found") {
      expect(result.reason).toMatch(/rate-limited/i);
    }
  });
});
