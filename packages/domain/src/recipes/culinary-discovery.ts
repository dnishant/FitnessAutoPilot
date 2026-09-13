import type {
  CulinaryDiscoveryCandidate,
  CulinaryDiscoveryGroundingMetadata,
  CulinaryDiscoveryMetadata,
  CulinaryDiscoveryQualityStats,
  CulinaryDiscoveryRequest,
  CulinaryDiscoveryResult,
} from "@fitness-autopilot/contracts";
import {
  CulinaryDiscoveryCandidateSchema,
  CulinaryDiscoveryRequestSchema,
  CulinaryDiscoveryResultSchema,
  FitnessAdaptabilitySchema,
  MealPrepAdaptabilitySchema,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";

export const CULINARY_DISCOVERY_PROMPT_VERSION = "culinary-discovery-v1.1" as const;
export const DEFAULT_CULINARY_DISCOVERY_CANDIDATE_COUNT = 20;
/** Soft guidance for Gemini; the API does not expose a hard search-count cap. */
export const GUIDED_CULINARY_SEARCH_QUERY_RANGE = { min: 4, max: 8 } as const;
export const LEGACY_FITNESS_ADAPTABILITY_MAP = {
  excellent: "easy",
  good: "moderate",
  difficult: "hard",
} as const;

export type CulinaryDiscoveryErrorCode =
  | "LLM_CONFIGURATION_ERROR"
  | "LLM_PROVIDER_ERROR"
  | "LLM_INVALID_STRUCTURED_OUTPUT"
  | "DISCOVERY_SCHEMA_VALIDATION_FAILED"
  | "DISCOVERY_NOT_GROUNDED"
  | "INVALID_DISCOVERY_REQUEST";

export type CulinaryDiscoveryError = {
  code: CulinaryDiscoveryErrorCode;
  message: string;
  details?: unknown;
};

/**
 * Provider-independent culinary discovery.
 * Implementations (Gemini + Google Search grounding, etc.) live outside domain.
 * PLAN-005 does not generate weekly strategies or detailed recipes.
 */
export interface CulinaryDiscoveryProvider {
  discover(request: CulinaryDiscoveryRequest): Promise<CulinaryDiscoveryResult>;
}

export type CulinaryDiscoveryPrompt = {
  version: typeof CULINARY_DISCOVERY_PROMPT_VERSION;
  systemInstruction: string;
  userPrompt: string;
};

export function culinaryDiscoveryError(
  code: CulinaryDiscoveryErrorCode,
  message: string,
  details?: unknown,
): CulinaryDiscoveryError {
  return details === undefined ? { code, message } : { code, message, details };
}

export function parseCulinaryDiscoveryRequest(
  input: unknown,
): Result<CulinaryDiscoveryRequest, CulinaryDiscoveryError> {
  const parsed = CulinaryDiscoveryRequestSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_DISCOVERY_REQUEST",
      message: parsed.error.issues[0]?.message ?? "Invalid culinary discovery request.",
      details: parsed.error.flatten(),
    });
  }
  return ok(parsed.data);
}

export function validateCulinaryDiscoveryCandidate(
  input: unknown,
): Result<CulinaryDiscoveryCandidate, CulinaryDiscoveryError> {
  const parsed = CulinaryDiscoveryCandidateSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "DISCOVERY_SCHEMA_VALIDATION_FAILED",
      message:
        parsed.error.issues[0]?.message ?? "Culinary discovery candidate failed schema validation.",
      details: parsed.error.flatten(),
    });
  }
  return ok(parsed.data);
}

export function validateCulinaryDiscoveryResult(
  input: unknown,
): Result<CulinaryDiscoveryResult, CulinaryDiscoveryError> {
  const parsed = CulinaryDiscoveryResultSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "DISCOVERY_SCHEMA_VALIDATION_FAILED",
      message:
        parsed.error.issues[0]?.message ?? "Culinary discovery result failed schema validation.",
      details: parsed.error.flatten(),
    });
  }
  return ok(parsed.data);
}

function listOrNone(values: readonly string[] | undefined): string {
  if (!values || values.length === 0) {
    return "(none specified)";
  }
  return values.join(", ");
}

function hostnameFromUrl(url: string): string | null {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url.trim());
  if (!match?.[1]) {
    return null;
  }
  return match[1].replace(/^www\./i, "").toLowerCase();
}

