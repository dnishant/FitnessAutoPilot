import type { CulinaryMeasurementState } from "../../contracts/index.ts";
import { inferMeasurementStateHint } from "../food-resolution/ingredient-key.ts";

/**
 * PLAN-012 grocery identity canonicalization.
 *
 * Strips preparation / usage annotations from grocery identity while preserving
 * purchasing-relevant state (fresh vs dried, powder vs fresh, canned vs fresh).
 * Does NOT invent package sizes or substitute foods.
 */

const USAGE_PAREN_RE = /\s*\((?:for|to)\s+[^)]+\)\s*/gi;
const PREP_TRAILING_RE =
  /(?:,\s*)?(?:finely|roughly|thinly|freshly)?\s*(?:minced|chopped|diced|sliced|crushed|grated|peeled|seeded|trimmed|rinsed|drained|washed|cut(?:\s+into)?(?:\s+\w+)*)\s*$/i;

/** Tokens that describe prep / size / freshness noise for identity (not purchasing form). */
const IDENTITY_NOISE_TOKENS = new Set([
  "fresh",
  "finely",
  "roughly",
  "thinly",
  "large",
  "small",
  "medium",
  "extra",
  "virgin", // handled with olive oil as retained phrase below
  "italian",
  "flat",
  "leaf",
  "flatleaf",
  "cloves",
  "clove",
  "bulbs",
  "bulb",
  "heads",
  "head",
  "pieces",
  "piece",
  "to",
  "taste",
  "and",
  "or",
  "a",
  "an",
  "the",
  "of",
  "with",
  "warm",
  "cold",
  "room",
  "temperature",
]);

/**
 * Purchasing-identity aliases: multiple culinary strings → one grocery concept.
 * Conservative — never merge fresh↔dried or powder↔fresh.
 */
const IDENTITY_ALIASES: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /^extra[-\s]?virgin\s+olive\s+oil$/, canonical: "olive oil" },
  { pattern: /^evoo$/, canonical: "olive oil" },
  { pattern: /^olive\s+oil$/, canonical: "olive oil" },
  { pattern: /^(?:fresh\s+)?(?:italian\s+)?(?:flat[-\s]?leaf\s+)?parsley$/, canonical: "parsley" },
  { pattern: /^(?:fresh\s+)?garlic(?:\s+cloves?)?$/, canonical: "garlic" },
  { pattern: /^garlic$/, canonical: "garlic" },
  { pattern: /^(?:kosher|sea|table|fine|coarse)\s+salt$/, canonical: "salt" },
  { pattern: /^salt$/, canonical: "salt" },
  { pattern: /^(?:freshly\s+)?(?:ground\s+)?black\s+pepper(?:corns?)?$/, canonical: "black pepper" },
  { pattern: /^black\s+pepper$/, canonical: "black pepper" },
  { pattern: /^(?:ground\s+)?(?:black\s+)?pepper$/, canonical: "black pepper" },
  { pattern: /^(?:yellow|white|brown)\s+onion$/, canonical: "yellow onion" },
  { pattern: /^onion$/, canonical: "onion" },
  { pattern: /^scallions?$/, canonical: "green onion" },
  { pattern: /^green\s+onions?$/, canonical: "green onion" },
  { pattern: /^spring\s+onions?$/, canonical: "green onion" },
  { pattern: /^cilantro$/, canonical: "cilantro" },
  { pattern: /^fresh\s+cilantro$/, canonical: "cilantro" },
  { pattern: /^coriander\s+leaves?$/, canonical: "cilantro" },
  { pattern: /^fresh\s+coriander$/, canonical: "cilantro" },
];

/** Forms that must remain distinct from the base fresh ingredient. */
const DISTINCT_FORM_MARKERS = [
  "powder",
  "granulated",
  "flakes",
  "paste",
  "dried",
  "dry",
  "canned",
  "jarred",
  "frozen",
  "pickled",
  "smoked",
  "roasted",
  "toasted",
  "fermented",
  "oil",
  "juice",
  "sauce",
  "vinegar",
  "extract",
  "seed",
  "seeds",
  "leaf",
  "leaves",
];

export type CanonicalGroceryIdentity = {
  /** Stable grocery aggregation concept (lowercase). */
  conceptKey: string;
  /** Preferred display name for the grocery row. */
  displayName: string;
  /** Prep / usage annotation stripped from identity (retained for provenance). */
  preparationAnnotation: string | null;
  /** Usage hint like "sauce" / "filling" when present in parens. */
  usageAnnotation: string | null;
  measurementState: CulinaryMeasurementState;
};

/**
 * Parse a raw recipe ingredient name into grocery identity + annotations.
 */
