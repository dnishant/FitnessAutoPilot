import type {
  CandidateRankingMealType,
  CandidateRankingRequest,
  CandidateRankingResult,
  CandidateRankingUserPreferences,
  CandidateSimilarity,
  CulinaryDiscoveryCandidate,
  RankedCulinaryCandidate,
  RankingScoreBreakdown,
  RecentMealConcept,
} from "../../contracts/index.ts";
import {
  CandidateRankingRequestSchema,
  CandidateRankingResultSchema,
  CANDIDATE_RANKING_POLICY_VERSION,
} from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";
import { isCommunityOrSocialSourceUrl } from "./culinary-discovery.ts";

export { CANDIDATE_RANKING_POLICY_VERSION };

export const DEFAULT_TARGET_POOL_SIZE = 12;

/**
 * Positive components are 0–1 and intended to sum to 1.00 when fully earned.
 * Penalties are subtracted (also 0–1 inputs). Centralized so tests and the
 * preview can inspect the policy without hunting magic numbers.
 */
export const CANDIDATE_RANKING_WEIGHTS = {
  userPreferenceFit: 0.24,
  culinaryInterest: 0.22,
  sourceQuality: 0.14,
  prepFit: 0.16,
  fitnessAdaptability: 0.08,
  novelty: 0.16,
  repetitionPenalty: 0.22,
  similarityPenalty: 0.3,
} as const;

/**
 * Flavor, technique, and dish format outweigh protein. Protein-swapped clones
 * of the same culinary experience (tikka variants) should still look similar.
 */
export const CULINARY_SIMILARITY_WEIGHTS = {
  flavorFamilies: 0.24,
  cookingTechniques: 0.2,
  dishFormat: 0.16,
  cuisineFamily: 0.12,
  regionalStyle: 0.1,
  textureTags: 0.08,
  experienceTags: 0.06,
  primaryProtein: 0.04,
} as const;

export const NEAR_DUPLICATE_THRESHOLD = 0.78;
export const SIMILARITY_PENALTY_THRESHOLD = 0.48;

export const SOURCE_QUALITY_SCORES = {
  high: 0.92,
  medium: 0.64,
  lower: 0.38,
  unknown: 0.55,
} as const;

export type SourceQualityCategory = keyof typeof SOURCE_QUALITY_SCORES;

export type CandidateRankingErrorCode = "INVALID_RANKING_REQUEST" | "RANKING_VALIDATION_FAILED";

export type CandidateRankingError = {
  code: CandidateRankingErrorCode;
  message: string;
  details?: unknown;
};

export type SourceQualityClassification = {
  category: SourceQualityCategory;
  score: number;
  reason: string;
};

export type PreferenceFitDetails = {
  score: number;
  matchedCuisines: string[];
  matchedProteins: string[];
  matchedExperiences: string[];
  matchedDislikes: string[];
};

export type RepetitionPenaltyDetails = {
  penalty: number;
  matchedName?: string;
  lastSuggestedDaysAgo?: number;
  timesSuggestedLast30Days?: number;
  matchKind?: "exact_name" | "canonical_dish" | "cuisine_flavor";
};

const GENERIC_FLAVOR_TAGS = new Set(["savory", "umami", "seasoned", "tasty", "flavorful"]);
const GENERIC_TECHNIQUE_TAGS = new Set([
  "grill",
  "grilled",
  "bake",
  "baked",
  "boil",
  "boiled",
  "cook",
  "cooked",
  "roast",
  "roasted",
  "saute",
  "sauteed",
  "sauté",
  "pan",
]);
const GENERIC_FORMAT_TAGS = new Set(["bowl", "plate", "wrap", "salad", "sandwich"]);
const GENERIC_TEXTURE_TAGS = new Set(["tender", "soft", "cooked", "moist"]);
const GENERIC_NAME_RE =
  /^(grilled|baked|roasted|steamed|sauteed|pan[- ]seared)?\s*(chicken|salmon|beef|tofu|shrimp|fish|turkey)?\s*(and\s+\w+)?\s*(bowl|plate|wrap|salad)?$/i;

/** Neutral novelty: PLAN-005 has no structured novelty signal beyond prose. */
export const NEUTRAL_NOVELTY_SCORE = 0.5;

const ENGLISH_PROTEIN_WORDS = [
  "chicken",
  "paneer",
  "fish",
  "shrimp",
  "prawn",
  "beef",
  "lamb",
  "tofu",
  "turkey",
  "pork",
  "mutton",
  "egg",
  "eggs",
] as const;

const CUISINE_ALIASES: Record<string, readonly string[]> = {
  indian: ["indian", "india", "south_indian", "north_indian", "andhra", "kerala", "punjab", "punjabi"],
  mexican: ["mexican", "mexico", "oaxacan", "veracruz", "yucatecan"],
  mediterranean: ["mediterranean", "greek", "turkish"],
  italian: ["italian", "italy"],
  east_asian: [
    "east_asian",
    "eastasian",
    "chinese",
    "korean",
    "japanese",
    "thai",
    "vietnamese",
    "taiwanese",
  ],
  american: ["american", "cajun", "southern", "creole"],
  middle_eastern: ["middle_eastern", "lebanese", "persian", "israeli", "levantine"],
};

const PROTEIN_ALIASES: Record<string, readonly string[]> = {
  chicken: ["chicken"],
  turkey: ["turkey"],
  eggs: ["egg", "eggs"],
  beef: ["beef"],
  fish: ["fish", "salmon", "cod", "redfish", "halibut", "snapper", "pescado"],
  shrimp: ["shrimp", "prawn"],
  paneer: ["paneer"],
  tofu: ["tofu"],
  beans_lentils: ["bean", "lentil", "dal", "daal", "chickpea", "chana", "legume"],
};

const EXPERIENCE_SYNONYMS: Record<string, readonly string[]> = {
  saucy_flavorful: ["saucy_flavorful", "saucy", "flavorful", "gravy", "sauce"],
  crispy_textured: ["crispy_textured", "crispy", "crunchy", "textured", "charred"],
  fresh: ["fresh", "herbaceous", "citrus", "bright"],
  comforting: ["comforting", "rich", "hearty", "cozy"],
  spicy: ["spicy", "chile", "chili", "chilli", "hot", "peppery"],
  light_refreshing: ["light_refreshing", "light", "refreshing"],
};

