import type {
  CulinaryMeasurementState,
  FoodSearchResult,
  IngredientRole,
} from "@fitness-autopilot/contracts";

export type ScoredFoodCandidate = FoodSearchResult & {
  score: number;
  matchReason: string;
  isBranded: boolean;
  preparationAligned: boolean;
};

const GENERIC_DATA_TYPES = new Set([
  "foundation",
  "sr legacy",
  "survey (fndds)",
  "survey",
  "fndds",
]);

const BRANDED_DATA_TYPES = new Set(["branded"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function overlapScore(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
  const candidateSet = new Set(candidateTokens);
  let hits = 0;
  for (const t of queryTokens) {
    if (candidateSet.has(t)) hits += 1;
  }
  return hits / queryTokens.length;
}

function hasToken(tokens: string[], needle: string): boolean {
  return tokens.some((t) => t === needle || t.includes(needle));
}

function preparationAlignment(
  measurementState: CulinaryMeasurementState,
  description: string,
): { aligned: boolean; penalty: number; bonus: number } {
  const tokens = tokenize(description);
  const cooked = hasToken(tokens, "cooked") || hasToken(tokens, "roasted") || hasToken(tokens, "grilled");
  const raw =
    hasToken(tokens, "raw") ||
    hasToken(tokens, "uncooked") ||
    (hasToken(tokens, "dry") && !cooked);

  if (measurementState === "raw") {
    if (cooked && !raw) return { aligned: false, penalty: 40, bonus: 0 };
    if (raw) return { aligned: true, penalty: 0, bonus: 18 };
    return { aligned: true, penalty: 0, bonus: 4 };
  }
  if (measurementState === "cooked" || measurementState === "prepared") {
    if (raw && !cooked) return { aligned: false, penalty: 40, bonus: 0 };
    if (cooked) return { aligned: true, penalty: 0, bonus: 18 };
    return { aligned: true, penalty: 0, bonus: 2 };
  }
  return { aligned: true, penalty: 0, bonus: 0 };
}

function roleCategoryBonus(role: IngredientRole, foodCategory: string | null | undefined): number {
  if (!foodCategory) return 0;
  const cat = foodCategory.toLowerCase();
  if (role === "protein" && /(poultry|beef|pork|fish|seafood|dairy|legume)/.test(cat)) return 8;
  if ((role === "carb" || role === "carbohydrate") && /(grain|cereal|bread|pasta|rice)/.test(cat)) {
    return 8;
  }
  if (role === "fat" && /(oil|fat|nut)/.test(cat)) return 8;
  if (role === "vegetable" && /(vegetable|produce)/.test(cat)) return 8;
  return 0;
}

export function isBrandedFoodCandidate(candidate: FoodSearchResult): boolean {
  const dataType = (candidate.dataType ?? "").toLowerCase();
  if (BRANDED_DATA_TYPES.has(dataType)) return true;
  if (candidate.brandName && candidate.brandName.trim().length > 0) return true;
  const desc = candidate.description.toLowerCase();
  // Branded dressings / infused products often pollute oil searches.
  if (/\b(dressing|marinade|sauce mix|seasoning mix)\b/.test(desc) && /\boil\b/.test(desc)) {
    return true;
  }
  return false;
}

export function isGenericDataType(dataType: string | null | undefined): boolean {
  if (!dataType) return false;
  return GENERIC_DATA_TYPES.has(dataType.toLowerCase());
}

export type ScoreFoodCandidatesInput = {
  query: string;
  measurementState: CulinaryMeasurementState;
  role: IngredientRole;
  requireGeneric?: boolean;
  candidates: readonly FoodSearchResult[];
};

/**
 * Deterministic candidate scoring. Prefer generic reference foods for generic ingredients.
 */
export function scoreFoodCandidates(input: ScoreFoodCandidatesInput): ScoredFoodCandidate[] {
  const queryTokens = tokenize(input.query);
  const scored: ScoredFoodCandidate[] = input.candidates.map((candidate) => {
    const descTokens = tokenize(candidate.description);
    const nameOverlap = overlapScore(queryTokens, descTokens) * 50;
    const branded = isBrandedFoodCandidate(candidate);
    const genericType = isGenericDataType(candidate.dataType);
    const prep = preparationAlignment(input.measurementState, candidate.description);
    const categoryBonus = roleCategoryBonus(input.role, candidate.foodCategory);

    let score = nameOverlap + prep.bonus + categoryBonus;
    const reasons: string[] = [];

    if (genericType) {
      score += 25;
      reasons.push("generic data type");
    }
    if (branded) {
      score -= input.requireGeneric === false ? 5 : 35;
      reasons.push(branded ? "branded penalty" : "branded");
    } else {
      reasons.push("non-branded");
    }
    if (prep.aligned) reasons.push("prep aligned");
    else reasons.push("prep mismatch");
    score -= prep.penalty;

    // Prefer shorter, simpler descriptions for generic staples.
    if (!branded && descTokens.length <= queryTokens.length + 3) {
      score += 6;
      reasons.push("concise description");
    }

    // Infused / flavored oils and dressings for plain "olive oil".
    if (
      /\boil\b/.test(input.query.toLowerCase()) &&
      /\b(garlic|lemon|chili|dressing|vinaigrette|spray)\b/.test(candidate.description.toLowerCase())
    ) {
      score -= 30;
      reasons.push("flavored oil/dressing penalty");
    }

    return {
      ...candidate,
      score,
      isBranded: branded,
      preparationAligned: prep.aligned,
      matchReason: reasons.join("; "),
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

export type CandidateSelection =
  | { kind: "resolved"; candidate: ScoredFoodCandidate; confidence: "high" | "medium" }
  | { kind: "ambiguous"; candidates: ScoredFoodCandidate[]; reason: string }
  | { kind: "not_found"; reason: string };

/**
 * Select a candidate without blindly taking search rank #1.
 */
export function selectFoodCandidate(
  scored: readonly ScoredFoodCandidate[],
  options?: { preferGeneric?: boolean },
): CandidateSelection {
  const preferGeneric = options?.preferGeneric !== false;
  let pool = [...scored];
  if (preferGeneric) {
    const generic = pool.filter((c) => !c.isBranded && c.preparationAligned);
    if (generic.length > 0) pool = generic;
  }
  pool = pool.filter((c) => c.preparationAligned || c.score >= 35);
  if (pool.length === 0) {
    if (scored.length === 0) {
      return { kind: "not_found", reason: "Provider returned no food candidates." };
    }
    return {
      kind: "ambiguous",
      candidates: scored.slice(0, 5),
      reason: "No candidate aligned with preparation state and generic preference.",
    };
  }

  const top = pool[0]!;
  const second = pool[1];
  if (top.score < 28) {
    return {
      kind: "ambiguous",
      candidates: pool.slice(0, 5),
      reason: `Top candidate score ${top.score.toFixed(1)} below confidence threshold.`,
    };
  }
  if (second && top.score - second.score < 8 && top.score < 70) {
    return {
      kind: "ambiguous",
      candidates: pool.slice(0, 5),
      reason: "Top candidates are too close in score for automatic resolution.",
    };
  }

  const confidence: "high" | "medium" =
    top.score >= 55 && top.preparationAligned && !top.isBranded ? "high" : "medium";
  return { kind: "resolved", candidate: top, confidence };
}
