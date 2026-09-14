import { describe, expect, it } from "vitest";
import {
  ANDHRA_GREEN_CHILLI_CHICKEN,
  CHICKEN_TIKKA,
  FISH_TIKKA,
  FRESH_ONLY_LONG_DINNER,
  PANEER_TIKKA,
} from "../recipes/candidate-ranking-fixtures";
import { computeCandidateSimilarity } from "../recipes/candidate-ranking";
import {
  ADJACENT_HIGH_SIMILARITY_THRESHOLD,
  MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK,
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  assertSufficientRankedCandidates,
  buildRankedWeeklyStrategyPrompt,
  calculateRankedWeeklyStrategyQualityStats,
  collectAdjacentMealPairs,
  collectRankedMealSlots,
  compactRankedCandidateForPrompt,
  looksLikeRankedWeeklyStrategyRequest,
  parseRankedWeeklyStrategyRequest,
  validateRankedWeeklyStrategy,
} from "./ranked-weekly-strategy";
import {
  PLAN007_DINNER_POOL,
  PLAN007_LUNCH_POOL,
  PLAN007_SMALL_DINNER_POOL,
  PLAN007_SMALL_LUNCH_POOL,
  makeRankedCandidate,
  sampleRankedWeekPayload,
  sampleRankedWeeklyStrategyRequest,
} from "./ranked-weekly-strategy-fixtures";

const metadata = {
  provider: "gemini",
  model: "gemini-test",
  promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
};

function clonePayload() {
  return structuredClone(sampleRankedWeekPayload());
}

describe("ranked weekly strategy request parsing", () => {
  it("parses a valid ranked weekly strategy request", () => {
    const parsed = parseRankedWeeklyStrategyRequest(sampleRankedWeeklyStrategyRequest());
    expect(parsed.ok).toBe(true);
  });

  it("detects ranked requests by candidate pools", () => {
    expect(looksLikeRankedWeeklyStrategyRequest(sampleRankedWeeklyStrategyRequest())).toBe(
      true,
    );
    expect(
      looksLikeRankedWeeklyStrategyRequest({
        nutrition: { targetCaloriesPerDay: 2200, targetProteinGramsPerDay: 160 },
        foodPreferences: { varietyLevel: "balanced", allergies: [], dietaryRestrictions: [], dislikes: [] },
        cookingPreferences: {
          prepFrequency: "once_weekly",
          maxPrepSessionMinutes: 90,
          cookingStyle: "ready_lunch_fresh_dinner",
          maxFinishMinutes: 10,
          useDinnerPrepForNextLunch: true,
        },
      }),
    ).toBe(false);
  });

  it("returns INSUFFICIENT_CANDIDATES for an empty lunch pool", () => {
    const request = sampleRankedWeeklyStrategyRequest({ lunchCandidates: [] });
    const parsed = parseRankedWeeklyStrategyRequest(request);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const sufficient = assertSufficientRankedCandidates(parsed.value);
    expect(sufficient.ok).toBe(false);
    if (!sufficient.ok) {
      expect(sufficient.error.code).toBe("INSUFFICIENT_CANDIDATES");
      expect(sufficient.error.message).toMatch(/lunch/i);
    }
  });

  it("returns INSUFFICIENT_CANDIDATES for an empty dinner pool", () => {
    const request = sampleRankedWeeklyStrategyRequest({ dinnerCandidates: [] });
    const sufficient = assertSufficientRankedCandidates(request);
    expect(sufficient.ok).toBe(false);
    if (!sufficient.ok) {
      expect(sufficient.error.code).toBe("INSUFFICIENT_CANDIDATES");
      expect(sufficient.error.message).toMatch(/dinner/i);
    }
  });
});