const HIGH_SOURCE_HOSTS = [
  "nytimes.com",
  "cooking.nytimes.com",
  "seriouseats.com",
  "bonappetit.com",
  "food52.com",
  "epicurious.com",
  "washingtonpost.com",
  "saveur.com",
  "bbcgoodfood.com",
  "bbc.co.uk",
  "thekitchn.com",
  "foodandwine.com",
  "gourmettraveller.com.au",
  "ottolenghi.co.uk",
  "rickbayless.com",
  "patijinich.com",
  "archanaskitchen.com",
  "vegrecipesofindia.com",
  "honest-food.net",
  "smittenkitchen.com",
] as const;

const MEDIUM_SOURCE_HOSTS = [
  "allrecipes.com",
  "foodnetwork.com",
  "tasteofhome.com",
  "eatingwell.com",
  "simplyrecipes.com",
  "budgetbytes.com",
  "hellofresh.com",
  "purplecarrot.com",
  "homechef.com",
  "gousto.co.uk",
  "tasty.co",
  "delish.com",
] as const;

const LOWER_SOURCE_HOSTS = [
  "pinterest.com",
  "instagram.com",
  "tiktok.com",
  "medium.com",
] as const;

const PUBLICATION_NAME_HINTS = [
  "bon appetit",
  "bon appétit",
  "nyt cooking",
  "nytimes",
  "new york times",
  "serious eats",
  "food52",
  "epicurious",
  "washington post",
  "saveur",
  "food and wine",
];

const SPECIALIST_NAME_HINTS = [
  "specialist",
  "regional",
  "author",
  "kitchen of",
  "chef ",
];

function rankingError(
  code: CandidateRankingErrorCode,
  message: string,
  details?: unknown,
): CandidateRankingError {
  return details === undefined ? { code, message } : { code, message, details };
}

export function parseCandidateRankingRequest(
  input: unknown,
): Result<CandidateRankingRequest, CandidateRankingError> {
  const parsed = CandidateRankingRequestSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      rankingError(
        "INVALID_RANKING_REQUEST",
        parsed.error.issues[0]?.message ?? "Invalid candidate ranking request.",
        parsed.error.flatten(),
      ),
    );
  }
  return ok(parsed.data);
}

export function validateCandidateRankingResult(
  input: unknown,
): Result<CandidateRankingResult, CandidateRankingError> {
  const parsed = CandidateRankingResultSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      rankingError(
        "RANKING_VALIDATION_FAILED",
        parsed.error.issues[0]?.message ?? "Candidate ranking result failed schema validation.",
        parsed.error.flatten(),
      ),
    );
  }
  return ok(parsed.data);
}

export function roundScore(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function normalizeRankingToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeDishName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function canonicalDishKey(name: string): string {
  const proteinPattern = new RegExp(`\\b(${ENGLISH_PROTEIN_WORDS.join("|")})\\b`, "g");
  return normalizeDishName(name)
    .replace(proteinPattern, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostnameFromUrl(url: string): string | null {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url.trim());
  if (!match?.[1]) {
    return null;
  }
  return match[1].replace(/^www\./i, "").toLowerCase();
}

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a.map(normalizeRankingToken).filter(Boolean));
  const setB = new Set(b.map(normalizeRankingToken).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersection += 1;
    }
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function sharedNormalized(a: readonly string[], b: readonly string[]): string[] {
  const setB = new Set(b.map(normalizeRankingToken).filter(Boolean));
  const seen = new Set<string>();
  const shared: string[] = [];
  for (const item of a) {
    const key = normalizeRankingToken(item);
    if (!key || seen.has(key) || !setB.has(key)) {
      continue;
    }
    seen.add(key);
    shared.push(item);
  }
  return shared;
}

function sameNormalized(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  return normalizeRankingToken(a) === normalizeRankingToken(b);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function preferenceList(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function cuisineAliasKeys(value: string): Set<string> {
  const token = normalizeRankingToken(value);
  const keys = new Set<string>([token, token.replace(/_/g, "")]);
  const mapped = CUISINE_ALIASES[token];
  if (mapped) {
    for (const alias of mapped) {
      keys.add(alias);
    }
  }
  for (const [canonical, aliases] of Object.entries(CUISINE_ALIASES)) {
    if (aliases.includes(token) || token.includes(canonical)) {
      keys.add(canonical);
      for (const alias of aliases) {
        keys.add(alias);
      }
    }
  }
  return keys;
}

function proteinAliasKeys(value: string): Set<string> {
  const token = normalizeRankingToken(value);
  const keys = new Set<string>([token]);
  const mapped = PROTEIN_ALIASES[token];
  if (mapped) {
    for (const alias of mapped) {
      keys.add(alias);
    }
  }
  for (const [canonical, aliases] of Object.entries(PROTEIN_ALIASES)) {
    if (aliases.some((alias) => token === alias || token.includes(alias))) {
      keys.add(canonical);
      for (const alias of aliases) {
        keys.add(alias);
      }
    }
  }
  return keys;
}

function experienceAliasKeys(value: string): Set<string> {
  const token = normalizeRankingToken(value);
  const keys = new Set<string>([token]);
  const mapped = EXPERIENCE_SYNONYMS[token];
  if (mapped) {
    for (const alias of mapped) {
      keys.add(alias);
    }
  }
  for (const [canonical, aliases] of Object.entries(EXPERIENCE_SYNONYMS)) {
    if (aliases.includes(token) || token.includes(canonical)) {
      keys.add(canonical);
      for (const alias of aliases) {
        keys.add(alias);
      }
    }
  }
  return keys;
}

function setsOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) {
    if (b.has(item)) {
      return true;
    }
  }
  return false;
}

function candidateSearchTokens(candidate: CulinaryDiscoveryCandidate): Set<string> {
  const parts = [
    candidate.name,
    candidate.cuisineFamily,
    candidate.regionalStyle ?? "",
    candidate.primaryProtein ?? "",
    candidate.dishFormat,
    ...candidate.flavorFamilies,
    ...candidate.cookingTechniques,
    ...candidate.textureTags,
    ...candidate.experienceTags,
    candidate.whyItIsInteresting,
    candidate.noveltyReason,
  ];
  const tokens = new Set<string>();
  for (const part of parts) {
    const normalized = normalizeRankingToken(part);
    if (normalized) {
      tokens.add(normalized);
      for (const piece of normalized.split("_")) {
        if (piece.length >= 3) {
          tokens.add(piece);
        }
      }
    }
  }
  return tokens;
}

function formatList(values: readonly string[]): string {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} + ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")} + ${values[values.length - 1]}`;
}

