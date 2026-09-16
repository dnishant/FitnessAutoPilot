/**
 * Offline PLAN-009 QA for the six PLAN-008 Simple recipes.
 * Uses a fixture USDA-like provider (no live network) to evaluate mapping quality,
 * completeness, and diagnostics. Live USDA requires USDA_API_KEY (DEMO_KEY is
 * frequently rate-limited).
 */
import { writeFileSync } from "node:fs";
import type { ExternalFoodRecord, FoodSearchResult } from "@fitness-autopilot/contracts";
import {
  DefaultFoodResolver,
  FoodResolutionMemoryCache,
  emptyDiagnostics,
  plan009SimpleResolvedRecipes,
  resolveWeeklyRecipeNutrition,
  type FoodDataProvider,
} from "@fitness-autopilot/domain";

function food(
  externalId: string,
  description: string,
  nutrients: ExternalFoodRecord["nutrientsPer100g"],
  extras?: Partial<ExternalFoodRecord>,
): ExternalFoodRecord {
  return {
    provider: "usda",
    externalId,
    canonicalName: description,
    source: { provider: "usda", externalId, dataType: extras?.source?.dataType ?? "SR Legacy" },
    description,
    nutrientsPer100g: nutrients,
    measures: extras?.measures ?? [],
    metadata: extras?.metadata ?? { brandName: null, foodCategory: null },
  };
}

const CATALOG: ExternalFoodRecord[] = [
  food("171077", "Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw", {
    caloriesKcal: 120, proteinGrams: 22.5, carbohydrateGrams: 0, fatGrams: 2.6, fiberGrams: 0,
  }, { metadata: { brandName: null, foodCategory: "Poultry Products" } }),
  food("174032", "Chicken, broiler or fryers, thigh, meat only, raw", {
    caloriesKcal: 121, proteinGrams: 19.7, carbohydrateGrams: 0, fatGrams: 4.1, fiberGrams: 0,
  }, { metadata: { brandName: null, foodCategory: "Poultry Products" } }),
  food("174036", "Beef, chuck, arm pot roast, separable lean only, raw", {
    caloriesKcal: 140, proteinGrams: 21.3, carbohydrateGrams: 0, fatGrams: 5.5, fiberGrams: 0,
  }, { metadata: { brandName: null, foodCategory: "Beef Products" } }),
  food("175180", "Crustaceans, shrimp, mixed species, raw", {
    caloriesKcal: 85, proteinGrams: 20.1, carbohydrateGrams: 0.9, fatGrams: 0.5, fiberGrams: 0,
  }, { metadata: { brandName: null, foodCategory: "Finfish and Shellfish" } }),
  food("174189", "Fish, catfish, channel, farmed, raw", {
    caloriesKcal: 119, proteinGrams: 15.2, carbohydrateGrams: 0, fatGrams: 5.9, fiberGrams: 0,
  }, { metadata: { brandName: null, foodCategory: "Finfish and Shellfish" } }),
  food("170903", "Yogurt, Greek, plain, whole milk", {
    caloriesKcal: 97, proteinGrams: 9, carbohydrateGrams: 3.98, fatGrams: 5, fiberGrams: 0,
  }),
  food("171413", "Oil, olive, salad or cooking", {
    caloriesKcal: 884, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 100, fiberGrams: 0,
  }, {
    measures: [{ label: "tablespoon", amount: 1, unitName: "tbsp", gramWeight: 13.5 }],
    metadata: { brandName: null, foodCategory: "Fats and Oils" },
  }),
  food("171412", "Oil, coconut", {
    caloriesKcal: 862, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 100, fiberGrams: 0,
  }, {
    measures: [{ label: "tablespoon", amount: 1, unitName: "tbsp", gramWeight: 13.6 }],
    metadata: { brandName: null, foodCategory: "Fats and Oils" },
  }),
  food("170145", "Nuts, coconut milk, raw (liquid expressed from grated meat and water)", {
    caloriesKcal: 230, proteinGrams: 2.3, carbohydrateGrams: 5.5, fatGrams: 23.8, fiberGrams: 2.2,
  }),
  food("170172", "Beverages, coconut water, ready-to-drink", {
    caloriesKcal: 19, proteinGrams: 0.7, carbohydrateGrams: 3.7, fatGrams: 0.2, fiberGrams: 1.1,
  }),
  food("169230", "Garlic, raw", {
    caloriesKcal: 149, proteinGrams: 6.36, carbohydrateGrams: 33.06, fatGrams: 0.5, fiberGrams: 2.1,
  }, { measures: [{ label: "clove", amount: 1, unitName: "clove", gramWeight: 3 }] }),
  food("170000", "Onions, raw", {
    caloriesKcal: 40, proteinGrams: 1.1, carbohydrateGrams: 9.3, fatGrams: 0.1, fiberGrams: 1.7,
  }),
  food("170005", "Onions, spring or scallions (includes tops and bulb), raw", {
    caloriesKcal: 32, proteinGrams: 1.8, carbohydrateGrams: 7.3, fatGrams: 0.2, fiberGrams: 2.6,
  }),
  food("168875", "Rice, white, long-grain, regular, raw, unenriched", {
    caloriesKcal: 365, proteinGrams: 7.1, carbohydrateGrams: 80, fatGrams: 0.7, fiberGrams: 1.3,
  }),
  food("168877", "Rice, white, long-grain, regular, cooked", {
    caloriesKcal: 130, proteinGrams: 2.7, carbohydrateGrams: 28.2, fatGrams: 0.3, fiberGrams: 0.4,
  }),
  food("168880", "Rice, white, steamed", {
    caloriesKcal: 129, proteinGrams: 2.7, carbohydrateGrams: 28, fatGrams: 0.3, fiberGrams: 0.4,
  }),
  food("167762", "Tortillas, ready-to-bake or -fry, corn", {
    caloriesKcal: 218, proteinGrams: 5.7, carbohydrateGrams: 44.6, fatGrams: 2.9, fiberGrams: 6.3,
  }, { measures: [{ label: "tortilla", amount: 1, unitName: "piece", gramWeight: 24 }] }),
  food("167747", "Cabbage, raw", {
    caloriesKcal: 25, proteinGrams: 1.3, carbohydrateGrams: 5.8, fatGrams: 0.1, fiberGrams: 2.5,
  }),
  food("167746", "Lime juice, raw", {
    caloriesKcal: 25, proteinGrams: 0.4, carbohydrateGrams: 8.4, fatGrams: 0.1, fiberGrams: 0.4,
  }),
  food("168819", "Spices, allspice, ground", {
    caloriesKcal: 263, proteinGrams: 6.1, carbohydrateGrams: 72.1, fatGrams: 8.7, fiberGrams: 21.6,
  }),
  food("168820", "Spices, curry powder", {
    caloriesKcal: 325, proteinGrams: 14.3, carbohydrateGrams: 55.8, fatGrams: 14, fiberGrams: 53.2,
  }),
  food("169997", "Sugars, granulated", {
    caloriesKcal: 387, proteinGrams: 0, carbohydrateGrams: 100, fatGrams: 0, fiberGrams: 0,
  }),
  food("174360", "Sauce, fish, ready-to-serve", {
    caloriesKcal: 35, proteinGrams: 5.1, carbohydrateGrams: 3.6, fatGrams: 0, fiberGrams: 0,
  }),
  food("169231", "Basil, fresh", {
    caloriesKcal: 23, proteinGrams: 3.2, carbohydrateGrams: 2.7, fatGrams: 0.6, fiberGrams: 1.6,
  }),
  // Branded pollution decoys
  food("999001", "Brand X Garlic Infused Olive Oil Dressing", {
    caloriesKcal: 250, proteinGrams: 0, carbohydrateGrams: 8, fatGrams: 24, fiberGrams: 0,
  }, { source: { provider: "usda", externalId: "999001", dataType: "Branded" }, metadata: { brandName: "Brand X", foodCategory: "Dressings" } }),
  food("999002", "Ambiguous special sauce A", {
    caloriesKcal: 100, proteinGrams: 1, carbohydrateGrams: 10, fatGrams: 5, fiberGrams: 0,
  }),
  food("999003", "Ambiguous special sauce B", {
    caloriesKcal: 110, proteinGrams: 1, carbohydrateGrams: 11, fatGrams: 6, fiberGrams: 0,
  }),
];