/**
 * Pragmatic heuristic for obvious homepage/root URLs such as https://food52.com/.
 * Does not prove that a non-root URL is a recipe/article page.
 */
export function isGenericHomepageOrRootUrl(url: string): boolean {
  const trimmed = url.trim();
  const match = /^https?:\/\/[^/?#]+(\/[^?#]*)?/i.exec(trimmed);
  if (!match) {
    return false;
  }
  const path = (match[1] ?? "").replace(/\/+$/, "");
  if (path === "" || path === "/") {
    return true;
  }
  return /^\/index\.html?$/i.test(path);
}

const COMMUNITY_OR_SOCIAL_HOSTS = [
  "reddit.com",
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "fb.com",
  "m.facebook.com",
  "substack.com",
] as const;

/**
 * Social/community hosts may appear during exploration but are not preferred
 * as the canonical candidate source. This is not an automatic reject list.
 */
export function isCommunityOrSocialSourceUrl(url: string): boolean {
  const host = hostnameFromUrl(url);
  if (!host) {
    return false;
  }
  return COMMUNITY_OR_SOCIAL_HOSTS.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function isPreferredCanonicalSourceUrl(url: string): boolean {
  return !isCommunityOrSocialSourceUrl(url) && !isGenericHomepageOrRootUrl(url);
}

const PUBLICATION_NAME_HINTS = [
  "bon appetit",
  "bon appétit",
  "nyt cooking",
  "nytimes",
  "new york times",
  "serious eats",
  "food52",
  "food 52",
  "epicurious",
  "washington post",
];

function quotedSpans(query: string): string[] {
  const spans: string[] = [];
  const re = /["“”]([^"“”]{2,})["“”]|'([^']{2,})'/g;
  for (const match of query.matchAll(re)) {
    const span = (match[1] || match[2] || "").trim();
    if (span) {
      spans.push(span);
    }
  }
  return spans;
}

function looksLikePublicationName(text: string): boolean {
  const normalized = normalizeName(text);
  return PUBLICATION_NAME_HINTS.some(
    (hint) => normalized === hint || normalized.includes(hint) || hint.includes(normalized),
  );
}

export type CulinarySearchQueryKind = "broad" | "specific_dish";

/**
 * Local heuristic: quoted dish names or queries that match returned candidate
 * names are treated as specific-dish searches. Publication-name quotes do not
 * count as dish-first searches.
 */
export function classifyCulinarySearchQuery(
  query: string,
  candidateNames: readonly string[] = [],
): CulinarySearchQueryKind {
  const dishLikeQuotes = quotedSpans(query).filter((span) => !looksLikePublicationName(span));
  if (dishLikeQuotes.length > 0) {
    return "specific_dish";
  }

  const normalizedQuery = normalizeName(query)
    .replace(/\brecipe[s]?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const name of candidateNames) {
    const normalizedName = normalizeName(name);
    if (normalizedName.length < 8) {
      continue;
    }
    if (
      normalizedQuery === normalizedName ||
      normalizedQuery.includes(normalizedName) ||
      normalizedName === normalizedQuery
    ) {
      return "specific_dish";
    }
  }

  return "broad";
}

export function countCulinarySearchQueryKinds(
  queries: readonly string[] | undefined,
  candidateNames: readonly string[] = [],
): { broadSearchQueryCount: number; specificDishSearchQueryCount: number } {
  let broadSearchQueryCount = 0;
  let specificDishSearchQueryCount = 0;
  for (const query of queries ?? []) {
    if (classifyCulinarySearchQuery(query, candidateNames) === "specific_dish") {
      specificDishSearchQueryCount += 1;
    } else {
      broadSearchQueryCount += 1;
    }
  }
  return { broadSearchQueryCount, specificDishSearchQueryCount };
}

/**
 * Discovery must classify adaptability, not prescribe recipe rewrites.
 */
export function fitnessAdaptabilityReasonPrescribesModification(reason: string): boolean {
  const text = reason.trim().toLowerCase();
  if (!text) {
    return false;
  }
  return (
    /\breplace\b/.test(text) ||
    /\bsubstitut(?:e|ion|ing)\b/.test(text) ||
    /\bremove (?:the )?skin\b/.test(text) ||
    /\breduce (?:the )?(?:cheese|oil|cream|butter)\b/.test(text) ||
    /\bconvert(?:ing)? (?:the )?dish\b/.test(text) ||
    /\bhealthy version\b/.test(text) ||
    /\blow-fat\b/.test(text)
  );
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Correlate a candidate source with Gemini grounding chunks when available.
 * Exact URI match is preferred; hostname / title overlap is accepted because
 * Google Search grounding often returns redirect URIs rather than original pages.
 */
export function candidateHasGroundingCorrelation(
  candidate: CulinaryDiscoveryCandidate,
  grounding: CulinaryDiscoveryGroundingMetadata | undefined,
): boolean {
  const chunks = grounding?.groundingChunks ?? [];
  if (chunks.length === 0) {
    // Queries-only grounding is not enough to tie a specific source page
    // to this candidate. Require chunk-level support when available.
    return false;
  }

  const sourceHost = hostnameFromUrl(candidate.source.url);
  const sourceName = normalizeName(candidate.source.name);
  const sourceUrl = candidate.source.url.trim().toLowerCase();

  for (const chunk of chunks) {
    const web = chunk.web;
    if (!web) continue;
    const chunkUri = web.uri?.trim().toLowerCase();
    if (
      chunkUri &&
      (chunkUri === sourceUrl || chunkUri.includes(sourceUrl) || sourceUrl.includes(chunkUri))
    ) {
      return true;
    }
    const titleRaw = web.title?.trim() ?? "";
    const titleAsHost = titleRaw.replace(/^www\./i, "").toLowerCase();
    const chunkHost = web.domain
      ? web.domain.replace(/^www\./i, "").toLowerCase()
      : titleAsHost.includes(".")
        ? titleAsHost
        : web.uri
          ? hostnameFromUrl(web.uri)
          : null;
    // Ignore Google grounding redirect hosts when comparing domains.
    const isRedirectHost =
      chunkHost?.includes("vertexaisearch.cloud.google.com") ||
      chunkHost?.includes("google.com");
    if (sourceHost && chunkHost && !isRedirectHost && sourceHost === chunkHost) {
      return true;
    }
    if (sourceHost && titleAsHost.includes(".") && sourceHost === titleAsHost) {
      return true;
    }
    const title = titleRaw ? normalizeName(titleRaw) : "";
    if (
      title &&
      (title.includes(sourceName) ||
        sourceName.includes(title) ||
        title.includes(normalizeName(candidate.name)))
    ) {
      return true;
    }
  }
  return false;
}

export function calculateUniqueSourceCount(
  candidates: readonly CulinaryDiscoveryCandidate[],
): number {
  const urls = new Set(
    candidates.map((c) => c.source.url.trim().toLowerCase()).filter(Boolean),
  );
  return urls.size;
}

export function calculateUniqueDomainCount(
  candidates: readonly CulinaryDiscoveryCandidate[],
): number {
  const domains = new Set(
    candidates
      .map((c) => hostnameFromUrl(c.source.url))
      .filter((host): host is string => Boolean(host)),
  );
  return domains.size;
}

export function calculateUniqueCuisineCount(
  candidates: readonly CulinaryDiscoveryCandidate[],
): number {
  const cuisines = new Set(
    candidates.map((c) => normalizeName(c.cuisineFamily)).filter(Boolean),
  );
  return cuisines.size;
}

function candidateSearchText(candidate: CulinaryDiscoveryCandidate): string {
  return [
    candidate.name,
    candidate.cuisineFamily,
    candidate.regionalStyle,
    candidate.primaryProtein,
    candidate.dishFormat,
    ...candidate.flavorFamilies,
    ...candidate.cookingTechniques,
    ...candidate.textureTags,
    ...candidate.experienceTags,
    candidate.whyItIsInteresting,
    candidate.noveltyReason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function findHardConstraintViolations(
  candidates: readonly CulinaryDiscoveryCandidate[],
  request: CulinaryDiscoveryRequest,
): string[] {
  const hardTerms = [...request.allergies, ...request.dietaryRestrictions]
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);

  if (hardTerms.length === 0) {
    return [];
  }

  const violations: string[] = [];
  for (const candidate of candidates) {
    const text = candidateSearchText(candidate);
    for (const term of hardTerms) {
      if (text.includes(term)) {
        violations.push(
          `Candidate "${candidate.name}" (${candidate.candidateId}) appears to reference hard constraint "${term}".`,
        );
      }
    }
  }
  return violations;
}

export type DiscoveryNormalizationStats = {
  rejectedForWeakProvenanceCount: number;
  genericHomepageSourceCount: number;
};

export type DiscoveryNormalizationSuccess = {
  candidates: CulinaryDiscoveryCandidate[];
  stats: DiscoveryNormalizationStats;
};

export type NormalizeDiscoveryCandidatesOptions = {
  request: CulinaryDiscoveryRequest;
  groundingMetadata?: CulinaryDiscoveryGroundingMetadata;
  /**
   * When true, omit candidates that lack grounding correlation if usable
   * (non-redirect) grounding chunk hosts/titles are available.
   */
  requireChunkCorrelationWhenAvailable?: boolean;
  /** Requested count is a maximum/target, never an exact-size requirement. */
  maxCandidateCount?: number;
};

function groundingHasUsableHosts(
  grounding: CulinaryDiscoveryGroundingMetadata | undefined,
): boolean {
  const chunks = grounding?.groundingChunks ?? [];
  for (const chunk of chunks) {
    const web = chunk.web;
    if (!web) continue;
    const title = web.title?.replace(/^www\./i, "").toLowerCase() ?? "";
    const domain = web.domain?.replace(/^www\./i, "").toLowerCase() ?? "";
    const hostFromUri = web.uri ? hostnameFromUrl(web.uri) : null;
    for (const host of [domain, title.includes(".") ? title : "", hostFromUri ?? ""]) {
      if (
        host &&
        !host.includes("vertexaisearch.cloud.google.com") &&
        !host.endsWith("google.com")
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Deterministic post-processing after schema validation of individual candidates:
 * unique IDs, exact-name dedupe, hard-constraint scan, provenance filtering.
 * Requested candidate count is a maximum — fewer high-quality candidates can succeed.
 */
export function normalizeDiscoveryCandidates(
  rawCandidates: readonly CulinaryDiscoveryCandidate[],
  options: NormalizeDiscoveryCandidatesOptions,
): Result<DiscoveryNormalizationSuccess, CulinaryDiscoveryError> {
  const requireCorrelation = options.requireChunkCorrelationWhenAvailable ?? true;
  const usableHosts = groundingHasUsableHosts(options.groundingMetadata);
  const maxCandidateCount =
    options.maxCandidateCount ??
    options.request.targetCandidateCount ??
    DEFAULT_CULINARY_DISCOVERY_CANDIDATE_COUNT;

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const kept: CulinaryDiscoveryCandidate[] = [];
  const rejected: string[] = [];
  let rejectedForWeakProvenanceCount = 0;
  let genericHomepageSourceCount = 0;

  for (const candidate of rawCandidates) {
    if (!FitnessAdaptabilitySchema.safeParse(candidate.fitnessAdaptability).success) {
      rejected.push(`Invalid fitnessAdaptability on ${candidate.candidateId}`);
      continue;
    }
    if (!MealPrepAdaptabilitySchema.safeParse(candidate.mealPrepAdaptability).success) {
      rejected.push(`Invalid mealPrepAdaptability on ${candidate.candidateId}`);
      continue;
    }
    if (!candidate.source.name.trim()) {
      rejectedForWeakProvenanceCount += 1;
      rejected.push(`Candidate "${candidate.name}" is missing a source name; omitted.`);
      continue;
    }
    if (isGenericHomepageOrRootUrl(candidate.source.url)) {
      genericHomepageSourceCount += 1;
      rejected.push(
        `Candidate "${candidate.name}" source URL looks like a homepage/root URL; omitted.`,
      );
      continue;
    }
    if (seenIds.has(candidate.candidateId)) {
      rejected.push(`Duplicate candidateId ${candidate.candidateId}`);
      continue;
    }
    const nameKey = normalizeName(candidate.name);
    if (seenNames.has(nameKey)) {
      rejected.push(`Duplicate candidate name "${candidate.name}"`);
      continue;
    }
    if (requireCorrelation && usableHosts) {
      if (!candidateHasGroundingCorrelation(candidate, options.groundingMetadata)) {
        rejectedForWeakProvenanceCount += 1;
        rejected.push(
          `Candidate "${candidate.name}" lacks correlation with grounding chunks; omitted.`,
        );
        continue;
      }
    }

    seenIds.add(candidate.candidateId);
    seenNames.add(nameKey);
    kept.push(candidate);
  }

  const capped = kept.slice(0, Math.max(1, maxCandidateCount));

  const hardViolations = findHardConstraintViolations(capped, options.request);
  if (hardViolations.length > 0) {
    return err(
      culinaryDiscoveryError(
        "DISCOVERY_SCHEMA_VALIDATION_FAILED",
        hardViolations[0] ?? "Hard preference constraint violated.",
        { hardViolations, rejected },
      ),
    );
  }

  if (capped.length === 0) {
    return err(
      culinaryDiscoveryError(
        "DISCOVERY_NOT_GROUNDED",
        "No grounded culinary candidates remained after provenance validation.",
        { rejected },
      ),
    );
  }

  return ok({
    candidates: capped,
    stats: {
      rejectedForWeakProvenanceCount,
      genericHomepageSourceCount,
    },
  });
}

export function assertDiscoveryWasGrounded(
  grounding: CulinaryDiscoveryGroundingMetadata | undefined,
): Result<true, CulinaryDiscoveryError> {
  const queries = grounding?.webSearchQueries ?? [];
  const chunks = grounding?.groundingChunks ?? [];
  const hasEntryPoint = grounding?.hasSearchEntryPoint === true;
  if (queries.length === 0 && chunks.length === 0 && !hasEntryPoint) {
    return err(
      culinaryDiscoveryError(
        "DISCOVERY_NOT_GROUNDED",
        "Gemini response did not include Google Search grounding metadata (no search queries or chunks).",
      ),
    );
  }
  return ok(true);
}

export function deriveCulinaryDiscoveryQualityStats(args: {
  candidates: readonly CulinaryDiscoveryCandidate[];
  groundingMetadata?: CulinaryDiscoveryGroundingMetadata;
  rejectedForWeakProvenanceCount?: number;
  genericHomepageSourceCount?: number;
}): CulinaryDiscoveryQualityStats {
  const groundedCount = args.candidates.filter((c) =>
    candidateHasGroundingCorrelation(c, args.groundingMetadata),
  ).length;
  const coverage =
    args.candidates.length === 0 ? 0 : groundedCount / args.candidates.length;
  const queries = args.groundingMetadata?.webSearchQueries;
  const kinds = countCulinarySearchQueryKinds(
    queries,
    args.candidates.map((c) => c.name),
  );
  const communitySourceCount = args.candidates.filter((c) =>
    isCommunityOrSocialSourceUrl(c.source.url),
  ).length;

  return {
    groundedCandidateCount: groundedCount,
    groundingCoverage: Number(coverage.toFixed(3)),
    uniqueSourceCount: calculateUniqueSourceCount(args.candidates),
    uniqueDomainCount: calculateUniqueDomainCount(args.candidates),
    searchQueryCount: queries?.length ?? 0,
    broadSearchQueryCount: kinds.broadSearchQueryCount,
    specificDishSearchQueryCount: kinds.specificDishSearchQueryCount,
    rejectedForWeakProvenanceCount: args.rejectedForWeakProvenanceCount ?? 0,
    genericHomepageSourceCount: args.genericHomepageSourceCount ?? 0,
    communitySourceCount,
  };
}

export function buildDiscoveryMetadata(args: {
  model: string;
  request: CulinaryDiscoveryRequest;
  candidates: readonly CulinaryDiscoveryCandidate[];
  groundingMetadata?: CulinaryDiscoveryGroundingMetadata;
  requestId?: string;
  durationMs?: number;
  usageMetadata?: CulinaryDiscoveryMetadata["usageMetadata"];
  rejectedForWeakProvenanceCount?: number;
  genericHomepageSourceCount?: number;
}): CulinaryDiscoveryMetadata {
  const qualityStats = deriveCulinaryDiscoveryQualityStats({
    candidates: args.candidates,
    groundingMetadata: args.groundingMetadata,
    rejectedForWeakProvenanceCount: args.rejectedForWeakProvenanceCount,
    genericHomepageSourceCount: args.genericHomepageSourceCount,
  });

  return {
    provider: "gemini",
    model: args.model,
    promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
    requestedCandidateCount: args.request.targetCandidateCount,
    returnedCandidateCount: args.candidates.length,
    searchQueries: args.groundingMetadata?.webSearchQueries,
    searchQueryCount: qualityStats.searchQueryCount,
    sourceCount: qualityStats.uniqueSourceCount,
    uniqueSourceCount: qualityStats.uniqueSourceCount,
    uniqueCuisineCount: calculateUniqueCuisineCount(args.candidates),
    uniqueDomainCount: qualityStats.uniqueDomainCount,
    groundedCandidateCount: qualityStats.groundedCandidateCount,
    groundingCoverage: qualityStats.groundingCoverage,
    broadSearchQueryCount: qualityStats.broadSearchQueryCount,
    specificDishSearchQueryCount: qualityStats.specificDishSearchQueryCount,
    rejectedForWeakProvenanceCount: qualityStats.rejectedForWeakProvenanceCount,
    genericHomepageSourceCount: qualityStats.genericHomepageSourceCount,
    communitySourceCount: qualityStats.communitySourceCount,
    qualityStats,
    requestId: args.requestId,
    durationMs: args.durationMs,
    usageMetadata: args.usageMetadata,
  };
}

const COOKING_STYLE_CONTEXT: Record<string, string> = {
  mostly_ready:
    "Prefer candidates that batch/reheat well; mealPrepAdaptability may lean fully_prepped or component_prepped.",
  ready_lunch_fresh_dinner:
    "Favor dishes that can finish fresh in a short weekday window when maxFinishMinutes is set.",
  fresh_focused:
    "Favor component-friendly or quick_fresh_finish dishes that cook from prepped ingredients.",
};

export function buildCulinaryDiscoveryPrompt(
  request: CulinaryDiscoveryRequest,
): CulinaryDiscoveryPrompt {
  const targetCount = request.targetCandidateCount ?? DEFAULT_CULINARY_DISCOVERY_CANDIDATE_COUNT;
  const cookingStyle = request.cookingPreferences?.cookingStyle;
  const cookingNote = cookingStyle
    ? COOKING_STYLE_CONTEXT[cookingStyle] ??
      `Honor cooking style preference: ${cookingStyle}.`
    : "No cooking-style preference specified.";
  const maxFinish = request.cookingPreferences?.maxFinishMinutes;

  const recentBlock =
    request.recentConcepts && request.recentConcepts.length > 0
      ? request.recentConcepts
          .map((concept) => {
            const bits = [
              concept.name,
              concept.cuisineFamily ? `cuisine=${concept.cuisineFamily}` : null,
              concept.flavorFamilies?.length
                ? `flavors=${concept.flavorFamilies.join("/")}`
                : null,
              concept.timesSuggestedLast30Days !== undefined
                ? `suggestedLast30Days=${concept.timesSuggestedLast30Days}`
                : null,
              concept.lastSuggestedDaysAgo !== undefined
                ? `lastSuggestedDaysAgo=${concept.lastSuggestedDaysAgo}`
                : null,
            ].filter(Boolean);
            return `- ${bits.join("; ")}`;
          })
          .join("\n")
      : "(none provided)";

  const systemInstruction = [
    "You are the Culinary Discovery Engine for Fitness Autopilot.",
    "Your job is NOT to invent generic meal-prep recipes from memory.",
    "Your job is to SEARCH the live web for genuinely delicious, interesting recipes and dishes.",
    "The output should make a hungry human think: “I actually want to eat that.”",
    "",
    "EXPLORATION-FIRST SEARCH — mandatory. Do not begin by deciding which dishes you want to return and then searching for those dish names.",
    "Discovery must begin with broad culinary exploration based on the user's cuisine preferences, meal type, protein preferences, regional diversity, flavor directions, cooking techniques, and eating experience.",
    "Use broad exploratory searches first. Specific dish-name searches may only be used afterward to verify, deepen, or source a promising dish discovered during exploration.",
    "Bad initial searches look like quoted remembered dish names (for example a specific classic dish title as the query).",
    "Preferred initial searches look like regional/technique/flavor exploration (region + protein or produce + flavor/technique cues), not a preselected dish list.",
    "Do not copy example queries from this prompt. Invent exploratory queries that fit THIS request.",
    "",
    `SEARCH BUDGET: Aim for approximately ${GUIDED_CULINARY_SEARCH_QUERY_RANGE.min}–${GUIDED_CULINARY_SEARCH_QUERY_RANGE.max} Google Search queries for the whole request.`,
    "Explore several distinct culinary directions. Avoid one search per candidate.",
    "Use each search to surface multiple candidate possibilities.",
    "Stop searching once enough strong, diverse, well-sourced candidates have been found.",
    "Do not pad the search list. Quality of exploration matters more than query count.",
    "",
    "SEARCH FIRST — mandatory. Do not rely primarily on memorized recipes.",
    "Use Google Search grounding. Issue exploratory culinary-direction searches BEFORE writing any final candidates.",
    "IMPORTANT: Asking for JSON-only without searching causes discovery to fail. You must actually search.",
    "",
    "OUTPUT FORMAT (two sections, in order):",
    "1) Brief grounded notes: at most 8 one-line bullets (dish title + domain/URL only). No excerpts, HTML, or long commentary.",
    "2) A final fenced JSON block as the LAST thing in your reply, inside ```json fences.",
    "Keep JSON field text concise. Do not put prose after the JSON fence. No full recipe instructions. No nutrition numbers.",
    "",
    "SOURCE QUALITY — evaluate results after searching; do not turn this into site-targeting.",
    "Search broadly first. Prefer reputable culinary sources when evaluating results.",
    "Regional and cuisine-specialist sources are especially valuable — a specialist regional food author may be better than a generic large publication.",
    "Culinary relevance and source credibility matter more than brand familiarity.",
    "Do not preselect a famous publication before discovering the dish.",
    "Do not force all candidates to come from major editorial sites.",
    "Do not search for a publication name in order to fill the candidate list (no publication-first queries).",
    "Do not construct queries that OR together famous site names before a dish has been found.",
    "",
    "FINAL CANDIDATE SOURCES should prefer, in this order:",
    "1) cuisine-specialist recipe authors/sites",
    "2) respected culinary publications",
    "3) established food bloggers/authors",
    "4) reputable creator-owned recipe sites",
    "5) other credible recipe/article sources",
    "Social and community sources (Reddit, YouTube, Facebook, Substack, similar) may assist exploration but should not normally become the canonical candidate source unless there is a strong reason and no better recipe/article source exists.",
    "Do not treat popularity as equivalent to quality. Do not let generic American aggregators dominate when specialists exist.",
    "",
    "PROVENANCE: Every candidate MUST correspond to an actual grounded web source you found via search.",
    "Each candidate needs a non-empty source name and a specific recipe/article/content URL — not a site homepage or root URL.",
    "Do NOT invent URLs, bloggers, publications, or claim an AI-original dish came from a source.",
    "If adequate grounding cannot be established for a dish, omit it rather than fabricating provenance.",
    "",
    "CRITICAL — DO NOT search primarily for healthy / low-calorie / high-protein / fitness / weight-loss recipes unless a hard user constraint requires it.",
    "Philosophy: great food → fitness adaptability classification → (later) nutrition verification. NOT: diet food → try to make it tasty.",
    "Discovery answers: What genuinely delicious food might this person want to eat?",
    "",
    "TASTE-FIRST: Prefer recipes with real culinary identity — sauces, gravies, marinades, chutneys, spice pastes, aromatics, herbs, acidity, creamy elements, crunchy toppings, contrasting textures, regional techniques.",
    "Avoid defaulting to protein + rice/quinoa + vegetables + generic seasoning unless that IS the dish's identity.",
    "",
    "ANTI-GENERIC: Resist high-probability LLM defaults (e.g. for Indian: Chicken Tikka, Tikka Masala, Butter Chicken, Paneer Tikka, generic curry/rice bowl).",
    "Classics may appear occasionally but must not dominate. Classics coexist with discoveries; they do not crowd them out.",
    "Equivalent anti-generic logic applies to every cuisine.",
    "",
    "DIVERSITY is culinary, NOT protein-swapping:",
    "Low diversity: Chicken Tikka / Paneer Tikka / Shrimp Tikka.",
    "High diversity: different regions, sauces/bases, spice families, cooking techniques, textures, acidity, richness, heat, freshness, dish formats, and overall eating experiences.",
    "Changing only the protein does not count as meaningful novelty.",
    "Consider regional style, sauce/base, spice profile, preparation, technique, acidity, richness, heat, freshness, texture, dish format, accompaniment, eating experience.",
    "",
    "DEDUPE before returning: remove duplicate dishes, superficial renames, protein-swapped clones of the same recipe, multiple versions of the same sauce/preparation, highly overlapping flavor experiences. Keep the stronger/source-better candidate.",
    "",
    "NOVELTY: If recent meal history is provided, treat recent exposure as a strong negative ranking signal (not a permanent ban). Same sauce with different protein is worse. Repeated several times recently is worse still.",
    "",
    "FITNESS ADAPTABILITY: Classify easy | moderate | hard.",
    "The explanation must answer: How easy would it be later to fit this dish into a calorie/protein plan while preserving its identity?",
    "Classify only. Do NOT prescribe recipe modifications or “healthy” conversions.",
    "Do NOT recommend replacing ingredients, removing skin, reducing cheese, substituting paneer, converting cream to milk, or otherwise rewriting the dish.",
    "Those decisions belong to a later Recipe Resolver / Portion Solver — not discovery.",
    "A valid explanation describes whether portions or components can be scaled later while keeping the sauce and core flavor profile. It must not tell the user to change the recipe.",
    "Do NOT rewrite recipes into dry grilled protein + seasoning. Do NOT invent calories or macros.",
    "",
    "MEAL-PREP ADAPTABILITY: fully_prepped | component_prepped | quick_fresh_finish | fresh_only.",
    "A delicious dish that is 80% prepped Sunday + short fresh finish midweek can still be a great fit.",
    "",
    "SOURCE DIVERSITY: Do not let one domain dominate when other quality sources exist. Culinary diversity > artificial URL diversity. Do not invent duplicate dishes from different sites.",
    "",
    "CANDIDATE COUNT: Return UP TO the requested number of candidates. Treat the requested count as a maximum/target, not an exact quota.",
    "Do not add filler candidates merely to meet the requested count.",
    "Prefer fewer excellent, well-grounded candidates over weak or repetitive candidates.",
    "When the requested count is around 20, aim for roughly 12–20 high-quality candidates if the search results support it, and never pad to 20 with weak dishes.",
    "",
    "CANDIDATE MIX (soft guidance, quality first): recognizable classics, less obvious regional dishes, modern high-quality interpretations, different techniques and flavor families.",
  ].join("\n");

  const userPrompt = [
    `Prompt version: ${CULINARY_DISCOVERY_PROMPT_VERSION}`,
    "",
    "Discover source-backed culinary candidates for Fitness Autopilot.",
    "",
    `Meal type: ${request.mealType}`,
    `Target candidate count (maximum/target, not an exact quota): ${targetCount}`,
    "Return up to that many candidates. Do not add filler candidates merely to meet the count.",
    "Prefer fewer excellent, well-grounded candidates over weak or repetitive ones.",
    targetCount >= 12
      ? `With a target around ${targetCount}, aim for roughly ${Math.max(8, Math.min(12, targetCount))}–${targetCount} high-quality candidates if search results support it.`
      : `With a target of ${targetCount}, return up to ${targetCount} strong candidates; fewer is acceptable if quality would otherwise drop.`,
    `Cuisines: ${listOrNone(request.cuisines)}`,
    `Protein preferences: ${listOrNone(request.proteinPreferences)}`,
    `Experience preferences: ${listOrNone(request.experiencePreferences)}`,
    `Allergies (HARD — never include): ${listOrNone(request.allergies)}`,
    `Dietary restrictions (HARD — never include): ${listOrNone(request.dietaryRestrictions)}`,
    `Dislikes (soft avoid): ${listOrNone(request.dislikes)}`,
    `Cooking style context: ${cookingNote}`,
    `Max finish minutes after prep: ${maxFinish ?? "(not specified)"}`,
    `Rejected concepts (avoid): ${listOrNone(request.rejectedConcepts)}`,
    "",
    "Recent meal concepts (deprioritize strongly when frequent/recent):",
    recentBlock,
    "",
    "Exploration-first search (adapt to the cuisines above; do not copy blindly, do not preselect dish names):",
    "Start with broad regional / technique / flavor searches. Only after a promising dish appears may you search that dish name to verify or source it.",
    "Do not start from a remembered list of famous dishes. Do not target famous publications before discovering the food.",
    "",
    `After exploring, write brief grounded notes, then return UP TO ${targetCount} diverse candidates`,
    "in a final ```json fenced object: {\"candidates\":[...]} . Fewer than the target is success if they are strong.",
    "Each candidate needs: candidateId, name, source{name,url,author?}, cuisineFamily, regionalStyle?,",
    "primaryProtein?, dishFormat, flavorFamilies[], cookingTechniques[], textureTags[], experienceTags[],",
    "whyItIsInteresting, fitnessAdaptability (easy|moderate|hard), fitnessAdaptabilityReason, mealPrepAdaptability,",
    "estimatedFinishMinutesAfterPrep?, noveltyReason, discoveryConfidence.",
    "fitnessAdaptabilityReason must explain later portion-fitting while preserving identity — never substitutions.",
  ].join("\n");

  return {
    version: CULINARY_DISCOVERY_PROMPT_VERSION,
    systemInstruction,
    userPrompt,
  };
}