export function scoreUserPreferenceFit(
  candidate: CulinaryDiscoveryCandidate,
  preferences: CandidateRankingUserPreferences | undefined,
): PreferenceFitDetails {
  const cuisines = preferenceList(preferences?.cuisines).filter(
    (value) => normalizeRankingToken(value) !== "surprise_me",
  );
  const proteins = preferenceList(preferences?.proteinPreferences);
  const experiences = preferenceList(preferences?.experiencePreferences);
  const dislikes = preferenceList(preferences?.dislikes);

  const matchedCuisines: string[] = [];
  const matchedProteins: string[] = [];
  const matchedExperiences: string[] = [];
  const matchedDislikes: string[] = [];

  const components: number[] = [];

  if (cuisines.length > 0) {
    const candidateCuisine = cuisineAliasKeys(
      [candidate.cuisineFamily, candidate.regionalStyle ?? ""].filter(Boolean).join(" "),
    );
    for (const cuisine of cuisines) {
      if (setsOverlap(cuisineAliasKeys(cuisine), candidateCuisine)) {
        matchedCuisines.push(cuisine);
      }
    }
    components.push(matchedCuisines.length > 0 ? 1 : 0.5);
  }

  if (proteins.length > 0) {
    const candidateProtein = proteinAliasKeys(candidate.primaryProtein ?? "");
    for (const protein of proteins) {
      if (setsOverlap(proteinAliasKeys(protein), candidateProtein)) {
        matchedProteins.push(protein);
      }
    }
    components.push(matchedProteins.length > 0 ? 1 : 0.5);
  }

  if (experiences.length > 0) {
    const candidateTokens = candidateSearchTokens(candidate);
    for (const experience of experiences) {
      if (setsOverlap(experienceAliasKeys(experience), candidateTokens)) {
        matchedExperiences.push(experience);
      }
    }
    const overlap = matchedExperiences.length / experiences.length;
    components.push(0.5 + 0.5 * overlap);
  }

  let score = components.length === 0 ? 0.5 : components.reduce((sum, value) => sum + value, 0) / components.length;

  if (dislikes.length > 0) {
    const haystack = candidateSearchTokens(candidate);
    for (const dislike of dislikes) {
      const tokens = normalizeRankingToken(dislike)
        .split("_")
        .filter((token) => token.length >= 3);
      if (tokens.some((token) => haystack.has(token) || haystack.has(normalizeRankingToken(dislike)))) {
        matchedDislikes.push(dislike);
      }
    }
    if (matchedDislikes.length > 0) {
      score = clamp01(score - 0.4);
    }
  }

  return {
    score: roundScore(score),
    matchedCuisines,
    matchedProteins,
    matchedExperiences,
    matchedDislikes,
  };
}

function isGenericName(name: string): boolean {
  const trimmed = normalizeDishName(name);
  return GENERIC_NAME_RE.test(trimmed) || /^(chicken|salmon|beef|tofu)\s+bowl$/.test(trimmed);
}

function dishNameWordCount(name: string): number {
  return normalizeDishName(name).split(/\s+/).filter(Boolean).length;
}

function hasSpecificRegionalStyle(candidate: CulinaryDiscoveryCandidate): boolean {
  const regional = candidate.regionalStyle?.trim();
  if (!regional) {
    return false;
  }
  return normalizeRankingToken(regional) !== normalizeRankingToken(candidate.cuisineFamily);
}

/**
 * Deterministic culinary-interest heuristic. Rewards specific identity
 * (region, distinctive technique/format, specific naming) rather than tag count.
 * Typical PLAN-005 candidates should land in a useful range, not all at ~0.98.
 */
export function scoreCulinaryInterest(candidate: CulinaryDiscoveryCandidate): number {
  let score = 0.2;

  if (hasSpecificRegionalStyle(candidate)) {
    score += 0.12;
  }

  const distinctiveFlavors = candidate.flavorFamilies.filter(
    (tag) => !GENERIC_FLAVOR_TAGS.has(normalizeRankingToken(tag)),
  );
  if (distinctiveFlavors.length >= 2) {
    score += 0.1;
  } else if (distinctiveFlavors.length === 1) {
    score += 0.04;
  }

  const distinctiveTechniques = candidate.cookingTechniques.filter(
    (tag) => !GENERIC_TECHNIQUE_TAGS.has(normalizeRankingToken(tag)),
  );
  if (distinctiveTechniques.length >= 1) {
    score += 0.1;
  } else if (candidate.cookingTechniques.length >= 1) {
    score += 0.03;
  }

  const distinctiveTextures = candidate.textureTags.filter((tag) => {
    const token = normalizeRankingToken(tag);
    return token.length > 0 && !GENERIC_TEXTURE_TAGS.has(token);
  });
  if (distinctiveTextures.length >= 1) {
    score += 0.06;
  } else if (candidate.textureTags.length >= 1) {
    score += 0.02;
  }

  const formatToken = normalizeRankingToken(candidate.dishFormat);
  if (formatToken && !GENERIC_FORMAT_TAGS.has(formatToken)) {
    score += 0.08;
  } else if (formatToken) {
    score += 0.02;
  }

  if (isGenericName(candidate.name)) {
    score -= 0.14;
  } else {
    const words = dishNameWordCount(candidate.name);
    if (words >= 4) {
      score += 0.12;
    } else if (words === 3) {
      score += 0.08;
    } else if (words === 2) {
      score += 0.05;
    }
  }

  if (candidate.discoveryConfidence === "high") {
    score += 0.03;
  } else if (candidate.discoveryConfidence === "low") {
    score -= 0.06;
  }

  return roundScore(clamp01(score));
}