function toSearch(f: ExternalFoodRecord): FoodSearchResult {
  return {
    externalId: f.externalId,
    description: f.description,
    dataType: f.source.dataType,
    brandName: f.metadata?.brandName ?? null,
    foodCategory: f.metadata?.foodCategory ?? null,
  };
}

function createFixtureUsdaProvider(): FoodDataProvider & { searchCalls: number; getCalls: number } {
  const state = { searchCalls: 0, getCalls: 0 };
  return {
    providerId: "usda",
    get searchCalls() { return state.searchCalls; },
    get getCalls() { return state.getCalls; },
    async searchFoods(query) {
      state.searchCalls += 1;
      const q = query.query.toLowerCase();
      const scored = CATALOG
        .map((f) => ({
          f,
          hit: q.split(/\s+/).filter(Boolean).filter((t) => f.description.toLowerCase().includes(t)).length,
        }))
        .filter((x) => x.hit > 0)
        .sort((a, b) => b.hit - a.hit)
        .map((x) => toSearch(x.f));
      // Always include branded olive oil decoy when searching oil
      if (q.includes("olive") || q.includes("oil")) {
        const decoy = toSearch(CATALOG.find((c) => c.externalId === "999001")!);
        return [decoy, ...scored.filter((s) => s.externalId !== "999001")];
      }
      return scored;
    },
    async getFood(id) {
      state.getCalls += 1;
      const found = CATALOG.find((c) => c.externalId === id);
      if (!found) throw new Error(`missing ${id}`);
      return found;
    },
  };
}

