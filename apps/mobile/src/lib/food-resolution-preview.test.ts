import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createFoodResolutionPreviewUiState,
  formatNutritionLine,
  humanizeFoodResolutionError,
  plan009SimpleResolvedRecipes,
  weeklyNutritionSummaryRows,
} from "./food-resolution-preview";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("food-resolution-preview helpers", () => {
  it("loads six PLAN-008 simple repertoire fixtures", () => {
    const recipes = plan009SimpleResolvedRecipes();
    expect(recipes).toHaveLength(6);
    expect(recipes.map((r) => r.candidateId)).toEqual([
      "tikka-chicken",
      "kerala-beef-fry",
      "jamaican-jerk-chicken",
      "thai-green-curry",
      "ca-kho-to",
      "quick-fresh-dinner",
    ]);
  });

  it("creates initial UI state", () => {
    const state = createFoodResolutionPreviewUiState();
    expect(state.recipes).toHaveLength(6);
    expect(state.result).toBeNull();
    expect(state.busy).toBe(false);
  });

  it("formats nutrition lines for display", () => {
    expect(
      formatNutritionLine({
        caloriesKcal: 123.4,
        proteinGrams: 10.12,
        carbohydrateGrams: 5.55,
        fatGrams: 2.2,
      }),
    ).toContain("123 kcal");
  });

  it("builds weekly summary rows", () => {
    const rows = weeklyNutritionSummaryRows({
      recipesByCandidateId: {},
      uniqueCandidateIds: [],
      recipeCount: 6,
      slotCount: 14,
      completeCount: 1,
      partialCount: 4,
      blockedCount: 1,
      diagnostics: {
        totalIngredients: 24,
        uniqueResolutionKeys: 20,
        mappingCacheHits: 3,
        canonicalFoodCacheHits: 2,
        providerSearchCount: 18,
        providerDetailFetchCount: 18,
        semanticDisambiguationCount: 1,
        resolvedCount: 18,
        ambiguousCount: 1,
        notFoundCount: 1,
        builtinResolvedCount: 0,
      },
    });
    expect(rows.some((r) => r.label === "Unique recipes" && r.value === "6")).toBe(true);
  });

  it("humanizes unreachable Edge Function / CORS failures", () => {
    expect(
      humanizeFoodResolutionError({
        message: "Failed to send a request to the Edge Function",
      }),
    ).toContain("resolve-recipe-nutrition");
  });

  it("serves resolve-recipe-nutrition with CORS like resolve-recipes", () => {
    const nutrition = readFileSync(
      join(mobileRoot, "../../supabase/functions/resolve-recipe-nutrition/index.ts"),
      "utf8",
    );
    const recipes = readFileSync(
      join(mobileRoot, "../../supabase/functions/resolve-recipes/index.ts"),
      "utf8",
    );
    const config = readFileSync(join(mobileRoot, "../../supabase/config.toml"), "utf8");
    const domainIndex = readFileSync(
      join(mobileRoot, "../../supabase/functions/_shared/domain/index.ts"),
      "utf8",
    );
    expect(nutrition).toContain("serveWithCors");
    expect(nutrition).not.toContain("Deno.serve");
    expect(recipes).toContain("serveWithCors");
    expect(config).toContain("[functions.resolve-recipe-nutrition]");
    expect(config).toMatch(
      /\[functions\.resolve-recipe-nutrition\][\s\S]*?verify_jwt\s*=\s*false/,
    );
    // Directory barrel must sync to /index.ts (not food-resolution.ts) or deploy 404s as CORS.
    expect(domainIndex).toContain('"./food-resolution/index.ts"');
  });
});