export function classifySourceQuality(
  candidate: CulinaryDiscoveryCandidate,
): SourceQualityClassification {
  const url = candidate.source.url;
  const host = hostnameFromUrl(url);
  const sourceName = normalizeDishName(candidate.source.name);
  const hasAuthor = Boolean(candidate.source.author?.trim());

  if (host && HIGH_SOURCE_HOSTS.some((suffix) => hostMatches(host, suffix))) {
    return { category: "high", score: SOURCE_QUALITY_SCORES.high, reason: "established culinary publication or specialist" };
  }
  if (PUBLICATION_NAME_HINTS.some((hint) => sourceName.includes(hint))) {
    return { category: "high", score: SOURCE_QUALITY_SCORES.high, reason: "recognized culinary publication name" };
  }
  if (SPECIALIST_NAME_HINTS.some((hint) => sourceName.includes(hint))) {
    return { category: "high", score: SOURCE_QUALITY_SCORES.high, reason: "cuisine-specialist or chef/author source" };
  }

  const isYoutube = Boolean(host && (hostMatches(host, "youtube.com") || hostMatches(host, "youtu.be")));
  if (isYoutube) {
    return hasAuthor
      ? {
          category: "medium",
          score: SOURCE_QUALITY_SCORES.medium,
          reason: "YouTube recipe with attributable creator",
        }
      : {
          category: "lower",
          score: SOURCE_QUALITY_SCORES.lower,
          reason: "YouTube source with weak attribution",
        };
  }

  if (isCommunityOrSocialSourceUrl(url) || (host && LOWER_SOURCE_HOSTS.some((suffix) => hostMatches(host, suffix)))) {
    return { category: "lower", score: SOURCE_QUALITY_SCORES.lower, reason: "community or social source" };
  }

  if (host && MEDIUM_SOURCE_HOSTS.some((suffix) => hostMatches(host, suffix))) {
    return { category: "medium", score: SOURCE_QUALITY_SCORES.medium, reason: "general recipe or meal-kit site" };
  }

  return { category: "unknown", score: SOURCE_QUALITY_SCORES.unknown, reason: "unknown domain — neutral source quality" };
}

export function scoreSourceQuality(candidate: CulinaryDiscoveryCandidate): number {
  return classifySourceQuality(candidate).score;
}

const PREP_FIT_BY_STYLE: Record<
  string,
  Record<CandidateRankingMealType, Record<CulinaryDiscoveryCandidate["mealPrepAdaptability"], number>>
> = {
  mostly_ready: {
    lunch: { fully_prepped: 1, component_prepped: 0.78, quick_fresh_finish: 0.4, fresh_only: 0.18 },
    dinner: { fully_prepped: 1, component_prepped: 0.78, quick_fresh_finish: 0.4, fresh_only: 0.18 },
  },
  ready_lunch_fresh_dinner: {
    lunch: { fully_prepped: 1, component_prepped: 0.9, quick_fresh_finish: 0.48, fresh_only: 0.22 },
    dinner: { fully_prepped: 0.55, component_prepped: 0.85, quick_fresh_finish: 1, fresh_only: 0.35 },
  },
  fresh_focused: {
    lunch: { fully_prepped: 0.45, component_prepped: 0.82, quick_fresh_finish: 1, fresh_only: 0.72 },
    dinner: { fully_prepped: 0.42, component_prepped: 0.8, quick_fresh_finish: 1, fresh_only: 0.74 },
  },
};

export function scorePrepFit(
  candidate: CulinaryDiscoveryCandidate,
  mealType: CandidateRankingMealType,
  cookingPreferences: CandidateRankingRequest["cookingPreferences"] | undefined,
): number {
  if (!cookingPreferences?.cookingStyle && cookingPreferences?.maxFinishMinutes === undefined) {
    return 0.5;
  }

  const style = cookingPreferences.cookingStyle
    ? normalizeRankingToken(String(cookingPreferences.cookingStyle))
    : "";
  const table = PREP_FIT_BY_STYLE[style];
  let score = table ? table[mealType][candidate.mealPrepAdaptability] : 0.5;

  const estimated = candidate.estimatedFinishMinutesAfterPrep;
  const maxFinish = cookingPreferences.maxFinishMinutes;
  if (estimated != null && maxFinish != null) {
    if (estimated <= maxFinish) {
      score += 0.08;
    } else {
      const overRatio = (estimated - maxFinish) / Math.max(maxFinish, 1);
      score -= Math.min(0.4, 0.22 * overRatio + 0.12);
    }
  }

  return roundScore(clamp01(Math.max(score, 0.08)));
}

export function scoreFitnessAdaptability(
  value: CulinaryDiscoveryCandidate["fitnessAdaptability"],
): number {
  switch (value) {
    case "easy":
      return 1;
    case "moderate":
      return 0.6;
    case "hard":
      return 0.25;
  }
}

/**
 * Standalone novelty is neutralized for candidate-ranking-v1.
 * `noveltyReason` is unstructured prose and `discoveryConfidence` measures
 * grounding quality, not culinary newness. Diversity comes from culinary
 * interest, recent-repetition penalties, and pairwise similarity.
 */
export function scoreNovelty(_candidate: CulinaryDiscoveryCandidate): number {
  return NEUTRAL_NOVELTY_SCORE;
}

export function recencyDecayFactor(lastSuggestedDaysAgo: number | undefined): number {
  if (lastSuggestedDaysAgo === undefined) {
    return 0.18;
  }
  if (lastSuggestedDaysAgo <= 1) return 1;
  if (lastSuggestedDaysAgo <= 4) return 0.75;
  if (lastSuggestedDaysAgo <= 10) return 0.5;
  if (lastSuggestedDaysAgo <= 21) return 0.25;
  if (lastSuggestedDaysAgo <= 30) return 0.12;
  return 0.04;
}

export function repetitionFrequencyFactor(timesSuggestedLast30Days: number | undefined): number {
  const times = timesSuggestedLast30Days ?? 1;
  return Math.min(1.5, 1 + 0.18 * Math.max(0, times - 1));
}

