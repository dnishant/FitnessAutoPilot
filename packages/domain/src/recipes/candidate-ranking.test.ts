import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CandidateRankingRequest } from "@fitness-autopilot/contracts";
import {
  ANDHRA_GREEN_CHILLI_CHICKEN,
  CAJUN_BLACKENED_REDFISH,
  CHICKEN_TIKKA,
  FISH_TIKKA,
  FRESH_ONLY_LONG_DINNER,
  GRILLED_CHICKEN_BOWL,
  KERALA_BEEF_FRY,
  KERALA_MEEN_POLLICHATHU,
  PANEER_TIKKA,
  PESCADO_VERACRUZANA,
  PESCADO_ZARANDEADO,
  POLLO_PIPIAN_VERDE,
  QUICK_FRESH_DINNER,
  SCENARIO_A_TIKKA_REDUNDANCY,
  SCENARIO_B_FISH_DIVERSITY,
  SCENARIO_PLAN006_MIX,
  makeRankingCandidate,
} from "./candidate-ranking-fixtures";
import {
  CANDIDATE_RANKING_POLICY_VERSION,
  CANDIDATE_RANKING_WEIGHTS,
  CULINARY_SIMILARITY_WEIGHTS,
  DEFAULT_TARGET_POOL_SIZE,
  NEAR_DUPLICATE_THRESHOLD,
  SIMILARITY_PENALTY_THRESHOLD,
  SOURCE_QUALITY_SCORES,
  canonicalDishKey,
  classifySourceQuality,
  composeRankingScore,
  computeCandidateSimilarity,
  parseCandidateRankingRequest,
  proteinSimilarityWeightIsLow,
  rankCulinaryCandidates,
  recencyDecayFactor,
  repetitionFrequencyFactor,
  scoreCandidateBase,
  scoreCulinaryInterest,
  scoreFitnessAdaptability,
  scoreNovelty,
  scorePrepFit,
  scoreRepetitionPenalty,
  scoreSourceQuality,
  scoreUserPreferenceFit,
  similarityPenaltyFromScore,
} from "./candidate-ranking";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function request(
  overrides: Partial<CandidateRankingRequest> &
    Pick<CandidateRankingRequest, "candidates">,
): CandidateRankingRequest {
  return {
    mealType: "dinner",
    userPreferences: {},
    targetPoolSize: 12,
    ...overrides,
  };
}

describe("candidate ranking policy", () => {
  it("versions the policy as candidate-ranking-v1", () => {
    expect(CANDIDATE_RANKING_POLICY_VERSION).toBe("candidate-ranking-v1");
    expect(DEFAULT_TARGET_POOL_SIZE).toBe(12);
  });

  it("keeps protein similarity weight lower than flavor, technique, and format", () => {
    expect(proteinSimilarityWeightIsLow()).toBe(true);
    expect(CULINARY_SIMILARITY_WEIGHTS.primaryProtein).toBeLessThan(
      CULINARY_SIMILARITY_WEIGHTS.flavorFamilies,
    );
    expect(CULINARY_SIMILARITY_WEIGHTS.primaryProtein).toBeLessThan(
      CULINARY_SIMILARITY_WEIGHTS.cookingTechniques,
    );
    expect(CULINARY_SIMILARITY_WEIGHTS.primaryProtein).toBeLessThan(
      CULINARY_SIMILARITY_WEIGHTS.dishFormat,
    );
  });

  it("centralizes score weights without burying magic numbers", () => {
    expect(CANDIDATE_RANKING_WEIGHTS.fitnessAdaptability).toBeLessThan(
      CANDIDATE_RANKING_WEIGHTS.culinaryInterest,
    );
    expect(CANDIDATE_RANKING_WEIGHTS.fitnessAdaptability).toBeLessThan(
      CANDIDATE_RANKING_WEIGHTS.userPreferenceFit,
    );
  });
});

