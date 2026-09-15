/**
 * Dev CLI: resolve PLAN-009 nutrition for the six PLAN-008 Simple recipes.
 * Uses live USDA (USDA_API_KEY or DEMO_KEY fallback for smoke QA only).
 *
 * Usage:
 *   USDA_API_KEY=... pnpm resolve:recipe-nutrition:dev
 */
import { writeFileSync } from "node:fs";
import {
  plan009SimpleResolvedRecipes,
  resolveWeeklyRecipeNutrition,
} from "@fitness-autopilot/domain";
import { createFoodResolver } from "../src/create-food-resolver";

async function main() {
  const apiKey = process.env.USDA_API_KEY ?? process.env.FDC_API_KEY ?? "DEMO_KEY";
  process.env.USDA_API_KEY = apiKey;

  const recipes = plan009SimpleResolvedRecipes();
  const resolver = createFoodResolver({
    enableSemanticDisambiguation: process.env.ENABLE_FOOD_DISAMBIGUATION === "1",
    onLog: (event) => console.error(JSON.stringify(event)),
  });

  const started = Date.now();
  const result = await resolveWeeklyRecipeNutrition({
    recipes,
    uniqueCandidateIds: recipes.map((r) => r.candidateId),
    resolver,
    concurrency: Number(process.env.FOOD_RESOLVE_CONCURRENCY ?? 3),
    slotCount: 14,
  });

  const mappings: Array<Record<string, unknown>> = [];
  for (const recipe of Object.values(result.recipesByCandidateId)) {
    for (const row of recipe.ingredients) {
      mappings.push({
        recipe: recipe.recipeName,
        ingredient: row.recipeIngredient.name,
        quantity: `${row.recipeIngredient.quantity} ${row.recipeIngredient.unit}`,
        measurementState: row.recipeIngredient.measurementState ?? "unknown",
        status: row.foodResolution.status,
        food:
          row.foodResolution.status === "resolved"
            ? {
                description: row.foodResolution.food.description,
                externalId: row.foodResolution.food.source.externalId,
                dataType: row.foodResolution.food.source.dataType,
                confidence: row.foodResolution.confidence,
              }
            : row.foodResolution.status === "ambiguous"
              ? { reason: row.foodResolution.reason, candidates: row.foodResolution.candidates }
              : { reason: row.foodResolution.reason },
        grams: row.normalizedQuantity?.grams ?? null,
        method: row.normalizedQuantity?.method ?? null,
        nutrition: row.nutrition ?? null,
      });
    }
  }

  const report = {
    durationMs: Date.now() - started,
    recipeCount: result.recipeCount,
    completeCount: result.completeCount,
    partialCount: result.partialCount,
    blockedCount: result.blockedCount,
    diagnostics: result.diagnostics,
    mappings,
    recipes: Object.fromEntries(
      Object.entries(result.recipesByCandidateId).map(([id, recipe]) => [
        id,
        {
          name: recipe.recipeName,
          status: recipe.resolutionQuality.status,
          quality: recipe.resolutionQuality,
          total: recipe.nutrition?.total ?? null,
          perBaseServing: recipe.nutrition?.perBaseServing ?? null,
        },
      ]),
    ),
  };

  const outPath = process.env.FOOD_RESOLUTION_REPORT_PATH ?? "/tmp/plan-009-qa-report.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, summary: {
    recipeCount: result.recipeCount,
    completeCount: result.completeCount,
    partialCount: result.partialCount,
    blockedCount: result.blockedCount,
    diagnostics: result.diagnostics,
  } }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