export function scoreRepetitionPenalty(
  candidate: CulinaryDiscoveryCandidate,
  recentConcepts: readonly RecentMealConcept[] | undefined,
): RepetitionPenaltyDetails {
  if (!recentConcepts || recentConcepts.length === 0) {
    return { penalty: 0 };
  }

  let best: RepetitionPenaltyDetails = { penalty: 0 };
  const candidateName = normalizeDishName(candidate.name);
  const candidateKey = canonicalDishKey(candidate.name);

  for (const concept of recentConcepts) {
    const conceptName = normalizeDishName(concept.name);
    const conceptKey = canonicalDishKey(concept.name);
    let matchKind: RepetitionPenaltyDetails["matchKind"];
    let strength = 0;

    if (candidateName === conceptName) {
      matchKind = "exact_name";
      strength = 1;
    } else if (candidateKey && conceptKey && candidateKey === conceptKey && candidateKey.length >= 4) {
      matchKind = "canonical_dish";
      strength = 0.82;
    } else if (
      concept.cuisineFamily &&
      sameNormalized(concept.cuisineFamily, candidate.cuisineFamily) &&
      concept.flavorFamilies &&
      sharedNormalized(concept.flavorFamilies, candidate.flavorFamilies).length >= 2
    ) {
      matchKind = "cuisine_flavor";
      strength = 0.45;
    }

    if (!matchKind) {
      continue;
    }

    const penalty = clamp01(
      strength * recencyDecayFactor(concept.lastSuggestedDaysAgo) * (repetitionFrequencyFactor(concept.timesSuggestedLast30Days) / 1.5),
    );
    if (penalty > best.penalty) {
      best = {
        penalty: roundScore(penalty),
        matchedName: concept.name,
        lastSuggestedDaysAgo: concept.lastSuggestedDaysAgo,
        timesSuggestedLast30Days: concept.timesSuggestedLast30Days,
        matchKind,
      };
    }
  }

  return best;
}

export function classifyCulinarySimilarity(
  score: number,
): CandidateSimilarity["classification"] {
  if (score >= NEAR_DUPLICATE_THRESHOLD) {
    return "near_duplicate";
  }
  if (score >= SIMILARITY_PENALTY_THRESHOLD) {
    return "similar";
  }
  return undefined;
}

function withSimilarityClassification(similarity: CandidateSimilarity): CandidateSimilarity {
  const classification = classifyCulinarySimilarity(similarity.score);
  return classification ? { ...similarity, classification } : similarity;
}

export function computeCandidateSimilarity(
  candidateA: CulinaryDiscoveryCandidate,
  candidateB: CulinaryDiscoveryCandidate,
): CandidateSimilarity {
  if (candidateA.candidateId === candidateB.candidateId) {
    return withSimilarityClassification({
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      score: 1,
      signals: {
        sharedFlavorFamilies: [...candidateA.flavorFamilies],
        sharedTechniques: [...candidateA.cookingTechniques],
        sameDishFormat: true,
        sameCuisineFamily: true,
        sameRegionalStyle: Boolean(candidateA.regionalStyle),
        samePrimaryProtein: Boolean(candidateA.primaryProtein),
        sameCanonicalDish: true,
      },
    });
  }

  if (normalizeDishName(candidateA.name) === normalizeDishName(candidateB.name)) {
    return withSimilarityClassification({
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      score: 1,
      signals: {
        sharedFlavorFamilies: sharedNormalized(candidateA.flavorFamilies, candidateB.flavorFamilies),
        sharedTechniques: sharedNormalized(candidateA.cookingTechniques, candidateB.cookingTechniques),
        sameDishFormat: sameNormalized(candidateA.dishFormat, candidateB.dishFormat),
        sameCuisineFamily: sameNormalized(candidateA.cuisineFamily, candidateB.cuisineFamily),
        sameRegionalStyle: sameNormalized(candidateA.regionalStyle, candidateB.regionalStyle),
        samePrimaryProtein: sameNormalized(candidateA.primaryProtein, candidateB.primaryProtein),
        sameCanonicalDish: true,
      },
    });
  }

  const sharedFlavorFamilies = sharedNormalized(candidateA.flavorFamilies, candidateB.flavorFamilies);
  const sharedTechniques = sharedNormalized(candidateA.cookingTechniques, candidateB.cookingTechniques);
  const sameDishFormat = sameNormalized(candidateA.dishFormat, candidateB.dishFormat);
  const sameCuisineFamily = sameNormalized(candidateA.cuisineFamily, candidateB.cuisineFamily);
  const sameRegionalStyle = sameNormalized(candidateA.regionalStyle, candidateB.regionalStyle);
  const samePrimaryProtein = sameNormalized(candidateA.primaryProtein, candidateB.primaryProtein);
  const keyA = canonicalDishKey(candidateA.name);
  const keyB = canonicalDishKey(candidateB.name);
  const sameCanonicalDish = Boolean(keyA && keyB && keyA === keyB && keyA.length >= 4);

  const dishFormatScore = Math.max(
    sameDishFormat ? 1 : jaccard(candidateA.dishFormat.split(/\s+/), candidateB.dishFormat.split(/\s+/)),
    sameCanonicalDish ? 0.92 : 0,
  );

  const weighted =
    CULINARY_SIMILARITY_WEIGHTS.flavorFamilies * jaccard(candidateA.flavorFamilies, candidateB.flavorFamilies) +
    CULINARY_SIMILARITY_WEIGHTS.cookingTechniques * jaccard(candidateA.cookingTechniques, candidateB.cookingTechniques) +
    CULINARY_SIMILARITY_WEIGHTS.dishFormat * dishFormatScore +
    CULINARY_SIMILARITY_WEIGHTS.cuisineFamily * (sameCuisineFamily ? 1 : 0) +
    CULINARY_SIMILARITY_WEIGHTS.regionalStyle * (sameRegionalStyle ? 1 : 0) +
    CULINARY_SIMILARITY_WEIGHTS.textureTags * jaccard(candidateA.textureTags, candidateB.textureTags) +
    CULINARY_SIMILARITY_WEIGHTS.experienceTags * jaccard(candidateA.experienceTags, candidateB.experienceTags) +
    CULINARY_SIMILARITY_WEIGHTS.primaryProtein * (samePrimaryProtein ? 1 : 0);

  return withSimilarityClassification({
    candidateAId: candidateA.candidateId,
    candidateBId: candidateB.candidateId,
    score: roundScore(clamp01(weighted)),
    signals: {
      sharedFlavorFamilies,
      sharedTechniques,
      sameDishFormat,
      sameCuisineFamily,
      sameRegionalStyle,
      samePrimaryProtein,
      sameCanonicalDish,
    },
  });
}