describe("request parsing / zod", () => {
  it("parses lunch and dinner ranking requests", () => {
    const dinner = parseCandidateRankingRequest({
      mealType: "dinner",
      candidates: [CHICKEN_TIKKA],
    });
    const lunch = parseCandidateRankingRequest({
      mealType: "lunch",
      candidates: [CHICKEN_TIKKA],
    });
    expect(dinner.ok).toBe(true);
    expect(lunch.ok).toBe(true);
    if (dinner.ok) {
      expect(dinner.value.targetPoolSize).toBe(12);
    }
  });

  it("rejects breakfast and snack ranking requests", () => {
    expect(parseCandidateRankingRequest({ mealType: "breakfast", candidates: [CHICKEN_TIKKA] }).ok).toBe(
      false,
    );
    expect(parseCandidateRankingRequest({ mealType: "snack", candidates: [CHICKEN_TIKKA] }).ok).toBe(
      false,
    );
  });
});

describe("user preference fit", () => {
  it("scores a cuisine match positively", () => {
    const matched = scoreUserPreferenceFit(CHICKEN_TIKKA, { cuisines: ["Indian"] });
    const unmatched = scoreUserPreferenceFit(CHICKEN_TIKKA, { cuisines: ["Mexican"] });
    expect(matched.matchedCuisines).toEqual(["Indian"]);
    expect(matched.score).toBeGreaterThan(unmatched.score);
    expect(matched.score).toBeGreaterThan(0.5);
  });

  it("scores a protein match positively", () => {
    const matched = scoreUserPreferenceFit(CHICKEN_TIKKA, { proteinPreferences: ["chicken"] });
    const unmatched = scoreUserPreferenceFit(CHICKEN_TIKKA, { proteinPreferences: ["paneer"] });
    expect(matched.matchedProteins.length).toBeGreaterThan(0);
    expect(matched.score).toBeGreaterThan(unmatched.score);
  });

  it("scores experience preference overlap positively", () => {
    const matched = scoreUserPreferenceFit(ANDHRA_GREEN_CHILLI_CHICKEN, {
      experiencePreferences: ["spicy", "saucy_flavorful", "crispy_textured"],
    });
    const unmatched = scoreUserPreferenceFit(GRILLED_CHICKEN_BOWL, {
      experiencePreferences: ["spicy", "saucy_flavorful", "crispy_textured"],
    });
    expect(matched.matchedExperiences.length).toBeGreaterThan(0);
    expect(matched.score).toBeGreaterThan(unmatched.score);
  });

  it("treats absence of preferences as neutral", () => {
    const none = scoreUserPreferenceFit(CHICKEN_TIKKA, {});
    const alsoNone = scoreUserPreferenceFit(PESCADO_ZARANDEADO, {});
    expect(none.score).toBe(0.5);
    expect(alsoNone.score).toBe(0.5);
  });

  it("does not infer dislikes from unselected cuisines", () => {
    const indianOnly = scoreUserPreferenceFit(PESCADO_ZARANDEADO, { cuisines: ["Indian"] });
    expect(indianOnly.matchedDislikes).toEqual([]);
    expect(indianOnly.score).toBe(0.5);
  });

  it("applies an explicit dislike as a negative signal", () => {
    const disliked = scoreUserPreferenceFit(CHICKEN_TIKKA, { dislikes: ["tandoori"] });
    const clean = scoreUserPreferenceFit(CHICKEN_TIKKA, {});
    expect(disliked.matchedDislikes).toContain("tandoori");
    expect(disliked.score).toBeLessThan(clean.score);
  });
});

describe("culinary interest", () => {
  it("scores a generic grilled chicken bowl below a distinctive regional dish", () => {
    expect(scoreCulinaryInterest(GRILLED_CHICKEN_BOWL)).toBeLessThan(
      scoreCulinaryInterest(KERALA_MEEN_POLLICHATHU),
    );
    expect(scoreCulinaryInterest(GRILLED_CHICKEN_BOWL)).toBeLessThan(
      scoreCulinaryInterest(POLLO_PIPIAN_VERDE),
    );
  });
});