describe("ranked weekly strategy prompt", () => {
  it("is versioned weekly-strategy-ranked-v1 and forbids invention", () => {
    const prompt = buildRankedWeeklyStrategyPrompt(sampleRankedWeeklyStrategyRequest());
    expect(prompt.version).toBe("weekly-strategy-ranked-v1");
    expect(prompt.systemInstruction).toContain("weekly-strategy-ranked-v1");
    expect(prompt.systemInstruction).toContain("Do NOT invent");
    expect(prompt.systemInstruction).toContain("NO original_concept");
    expect(prompt.systemInstruction).toContain("Do NOT rename, healthify");
    expect(prompt.systemInstruction).not.toMatch(/always choose the highest-ranked/i);
    expect(prompt.systemInstruction).toContain("Do NOT output calories, protein, carbs, fat, portion grams, or serving sizes");
    expect(prompt.userPrompt).not.toContain("caloriesKcal");
    expect(prompt.userPrompt).not.toMatch(/assign (authoritative )?(calories|macros)/i);
  });

  it("includes candidate IDs, PLAN-001 context, PLAN-002 context, and variety level", () => {
    const prompt = buildRankedWeeklyStrategyPrompt(sampleRankedWeeklyStrategyRequest());
    expect(prompt.userPrompt).toContain("andhra-green-chilli-chicken");
    expect(prompt.userPrompt).toContain("kerala-meen-pollichathu");
    expect(prompt.userPrompt).toContain("varietyLevel: balanced");
    expect(prompt.userPrompt).toContain("cuisines: Indian, Mexican, Mediterranean");
    expect(prompt.userPrompt).toContain("proteinPreferences: Chicken, Fish");
    expect(prompt.userPrompt).toContain("allergies (hard exclude): Peanuts");
    expect(prompt.userPrompt).toContain("prepFrequency: once_weekly");
    expect(prompt.userPrompt).toContain("cookingStyle: ready_lunch_fresh_dinner");
    expect(prompt.userPrompt).toContain("maxFinishMinutes: 10");
    expect(prompt.userPrompt).toContain("useDinnerPrepForNextLunch: true");
    expect(prompt.userPrompt).toContain("targetCaloriesPerDay: 2200");
    expect(prompt.systemInstruction).toContain("Piggyback prep is NOT same-food reuse");
    expect(JSON.stringify(compactRankedCandidateForPrompt(PLAN007_LUNCH_POOL[1]!))).toContain(
      "andhra-green-chilli-chicken",
    );
    expect(JSON.stringify(compactRankedCandidateForPrompt(PLAN007_LUNCH_POOL[1]!))).not.toContain(
      "whyItIsInteresting",
    );
  });
});