export function similarityPenaltyFromScore(maxSimilarity: number): number {
  if (maxSimilarity < SIMILARITY_PENALTY_THRESHOLD) {
    return 0;
  }
  if (maxSimilarity >= NEAR_DUPLICATE_THRESHOLD) {
    return 1;
  }
  return roundScore(
    (maxSimilarity - SIMILARITY_PENALTY_THRESHOLD) /
      (NEAR_DUPLICATE_THRESHOLD - SIMILARITY_PENALTY_THRESHOLD),
  );
}

export function composeRankingScore(breakdown: RankingScoreBreakdown): number {
  const weights = CANDIDATE_RANKING_WEIGHTS;
  const positive =
    weights.userPreferenceFit * breakdown.userPreferenceFit +
    weights.culinaryInterest * breakdown.culinaryInterest +
    weights.sourceQuality * breakdown.sourceQuality +
    weights.prepFit * breakdown.prepFit +
    weights.fitnessAdaptability * breakdown.fitnessAdaptability +
    weights.novelty * breakdown.novelty;
  const negative =
    weights.repetitionPenalty * breakdown.repetitionPenalty +
    weights.similarityPenalty * breakdown.similarityPenalty;
  return roundScore((positive - negative) * 100, 2);
}

export function inspectableRankingScores(breakdown: RankingScoreBreakdown): {
  baseScore: number;
  effectiveScore: number;
  similarityPenalty: number;
  similarityDelta: number;
} {
  const baseScore = composeRankingScore({ ...breakdown, similarityPenalty: 0 });
  const effectiveScore = composeRankingScore(breakdown);
  return {
    baseScore,
    effectiveScore,
    similarityPenalty: breakdown.similarityPenalty,
    similarityDelta: roundScore(baseScore - effectiveScore, 2),
  };
}

export type BaseCandidateScore = {
  candidate: CulinaryDiscoveryCandidate;
  breakdown: Omit<RankingScoreBreakdown, "similarityPenalty">;
  preference: PreferenceFitDetails;
  source: SourceQualityClassification;
  repetition: RepetitionPenaltyDetails;
  scoreWithoutSimilarity: number;
};

export function scoreCandidateBase(
  candidate: CulinaryDiscoveryCandidate,
  request: CandidateRankingRequest,
): BaseCandidateScore {
  const preference = scoreUserPreferenceFit(candidate, request.userPreferences);
  const source = classifySourceQuality(candidate);
  const repetition = scoreRepetitionPenalty(candidate, request.recentConcepts);
  const breakdown = {
    userPreferenceFit: preference.score,
    culinaryInterest: scoreCulinaryInterest(candidate),
    sourceQuality: source.score,
    prepFit: scorePrepFit(candidate, request.mealType, request.cookingPreferences),
    fitnessAdaptability: scoreFitnessAdaptability(candidate.fitnessAdaptability),
    novelty: scoreNovelty(candidate),
    repetitionPenalty: repetition.penalty,
  };
  return {
    candidate,
    breakdown,
    preference,
    source,
    repetition,
    scoreWithoutSimilarity: composeRankingScore({ ...breakdown, similarityPenalty: 0 }),
  };
}

function humanizePreference(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildRankingReasons(input: {
  candidate: CulinaryDiscoveryCandidate;
  breakdown: RankingScoreBreakdown;
  preference: PreferenceFitDetails;
  source: SourceQualityClassification;
  repetition: RepetitionPenaltyDetails;
  decision: RankedCulinaryCandidate["decision"];
  similarToNames: string[];
  cookingPreferences: CandidateRankingRequest["cookingPreferences"] | undefined;
}): string[] {
  const reasons: string[] = [];
  const { preference, breakdown, candidate, source, repetition } = input;

  if (preference.matchedCuisines.length > 0) {
    reasons.push(`+ Matches ${formatList(preference.matchedCuisines.map(humanizePreference))} cuisine preference`);
  }
  if (preference.matchedProteins.length > 0) {
    reasons.push(`+ Matches ${formatList(preference.matchedProteins.map(humanizePreference))} protein preference`);
  }
  if (preference.matchedExperiences.length > 0) {
    const label = formatList(preference.matchedExperiences.map(humanizePreference));
    reasons.push(
      preference.matchedExperiences.length >= 2
        ? `+ Strong match for ${label} experience`
        : `+ Matches ${label} experience preference`,
    );
  }
  if (preference.matchedDislikes.length > 0) {
    reasons.push(`- Mentions disliked ${formatList(preference.matchedDislikes)}`);
  }

  if (breakdown.culinaryInterest >= 0.7) {
    reasons.push("+ High culinary distinctiveness");
  } else if (isGenericName(candidate.name) || breakdown.culinaryInterest <= 0.38) {
    reasons.push("- Generic culinary profile");
  }

  if (source.category === "high") {
    reasons.push("+ High-quality culinary source");
  } else if (source.category === "lower") {
    reasons.push("- Lower source-quality signal");
  }

  const style = input.cookingPreferences?.cookingStyle
    ? String(input.cookingPreferences.cookingStyle)
    : undefined;
  const maxFinish = input.cookingPreferences?.maxFinishMinutes;
  if (style === "ready_lunch_fresh_dinner" && candidate.mealPrepAdaptability === "quick_fresh_finish") {
    reasons.push("+ Quick fresh finish fits ready-lunch / fresh-dinner cooking style");
  } else if (
    style === "ready_lunch_fresh_dinner" &&
    (candidate.mealPrepAdaptability === "fully_prepped" ||
      candidate.mealPrepAdaptability === "component_prepped")
  ) {
    reasons.push("+ Prep style fits ready lunches / component dinners");
  } else if (breakdown.prepFit >= 0.8) {
    reasons.push("+ Strong meal-prep fit for cooking preferences");
  }

  if (
    maxFinish != null &&
    candidate.estimatedFinishMinutesAfterPrep != null &&
    candidate.estimatedFinishMinutesAfterPrep <= maxFinish
  ) {
    reasons.push(`+ Finish time within ${maxFinish}-minute preference`);
  } else if (
    maxFinish != null &&
    candidate.estimatedFinishMinutesAfterPrep != null &&
    candidate.estimatedFinishMinutesAfterPrep > maxFinish
  ) {
    reasons.push(
      `- Finish time ${candidate.estimatedFinishMinutesAfterPrep} min exceeds ${maxFinish}-minute preference`,
    );
  }

  if (candidate.fitnessAdaptability === "easy" && breakdown.fitnessAdaptability >= 0.9) {
    reasons.push("+ Easy fitness adaptability");
  }

  if (breakdown.novelty >= 0.7) {
    reasons.push("+ Distinctive novelty relative to common defaults");
  }

  if (repetition.penalty > 0 && repetition.matchedName) {
    if (repetition.lastSuggestedDaysAgo === 0 || repetition.lastSuggestedDaysAgo === 1) {
      reasons.push(`- Recently suggested (${repetition.matchedName}, yesterday or today)`);
    } else if (repetition.lastSuggestedDaysAgo != null) {
      reasons.push(
        `- Recently suggested (${repetition.matchedName}, ${repetition.lastSuggestedDaysAgo} days ago)`,
      );
    } else {
      reasons.push(`- Matches recent concept ${repetition.matchedName}`);
    }
  }

  if (input.decision === "duplicate" && input.similarToNames[0]) {
    reasons.push(`- Near-duplicate of already selected ${input.similarToNames[0]}`);
  } else if (breakdown.similarityPenalty > 0 && input.similarToNames[0]) {
    reasons.push(`- Similar to already selected ${input.similarToNames[0]}`);
  }

  if (reasons.length === 0) {
    reasons.push("Neutral ranking — no strong preference or redundancy signals");
  }
  return reasons.slice(0, 12);
}

function uniqueCount(values: readonly (string | null | undefined)[]): number {
  const set = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const key = normalizeRankingToken(value);
    if (key) {
      set.add(key);
    }
  }
  return set.size;
}

