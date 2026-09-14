import { describe, expect, it } from "vitest";
import type { CandidateRankingRequest, CulinaryDiscoveryCandidate } from "@fitness-autopilot/contracts";
import {
  ANDHRA_GREEN_CHILLI_CHICKEN,
  CAJUN_BLACKENED_REDFISH,
  CHICKEN_SCALOPPINE_AL_LIMONE,
  CHICKEN_TIKKA,
  FISH_TIKKA,
  GRILLED_CHICKEN_BOWL,
  KERALA_MEEN_POLLICHATHU,
  PANEER_TIKKA,
  PESCADO_VERACRUZANA,
  PESCADO_ZARANDEADO,
  SCENARIO_A_TIKKA_REDUNDANCY,
  SCENARIO_B_FISH_DIVERSITY,
  SCENARIO_C_LARGE_MIXED_POOL,
  makeRankingCandidate,
} from "./candidate-ranking-fixtures";
import {
  CANDIDATE_RANKING_POLICY_VERSION,
  CANDIDATE_RANKING_WEIGHTS,
  CULINARY_SIMILARITY_WEIGHTS,
  NEAR_DUPLICATE_THRESHOLD,
  NEUTRAL_NOVELTY_SCORE,
  SIMILARITY_PENALTY_THRESHOLD,
  classifyCulinarySimilarity,
  composeRankingScore,
  computeCandidateSimilarity,
  inspectableRankingScores,
  rankCulinaryCandidates,
  scoreCandidateBase,
  scoreCulinaryInterest,
  scoreNovelty,
  strongestSimilarityDiagnostic,
} from "./candidate-ranking";

function request(
  overrides: Partial<CandidateRankingRequest> & Pick<CandidateRankingRequest, "candidates">,
): CandidateRankingRequest {
  return {
    mealType: "dinner",
    userPreferences: {},
    targetPoolSize: 12,
    ...overrides,
  };
}

function requireRanked(input: CandidateRankingRequest) {
  const ranked = rankCulinaryCandidates(input);
  expect(ranked.ok).toBe(true);
  if (!ranked.ok) {
    throw new Error(ranked.error.message);
  }
  return ranked.value;
}

function naiveTopIds(candidates: readonly CulinaryDiscoveryCandidate[], n: number, payload: CandidateRankingRequest) {
  return [...candidates]
    .map((candidate) => scoreCandidateBase(candidate, payload))
    .sort((a, b) => {
      if (b.scoreWithoutSimilarity !== a.scoreWithoutSimilarity) {
        return b.scoreWithoutSimilarity - a.scoreWithoutSimilarity;
      }
      return a.candidate.candidateId.localeCompare(b.candidate.candidateId);
    })
    .slice(0, n)
    .map((item) => item.candidate.candidateId);
}

function fishPair(a: CulinaryDiscoveryCandidate, b: CulinaryDiscoveryCandidate) {
  return computeCandidateSimilarity(a, b);
}

