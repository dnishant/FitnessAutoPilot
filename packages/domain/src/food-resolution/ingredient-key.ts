import type {
  CulinaryMeasurementState,
  ResolvedRecipeIngredient,
} from "@fitness-autopilot/contracts";

/**
 * Normalize ingredient text for caching / deduplication without erasing
 * nutritionally meaningful qualifiers (raw/cooked, fat level, etc.).
 */

const STOP_PREP_WORDS = new Set([
  "minced",
  "chopped",
  "diced",
  "sliced",
  "cut",
  "into",
  "pieces",
  "fresh",
  "finely",
  "roughly",
  "thinly",
  "large",
  "small",
  "medium",
  "peeled",
  "seeded",
  "to",
  "taste",
  "and",
  "or",
  "a",
  "an",
  "the",
  "of",
  "with",
]);

/** Qualifiers that must be retained because they change nutrition identity. */
const RETAINED_QUALIFIERS = [
  "raw",
  "cooked",
  "roasted",
  "grilled",
  "fried",
  "boiled",
  "steamed",
  "baked",
  "dry",
  "dried",
  "uncooked",
  "prepared",
  "canned",
  "drained",
  "skinless",
  "boneless",
  "skin-on",
  "whole",
  "nonfat",
  "fat-free",
  "low-fat",
  "reduced-fat",
  "2%",
  "1%",
  "whole-milk",
  "skim",
  "unsweetened",
  "sweetened",
  "plain",
  "full-fat",
  "light",
  "extra-virgin",
  "virgin",
];

export type IngredientResolutionKeyParts = {
  resolutionKey: string;
  normalizedName: string;
  measurementState: CulinaryMeasurementState;
  searchQuery: string;
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeIngredientName(name: string): string {
  return collapseWhitespace(name.toLowerCase().replace(/,/g, " "));
}

export function inferMeasurementStateHint(
  ingredient: Pick<ResolvedRecipeIngredient, "name" | "preparation" | "measurementState">,
): CulinaryMeasurementState {
  if (ingredient.measurementState && ingredient.measurementState !== "unknown") {
    return ingredient.measurementState;
  }
  const text = `${ingredient.name} ${ingredient.preparation ?? ""}`.toLowerCase();
  const cookedHints =
    /\b(cooked|roasted|grilled|fried|boiled|steamed|baked|prepared)\b/.test(text);
  const rawHints = /\b(raw|uncooked|dry|dried)\b/.test(text);
  if (cookedHints && !rawHints) return "cooked";
  if (rawHints && !cookedHints) return "raw";
  return ingredient.measurementState ?? "unknown";
}

/**
 * Build a conservative resolution key.
 * Does NOT collapse raw rice ↔ cooked rice or chicken breast ↔ thigh.
 */
export function buildIngredientResolutionKey(
  ingredient: Pick<
    ResolvedRecipeIngredient,
    "name" | "preparation" | "measurementState" | "role"
  >,
): IngredientResolutionKeyParts {
  const normalizedName = normalizeIngredientName(ingredient.name);
  const measurementState = inferMeasurementStateHint(ingredient);

  const tokens = normalizedName
    .split(/[^a-z0-9%+.-]+/)
    .filter((t) => t.length > 0 && !STOP_PREP_WORDS.has(t));

  const retained = new Set<string>();
  for (const token of tokens) {
    retained.add(token);
  }
  for (const q of RETAINED_QUALIFIERS) {
    if (normalizedName.includes(q)) retained.add(q);
  }

  const core = [...retained].sort().join(" ");
  const resolutionKey = `${core}|${measurementState}|${ingredient.role}`;

  const searchBits = [ingredient.name];
  if (measurementState === "raw") searchBits.push("raw");
  if (measurementState === "cooked") searchBits.push("cooked");
  if (ingredient.preparation && !/cut into|chopped|minced|diced|sliced/i.test(ingredient.preparation)) {
    searchBits.push(ingredient.preparation);
  }

  return {
    resolutionKey,
    normalizedName,
    measurementState,
    searchQuery: collapseWhitespace(searchBits.join(" ")),
  };
}

/**
 * True when two ingredients should share a request-level resolution path.
 */
export function sameResolutionKey(
  a: Pick<ResolvedRecipeIngredient, "name" | "preparation" | "measurementState" | "role">,
  b: Pick<ResolvedRecipeIngredient, "name" | "preparation" | "measurementState" | "role">,
): boolean {
  return buildIngredientResolutionKey(a).resolutionKey === buildIngredientResolutionKey(b).resolutionKey;
}
