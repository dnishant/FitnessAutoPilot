import type {
  CulinaryDiscoveryCandidate,
  CulinaryDiscoveryGroundingMetadata,
  CulinaryDiscoveryMetadata,
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

export const CULINARY_DISCOVERY_PROMPT_VERSION = "culinary-discovery-v1" as const;
export const DEFAULT_CULINARY_DISCOVERY_CANDIDATE_COUNT = 20;

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
    // Searches may still have run; provenance rests on the candidate's own source URL.
    return Boolean(candidate.source.url);
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

export type NormalizeDiscoveryCandidatesOptions = {
  request: CulinaryDiscoveryRequest;
  groundingMetadata?: CulinaryDiscoveryGroundingMetadata;
  /**
   * When true, omit candidates that lack grounding correlation if usable
   * (non-redirect) grounding chunk hosts/titles are available.
   */
  requireChunkCorrelationWhenAvailable?: boolean;
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
 */
export function normalizeDiscoveryCandidates(
  rawCandidates: readonly CulinaryDiscoveryCandidate[],
  options: NormalizeDiscoveryCandidatesOptions,
): Result<CulinaryDiscoveryCandidate[], CulinaryDiscoveryError> {
  const requireCorrelation = options.requireChunkCorrelationWhenAvailable ?? true;
  const usableHosts = groundingHasUsableHosts(options.groundingMetadata);

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const kept: CulinaryDiscoveryCandidate[] = [];
  const rejected: string[] = [];

  for (const candidate of rawCandidates) {
    if (!FitnessAdaptabilitySchema.safeParse(candidate.fitnessAdaptability).success) {
      rejected.push(`Invalid fitnessAdaptability on ${candidate.candidateId}`);
      continue;
    }
    if (!MealPrepAdaptabilitySchema.safeParse(candidate.mealPrepAdaptability).success) {
      rejected.push(`Invalid mealPrepAdaptability on ${candidate.candidateId}`);
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

  const hardViolations = findHardConstraintViolations(kept, options.request);
  if (hardViolations.length > 0) {
    return err(
      culinaryDiscoveryError(
        "DISCOVERY_SCHEMA_VALIDATION_FAILED",
        hardViolations[0] ?? "Hard preference constraint violated.",
        { hardViolations, rejected },
      ),
    );
  }

  if (kept.length === 0) {
    return err(
      culinaryDiscoveryError(
        "DISCOVERY_NOT_GROUNDED",
        "No grounded culinary candidates remained after provenance validation.",
        { rejected },
      ),
    );
  }

  return ok(kept);
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

export function buildDiscoveryMetadata(args: {
  model: string;
  request: CulinaryDiscoveryRequest;
  candidates: readonly CulinaryDiscoveryCandidate[];
  groundingMetadata?: CulinaryDiscoveryGroundingMetadata;
  requestId?: string;
  durationMs?: number;
  usageMetadata?: CulinaryDiscoveryMetadata["usageMetadata"];
}): CulinaryDiscoveryMetadata {
  const groundedCount = args.candidates.filter((c) =>
    candidateHasGroundingCorrelation(c, args.groundingMetadata),
  ).length;
  const coverage =
    args.candidates.length === 0 ? 0 : groundedCount / args.candidates.length;

  return {
    provider: "gemini",
    model: args.model,
    promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
    requestedCandidateCount: args.request.targetCandidateCount,
    returnedCandidateCount: args.candidates.length,
    searchQueries: args.groundingMetadata?.webSearchQueries,
    sourceCount: calculateUniqueSourceCount(args.candidates),
    uniqueSourceCount: calculateUniqueSourceCount(args.candidates),
    uniqueCuisineCount: calculateUniqueCuisineCount(args.candidates),
    uniqueDomainCount: calculateUniqueDomainCount(args.candidates),
    groundedCandidateCount: groundedCount,
    groundingCoverage: Number(coverage.toFixed(3)),
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
    "Your job is to SEARCH the live web for genuinely delicious, interesting recipes and dishes from reputable culinary publications, cuisine specialists, established recipe authors/bloggers, and creator-owned recipe sites.",
    "The output should make a hungry human think: “I actually want to eat that.”",
    "",
    "SEARCH FIRST — mandatory. Do not rely primarily on memorized recipes.",
    "Use Google Search grounding. Issue multiple culinary-direction searches BEFORE writing any final candidates.",
    "Explore regional styles, techniques, and sauce/flavor families — not a single generic query.",
    "IMPORTANT: Asking for JSON-only without searching causes discovery to fail. You must actually search.",
    "",
    "OUTPUT FORMAT (two sections, in order):",
    "1) Brief grounded notes: short bullets of dishes/sources you found via search (titles + domains/URLs).",
    "2) A final fenced JSON block as the LAST thing in your reply, inside ```json fences.",
    "Do not put prose after the JSON fence. No full recipe instructions. No nutrition numbers.",
    "",
    "SOURCE QUALITY (prefer roughly in this order):",
    "1) cuisine-specialist recipe sites/authors",
    "2) respected culinary publications",
    "3) established food bloggers/authors",
    "4) reputable creator-owned recipe websites",
    "5) other credible recipe sources",
    "Do not treat popularity as equivalent to quality. Do not let generic American aggregators dominate when specialists exist.",
    "",
    "CRITICAL — DO NOT search primarily for healthy / low-calorie / high-protein / fitness / weight-loss recipes unless a hard user constraint requires it.",
    "Philosophy: great food → fitness adaptability classification → (later) nutrition verification. NOT: diet food → try to make it tasty.",
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
    "High diversity: Chicken Chettinad / Chicken Tinga / Thai Basil Chicken / Chicken Shawarma (different regions, sauces, techniques, experiences).",
    "Consider regional style, sauce/base, spice profile, preparation, technique, acidity, richness, heat, freshness, texture, dish format, accompaniment, eating experience.",
    "",
    "DEDUPE before returning: remove duplicate dishes, superficial renames, protein-swapped clones of the same recipe, multiple versions of the same sauce/preparation, highly overlapping flavor experiences. Keep the stronger/source-better candidate.",
    "",
    "NOVELTY: If recent meal history is provided, treat recent exposure as a strong negative ranking signal (not a permanent ban). Same sauce with different protein is worse. Repeated several times recently is worse still.",
    "",
    "FITNESS ADAPTABILITY: Classify excellent|good|difficult — could Fitness Autopilot later adjust portions/macros while preserving what makes the dish good?",
    "Do NOT rewrite recipes into dry grilled protein + seasoning. Do NOT invent calories or macros.",
    "",
    "MEAL-PREP ADAPTABILITY: fully_prepped | component_prepped | quick_fresh_finish | fresh_only.",
    "A delicious dish that is 80% prepped Sunday + short fresh finish midweek can be excellent.",
    "",
    "SOURCE DIVERSITY: Do not let one domain dominate when other quality sources exist. Culinary diversity > artificial URL diversity. Do not invent duplicate dishes from different sites.",
    "",
    "CANDIDATE MIX (soft guidance, quality first): recognizable classics, less obvious regional dishes, modern high-quality interpretations, different techniques and flavor families.",
    "",
    "PROVENANCE: Every candidate MUST correspond to an actual grounded web source you found via search.",
    "Do NOT invent URLs, bloggers, publications, or claim an AI-original dish came from a source.",
    "If adequate grounding cannot be established for a dish, omit it.",
  ].join("\n");

  const userPrompt = [
    `Prompt version: ${CULINARY_DISCOVERY_PROMPT_VERSION}`,
    "",
    "Discover source-backed culinary candidates for Fitness Autopilot.",
    "",
    `Meal type: ${request.mealType}`,
    `Target candidate count: ${targetCount}`,
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
    "Search guidance example (adapt to the cuisines above; do not copy blindly):",
    "For Indian + chicken + dinner, explore multiple directions such as regional Indian chicken dishes,",
    "South Indian / Bengali / Goan / Kerala / Mangalorean / Andhra preparations, pepper chicken, herb chicken,",
    "street-food styles, grilled styles — NOT only “Indian chicken recipe” or “healthy Indian chicken”.",
    "",
    `After searching, write brief grounded notes, then return about ${targetCount} diverse candidates`,
    "in a final ```json fenced object: {\"candidates\":[...]} .",
    "Each candidate needs: candidateId, name, source{name,url,author?}, cuisineFamily, regionalStyle?,",
    "primaryProtein?, dishFormat, flavorFamilies[], cookingTechniques[], textureTags[], experienceTags[],",
    "whyItIsInteresting, fitnessAdaptability, fitnessAdaptabilityReason, mealPrepAdaptability,",
    "estimatedFinishMinutesAfterPrep?, noveltyReason, discoveryConfidence.",
  ].join("\n");

  return {
    version: CULINARY_DISCOVERY_PROMPT_VERSION,
    systemInstruction,
    userPrompt,
  };
}