describe("PLAN-006.1 tikka cluster", () => {
  it("scores tikka variants highly similar even when protein changes", () => {
    const pairs = [
      computeCandidateSimilarity(CHICKEN_TIKKA, PANEER_TIKKA),
      computeCandidateSimilarity(CHICKEN_TIKKA, FISH_TIKKA),
      computeCandidateSimilarity(PANEER_TIKKA, FISH_TIKKA),
    ];
    for (const pair of pairs) {
      expect(pair.score).toBeGreaterThanOrEqual(NEAR_DUPLICATE_THRESHOLD);
      expect(pair.classification).toBe("near_duplicate");
      expect(pair.signals.samePrimaryProtein).toBe(false);
      expect(pair.signals.sameCanonicalDish).toBe(true);
      expect(pair.signals.sameDishFormat).toBe(true);
      expect(pair.signals.sameCuisineFamily).toBe(true);
      expect(pair.signals.sharedFlavorFamilies.length).toBeGreaterThanOrEqual(2);
      expect(pair.signals.sharedTechniques.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not treat a protein swap as culinary independence", () => {
    const proteinSwap = computeCandidateSimilarity(CHICKEN_TIKKA, PANEER_TIKKA);
    const differentDish = computeCandidateSimilarity(CHICKEN_TIKKA, ANDHRA_GREEN_CHILLI_CHICKEN);
    expect(proteinSwap.signals.samePrimaryProtein).toBe(false);
    expect(differentDish.signals.samePrimaryProtein).toBe(true);
    expect(proteinSwap.score).toBeGreaterThan(differentDish.score);
    expect(proteinSwap.score - differentDish.score).toBeGreaterThan(
      CULINARY_SIMILARITY_WEIGHTS.primaryProtein,
    );
  });

  it("runs the full pipeline: one tikka stays competitive, weaker clones are duplicates, pool is more diverse than base-score sort", () => {
    const payload = request({
      candidates: SCENARIO_A_TIKKA_REDUNDANCY,
      targetPoolSize: 6,
    });
    const result = requireRanked(payload);
    const byId = Object.fromEntries(
      [...result.selected, ...result.deprioritized].map((item) => [item.candidate.candidateId, item]),
    );
    const tikkaItems = [byId["tikka-chicken"], byId["tikka-paneer"], byId["tikka-fish"]];
    const selectedTikka = tikkaItems.filter((item) => item?.decision === "selected");
    const duplicateTikka = tikkaItems.filter((item) => item?.decision === "duplicate");
    expect(selectedTikka).toHaveLength(1);
    expect(duplicateTikka.length).toBeGreaterThanOrEqual(2);
    expect(selectedTikka[0]?.scoreBreakdown.similarityPenalty).toBe(0);
    expect(selectedTikka[0]?.baseScore).toBe(selectedTikka[0]?.score);
    for (const clone of duplicateTikka) {
      expect(clone?.scoreBreakdown.similarityPenalty).toBe(1);
      expect(clone?.similarToCandidateIds).toContain(selectedTikka[0]?.candidate.candidateId);
      expect(clone!.baseScore).toBeGreaterThan(clone!.score);
    }

    const naiveIds = naiveTopIds(SCENARIO_A_TIKKA_REDUNDANCY, 6, payload);
    const selectedIds = result.selected.map((item) => item.candidate.candidateId);
    const naiveTikkaCount = naiveIds.filter((id) => id.includes("tikka")).length;
    const selectedTikkaCount = selectedIds.filter((id) => id.includes("tikka")).length;
    expect(naiveTikkaCount).toBeGreaterThan(selectedTikkaCount);
    expect(selectedIds).toContain("andhra-green-chilli-chicken");
  });
});

describe("PLAN-006.1 fish diversity", () => {
  const fishPairs = [
    fishPair(KERALA_MEEN_POLLICHATHU, PESCADO_ZARANDEADO),
    fishPair(KERALA_MEEN_POLLICHATHU, PESCADO_VERACRUZANA),
    fishPair(KERALA_MEEN_POLLICHATHU, CAJUN_BLACKENED_REDFISH),
    fishPair(PESCADO_ZARANDEADO, PESCADO_VERACRUZANA),
    fishPair(PESCADO_ZARANDEADO, CAJUN_BLACKENED_REDFISH),
    fishPair(PESCADO_VERACRUZANA, CAJUN_BLACKENED_REDFISH),
  ];

  it("does not collapse distinct fish dishes into near-duplicates", () => {
    for (const pair of fishPairs) {
      expect(pair.signals.samePrimaryProtein).toBe(true);
      expect(pair.score).toBeLessThan(NEAR_DUPLICATE_THRESHOLD);
      expect(pair.score).toBeLessThan(SIMILARITY_PENALTY_THRESHOLD);
      expect(pair.classification).toBeUndefined();
    }
  });

  it("shows differences across cuisine, flavor, technique, format, texture, and experience", () => {
    const pair = computeCandidateSimilarity(KERALA_MEEN_POLLICHATHU, PESCADO_ZARANDEADO);
    expect(pair.signals.sameCuisineFamily).toBe(false);
    expect(pair.signals.sameRegionalStyle).toBe(false);
    expect(pair.signals.sameDishFormat).toBe(false);
    expect(pair.signals.sharedFlavorFamilies).toEqual([]);
    expect(pair.signals.sharedTechniques).toEqual([]);
  });

  it("lets several or all diverse fish dishes coexist in the selected pool", () => {
    const result = requireRanked(
      request({
        candidates: SCENARIO_B_FISH_DIVERSITY,
        targetPoolSize: 4,
      }),
    );
    expect(result.selected).toHaveLength(4);
    expect(result.stats.duplicateCount).toBe(0);
    expect(result.similarities ?? []).toEqual([]);
  });

  it("proves same protein alone contributes relatively little to culinary similarity", () => {
    const sameProteinOnly = computeCandidateSimilarity(
      makeRankingCandidate({
        candidateId: "protein-a",
        name: "Alpha Coastal Stew",
        cuisineFamily: "Indian",
        regionalStyle: "Kerala",
        primaryProtein: "Fish",
        dishFormat: "banana-leaf parcel",
        flavorFamilies: ["coconut", "mustard"],
        cookingTechniques: ["banana-leaf roast"],
        textureTags: ["moist"],
        experienceTags: ["saucy_flavorful"],
      }),
      makeRankingCandidate({
        candidateId: "protein-b",
        name: "Bravo Woodfire Fillet",
        cuisineFamily: "Mexican",
        regionalStyle: "Nayarit",
        primaryProtein: "Fish",
        dishFormat: "butterflied grilled fish",
        flavorFamilies: ["chile", "citrus"],
        cookingTechniques: ["open-fire grill"],
        textureTags: ["charred"],
        experienceTags: ["smoky"],
      }),
    );
    expect(sameProteinOnly.signals.samePrimaryProtein).toBe(true);
    expect(sameProteinOnly.score).toBeLessThanOrEqual(CULINARY_SIMILARITY_WEIGHTS.primaryProtein + 0.02);
    expect(sameProteinOnly.score).toBeLessThan(SIMILARITY_PENALTY_THRESHOLD / 4);

    const tikkaDifferentProtein = computeCandidateSimilarity(CHICKEN_TIKKA, PANEER_TIKKA);
    expect(tikkaDifferentProtein.signals.samePrimaryProtein).toBe(false);
    expect(tikkaDifferentProtein.score).toBeGreaterThan(sameProteinOnly.score + 0.5);
  });
});

describe("PLAN-006.1 similarity thresholds", () => {
  it("classifies scores at the documented thresholds", () => {
    expect(classifyCulinarySimilarity(SIMILARITY_PENALTY_THRESHOLD - 0.01)).toBeUndefined();
    expect(classifyCulinarySimilarity(SIMILARITY_PENALTY_THRESHOLD)).toBe("similar");
    expect(classifyCulinarySimilarity(0.6)).toBe("similar");
    expect(classifyCulinarySimilarity(NEAR_DUPLICATE_THRESHOLD)).toBe("near_duplicate");
    expect(NEAR_DUPLICATE_THRESHOLD).toBe(0.78);
    expect(SIMILARITY_PENALTY_THRESHOLD).toBe(0.48);
  });
});

describe("PLAN-006.1 iterative selection pipeline", () => {
  it("recalculates similarity penalties against the already-selected pool", () => {
    const payload = request({
      candidates: [CHICKEN_TIKKA, PANEER_TIKKA, ANDHRA_GREEN_CHILLI_CHICKEN],
      targetPoolSize: 3,
    });
    const isolatedPaneer = scoreCandidateBase(PANEER_TIKKA, payload);
    expect(isolatedPaneer.scoreWithoutSimilarity).toBe(
      composeRankingScore({ ...isolatedPaneer.breakdown, similarityPenalty: 0 }),
    );

    const result = requireRanked(payload);
    const first = result.selected[0];
    const paneer = [...result.selected, ...result.deprioritized].find(
      (item) => item.candidate.candidateId === "tikka-paneer",
    );
    expect(first?.scoreBreakdown.similarityPenalty).toBe(0);
    expect(paneer).toBeDefined();
    expect(paneer!.scoreBreakdown.similarityPenalty).toBeGreaterThan(0);
    expect(paneer!.similarToCandidateIds).toContain(first?.candidate.candidateId);
    const inspectable = inspectableRankingScores(paneer!.scoreBreakdown);
    expect(paneer!.baseScore).toBe(inspectable.baseScore);
    expect(paneer!.score).toBe(inspectable.effectiveScore);
    expect(paneer!.baseScore).toBe(isolatedPaneer.scoreWithoutSimilarity);
    expect(paneer!.score).toBeLessThan(paneer!.baseScore);
  });

  it("differs from naive base-score top-8 on the large mixed fixture", () => {
    expect(SCENARIO_C_LARGE_MIXED_POOL.length).toBeGreaterThanOrEqual(15);
    const payload = request({
      candidates: SCENARIO_C_LARGE_MIXED_POOL,
      targetPoolSize: 8,
    });
    const result = requireRanked(payload);
    expect(result.selected).toHaveLength(8);

    const naiveIds = naiveTopIds(SCENARIO_C_LARGE_MIXED_POOL, 8, payload);
    const selectedIds = result.selected.map((item) => item.candidate.candidateId);
    expect(selectedIds).not.toEqual(naiveIds);

    const movedDown = naiveIds.filter((id) => !selectedIds.includes(id));
    const movedUp = selectedIds.filter((id) => !naiveIds.includes(id));
    expect(movedDown.length).toBeGreaterThan(0);
    expect(movedUp.length).toBeGreaterThan(0);

    const redundantMovedDown = movedDown.some(
      (id) => id.includes("tikka") || id === "tandoori-chicken",
    );
    expect(redundantMovedDown).toBe(true);

    const selectedTikka = selectedIds.filter((id) => id.includes("tikka"));
    expect(selectedTikka.length).toBeLessThanOrEqual(1);
    expect(result.stats.uniqueCuisineCount).toBeGreaterThanOrEqual(4);
  });

  it("keeps the stronger near-duplicate and marks the weaker one duplicate", () => {
    const result = requireRanked(
      request({
        candidates: [CHICKEN_TIKKA, PANEER_TIKKA],
        targetPoolSize: 2,
      }),
    );
    const selected = result.selected[0];
    const duplicate = result.deprioritized.find((item) => item.decision === "duplicate");
    expect(selected?.decision).toBe("selected");
    expect(duplicate).toBeDefined();
    expect(selected!.baseScore).toBeGreaterThanOrEqual(duplicate!.baseScore);
    expect(duplicate!.scoreBreakdown.similarityPenalty).toBe(1);
    expect(duplicate!.similarToCandidateIds).toContain(selected!.candidate.candidateId);
  });

  it("populates similarity diagnostics for pairs that penalize or duplicate", () => {
    const result = requireRanked(
      request({
        candidates: SCENARIO_A_TIKKA_REDUNDANCY,
        targetPoolSize: 6,
      }),
    );
    const similarities = result.similarities ?? [];
    expect(similarities.length).toBeGreaterThan(0);
    expect(similarities.every((item) => item.score >= SIMILARITY_PENALTY_THRESHOLD)).toBe(true);
    expect(similarities.some((item) => item.classification === "near_duplicate")).toBe(true);

    const paneerVsChicken = similarities.find(
      (item) =>
        (item.candidateAId === "tikka-chicken" && item.candidateBId === "tikka-paneer") ||
        (item.candidateAId === "tikka-paneer" && item.candidateBId === "tikka-chicken"),
    );
    expect(paneerVsChicken?.classification).toBe("near_duplicate");
    expect(paneerVsChicken?.signals.sharedFlavorFamilies.length).toBeGreaterThan(0);

    const paneer = result.deprioritized.find((item) => item.candidate.candidateId === "tikka-paneer");
    const strongest = strongestSimilarityDiagnostic(similarities, "tikka-paneer");
    expect(paneer?.scoreBreakdown.similarityPenalty).toBeGreaterThan(0);
    expect(strongest?.score).toBeGreaterThanOrEqual(NEAR_DUPLICATE_THRESHOLD);
  });

  it("keeps baseScore as the isolated score and score as effective score", () => {
    const result = requireRanked(
      request({
        candidates: [CHICKEN_TIKKA, PANEER_TIKKA, ANDHRA_GREEN_CHILLI_CHICKEN],
        targetPoolSize: 2,
      }),
    );
    for (const item of [...result.selected, ...result.deprioritized]) {
      const inspectable = inspectableRankingScores(item.scoreBreakdown);
      expect(item.baseScore).toBe(inspectable.baseScore);
      expect(item.score).toBe(inspectable.effectiveScore);
      expect(item.score).toBe(
        composeRankingScore(item.scoreBreakdown),
      );
      if (item.scoreBreakdown.similarityPenalty === 0) {
        expect(item.score).toBe(item.baseScore);
      } else {
        expect(item.score).toBeLessThan(item.baseScore);
        expect(inspectable.similarityDelta).toBeCloseTo(
          CANDIDATE_RANKING_WEIGHTS.similarityPenalty * item.scoreBreakdown.similarityPenalty * 100,
          2,
        );
      }
    }
  });
});

describe("PLAN-006.1 determinism", () => {
  it("uses candidate id as a stable tie-breaker independent of input order", () => {
    const shared = {
      cuisineFamily: "Italian",
      regionalStyle: "Lazio",
      primaryProtein: "Chicken",
      dishFormat: "pan sauce cutlet",
      flavorFamilies: ["lemon", "white wine"],
      cookingTechniques: ["quick pan sauce"],
      textureTags: ["silky"],
      experienceTags: ["bright"],
      fitnessAdaptability: "easy" as const,
      mealPrepAdaptability: "quick_fresh_finish" as const,
      estimatedFinishMinutesAfterPrep: 10,
      discoveryConfidence: "high" as const,
      source: {
        name: "NYT Cooking",
        url: "https://cooking.nytimes.com/recipes/tie-break",
        author: "NYT Cooking",
      },
    };
    const alpha = makeRankingCandidate({
      ...shared,
      candidateId: "tie-alpha",
      name: "Alpha Lemon Cutlet",
    });
    const omega = makeRankingCandidate({
      ...shared,
      candidateId: "tie-omega",
      name: "Omega Lemon Cutlet",
    });
    expect(scoreCandidateBase(alpha, request({ candidates: [alpha, omega] })).scoreWithoutSimilarity).toBe(
      scoreCandidateBase(omega, request({ candidates: [alpha, omega] })).scoreWithoutSimilarity,
    );

    const forward = requireRanked(request({ candidates: [omega, alpha], targetPoolSize: 2 }));
    const reverse = requireRanked(request({ candidates: [alpha, omega], targetPoolSize: 2 }));
    expect(forward.selected[0]?.candidate.candidateId).toBe("tie-alpha");
    expect(reverse.selected[0]?.candidate.candidateId).toBe("tie-alpha");
  });

  it("returns identical ranking, penalties, and diagnostics on repeated execution", () => {
    const payload = request({
      candidates: SCENARIO_C_LARGE_MIXED_POOL,
      userPreferences: { cuisines: ["Indian", "Mexican"] },
      cookingPreferences: { cookingStyle: "ready_lunch_fresh_dinner", maxFinishMinutes: 10 },
      recentConcepts: [{ name: "Chicken Tikka", lastSuggestedDaysAgo: 2, timesSuggestedLast30Days: 1 }],
      targetPoolSize: 8,
    });
    const first = requireRanked(payload);
    const second = requireRanked(payload);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("PLAN-006.1 culinary interest and novelty", () => {
  it("does not trivially saturate across realistic fixtures", () => {
    const fixtures = [
      GRILLED_CHICKEN_BOWL,
      CHICKEN_TIKKA,
      CHICKEN_SCALOPPINE_AL_LIMONE,
      KERALA_MEEN_POLLICHATHU,
      PESCADO_ZARANDEADO,
      ANDHRA_GREEN_CHILLI_CHICKEN,
    ];
    const scores = fixtures.map((candidate) => scoreCulinaryInterest(candidate));
    const unique = new Set(scores);
    expect(unique.size).toBeGreaterThan(2);
    expect(Math.max(...scores)).toBeLessThan(0.95);
    expect(scoreCulinaryInterest(GRILLED_CHICKEN_BOWL)).toBeLessThan(
      scoreCulinaryInterest(CHICKEN_SCALOPPINE_AL_LIMONE),
    );
    expect(scoreCulinaryInterest(CHICKEN_SCALOPPINE_AL_LIMONE)).toBeLessThanOrEqual(
      scoreCulinaryInterest(KERALA_MEEN_POLLICHATHU) + 0.12,
    );
    expect(scoreCulinaryInterest(KERALA_MEEN_POLLICHATHU)).toBeGreaterThan(0.6);
  });

  it("keeps novelty neutralized at the constant contribution", () => {
    for (const candidate of SCENARIO_C_LARGE_MIXED_POOL) {
      expect(scoreNovelty(candidate)).toBe(NEUTRAL_NOVELTY_SCORE);
    }
  });
});

describe("PLAN-006.1 diagnostics naming and pool-size edges", () => {
  it("counts unique flavor families, not a fake profile total", () => {
    const result = requireRanked(
      request({
        candidates: [CHICKEN_TIKKA, PESCADO_ZARANDEADO],
        targetPoolSize: 2,
      }),
    );
    const families = new Set(
      result.selected.flatMap((item) => item.candidate.flavorFamilies.map((tag) => tag.toLowerCase())),
    );
    expect(result.stats.uniqueFlavorFamilyCount).toBe(families.size);
    expect(result.stats).not.toHaveProperty("uniqueFlavorProfileCount");
  });

  it("selects the full input when targetPoolSize is larger, without padding", () => {
    const result = requireRanked(
      request({
        candidates: SCENARIO_B_FISH_DIVERSITY,
        targetPoolSize: 12,
      }),
    );
    expect(result.stats.inputCandidateCount).toBe(4);
    expect(result.selected).toHaveLength(4);
    expect(result.deprioritized).toHaveLength(0);
    expect(result.policy.version).toBe(CANDIDATE_RANKING_POLICY_VERSION);
  });

  it("caps the selected pool when targetPoolSize is smaller than input", () => {
    const result = requireRanked(
      request({
        candidates: SCENARIO_C_LARGE_MIXED_POOL,
        targetPoolSize: 8,
      }),
    );
    expect(result.stats.inputCandidateCount).toBeGreaterThan(8);
    expect(result.selected).toHaveLength(8);
    expect(result.deprioritized.length).toBeGreaterThan(0);
  });
});
