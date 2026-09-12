import type {
  DiscoveryConstraintReport,
  RecipeDiscoveryCandidate,
  RecipeDiscoveryRequest,
  RecipeDiscoveryResult,
} from "@fitness-autopilot/contracts";
import {
  DEFAULT_RECIPE_DISCOVERY_MAX_RESULTS,
  RecipeDiscoveryRequestSchema,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";

/**
 * PLAN-005: provider-independent recipe discovery.
 *
 * Adapters (Edamam, etc.) live outside domain packages.
 * Discovery candidates carry source-provided nutrition metadata only —
 * never treat them as authoritative Fitness Autopilot nutrition.
 */

/** Hard cap on outbound provider HTTP searches per discovery call. */
export const MAX_RECIPE_DISCOVERY_EXTERNAL_SEARCHES = 4;

export const RECIPE_DISCOVERY_PROVIDER_EDAMAM = "edamam" as const;

export type RecipeDiscoveryErrorCode =
  | "INVALID_REQUEST"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_BAD_RESPONSE"
  | "NO_RESULTS"
  | "PROVIDER_CONFIGURATION_ERROR";

export type RecipeDiscoveryError = {
  code: RecipeDiscoveryErrorCode;
  message: string;
  details?: unknown;
};

export interface RecipeDiscoveryProvider {
  search(request: RecipeDiscoveryRequest): Promise<RecipeDiscoveryResult>;
}

export type EdamamCuisineType =
  | "american"
  | "asian"
  | "british"
  | "caribbean"
  | "central europe"
  | "chinese"
  | "eastern europe"
  | "french"
  | "greek"
  | "indian"
  | "italian"
  | "japanese"
  | "korean"
  | "kosher"
  | "mediterranean"
  | "mexican"
  | "middle eastern"
  | "nordic"
  | "south american"
  | "south east asian"
  | "world";

export type EdamamMealType = "breakfast" | "brunch" | "lunch/dinner" | "snack" | "teatime";

export type EdamamDietLabel = "balanced" | "high-fiber" | "high-protein" | "low-carb" | "low-fat" | "low-sodium";

/**
 * Edamam health labels we actively map from FA allergy/restriction tags.
 * Unsupported user tags are reported, not silently claimed as enforced.
 */
export type EdamamHealthLabel =
  | "alcohol-free"
  | "celery-free"
  | "crustacean-free"
  | "dairy-free"
  | "egg-free"
  | "fish-free"
  | "fodmap-free"
  | "gluten-free"
  | "immuno-supportive"
  | "keto-friendly"
  | "kidney-friendly"
  | "kosher"
  | "low-fat-abs"
  | "low-potassium"
  | "low-sugar"
  | "lupine-free"
  | "mediterranean"
  | "mollusk-free"
  | "mustard-free"
  | "paleo"
  | "peanut-free"
  | "pescatarian"
  | "pork-free"
  | "red-meat-free"
  | "sesame-free"
  | "shellfish-free"
  | "soy-free"
  | "sugar-conscious"
  | "sulfite-free"
  | "tree-nut-free"
  | "vegan"
  | "vegetarian"
  | "wheat-free";

export type RecipeDiscoverySearchPlan = {
  /** Free-text query for the provider (`q`). */
  query?: string;
  cuisineTypes: EdamamCuisineType[];
  mealTypes: EdamamMealType[];
  dietLabels: EdamamDietLabel[];
  healthLabels: EdamamHealthLabel[];
  maxResults: number;
};

export type PlannedRecipeDiscoverySearches = {
  searches: RecipeDiscoverySearchPlan[];
  constraintReport: DiscoveryConstraintReport;
  maxResults: number;
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Map FA meal types to Edamam mealType values.
 * Lunch and dinner both map to Edamam's combined "lunch/dinner".
 */
export function mapMealTypeToEdamam(
  mealType: RecipeDiscoveryRequest["mealType"],
): EdamamMealType[] {
  if (!mealType) return [];
  switch (mealType) {
    case "breakfast":
      return ["breakfast"];
    case "snack":
      return ["snack"];
    case "lunch":
    case "dinner":
      return ["lunch/dinner"];
    default:
      return [];
  }
}

/**
 * Map FA cuisine codes/labels to one or more Edamam cuisineType values.
 * Broader families (e.g. East Asian) intentionally expand to multiple cuisines.
 * Returns null when the cuisine has no safe Edamam equivalent.
 */
export function mapCuisineToEdamam(cuisine: string): EdamamCuisineType[] | null {
  const key = normalizeKey(cuisine);
  switch (key) {
    case "indian":
      return ["indian"];
    case "mexican":
      return ["mexican"];
    case "mediterranean":
      return ["mediterranean"];
    case "italian":
      return ["italian"];
    case "middle eastern":
      return ["middle eastern"];
    case "american":
      return ["american"];
    case "east asian":
    case "eastasian":
      // Prefer multiple targeted searches over incorrectly picking one cuisine.
      return ["chinese", "japanese", "korean"];
    case "chinese":
      return ["chinese"];
    case "japanese":
      return ["japanese"];
    case "korean":
      return ["korean"];
    case "other":
    case "surprise me":
    case "surpriseme":
      return null;
    default:
      return null;
  }
}

/**
 * Map protein preference codes/labels into short search query terms.
 */
export function mapProteinToSearchQuery(protein: string): string | null {
  const key = normalizeKey(protein);
  switch (key) {
    case "chicken":
      return "chicken";
    case "turkey":
      return "turkey";
    case "eggs":
    case "egg":
      return "egg";
    case "beef":
      return "beef";
    case "fish":
      return "fish";
    case "shrimp":
      return "shrimp";
    case "paneer":
      return "paneer";
    case "tofu":
      return "tofu";
    case "beans lentils":
    case "beans/lentils":
    case "beans":
    case "lentils":
      return "lentils";
    default: {
      const trimmed = protein.trim();
      return trimmed.length > 0 ? trimmed.toLowerCase() : null;
    }
  }
}

type ConstraintMapping = {
  applied: string[];
  healthLabels: EdamamHealthLabel[];
  unsupported: string[];
};

/**
 * Centralized allergy / dietary-restriction → Edamam health label mapping.
 * Only maps tags we can enforce via provider filters.
 */
export function mapDietaryConstraintsToEdamam(input: {
  allergies?: string[];
  dietaryRestrictions?: string[];
}): ConstraintMapping {
  const healthLabels = new Set<EdamamHealthLabel>();
  const applied: string[] = [];
  const unsupported: string[] = [];

  const tryMap = (raw: string, source: "allergy" | "restriction"): void => {
    const key = normalizeKey(raw);
    const mapped = resolveHealthLabel(key);
    if (mapped) {
      if (!healthLabels.has(mapped)) {
        healthLabels.add(mapped);
        applied.push(`${source}:${raw.trim()}→${mapped}`);
      }
      return;
    }
    unsupported.push(`${source}:${raw.trim()}`);
  };

  for (const tag of input.allergies ?? []) {
    tryMap(tag, "allergy");
  }
  for (const tag of input.dietaryRestrictions ?? []) {
    tryMap(tag, "restriction");
  }

  return {
    applied,
    healthLabels: [...healthLabels].sort(),
    unsupported,
  };
}

function resolveHealthLabel(key: string): EdamamHealthLabel | null {
  switch (key) {
    case "dairy":
    case "dairy free":
    case "dairyfree":
    case "lactose":
    case "milk":
      return "dairy-free";
    case "egg":
    case "eggs":
    case "egg free":
    case "eggfree":
      return "egg-free";
    case "gluten":
    case "gluten free":
    case "glutenfree":
    case "celiac":
      return "gluten-free";
    case "peanut":
    case "peanuts":
    case "peanut free":
    case "peanutfree":
      return "peanut-free";
    case "tree nut":
    case "tree nuts":
    case "treenut":
    case "tree nut free":
    case "nut":
    case "nuts":
      return "tree-nut-free";
    case "fish":
    case "fish free":
    case "fishfree":
      return "fish-free";
    case "shellfish":
    case "crustacean":
    case "crustaceans":
    case "shrimp allergy":
    case "shellfish free":
    case "crustacean free":
      return "crustacean-free";
    case "soy":
    case "soy free":
    case "soyfree":
      return "soy-free";
    case "sesame":
    case "sesame free":
      return "sesame-free";
    case "vegetarian":
      return "vegetarian";
    case "vegan":
      return "vegan";
    case "pescatarian":
      return "pescatarian";
    case "pork":
    case "pork free":
      return "pork-free";
    case "wheat":
    case "wheat free":
      return "wheat-free";
    default:
      return null;
  }
}

export function parseRecipeDiscoveryRequest(
  input: unknown,
): Result<RecipeDiscoveryRequest & { maxResults: number }, RecipeDiscoveryError> {
  const parsed = RecipeDiscoveryRequestSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_REQUEST",
      message: parsed.error.issues[0]?.message ?? "Invalid recipe discovery request.",
      details: parsed.error.flatten(),
    });
  }
  return ok({
    ...parsed.data,
    maxResults: parsed.data.maxResults ?? DEFAULT_RECIPE_DISCOVERY_MAX_RESULTS,
  });
}

