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
  WEEKLY_VARIETY_COMPLEXITY_POLICY,
  assertSufficientRankedCandidates,
  buildComplexityRetryFeedback,
  buildRankedWeeklyStrategyPrompt,
  calculateRankedWeeklyStrategyQualityStats,
  classifyWeeklyComplexityStatus,
  collectAdjacentMealPairs,
  collectRankedMealSlots,
  compactRankedCandidateForPrompt,
  evaluateWeeklyComplexity,
  getWeeklyVarietyComplexityPolicy,
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
  sampleRankedWeekPayloadWithUniqueCount,
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
  it("is versioned weekly-strategy-ranked-v1.3.0 and prioritizes repertoire-first practicality", () => {
    const prompt = buildRankedWeeklyStrategyPrompt(sampleRankedWeeklyStrategyRequest());
    expect(prompt.version).toBe("weekly-strategy-ranked-v1.3.0");
    expect(prompt.systemInstruction).toContain("weekly-strategy-ranked-v1.3.0");
    expect(prompt.systemInstruction).toContain("Do NOT invent");
    expect(prompt.systemInstruction).toContain("NO original_concept");
    expect(prompt.systemInstruction).toContain("Do NOT rename, healthify");
    expect(prompt.systemInstruction).toContain("Variety is a constraint to prevent boredom");
    expect(prompt.systemInstruction).toContain("WEEKLY REPERTOIRE FIRST");
    expect(prompt.systemInstruction).toContain("schedule ONLY from that chosen repertoire");
    expect(prompt.systemInstruction).toContain("prefer 7–9 unique candidates overall");
    expect(prompt.systemInstruction).toContain("Absolute hard maximum: 10 unique candidates");
    expect(prompt.systemInstruction).toContain(
      "A strategy above the hard maximum is INVALID and will be rejected by the server",
    );
    expect(prompt.systemInstruction).toContain("Above hard max 10 is INVALID");
    expect(prompt.systemInstruction).toContain("3–4 unique lunch candidates");
    expect(prompt.systemInstruction).toContain("4–5 unique dinner candidates");
    expect(prompt.systemInstruction).toContain("LUNCH REPERTOIRE");
    expect(prompt.systemInstruction).toContain("fully_prepped");
    expect(prompt.systemInstruction).toContain("component_prepped");
    expect(prompt.systemInstruction).toContain(
      "Similarity should affect scheduling of the repertoire",
    );
    expect(prompt.systemInstruction).toContain(
      "Do not infer piggyback prep merely because two dishes probably contain aromatics",
    );
    expect(prompt.systemInstruction).toContain("weekly prep practicality");
    expect(prompt.systemInstruction).toContain("Do not create a restaurant tasting-menu week");
    expect(prompt.systemInstruction).toContain("Repetition is a useful meal-prep tool");
    expect(prompt.systemInstruction).toContain("When uncertain, use independent_meal_prep");
    expect(prompt.systemInstruction).not.toMatch(/always choose the highest-ranked/i);
    expect(prompt.systemInstruction).toContain("COMPLETE MEAL CONCEPTS");
    expect(prompt.systemInstruction).toContain("Ingredient/component reuse is NOT meal repetition");
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
    expect(prompt.userPrompt).not.toContain("useDinnerPrepForNextLunch:");
    expect(prompt.userPrompt).toContain("targetCaloriesPerDay: 2200");
    expect(prompt.systemInstruction).toContain("Use piggyback_prep ONLY when candidate metadata");
    expect(prompt.systemInstruction).toContain("AUTOMATIC optimization opportunity");
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

  it("still allows piggyback and leftover when the deprecated dinner-prep flag is false", () => {
    const request = sampleRankedWeeklyStrategyRequest({
      cookingPreferences: {
        ...sampleRankedWeeklyStrategyRequest().cookingPreferences,
        useDinnerPrepForNextLunch: false,
      },
    });
    const result = validateRankedWeeklyStrategy(clonePayload(), request, metadata);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const piggyback = result.value.days.find(
        (day) => day.lunch.lunchPreparationStrategy === "piggyback_prep",
      );
      expect(piggyback).toBeTruthy();
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
  it("calculates deterministic quality and complexity diagnostics", () => {
    const request = sampleRankedWeeklyStrategyRequest();
    const validated = validateRankedWeeklyStrategy(clonePayload(), request, metadata);
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    const stats = calculateRankedWeeklyStrategyQualityStats(validated.value, request);
    expect(stats.totalMealSlots).toBe(14);
    expect(stats.uniqueCandidateCount).toBe(validated.value.uniqueCandidateIds.length);
    expect(stats.uniqueCandidateCount).toBe(8);
    expect(stats.uniqueLunchCandidateCount).toBe(4);
    expect(stats.uniqueDinnerCandidateCount).toBe(5);
    expect(stats.repeatedMealSlotCount).toBe(14 - stats.uniqueCandidateCount);
    expect(stats.uniqueCuisineCount).toBeGreaterThan(1);
    expect(stats.uniqueProteinCount).toBeGreaterThan(1);
    expect(stats.uniqueCookingTechniqueCount).toBeGreaterThan(0);
    expect(stats.uniqueFlavorFamilyCount).toBeGreaterThan(1);
    expect(stats.fullyPreppedUniqueCandidateCount).toBeGreaterThan(0);
    expect(stats.directLeftoverLunchCount).toBe(1);
    expect(stats.piggybackLunchCount).toBe(1);
    expect(stats.independentLunchCount).toBe(5);
    expect(stats.complexityStatus).toBe("within_preferred_range");
    expect(stats.preferredUniqueCandidateRange).toEqual({ min: 7, max: 9 });
    expect(stats.hardMaxUniqueCandidates).toBe(10);
    expect(stats.candidateUsage.length).toBe(stats.uniqueCandidateCount);
    expect(stats.averageCandidateRank).toBeGreaterThan(0);
    const andhraUsage = stats.candidateUsage.find(
      (item) => item.candidateId === "andhra-green-chilli-chicken",
    );
    expect(andhraUsage?.count).toBe(2);
    expect(andhraUsage?.slots).toEqual([
      { day: "monday", mealType: "lunch" },
      { day: "thursday", mealType: "lunch" },
    ]);
  });

  it("exposes complete-plate reuse and complexity as ranking diagnostics", () => {
    const request = sampleRankedWeeklyStrategyRequest({
      mealConceptsByCandidateId: {
        "andhra-green-chilli-chicken": {
          candidateId: "andhra-green-chilli-chicken",
          name: "Andhra Green Chilli Chicken",
          main: {
            componentId: "main",
            role: "main",
            name: "Andhra Green Chilli Chicken",
            relationship: "intrinsic",
            source: "candidate",
            reason: "main",
            definitionKind: "recipe_component",
            normalizedComponentKey: "main:andhra green chilli chicken",
          },
          components: [
            {
              componentId: "rice",
              role: "carbohydrate",
              name: "basmati rice",
              relationship: "required_companion",
              source: "composition_engine",
              reason: "starch",
              definitionKind: "atomic_food",
              normalizedComponentKey: "carbohydrate:basmati rice",
            },
            {
              componentId: "salad",
              role: "vegetable",
              name: "kachumber",
              relationship: "required_companion",
              source: "composition_engine",
              reason: "salad",
              definitionKind: "recipe_component",
              normalizedComponentKey: "vegetable:kachumber",
            },
          ],
          compositionProfile: {
            hasPrimaryProtein: true,
            hasMeaningfulCarbohydrate: true,
            hasMeaningfulVegetableOrFruit: true,
            hasMeaningfulFiberSource: true,
            hasSauceOrMoistureComponent: false,
            addedComponentRoles: ["carbohydrate", "vegetable"],
          },
          metadata: {
            promptVersion: "meal-composition-v2",
            policyVersion: "meal-composition-v1",
            createdAt: "2026-09-16T00:00:00.000Z",
          },
        },
        "kerala-meen-pollichathu": {
          candidateId: "kerala-meen-pollichathu",
          name: "Kerala Meen Pollichathu",
          main: {
            componentId: "main",
            role: "main",
            name: "Kerala Meen Pollichathu",
            relationship: "intrinsic",
            source: "candidate",
            reason: "main",
            definitionKind: "recipe_component",
            normalizedComponentKey: "main:kerala meen pollichathu",
          },
          components: [
            {
              componentId: "rice",
              role: "carbohydrate",
              name: "basmati rice",
              relationship: "required_companion",
              source: "composition_engine",
              reason: "starch",
              definitionKind: "atomic_food",
              normalizedComponentKey: "carbohydrate:basmati rice",
            },
          ],
          compositionProfile: {
            hasPrimaryProtein: true,
            hasMeaningfulCarbohydrate: true,
            hasMeaningfulVegetableOrFruit: false,
            hasMeaningfulFiberSource: false,
            hasSauceOrMoistureComponent: true,
            addedComponentRoles: ["carbohydrate"],
          },
          metadata: {
            promptVersion: "meal-composition-v2",
            policyVersion: "meal-composition-v1",
            createdAt: "2026-09-16T00:00:00.000Z",
          },
        },
      },
    });
    const prompt = buildRankedWeeklyStrategyPrompt(request);
    expect(prompt.userPrompt).toMatch(/basmati rice/i);
    expect(prompt.userPrompt).toMatch(/used by 2 meals/i);
    const validated = validateRankedWeeklyStrategy(clonePayload(), request, metadata);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const stats = calculateRankedWeeklyStrategyQualityStats(validated.value, request);
    expect(stats.reusedComponentsInSelectedWeek).toBeGreaterThan(0);
    expect(stats.componentReuse?.some((entry) => /basmati rice/i.test(entry.name))).toBe(true);
    expect(stats.componentComplexitySignal).toMatch(/compact_reusable|mixed|high_unique_sides/);
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

describe("weekly variety complexity policy", () => {
  it("centralizes simple/balanced/high preferred and hard ranges", () => {
    expect(WEEKLY_VARIETY_COMPLEXITY_POLICY).toEqual({
      simple: {
        minPreferredUniqueCandidates: 5,
        maxPreferredUniqueCandidates: 7,
        maxHardUniqueCandidates: 8,
        minPreferredUniqueLunchCandidates: 2,
        maxPreferredUniqueLunchCandidates: 3,
        minPreferredUniqueDinnerCandidates: 3,
        maxPreferredUniqueDinnerCandidates: 4,
      },
      balanced: {
        minPreferredUniqueCandidates: 7,
        maxPreferredUniqueCandidates: 9,
        maxHardUniqueCandidates: 10,
        minPreferredUniqueLunchCandidates: 3,
        maxPreferredUniqueLunchCandidates: 4,
        minPreferredUniqueDinnerCandidates: 4,
        maxPreferredUniqueDinnerCandidates: 5,
      },
      high: {
        minPreferredUniqueCandidates: 9,
        maxPreferredUniqueCandidates: 12,
        maxHardUniqueCandidates: 13,
        minPreferredUniqueLunchCandidates: 4,
        maxPreferredUniqueLunchCandidates: 5,
        minPreferredUniqueDinnerCandidates: 5,
        maxPreferredUniqueDinnerCandidates: 6,
      },
    });
    expect(getWeeklyVarietyComplexityPolicy("balanced").maxHardUniqueCandidates).toBe(10);
  });

  it("classifies Balanced boundaries: 8/9 within, 10 above, 11+ excessive", () => {
    const policy = getWeeklyVarietyComplexityPolicy("balanced");
    expect(classifyWeeklyComplexityStatus(8, policy)).toBe("within_preferred_range");
    expect(classifyWeeklyComplexityStatus(9, policy)).toBe("within_preferred_range");
    expect(classifyWeeklyComplexityStatus(10, policy)).toBe("above_preferred_range");
    expect(classifyWeeklyComplexityStatus(11, policy)).toBe("excessive");
  });

  it("classifies Simple and High analogous boundaries", () => {
    const simple = getWeeklyVarietyComplexityPolicy("simple");
    expect(classifyWeeklyComplexityStatus(7, simple)).toBe("within_preferred_range");
    expect(classifyWeeklyComplexityStatus(8, simple)).toBe("above_preferred_range");
    expect(classifyWeeklyComplexityStatus(9, simple)).toBe("excessive");

    const high = getWeeklyVarietyComplexityPolicy("high");
    expect(classifyWeeklyComplexityStatus(12, high)).toBe("within_preferred_range");
    expect(classifyWeeklyComplexityStatus(13, high)).toBe("above_preferred_range");
    expect(classifyWeeklyComplexityStatus(14, high)).toBe("excessive");
  });

  it("evaluates complexity stats for Balanced acceptance bands", () => {
    const request = sampleRankedWeeklyStrategyRequest();
    for (const [uniqueCount, status] of [
      [8, "within_preferred_range"],
      [9, "within_preferred_range"],
      [10, "above_preferred_range"],
      [11, "excessive"],
    ] as const) {
      const validated = validateRankedWeeklyStrategy(
        sampleRankedWeekPayloadWithUniqueCount(uniqueCount),
        request,
        metadata,
      );
      expect(validated.ok).toBe(true);
      if (!validated.ok) {
        continue;
      }
      const evaluation = evaluateWeeklyComplexity(validated.value, request);
      expect(evaluation.uniqueCandidateCount).toBe(uniqueCount);
      expect(evaluation.status).toBe(status);
      const stats = calculateRankedWeeklyStrategyQualityStats(validated.value, request);
      expect(stats.complexityStatus).toBe(status);
      expect(stats.uniqueLunchCandidateCount).toBeGreaterThan(0);
      expect(stats.uniqueDinnerCandidateCount).toBeGreaterThan(0);
    }
  });

  it("builds corrective retry feedback for excessive weeks", () => {
    const request = sampleRankedWeeklyStrategyRequest();
    const validated = validateRankedWeeklyStrategy(
      sampleRankedWeekPayloadWithUniqueCount(13),
      request,
      metadata,
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    const evaluation = evaluateWeeklyComplexity(validated.value, request);
    expect(evaluation.status).toBe("excessive");
    const feedback = buildComplexityRetryFeedback(request, evaluation);
    expect(feedback).toContain("13 unique candidates");
    expect(feedback).toContain("compact weekly repertoire");
    expect(feedback).toContain("Preferred: 7–9 unique candidates total");
    expect(feedback).toContain("Absolute maximum: 10 unique candidates total");
    expect(feedback).toContain("3–4 unique lunch candidates");
    expect(feedback).toContain("4–5 unique dinner candidates");
    expect(feedback).toContain("Increase strategic repetition");
  });

  it("allows strategic repetition without treating it as a structural failure", () => {
    const result = validateRankedWeeklyStrategy(
      clonePayload(),
      sampleRankedWeeklyStrategyRequest(),
      metadata,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const lunchRepeats = result.value.days.filter(
      (day) => day.lunch.candidateId === "andhra-green-chilli-chicken",
    );
    const dinnerRepeats = result.value.days.filter(
      (day) => day.dinner.candidateId === "kerala-meen-pollichathu",
    );
    expect(lunchRepeats.length).toBe(2);
    expect(dinnerRepeats.length).toBe(2);
  });
});