describe("source quality", () => {
  it("scores established culinary publications high", () => {
    expect(classifySourceQuality(CHICKEN_TIKKA).category).toBe("high");
    expect(scoreSourceQuality(CHICKEN_TIKKA)).toBe(SOURCE_QUALITY_SCORES.high);
  });

  it("scores general recipe sites medium", () => {
    expect(classifySourceQuality(GRILLED_CHICKEN_BOWL).category).toBe("medium");
    expect(scoreSourceQuality(GRILLED_CHICKEN_BOWL)).toBe(SOURCE_QUALITY_SCORES.medium);
  });

  it("scores community/social sources lower without rejecting them", () => {
    const reddit = makeRankingCandidate({
      candidateId: "reddit-dish",
      name: "Home Tikka",
      source: { name: "Reddit thread", url: "https://www.reddit.com/r/Cooking/tikka", author: null },
    });
    const classified = classifySourceQuality(reddit);
    expect(classified.category).toBe("lower");
    expect(classified.score).toBe(SOURCE_QUALITY_SCORES.lower);
    expect(classified.score).toBeGreaterThan(0);
  });

  it("gives unknown domains a neutral score, not zero", () => {
    const unknown = makeRankingCandidate({
      candidateId: "unknown-host",
      name: "Regional Stew",
      source: { name: "Some Blog", url: "https://totally-unknown-food.example/stew", author: null },
    });
    expect(classifySourceQuality(unknown).category).toBe("unknown");
    expect(scoreSourceQuality(unknown)).toBe(SOURCE_QUALITY_SCORES.unknown);
    expect(scoreSourceQuality(unknown)).toBeGreaterThan(0.4);
  });

  it("treats YouTube with an author as medium rather than rejected", () => {
    const youtube = makeRankingCandidate({
      candidateId: "yt-dish",
      name: "Zarandeado Tutorial",
      source: {
        name: "Creator Kitchen",
        url: "https://www.youtube.com/watch?v=abc123",
        author: "Coastal Cooks",
      },
    });
    expect(classifySourceQuality(youtube).category).toBe("medium");
  });
});

describe("meal-prep and finish-time scoring", () => {
  const cooking = {
    cookingStyle: "ready_lunch_fresh_dinner",
    maxFinishMinutes: 10,
  } as const;

  it("rewards lunch fully_prepped / component_prepped for ready_lunch_fresh_dinner", () => {
    const fully = scorePrepFit(KERALA_BEEF_FRY, "lunch", cooking);
    const freshOnly = scorePrepFit(PESCADO_ZARANDEADO, "lunch", cooking);
    expect(fully).toBeGreaterThan(freshOnly);
  });

  it("rewards dinner quick_fresh_finish for ready_lunch_fresh_dinner", () => {
    const quick = scorePrepFit(QUICK_FRESH_DINNER, "dinner", cooking);
    const longFresh = scorePrepFit(FRESH_ONLY_LONG_DINNER, "dinner", cooking);
    expect(quick).toBeGreaterThan(longFresh);
  });

  it("penalizes finish time over maxFinishMinutes without hard-rejecting", () => {
    const over = scorePrepFit(PESCADO_ZARANDEADO, "dinner", cooking);
    const within = scorePrepFit(QUICK_FRESH_DINNER, "dinner", cooking);
    expect(over).toBeGreaterThan(0);
    expect(within).toBeGreaterThan(over);
  });

  it("is neutral when cooking preferences are absent", () => {
    expect(scorePrepFit(QUICK_FRESH_DINNER, "dinner", undefined)).toBe(0.5);
  });
});