async function main() {
  const recipes = plan009SimpleResolvedRecipes();
  const provider = createFixtureUsdaProvider();
  const diagnostics = emptyDiagnostics();
  const cache = new FoodResolutionMemoryCache();
  const resolver = new DefaultFoodResolver({
    provider,
    cache,
    diagnostics,
    enableSemanticDisambiguation: false,
    createFoodId: () => crypto.randomUUID(),
  });

  const result = await resolveWeeklyRecipeNutrition({
    recipes,
    uniqueCandidateIds: recipes.map((r) => r.candidateId),
    resolver,
    concurrency: 4,
    slotCount: 14,
  });

  const mappings = [];
  let totalIngredients = 0;
  for (const recipe of Object.values(result.recipesByCandidateId)) {
    for (const row of recipe.ingredients) {
      totalIngredients += 1;
      mappings.push({
        recipe: recipe.recipeName,
        ingredient: row.recipeIngredient.name,
        quantity: `${row.recipeIngredient.quantity} ${row.recipeIngredient.unit}`,
        measurementState: row.recipeIngredient.measurementState ?? "unknown",
        status: row.foodResolution.status,
        canonical:
          row.foodResolution.status === "resolved"
            ? {
                description: row.foodResolution.food.description,
                externalId: row.foodResolution.food.source.externalId,
                dataType: row.foodResolution.food.source.dataType,
                branded: Boolean(row.foodResolution.food.metadata?.brandName),
                confidence: row.foodResolution.confidence,
              }
            : null,
        grams: row.normalizedQuantity?.grams ?? null,
        method: row.normalizedQuantity?.method ?? null,
        nutrition: row.nutrition
          ? {
              caloriesKcal: Math.round(row.nutrition.caloriesKcal),
              proteinGrams: Number(row.nutrition.proteinGrams.toFixed(1)),
              carbohydrateGrams: Number(row.nutrition.carbohydrateGrams.toFixed(1)),
              fatGrams: Number(row.nutrition.fatGrams.toFixed(1)),
            }
          : null,
        quantityStatus: row.quantityStatus,
      });
    }
  }

  const report = {
    mode: "fixture-usda-provider",
    note: "Live USDA DEMO_KEY was rate-limited (HTTP 429, Retry-After ~48m). This QA uses a USDA-shaped fixture provider covering the six-recipe ingredient set.",
    totalRecipeIngredients: totalIngredients,
    uniqueResolutionKeys: result.diagnostics.uniqueResolutionKeys,
    resolvedAutomatically: result.diagnostics.resolvedCount,
    ambiguous: result.diagnostics.ambiguousCount,
    notFound: result.diagnostics.notFoundCount,
    cacheHits: result.diagnostics.mappingCacheHits + result.diagnostics.canonicalFoodCacheHits,
    usdaSearches: result.diagnostics.providerSearchCount,
    usdaDetailFetches: result.diagnostics.providerDetailFetchCount,
    semanticDisambiguations: result.diagnostics.semanticDisambiguationCount,
    completeRecipes: result.completeCount,
    partialRecipes: result.partialCount,
    blockedRecipes: result.blockedCount,
    providerSearchCalls: provider.searchCalls,
    providerDetailCalls: provider.getCalls,
    recipes: Object.fromEntries(
      Object.entries(result.recipesByCandidateId).map(([id, r]) => [
        id,
        {
          name: r.recipeName,
          status: r.resolutionQuality.status,
          total: r.nutrition?.total
            ? {
                caloriesKcal: Math.round(r.nutrition.total.caloriesKcal),
                proteinGrams: Number(r.nutrition.total.proteinGrams.toFixed(1)),
                carbohydrateGrams: Number(r.nutrition.total.carbohydrateGrams.toFixed(1)),
                fatGrams: Number(r.nutrition.total.fatGrams.toFixed(1)),
              }
            : null,
          perBaseServing: r.nutrition?.perBaseServing
            ? {
                caloriesKcal: Math.round(r.nutrition.perBaseServing.caloriesKcal),
                proteinGrams: Number(r.nutrition.perBaseServing.proteinGrams.toFixed(1)),
              }
            : null,
          mealComponents: r.mealComponents.map((c) => ({
            name: c.mealComponent.name,
            status: c.status,
          })),
        },
      ]),
    ),
    mappings,
    exampleMappings: mappings.filter((m) => m.status === "resolved").slice(0, 8),
  };

  const outPath =
    process.env.FOOD_RESOLUTION_REPORT_PATH ??
    "/opt/cursor/artifacts/plan009_six_recipe_qa_report.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, summary: {
    totalRecipeIngredients: report.totalRecipeIngredients,
    uniqueResolutionKeys: report.uniqueResolutionKeys,
    resolvedAutomatically: report.resolvedAutomatically,
    ambiguous: report.ambiguous,
    notFound: report.notFound,
    cacheHits: report.cacheHits,
    usdaSearches: report.usdaSearches,
    completeRecipes: report.completeRecipes,
    partialRecipes: report.partialRecipes,
    blockedRecipes: report.blockedRecipes,
  } }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