/**
 * Build a deterministic, capped set of provider searches.
 *
 * Strategy:
 * - Expand cuisines (East Asian → chinese/japanese/korean) into cuisineType filters
 *   on each request (Edamam accepts multiple cuisineType params).
 * - When proteins are supplied, issue one search per protein query (≤ 4).
 * - When no proteins, issue a single search using optional free-text query.
 * - Dislikes are never sent as provider filters (reported unsupported).
 * - highProteinPreferred → diet=high-protein when set.
 */
export function planRecipeDiscoverySearches(
  request: RecipeDiscoveryRequest & { maxResults: number },
): PlannedRecipeDiscoverySearches {
  const mealTypes = mapMealTypeToEdamam(request.mealType);
  const cuisineTypes: EdamamCuisineType[] = [];
  const unsupportedCuisines: string[] = [];

  for (const cuisine of request.cuisines ?? []) {
    const mapped = mapCuisineToEdamam(cuisine);
    if (!mapped) {
      unsupportedCuisines.push(`cuisine:${cuisine.trim()}`);
      continue;
    }
    for (const item of mapped) {
      if (!cuisineTypes.includes(item)) {
        cuisineTypes.push(item);
      }
    }
  }

  const dietary = mapDietaryConstraintsToEdamam({
    allergies: request.allergies,
    dietaryRestrictions: request.dietaryRestrictions,
  });

  const appliedConstraints = [...dietary.applied];
  const unsupportedConstraints = [
    ...dietary.unsupported,
    ...unsupportedCuisines,
  ];

  for (const dislike of request.dislikes ?? []) {
    unsupportedConstraints.push(`dislike:${dislike.trim()}`);
  }

  const dietLabels: EdamamDietLabel[] = [];
  if (request.highProteinPreferred === true) {
    dietLabels.push("high-protein");
    appliedConstraints.push("diet:high-protein");
  }

  const proteinQueries = (request.proteins ?? [])
    .map(mapProteinToSearchQuery)
    .filter((value): value is string => value !== null);

  // Deterministic unique protein queries, capped by MAX_RECIPE_DISCOVERY_EXTERNAL_SEARCHES.
  const uniqueProteins: string[] = [];
  for (const protein of proteinQueries) {
    if (!uniqueProteins.includes(protein)) {
      uniqueProteins.push(protein);
    }
    if (uniqueProteins.length >= MAX_RECIPE_DISCOVERY_EXTERNAL_SEARCHES) {
      break;
    }
  }

  const base = {
    cuisineTypes,
    mealTypes,
    dietLabels,
    healthLabels: dietary.healthLabels,
    maxResults: request.maxResults,
  };

  const searches: RecipeDiscoverySearchPlan[] = [];

  if (uniqueProteins.length > 0) {
    for (const protein of uniqueProteins) {
      searches.push({
        ...base,
        query: protein,
      });
    }
  } else {
    searches.push({
      ...base,
      query: request.query,
    });
  }

  return {
    searches,
    constraintReport: {
      appliedConstraints,
      unsupportedConstraints,
    },
    maxResults: request.maxResults,
  };
}