describe("fitness adaptability", () => {
  it("prefers easy over moderate over hard at low weight", () => {
    expect(scoreFitnessAdaptability("easy")).toBeGreaterThan(scoreFitnessAdaptability("moderate"));
    expect(scoreFitnessAdaptability("moderate")).toBeGreaterThan(scoreFitnessAdaptability("hard"));
    expect(CANDIDATE_RANKING_WEIGHTS.fitnessAdaptability).toBeLessThan(0.12);
  });

  it("lets a distinctive moderate dish outrank a boring easy dish", () => {
    const distinctive = scoreCandidateBase(
      KERALA_MEEN_POLLICHATHU,
      request({ candidates: [KERALA_MEEN_POLLICHATHU, GRILLED_CHICKEN_BOWL] }),
    );
    const boring = scoreCandidateBase(
      GRILLED_CHICKEN_BOWL,
      request({ candidates: [KERALA_MEEN_POLLICHATHU, GRILLED_CHICKEN_BOWL] }),
    );
    expect(distinctive.breakdown.fitnessAdaptability).toBeLessThan(boring.breakdown.fitnessAdaptability);
    expect(distinctive.scoreWithoutSimilarity).toBeGreaterThan(boring.scoreWithoutSimilarity);
  });
});

describe("recent repetition penalty", () => {
  it("penalizes a recently suggested exact name", () => {
    const recent = scoreRepetitionPenalty(CHICKEN_TIKKA, [
      { name: "Chicken Tikka", timesSuggestedLast30Days: 3, lastSuggestedDaysAgo: 1 },
    ]);
    expect(recent.penalty).toBeGreaterThan(0.4);
    expect(recent.matchKind).toBe("exact_name");
  });

  it("decays the penalty as exposure gets older", () => {
    const yesterday = recencyDecayFactor(1);
    const fiveDays = recencyDecayFactor(5);
    const threeWeeks = recencyDecayFactor(21);
    const unseen = recencyDecayFactor(40);
    expect(yesterday).toBeGreaterThan(fiveDays);
    expect(fiveDays).toBeGreaterThan(threeWeeks);
    expect(threeWeeks).toBeGreaterThan(unseen);
    expect(repetitionFrequencyFactor(3)).toBeGreaterThan(repetitionFrequencyFactor(1));
  });

  it("does not permanently exclude a previously suggested dish", () => {
    const old = scoreRepetitionPenalty(CHICKEN_TIKKA, [
      { name: "Chicken Tikka", timesSuggestedLast30Days: 1, lastSuggestedDaysAgo: 40 },
    ]);
    expect(old.penalty).toBeGreaterThan(0);
    expect(old.penalty).toBeLessThan(0.2);
    const ranked = rankCulinaryCandidates(
      request({
        candidates: [CHICKEN_TIKKA, GRILLED_CHICKEN_BOWL],
        recentConcepts: [{ name: "Chicken Tikka", lastSuggestedDaysAgo: 1, timesSuggestedLast30Days: 4 }],
        targetPoolSize: 2,
      }),
    );
    expect(ranked.ok).toBe(true);
    if (ranked.ok) {
      const tikka = [...ranked.value.selected, ...ranked.value.deprioritized].find(
        (item) => item.candidate.candidateId === "tikka-chicken",
      );
      expect(tikka).toBeDefined();
      expect(tikka?.decision).not.toBe("duplicate");
      expect(tikka?.scoreBreakdown.repetitionPenalty).toBeGreaterThan(0);
    }
  });
});