export function deriveCandidateRankingStats(
  inputCandidates: readonly CulinaryDiscoveryCandidate[],
  selected: readonly RankedCulinaryCandidate[],
  deprioritized: readonly RankedCulinaryCandidate[],
): CandidateRankingResult["stats"] {
  const flavorTags = selected.flatMap((item) => item.candidate.flavorFamilies);
  return {
    inputCandidateCount: inputCandidates.length,
    selectedCandidateCount: selected.length,
    duplicateCount: deprioritized.filter((item) => item.decision === "duplicate").length,
    deprioritizedCount: deprioritized.filter((item) => item.decision === "deprioritized").length,
    uniqueCuisineCount: uniqueCount(selected.map((item) => item.candidate.cuisineFamily)),
    uniqueProteinCount: uniqueCount(selected.map((item) => item.candidate.primaryProtein)),
    uniqueFlavorFamilyCount: uniqueCount(flavorTags),
  };
}

function toRankedCandidate(input: {
  candidate: CulinaryDiscoveryCandidate;
  breakdown: RankingScoreBreakdown;
  decision: RankedCulinaryCandidate["decision"];
  rank: number;
  reasons: string[];
  similarToCandidateIds?: string[];
}): RankedCulinaryCandidate {
  const scores = inspectableRankingScores(input.breakdown);
  return {
    candidate: input.candidate,
    score: scores.effectiveScore,
    baseScore: scores.baseScore,
    scoreBreakdown: input.breakdown,
    rank: input.rank,
    decision: input.decision,
    reasons: input.reasons,
    similarToCandidateIds: input.similarToCandidateIds,
  };
}

function compareByScoreThenId(
  a: { score: number; candidate: CulinaryDiscoveryCandidate },
  b: { score: number; candidate: CulinaryDiscoveryCandidate },
): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  return a.candidate.candidateId.localeCompare(b.candidate.candidateId);
}

/**
 * Iterative diversity selection (MMR-style). Scores are recomputed against the
 * already-selected pool so a strong but redundant candidate can lose rank.
 */