describe("ranked weekly strategy validation", () => {
  it("accepts a valid 7-day lunch+dinner week and hydrates names from candidate IDs", () => {
    const request = sampleRankedWeeklyStrategyRequest();
    const result = validateRankedWeeklyStrategy(clonePayload(), request, metadata);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.days).toHaveLength(7);
    const slots = collectRankedMealSlots(result.value.days);
    expect(slots).toHaveLength(14);
    expect(slots.filter((slot) => slot.mealType === "lunch")).toHaveLength(7);
    expect(slots.filter((slot) => slot.mealType === "dinner")).toHaveLength(7);
    expect(result.value.days[0]?.lunch.name).toBe("Andhra Green Chilli Chicken");
    expect(result.value.days[0]?.lunch.candidateId).toBe("andhra-green-chilli-chicken");
    expect(result.value.uniqueCandidateIds.length).toBeGreaterThan(0);
    expect(result.value.uniqueCandidateIds.length).toBeLessThan(14);
  });

  it("allows repeated candidates and does not require 14 unique recipes", () => {
    const result = validateRankedWeeklyStrategy(
      clonePayload(),
      sampleRankedWeeklyStrategyRequest(),
      metadata,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.uniqueCandidateIds.length).toBeLessThan(14);
    const andhraLunches = result.value.days.filter(
      (day) => day.lunch.candidateId === "andhra-green-chilli-chicken",
    );
    expect(andhraLunches.length).toBe(2);
  });

  it("accepts a valid week from a small pool via repetition", () => {
    const request = sampleRankedWeeklyStrategyRequest({
      lunchCandidates: PLAN007_SMALL_LUNCH_POOL,
      dinnerCandidates: PLAN007_SMALL_DINNER_POOL,
    });
    const payload = clonePayload();
    payload.days = payload.days.map((day, index) => ({
      ...day,
      lunch: {
        ...day.lunch,
        candidateId: PLAN007_SMALL_LUNCH_POOL[index % PLAN007_SMALL_LUNCH_POOL.length]!.candidate
          .candidateId,
        lunchPreparationStrategy: "independent_meal_prep" as const,
      },
      dinner: {
        ...day.dinner,
        candidateId: PLAN007_SMALL_DINNER_POOL[index % PLAN007_SMALL_DINNER_POOL.length]!.candidate
          .candidateId,
        prepIntent: "fully_prepped" as const,
      },
    }));
    const result = validateRankedWeeklyStrategy(payload, request, metadata);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.days).toHaveLength(7);
    expect(result.value.uniqueCandidateIds.length).toBeLessThanOrEqual(9);
  });

  it("rejects a week that is not exactly 7 days", () => {
    const payload = clonePayload();
    payload.days = payload.days.slice(0, 6);
    const result = validateRankedWeeklyStrategy(
      payload,
      sampleRankedWeeklyStrategyRequest(),
      metadata,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_WEEK_STRUCTURE");
      expect(result.error.message).toMatch(/7 days/i);
    }
  });

  it("rejects an unknown / hallucinated candidate", () => {
    const payload = clonePayload();
    payload.days[0]!.lunch.candidateId = "healthy-coconut-fish-bowl";
    const result = validateRankedWeeklyStrategy(
      payload,
      sampleRankedWeeklyStrategyRequest(),
      metadata,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CANDIDATE_REFERENCE");
      expect(result.error.message).toMatch(/Unknown lunch candidate/i);
    }
  });

  it("rejects a dinner candidate used in a lunch slot (cross-pool)", () => {
    const payload = clonePayload();
    payload.days[0]!.lunch.candidateId = "kerala-meen-pollichathu";
    const result = validateRankedWeeklyStrategy(
      payload,
      sampleRankedWeeklyStrategyRequest(),
      metadata,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CANDIDATE_REFERENCE");
      expect(result.error.message).toMatch(/not in the lunch pool/i);
    }
  });

  it("rejects a lunch candidate used in a dinner slot (cross-pool)", () => {
    const payload = clonePayload();
    payload.days[0]!.dinner.candidateId = "kerala-beef-fry";
    const result = validateRankedWeeklyStrategy(
      payload,
      sampleRankedWeeklyStrategyRequest(),
      metadata,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CANDIDATE_REFERENCE");
      expect(result.error.message).toMatch(/not in the dinner pool/i);
    }
  });

  it("limits direct leftover lunches to the planner policy maximum", () => {
    expect(MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK).toBe(1);
    const payload = clonePayload();
    // Saturday lunch is already a leftover of Friday dinner. Add a second leftover
    // using a dish present in both pools.
    payload.days[5]!.dinner.candidateId = "thai-green-curry";
    payload.days[5]!.dinner.prepIntent = "component_prepped";
    payload.days[6]!.lunch.candidateId = "thai-green-curry";
    payload.days[6]!.lunch.lunchPreparationStrategy = "direct_leftover";
    const result = validateRankedWeeklyStrategy(
      payload,
      sampleRankedWeeklyStrategyRequest(),
      metadata,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_WEEK_STRUCTURE");
      expect(result.error.message).toMatch(/direct leftover/i);
    }
  });

  it("rejects piggyback and leftover planning when the preference is disabled", () => {
    const request = sampleRankedWeeklyStrategyRequest({
      cookingPreferences: {
        ...sampleRankedWeeklyStrategyRequest().cookingPreferences,
        useDinnerPrepForNextLunch: false,
      },
    });
    const result = validateRankedWeeklyStrategy(clonePayload(), request, metadata);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_WEEK_STRUCTURE");
      expect(result.error.message).toMatch(/useDinnerPrepForNextLunch is false/i);
    }
  });

  it("detects finish-time incompatibility when metadata exceeds maxFinishMinutes", () => {
    const request = sampleRankedWeeklyStrategyRequest({
      dinnerCandidates: [
        ...PLAN007_DINNER_POOL,
        makeRankedCandidate(FRESH_ONLY_LONG_DINNER, 20),
      ],
    });
    const payload = clonePayload();
    payload.days[0]!.dinner = {
      candidateId: "fresh-only-long",
      prepIntent: "fresh",
      planningReason: "A long roast that cannot finish in 10 minutes.",
    };
    const result = validateRankedWeeklyStrategy(payload, request, metadata);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_WEEK_STRUCTURE");
      expect(result.error.message).toMatch(/exceeds maxFinishMinutes/i);
    }
  });

  it("does not silently rename a selected candidate", () => {
    const result = validateRankedWeeklyStrategy(
      clonePayload(),
      sampleRankedWeeklyStrategyRequest(),
      metadata,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const meen = result.value.days.find((day) => day.dinner.candidateId === "kerala-meen-pollichathu");
    expect(meen?.dinner.name).toBe("Kerala Meen Pollichathu");
    expect(meen?.dinner.name).not.toMatch(/healthy|bowl/i);
  });
});