export function canonicalizeGroceryIngredientName(input: {
  displayName: string;
  preparation?: string | null;
  measurementState?: CulinaryMeasurementState;
}): CanonicalGroceryIdentity {
  const raw = collapseWhitespace(input.displayName);
  const usageMatches = [...raw.matchAll(/\((?:for|to)\s+([^)]+)\)/gi)];
  const usageAnnotation =
    usageMatches.length > 0
      ? collapseWhitespace(usageMatches.map((m) => m[1] ?? "").join("; "))
      : null;

  let working = raw.replace(USAGE_PAREN_RE, " ");
  working = collapseWhitespace(working);

  let prepFromName: string | null = null;
  const prepMatch = working.match(PREP_TRAILING_RE);
  if (prepMatch) {
    prepFromName = collapseWhitespace(prepMatch[0].replace(/^,\s*/, ""));
    working = working.replace(PREP_TRAILING_RE, "");
  }

  const preparationAnnotation =
    collapseWhitespace(
      [prepFromName, input.preparation].filter((x): x is string => Boolean(x && x.trim())).join("; "),
    ) || null;

  const lowered = collapseWhitespace(working.toLowerCase().replace(/,/g, " "));
  const conceptKey = resolveConceptKey(lowered);
  const measurementState = inferMeasurementStateHint({
    name: conceptKey,
    preparation: preparationAnnotation,
    measurementState: input.measurementState,
  });

  return {
    conceptKey,
    displayName: titleCaseGrocery(conceptKey),
    preparationAnnotation,
    usageAnnotation,
    measurementState,
  };
}

function resolveConceptKey(normalized: string): string {
  // Preserve distinct purchasing forms before alias collapse.
  if (hasDistinctForm(normalized)) {
    return stripNoiseTokens(normalized);
  }
  for (const alias of IDENTITY_ALIASES) {
    if (alias.pattern.test(normalized)) return alias.canonical;
  }
  return stripNoiseTokens(normalized);
}

function hasDistinctForm(normalized: string): boolean {
  // "garlic powder", "dried parsley", "canned tomatoes" stay distinct.
  return DISTINCT_FORM_MARKERS.some((marker) => {
    if (marker === "oil" && /\bolive\s+oil\b/.test(normalized)) return false;
    if (marker === "leaf" || marker === "leaves") {
      // "flat-leaf parsley" is still parsley — handled by alias; curry leaves stay.
      if (/flat[-\s]?leaf/.test(normalized) && /parsley/.test(normalized)) return false;
    }
    return new RegExp(`\\b${marker}\\b`).test(normalized);
  });
}

function stripNoiseTokens(normalized: string): string {
  const tokens = normalized
    .split(/[^a-z0-9%+.-]+/)
    .filter((t) => t.length > 0 && !IDENTITY_NOISE_TOKENS.has(t));
  // Keep "extra virgin" only as part of olive oil (already aliased).
  return tokens.join(" ").trim() || normalized;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function titleCaseGrocery(conceptKey: string): string {
  return conceptKey
    .split(" ")
    .map((word) => {
      if (!word) return word;
      if (word === "evoo") return "EVOO";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Validate that a grocery unit is coherent with the ingredient identity.
 * Catches identity/unit collisions (e.g. pasta name + tortilla unit).
 */
export function validateGroceryIdentityUnitCoherence(input: {
  conceptKey: string;
  displayName: string;
  unit: string;
}): { ok: true } | { ok: false; reason: string } {
  const name = `${input.conceptKey} ${input.displayName}`.toLowerCase();
  const unit = input.unit.trim().toLowerCase().replace(/\./g, "");

  const pastaLike = /\b(pasta|noodle|spaghetti|penne|fusilli|macaroni|linguine)\b/.test(name);
  const tortillaLike = /\btortilla/.test(name);
  const eggLike = /\beggs?\b/.test(name);
  const cloveLike = /\bgarlic\b/.test(name);

  if (pastaLike && /\btortilla/.test(unit)) {
    return {
      ok: false,
      reason: `Impossible unit mapping: pasta-like ingredient "${input.displayName}" with unit "${input.unit}".`,
    };
  }
  if (tortillaLike && /\b(pasta|noodle|cup|cups)\b/.test(unit) && !/tortilla/.test(unit)) {
    return {
      ok: false,
      reason: `Impossible unit mapping: tortilla-like ingredient "${input.displayName}" with unit "${input.unit}".`,
    };
  }
  if (eggLike && /\b(clove|tortilla|leaf|sprig)\b/.test(unit)) {
    return {
      ok: false,
      reason: `Impossible unit mapping: egg ingredient with unit "${input.unit}".`,
    };
  }
  if (cloveLike && /\b(tortilla|egg|eggs)\b/.test(unit)) {
    return {
      ok: false,
      reason: `Impossible unit mapping: garlic with unit "${input.unit}".`,
    };
  }
  return { ok: true };
}