export function candidateDedupeKey(candidate: Pick<RecipeDiscoveryCandidate, "provider" | "externalId">): string {
  return `${candidate.provider}::${candidate.externalId}`;
}

/**
 * Deterministic dedupe by provider + externalId, then cap to maxResults.
 */
export function dedupeAndCapCandidates(
  candidates: readonly RecipeDiscoveryCandidate[],
  maxResults: number,
): RecipeDiscoveryCandidate[] {
  const seen = new Set<string>();
  const out: RecipeDiscoveryCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidateDedupeKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= maxResults) break;
  }
  return out;
}

/**
 * Extract a stable Edamam recipe id from a recipe URI.
 * Example URI suffix: `#recipe_b79327d05b8e5b838ad6cfd9576b30b6`
 */
export function extractEdamamExternalId(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  const hashMatch = trimmed.match(/#recipe_([A-Za-z0-9]+)/i);
  if (hashMatch?.[1]) {
    return hashMatch[1].toLowerCase();
  }
  const pathMatch = trimmed.match(/recipe[_-]([A-Za-z0-9]+)/i);
  if (pathMatch?.[1]) {
    return pathMatch[1].toLowerCase();
  }
  return null;
}

export function recipeDiscoveryError(
  code: RecipeDiscoveryErrorCode,
  message: string,
  details?: unknown,
): RecipeDiscoveryError {
  return { code, message, details };
}

export function isRecipeDiscoveryError(error: unknown): error is RecipeDiscoveryError {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as RecipeDiscoveryError).code === "string" &&
    typeof (error as RecipeDiscoveryError).message === "string"
  );
}
