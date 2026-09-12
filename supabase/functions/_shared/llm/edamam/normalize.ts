import type { RecipeDiscoveryCandidate } from "../../contracts/index.ts";
import {
  extractEdamamExternalId,
  RECIPE_DISCOVERY_PROVIDER_EDAMAM,
  recipeDiscoveryError,
  type RecipeDiscoveryError,
} from "../../domain/index.ts";

/**
 * Minimal Edamam hit shape we accept. Unknown/extra fields are ignored.
 * Nutrition totals are source-provided metadata only.
 */
export type EdamamRecipeHit = {
  recipe?: {
    uri?: unknown;
    label?: unknown;
    image?: unknown;
    source?: unknown;
    url?: unknown;
    yield?: unknown;
    dietLabels?: unknown;
    healthLabels?: unknown;
    cuisineType?: unknown;
    mealType?: unknown;
    dishType?: unknown;
    ingredientLines?: unknown;
    calories?: unknown;
    totalNutrients?: {
      PROCNT?: { quantity?: unknown };
      CHOCDF?: { quantity?: unknown };
      FAT?: { quantity?: unknown };
    };
  };
};

export type EdamamSearchResponseBody = {
  hits?: unknown;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function asOptionalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    // Accept http(s) URLs only.
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return trimmed;
  } catch {
    return undefined;
  }
}

function asPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function asNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function perServing(
  total: number | undefined,
  servings: number | undefined,
): number | undefined {
  if (total === undefined || servings === undefined || servings <= 0) {
    return undefined;
  }
  return total / servings;
}

/**
 * Normalize one Edamam hit into a RecipeDiscoveryCandidate.
 * Returns null when required identity/name fields are missing.
 */
export function normalizeEdamamHit(
  hit: EdamamRecipeHit,
): RecipeDiscoveryCandidate | null {
  const recipe = hit.recipe;
  if (!recipe || typeof recipe !== "object") {
    return null;
  }

  const uri = typeof recipe.uri === "string" ? recipe.uri : "";
  const externalId = extractEdamamExternalId(uri);
  const name = typeof recipe.label === "string" ? recipe.label.trim() : "";
  if (!externalId || !name) {
    return null;
  }

  const servings = asPositiveNumber(recipe.yield);
  const totalCalories = asNonNegativeNumber(recipe.calories);
  const totalProtein = asNonNegativeNumber(recipe.totalNutrients?.PROCNT?.quantity);
  const totalCarbs = asNonNegativeNumber(recipe.totalNutrients?.CHOCDF?.quantity);
  const totalFat = asNonNegativeNumber(recipe.totalNutrients?.FAT?.quantity);

  const cuisineLabels = asStringArray(recipe.cuisineType);
  const mealTypeLabels = asStringArray(recipe.mealType);
  const dishTypeLabels = asStringArray(recipe.dishType);
  const sourceName =
    typeof recipe.source === "string" && recipe.source.trim()
      ? recipe.source.trim()
      : undefined;

  const candidate: RecipeDiscoveryCandidate = {
    provider: RECIPE_DISCOVERY_PROVIDER_EDAMAM,
    externalId,
    name,
    sourceName,
    sourceUrl: asOptionalUrl(recipe.url),
    imageUrl: asOptionalUrl(recipe.image),
    cuisineLabels,
    mealTypeLabels,
    dishTypeLabels,
    ingredientLines: asStringArray(recipe.ingredientLines),
    servings,
    caloriesPerServing: perServing(totalCalories, servings),
    proteinGramsPerServing: perServing(totalProtein, servings),
    carbsGramsPerServing: perServing(totalCarbs, servings),
    fatGramsPerServing: perServing(totalFat, servings),
    dietLabels: asStringArray(recipe.dietLabels),
    healthLabels: asStringArray(recipe.healthLabels),
    providerMetadata: {
      rawCuisineLabels: cuisineLabels,
      rawMealTypeLabels: mealTypeLabels,
    },
  };

  return candidate;
}

export function parseEdamamSearchResponse(
  bodyText: string,
): { ok: true; hits: EdamamRecipeHit[] } | { ok: false; error: RecipeDiscoveryError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    return {
      ok: false,
      error: recipeDiscoveryError(
        "PROVIDER_BAD_RESPONSE",
        "Edamam returned non-JSON response body.",
      ),
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: recipeDiscoveryError(
        "PROVIDER_BAD_RESPONSE",
        "Edamam response root must be an object.",
      ),
    };
  }

  const hitsRaw = (parsed as EdamamSearchResponseBody).hits;
  if (hitsRaw === undefined) {
    return { ok: true, hits: [] };
  }
  if (!Array.isArray(hitsRaw)) {
    return {
      ok: false,
      error: recipeDiscoveryError(
        "PROVIDER_BAD_RESPONSE",
        "Edamam response hits must be an array.",
      ),
    };
  }

  return {
    ok: true,
    hits: hitsRaw.filter(
      (hit): hit is EdamamRecipeHit =>
        hit !== null && typeof hit === "object" && !Array.isArray(hit),
    ),
  };
}