describe("culinary similarity", () => {
  it("treats exact normalized names as identical", () => {
    const clone = makeRankingCandidate({
      ...PANEER_TIKKA,
      candidateId: "tikka-paneer-clone",
      name: " paneer tikka ",
    });
    expect(computeCandidateSimilarity(PANEER_TIKKA, clone).score).toBe(1);
  });

  it("scores tikka variants highly similar despite different proteins", () => {
    const chickenPaneer = computeCandidateSimilarity(CHICKEN_TIKKA, PANEER_TIKKA);
    const chickenFish = computeCandidateSimilarity(CHICKEN_TIKKA, FISH_TIKKA);
    expect(chickenPaneer.score).toBeGreaterThanOrEqual(NEAR_DUPLICATE_THRESHOLD);
    expect(chickenFish.score).toBeGreaterThanOrEqual(NEAR_DUPLICATE_THRESHOLD);
    expect(chickenPaneer.signals.samePrimaryProtein).toBe(false);
    expect(chickenPaneer.signals.sameCanonicalDish).toBe(true);
    expect(canonicalDishKey("Chicken Tikka")).toBe(canonicalDishKey("Paneer Tikka"));
  });

  it("does not treat different fish dishes as near-duplicates just because they share protein", () => {
    const pairs = [
      computeCandidateSimilarity(KERALA_MEEN_POLLICHATHU, PESCADO_ZARANDEADO),
      computeCandidateSimilarity(KERALA_MEEN_POLLICHATHU, PESCADO_VERACRUZANA),
      computeCandidateSimilarity(KERALA_MEEN_POLLICHATHU, CAJUN_BLACKENED_REDFISH),
      computeCandidateSimilarity(PESCADO_ZARANDEADO, PESCADO_VERACRUZANA),
      computeCandidateSimilarity(PESCADO_ZARANDEADO, CAJUN_BLACKENED_REDFISH),
      computeCandidateSimilarity(PESCADO_VERACRUZANA, CAJUN_BLACKENED_REDFISH),
    ];
    for (const pair of pairs) {
      expect(pair.signals.samePrimaryProtein).toBe(true);
      expect(pair.score).toBeLessThan(NEAR_DUPLICATE_THRESHOLD);
      expect(pair.score).toBeLessThan(SIMILARITY_PENALTY_THRESHOLD);
    }
  });

  it("uses flavor, technique, and dish-format overlap", () => {
    const tikka = computeCandidateSimilarity(CHICKEN_TIKKA, PANEER_TIKKA);
    expect(tikka.signals.sharedFlavorFamilies.length).toBeGreaterThan(0);
    expect(tikka.signals.sharedTechniques.length).toBeGreaterThan(0);
    expect(tikka.signals.sameDishFormat).toBe(true);
  });

  it("keeps Andhra green chilli chicken distinct from chicken tikka", () => {
    const similarity = computeCandidateSimilarity(CHICKEN_TIKKA, ANDHRA_GREEN_CHILLI_CHICKEN);
    expect(similarity.signals.samePrimaryProtein).toBe(true);
    expect(similarity.score).toBeLessThan(NEAR_DUPLICATE_THRESHOLD);
  });
});

describe("duplicate vs moderate similarity thresholds", () => {
  it("maps very high similarity to a full near-duplicate penalty", () => {
    expect(similarityPenaltyFromScore(0.9)).toBe(1);
    expect(similarityPenaltyFromScore(NEAR_DUPLICATE_THRESHOLD)).toBe(1);
  });

  it("maps moderate similarity to a partial penalty", () => {
    const mid = (SIMILARITY_PENALTY_THRESHOLD + NEAR_DUPLICATE_THRESHOLD) / 2;
    const penalty = similarityPenaltyFromScore(mid);
    expect(penalty).toBeGreaterThan(0);
    expect(penalty).toBeLessThan(1);
    expect(similarityPenaltyFromScore(0.2)).toBe(0);
  });
});