export function rankCulinaryCandidates(
  input: CandidateRankingRequest | unknown,
): Result<CandidateRankingResult, CandidateRankingError> {
  const parsed = CandidateRankingRequestSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      rankingError(
        "INVALID_RANKING_REQUEST",
        parsed.error.issues[0]?.message ?? "Invalid candidate ranking request.",
        parsed.error.flatten(),
      ),
    );
  }
  const request = parsed.data;
  const targetPoolSize = request.targetPoolSize ?? DEFAULT_TARGET_POOL_SIZE;
  const bases = request.candidates.map((candidate) => scoreCandidateBase(candidate, request));

  const similarityCache = new Map<string, CandidateSimilarity>();
  const similarityKey = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`);
  const similarityOf = (a: CulinaryDiscoveryCandidate, b: CulinaryDiscoveryCandidate) => {
    const key = similarityKey(a.candidateId, b.candidateId);
    const cached = similarityCache.get(key);
    if (cached) {
      return cached;
    }
    const computed = computeCandidateSimilarity(a, b);
    similarityCache.set(key, computed);
    return computed;
  };

  const remaining = [...bases];
  const selected: RankedCulinaryCandidate[] = [];
  const duplicates: RankedCulinaryCandidate[] = [];

  while (selected.length < targetPoolSize && remaining.length > 0) {
    const evaluated = remaining.map((base) => {
      let maxSimilarity = 0;
      const similarTo: string[] = [];
      for (const chosen of selected) {
        const similarity = similarityOf(base.candidate, chosen.candidate);
        if (similarity.score >= SIMILARITY_PENALTY_THRESHOLD) {
          similarTo.push(chosen.candidate.candidateId);
        }
        if (similarity.score > maxSimilarity) {
          maxSimilarity = similarity.score;
        }
      }
      const similarityPenalty = similarityPenaltyFromScore(maxSimilarity);
      const breakdown: RankingScoreBreakdown = {
        ...base.breakdown,
        similarityPenalty,
      };
      return {
        base,
        breakdown,
        score: composeRankingScore(breakdown),
        similarToCandidateIds: similarTo,
        maxSimilarity,
      };
    });

    evaluated.sort((a, b) =>
      compareByScoreThenId(
        { score: a.score, candidate: a.base.candidate },
        { score: b.score, candidate: b.base.candidate },
      ),
    );

    const nearDuplicates = evaluated.filter((item) => item.maxSimilarity >= NEAR_DUPLICATE_THRESHOLD);
    for (const item of nearDuplicates) {
      const similarNames = item.similarToCandidateIds
        .map((id) => selected.find((row) => row.candidate.candidateId === id)?.candidate.name)
        .filter((name): name is string => Boolean(name));
      duplicates.push(
        toRankedCandidate({
          candidate: item.base.candidate,
          breakdown: item.breakdown,
          rank: 0,
          decision: "duplicate",
          reasons: buildRankingReasons({
            candidate: item.base.candidate,
            breakdown: item.breakdown,
            preference: item.base.preference,
            source: item.base.source,
            repetition: item.base.repetition,
            decision: "duplicate",
            similarToNames: similarNames,
            cookingPreferences: request.cookingPreferences,
          }),
          similarToCandidateIds: item.similarToCandidateIds,
        }),
      );
      const index = remaining.findIndex((row) => row.candidate.candidateId === item.base.candidate.candidateId);
      if (index >= 0) {
        remaining.splice(index, 1);
      }
    }

    const eligible = evaluated.filter((item) => item.maxSimilarity < NEAR_DUPLICATE_THRESHOLD);
    const pick = eligible[0];
    if (!pick) {
      break;
    }

    const similarNames = pick.similarToCandidateIds
      .map((id) => selected.find((row) => row.candidate.candidateId === id)?.candidate.name)
      .filter((name): name is string => Boolean(name));
    selected.push(
      toRankedCandidate({
        candidate: pick.base.candidate,
        breakdown: pick.breakdown,
        rank: selected.length + 1,
        decision: "selected",
        reasons: buildRankingReasons({
          candidate: pick.base.candidate,
          breakdown: pick.breakdown,
          preference: pick.base.preference,
          source: pick.base.source,
          repetition: pick.base.repetition,
          decision: "selected",
          similarToNames: similarNames,
          cookingPreferences: request.cookingPreferences,
        }),
        similarToCandidateIds: pick.similarToCandidateIds.length > 0 ? pick.similarToCandidateIds : undefined,
      }),
    );
    const remainingIndex = remaining.findIndex(
      (row) => row.candidate.candidateId === pick.base.candidate.candidateId,
    );
    if (remainingIndex >= 0) {
      remaining.splice(remainingIndex, 1);
    }
  }

  const deprioritizedCore: RankedCulinaryCandidate[] = remaining.map((base) => {
    let maxSimilarity = 0;
    const similarTo: string[] = [];
    for (const chosen of selected) {
      const similarity = similarityOf(base.candidate, chosen.candidate);
      if (similarity.score >= SIMILARITY_PENALTY_THRESHOLD) {
        similarTo.push(chosen.candidate.candidateId);
      }
      if (similarity.score > maxSimilarity) {
        maxSimilarity = similarity.score;
      }
    }
    const breakdown: RankingScoreBreakdown = {
      ...base.breakdown,
      similarityPenalty: similarityPenaltyFromScore(maxSimilarity),
    };
    const similarNames = similarTo
      .map((id) => selected.find((row) => row.candidate.candidateId === id)?.candidate.name)
      .filter((name): name is string => Boolean(name));
    return toRankedCandidate({
      candidate: base.candidate,
      breakdown,
      rank: 0,
      decision: "deprioritized",
      reasons: buildRankingReasons({
        candidate: base.candidate,
        breakdown,
        preference: base.preference,
        source: base.source,
        repetition: base.repetition,
        decision: "deprioritized",
        similarToNames: similarNames,
        cookingPreferences: request.cookingPreferences,
      }),
      similarToCandidateIds: similarTo.length > 0 ? similarTo : undefined,
    });
  });

  const deprioritized = [...duplicates, ...deprioritizedCore].sort(compareByScoreThenId);
  deprioritized.forEach((item, index) => {
    item.rank = selected.length + index + 1;
  });

  const notableSimilarities: CandidateSimilarity[] = [];
  const seenPairs = new Set<string>();
  const pool = [...selected, ...deprioritized];
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const left = pool[i];
      const right = pool[j];
      if (!left || !right) continue;
      const similarity = similarityOf(left.candidate, right.candidate);
      if (similarity.score < SIMILARITY_PENALTY_THRESHOLD) {
        continue;
      }
      const key = similarityKey(left.candidate.candidateId, right.candidate.candidateId);
      if (seenPairs.has(key)) {
        continue;
      }
      seenPairs.add(key);
      notableSimilarities.push(withSimilarityClassification(similarity));
    }
  }
  notableSimilarities.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return similarityKey(a.candidateAId, a.candidateBId).localeCompare(
      similarityKey(b.candidateAId, b.candidateBId),
    );
  });

  const result: CandidateRankingResult = {
    selected,
    deprioritized,
    stats: deriveCandidateRankingStats(request.candidates, selected, deprioritized),
    policy: {
      version: CANDIDATE_RANKING_POLICY_VERSION,
      targetPoolSize,
      nearDuplicateThreshold: NEAR_DUPLICATE_THRESHOLD,
      similarityPenaltyThreshold: SIMILARITY_PENALTY_THRESHOLD,
    },
    similarities: notableSimilarities,
  };

  const validated = validateCandidateRankingResult(result);
  if (!validated.ok) {
    return validated;
  }
  return ok(validated.value);
}

export function rankingPolicyVersion(): typeof CANDIDATE_RANKING_POLICY_VERSION {
  return CANDIDATE_RANKING_POLICY_VERSION;
}

export function strongestSimilarityDiagnostic(
  similarities: readonly CandidateSimilarity[] | undefined,
  candidateId: string,
): CandidateSimilarity | undefined {
  const matches = (similarities ?? []).filter(
    (item) => item.candidateAId === candidateId || item.candidateBId === candidateId,
  );
  if (matches.length === 0) {
    return undefined;
  }
  return [...matches].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return `${a.candidateAId}::${a.candidateBId}`.localeCompare(`${b.candidateAId}::${b.candidateBId}`);
  })[0];
}

export function proteinSimilarityWeightIsLow(): boolean {
  return (
    CULINARY_SIMILARITY_WEIGHTS.primaryProtein < CULINARY_SIMILARITY_WEIGHTS.flavorFamilies &&
    CULINARY_SIMILARITY_WEIGHTS.primaryProtein < CULINARY_SIMILARITY_WEIGHTS.cookingTechniques &&
    CULINARY_SIMILARITY_WEIGHTS.primaryProtein < CULINARY_SIMILARITY_WEIGHTS.dishFormat
  );
}