describe("ranked weekly strategy quality stats", () => {
  it("calculates deterministic quality diagnostics", () => {
    const request = sampleRankedWeeklyStrategyRequest();
    const validated = validateRankedWeeklyStrategy(clonePayload(), request, metadata);
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    const stats = calculateRankedWeeklyStrategyQualityStats(validated.value, request);
    expect(stats.totalMealSlots).toBe(14);
    expect(stats.uniqueCandidateCount).toBe(validated.value.uniqueCandidateIds.length);
    expect(stats.repeatedMealSlotCount).toBe(14 - stats.uniqueCandidateCount);
    expect(stats.uniqueCuisineCount).toBeGreaterThan(1);
    expect(stats.uniqueProteinCount).toBeGreaterThan(1);
    expect(stats.uniqueFlavorFamilyCount).toBeGreaterThan(1);
    expect(stats.directLeftoverLunchCount).toBe(1);
    expect(stats.piggybackLunchCount).toBe(2);
    expect(stats.independentLunchCount).toBe(4);
    expect(stats.candidateUsage.length).toBe(stats.uniqueCandidateCount);
    expect(stats.averageCandidateRank).toBeGreaterThan(0);
    const andhraUsage = stats.candidateUsage.find(
      (item) => item.candidateId === "andhra-green-chilli-chicken",
    );
    expect(andhraUsage?.count).toBe(2);
  });

  it("reuses PLAN-006 similarity for adjacency diagnostics", () => {
    const request = sampleRankedWeeklyStrategyRequest();
    const validated = validateRankedWeeklyStrategy(clonePayload(), request, metadata);
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    const pairs = collectAdjacentMealPairs(validated.value.days);
    expect(pairs).toHaveLength(13);
    expect(pairs[0]?.left.mealType).toBe("lunch");
    expect(pairs[0]?.right.mealType).toBe("dinner");
    expect(pairs[1]?.left.day).toBe("monday");
    expect(pairs[1]?.right.day).toBe("tuesday");

    const stats = calculateRankedWeeklyStrategyQualityStats(validated.value, request);
    expect(stats.maxAdjacentSimilarity).toBeGreaterThanOrEqual(0);
    expect(ADJACENT_HIGH_SIMILARITY_THRESHOLD).toBeGreaterThan(0);

    const tikkaSimilarity = computeCandidateSimilarity(CHICKEN_TIKKA, PANEER_TIKKA);
    const fishTikkaSimilarity = computeCandidateSimilarity(CHICKEN_TIKKA, FISH_TIKKA);
    const distinctSimilarity = computeCandidateSimilarity(
      ANDHRA_GREEN_CHILLI_CHICKEN,
      CHICKEN_TIKKA,
    );
    expect(tikkaSimilarity.score).toBeGreaterThan(distinctSimilarity.score);
    expect(fishTikkaSimilarity.score).toBeGreaterThan(0.4);

    const lunch = PLAN007_LUNCH_POOL.find(
      (item) => item.candidate.candidateId === validated.value.days[0]?.lunch.candidateId,
    )!.candidate;
    const dinner = PLAN007_DINNER_POOL.find(
      (item) => item.candidate.candidateId === validated.value.days[0]?.dinner.candidateId,
    )!.candidate;
    const expected = computeCandidateSimilarity(lunch, dinner).score;
    expect(stats.worstAdjacentPair).toBeDefined();
    expect(expected).toBeGreaterThanOrEqual(0);
  });
});