describe("iterative ranking", () => {
  it("keeps one strong tikka and marks weaker tikka variants duplicate", () => {
    const ranked = rankCulinaryCandidates(
      request({
        mealType: "dinner",
        candidates: SCENARIO_A_TIKKA_REDUNDANCY,
        targetPoolSize: 6,
      }),
    );
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    const byId = Object.fromEntries(
      [...ranked.value.selected, ...ranked.value.deprioritized].map((item) => [
        item.candidate.candidateId,
        item,
      ]),
    );
    const tikkaDecisions = [byId["tikka-chicken"], byId["tikka-paneer"], byId["tikka-fish"]].map(
      (item) => item?.decision,
    );
    expect(tikkaDecisions.filter((decision) => decision === "selected")).toHaveLength(1);
    expect(tikkaDecisions.filter((decision) => decision === "duplicate").length).toBeGreaterThanOrEqual(2);
    expect(byId["andhra-green-chilli-chicken"]?.decision).toBe("selected");
    const selectedTikka = ranked.value.selected.find((item) =>
      item.candidate.name.toLowerCase().includes("tikka"),
    );
    const duplicateTikka = ranked.value.deprioritized.find((item) => item.decision === "duplicate");
    expect(selectedTikka).toBeDefined();
    expect(duplicateTikka).toBeDefined();
    expect(selectedTikka!.score).toBeGreaterThanOrEqual(duplicateTikka!.score);
    expect(duplicateTikka!.similarToCandidateIds?.length).toBeGreaterThan(0);
  });

  it("allows several culinarily different fish dishes to remain selected", () => {
    const ranked = rankCulinaryCandidates(
      request({
        candidates: SCENARIO_B_FISH_DIVERSITY,
        targetPoolSize: 4,
      }),
    );
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    expect(ranked.value.selected).toHaveLength(4);
    expect(ranked.value.stats.duplicateCount).toBe(0);
    expect(ranked.value.stats.uniqueCuisineCount).toBeGreaterThanOrEqual(3);
  });

  it("produces a more diverse pool than naive top-N isolated scores", () => {
    const ranked = rankCulinaryCandidates(
      request({
        candidates: SCENARIO_PLAN006_MIX,
        targetPoolSize: 8,
      }),
    );
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    const selectedNames = ranked.value.selected.map((item) => item.candidate.name);
    expect(selectedNames.filter((name) => name.toLowerCase().includes("tikka")).length).toBeLessThanOrEqual(1);
    expect(ranked.value.stats.uniqueCuisineCount).toBeGreaterThanOrEqual(2);
    expect(selectedNames).toContain("Andhra Green Chilli Chicken");
  });

  it("does not pad the pool with weak candidates", () => {
    const ranked = rankCulinaryCandidates(
      request({
        candidates: SCENARIO_B_FISH_DIVERSITY,
        targetPoolSize: 12,
      }),
    );
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    expect(ranked.value.selected).toHaveLength(4);
    expect(ranked.value.stats.selectedCandidateCount).toBe(4);
    expect(ranked.value.stats.inputCandidateCount).toBe(4);
  });

  it("caps selected size at the target when the pool is larger", () => {
    const ranked = rankCulinaryCandidates(
      request({
        candidates: SCENARIO_PLAN006_MIX,
        targetPoolSize: 5,
      }),
    );
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    expect(ranked.value.selected).toHaveLength(5);
    expect(ranked.value.deprioritized.length).toBeGreaterThan(0);
  });

  it("applies user preference impact in the final ranking", () => {
    const withPrefs = rankCulinaryCandidates(
      request({
        candidates: [GRILLED_CHICKEN_BOWL, POLLO_PIPIAN_VERDE, ANDHRA_GREEN_CHILLI_CHICKEN],
        userPreferences: {
          cuisines: ["Indian", "Mexican"],
          experiencePreferences: ["spicy", "saucy_flavorful", "crispy_textured"],
        },
        targetPoolSize: 3,
      }),
    );
    const withoutPrefs = rankCulinaryCandidates(
      request({
        candidates: [GRILLED_CHICKEN_BOWL, POLLO_PIPIAN_VERDE, ANDHRA_GREEN_CHILLI_CHICKEN],
        targetPoolSize: 3,
      }),
    );
    expect(withPrefs.ok && withoutPrefs.ok).toBe(true);
    if (!withPrefs.ok || !withoutPrefs.ok) return;
    const andhraWith = withPrefs.value.selected.find(
      (item) => item.candidate.candidateId === "andhra-green-chilli-chicken",
    );
    const andhraWithout = withoutPrefs.value.selected.find(
      (item) => item.candidate.candidateId === "andhra-green-chilli-chicken",
    );
    expect(andhraWith?.scoreBreakdown.userPreferenceFit).toBeGreaterThan(
      andhraWithout?.scoreBreakdown.userPreferenceFit ?? 0,
    );
  });

  it("applies cooking preference impact for dinner finish time", () => {
    const ranked = rankCulinaryCandidates(
      request({
        mealType: "dinner",
        candidates: [QUICK_FRESH_DINNER, FRESH_ONLY_LONG_DINNER],
        cookingPreferences: { cookingStyle: "ready_lunch_fresh_dinner", maxFinishMinutes: 10 },
        targetPoolSize: 2,
      }),
    );
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    expect(ranked.value.selected[0]?.candidate.candidateId).toBe("quick-fresh-dinner");
    const quick = ranked.value.selected[0];
    const slow = ranked.value.selected[1] ?? ranked.value.deprioritized[0];
    expect(quick?.scoreBreakdown.prepFit).toBeGreaterThan(slow?.scoreBreakdown.prepFit ?? 0);
    expect(quick?.reasons.some((reason) => reason.includes("Finish time within 10-minute"))).toBe(true);
    expect(slow?.reasons.some((reason) => reason.includes("exceeds 10-minute preference"))).toBe(true);
  });

  it("generates deterministic reasons and stats", () => {
    const ranked = rankCulinaryCandidates(
      request({
        candidates: SCENARIO_A_TIKKA_REDUNDANCY,
        userPreferences: { cuisines: ["Indian"] },
        targetPoolSize: 4,
      }),
    );
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    expect(ranked.value.policy.version).toBe("candidate-ranking-v1");
    expect(ranked.value.stats.inputCandidateCount).toBe(6);
    expect(
      ranked.value.stats.selectedCandidateCount + ranked.value.deprioritized.length,
    ).toBe(6);
    expect(
      ranked.value.stats.duplicateCount + ranked.value.stats.deprioritizedCount,
    ).toBe(ranked.value.deprioritized.length);
    for (const item of ranked.value.selected) {
      expect(item.reasons.length).toBeGreaterThan(0);
      expect(item.decision).toBe("selected");
    }
    const duplicate = ranked.value.deprioritized.find((item) => item.decision === "duplicate");
    expect(duplicate?.reasons.some((reason) => reason.toLowerCase().includes("near-duplicate"))).toBe(
      true,
    );
  });

  it("is stable and deterministic across repeated runs", () => {
    const payload = request({
      candidates: SCENARIO_PLAN006_MIX,
      userPreferences: { cuisines: ["Indian", "Mexican"] },
      cookingPreferences: { cookingStyle: "ready_lunch_fresh_dinner", maxFinishMinutes: 10 },
      targetPoolSize: 8,
    });
    const first = rankCulinaryCandidates(payload);
    const second = rankCulinaryCandidates(payload);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(JSON.stringify(first.value)).toBe(JSON.stringify(second.value));
  });

  it("does not introduce rigid cuisine or protein quotas", () => {
    const source = readFileSync(join(here, "candidate-ranking.ts"), "utf8");
    expect(source).not.toMatch(/exactly 3 Indian|quota|minCuisine|mustIncludeProtein/i);
    expect(source).not.toContain("exactly 2 fish");
  });
});

describe("novelty and composed score", () => {
  it("gives generic dishes a weaker novelty signal", () => {
    expect(scoreNovelty(GRILLED_CHICKEN_BOWL)).toBeLessThan(scoreNovelty(KERALA_MEEN_POLLICHATHU));
  });

  it("composes score from centralized weights", () => {
    const score = composeRankingScore({
      userPreferenceFit: 1,
      culinaryInterest: 1,
      sourceQuality: 1,
      prepFit: 1,
      fitnessAdaptability: 1,
      novelty: 1,
      repetitionPenalty: 0,
      similarityPenalty: 0,
    });
    expect(score).toBe(100);
  });
});

describe("dev endpoint wiring", () => {
  it("edge function ranks without Gemini", () => {
    const edge = readFileSync(
      join(repoRoot, "supabase/functions/rank-culinary-candidates/index.ts"),
      "utf8",
    );
    expect(edge).toContain("rankCulinaryCandidates");
    expect(edge).toContain("serveWithCors");
    expect(edge).not.toContain("createCulinaryDiscoveryProvider");
    expect(edge).not.toContain("@google/genai");
    expect(edge).not.toContain("GEMINI_API_KEY");
  });
});
