import type {
  CulinaryDiscoveryCandidate,
  RankedCulinaryCandidate,
  RankedWeeklyStrategyRequest,
} from "../../contracts/index.ts";
import {
  ANDHRA_GREEN_CHILLI_CHICKEN,
  CAJUN_BLACKENED_REDFISH,
  CA_KHO_TO,
  CHICKEN_SCALOPPINE_AL_LIMONE,
  CHICKEN_TIKKA,
  FRESH_ONLY_LONG_DINNER,
  FISH_TIKKA,
  GRILLED_CHICKEN_BOWL,
  JAMAICAN_JERK_CHICKEN,
  KERALA_BEEF_FRY,
  KERALA_MEEN_POLLICHATHU,
  LAMB_KOFTA,
  MAPO_TOFU,
  PANEER_TIKKA,
  PESCADO_VERACRUZANA,
  PESCADO_ZARANDEADO,
  POLLO_PIPIAN_VERDE,
  QUICK_FRESH_DINNER,
  SCENARIO_A_TIKKA_REDUNDANCY,
  SCENARIO_C_LARGE_MIXED_POOL,
  TANDOORI_CHICKEN,
  THAI_GREEN_CURRY,
} from "../recipes/candidate-ranking-fixtures.ts";
import type { RankedWeeklyModelPayload } from "./ranked-weekly-strategy.ts";

const DEFAULT_BREAKDOWN = {
  userPreferenceFit: 0.7,
  culinaryInterest: 0.72,
  sourceQuality: 0.7,
  prepFit: 0.68,
  fitnessAdaptability: 0.65,
  novelty: 0.7,
  repetitionPenalty: 0,
  similarityPenalty: 0,
};

export function makeRankedCandidate(
  candidate: CulinaryDiscoveryCandidate,
  rank: number,
  score = Math.max(40, 92 - (rank - 1) * 3),
): RankedCulinaryCandidate {
  return {
    candidate,
    score,
    baseScore: score,
    scoreBreakdown: { ...DEFAULT_BREAKDOWN },
    rank,
    decision: "selected",
    reasons: [`Ranked #${rank} for PLAN-007 tests.`],
  };
}

export function rankCandidatesInOrder(
  candidates: readonly CulinaryDiscoveryCandidate[],
): RankedCulinaryCandidate[] {
  return candidates.map((candidate, index) => makeRankedCandidate(candidate, index + 1));
}

export const PLAN007_LUNCH_POOL: RankedCulinaryCandidate[] = rankCandidatesInOrder([
  KERALA_BEEF_FRY,
  ANDHRA_GREEN_CHILLI_CHICKEN,
  PESCADO_VERACRUZANA,
  POLLO_PIPIAN_VERDE,
  CHICKEN_TIKKA,
  JAMAICAN_JERK_CHICKEN,
  MAPO_TOFU,
  CA_KHO_TO,
  LAMB_KOFTA,
  THAI_GREEN_CURRY,
  GRILLED_CHICKEN_BOWL,
  PANEER_TIKKA,
  FISH_TIKKA,
]);

export const PLAN007_DINNER_POOL: RankedCulinaryCandidate[] = rankCandidatesInOrder([
  KERALA_MEEN_POLLICHATHU,
  CHICKEN_SCALOPPINE_AL_LIMONE,
  PESCADO_ZARANDEADO,
  CAJUN_BLACKENED_REDFISH,
  TANDOORI_CHICKEN,
  QUICK_FRESH_DINNER,
  POLLO_PIPIAN_VERDE,
  THAI_GREEN_CURRY,
  LAMB_KOFTA,
  JAMAICAN_JERK_CHICKEN,
  ANDHRA_GREEN_CHILLI_CHICKEN,
  FRESH_ONLY_LONG_DINNER,
  CHICKEN_TIKKA,
]);

export const PLAN007_SMALL_LUNCH_POOL = PLAN007_LUNCH_POOL.slice(0, 4);
export const PLAN007_SMALL_DINNER_POOL = PLAN007_DINNER_POOL.slice(0, 5);

export const PLAN007_TIKKA_PRESSURE_LUNCH = rankCandidatesInOrder(SCENARIO_A_TIKKA_REDUNDANCY);
export const PLAN007_TIKKA_PRESSURE_DINNER = rankCandidatesInOrder([
  ...SCENARIO_A_TIKKA_REDUNDANCY,
  KERALA_MEEN_POLLICHATHU,
  CHICKEN_SCALOPPINE_AL_LIMONE,
]);

export const PLAN007_LARGE_LUNCH_POOL = rankCandidatesInOrder(SCENARIO_C_LARGE_MIXED_POOL);
export const PLAN007_LARGE_DINNER_POOL = rankCandidatesInOrder(
  [...SCENARIO_C_LARGE_MIXED_POOL].reverse(),
);

export function sampleRankedWeeklyStrategyRequest(
  overrides: Partial<RankedWeeklyStrategyRequest> = {},
): RankedWeeklyStrategyRequest {
  return {
    nutrition: {
      targetCaloriesPerDay: 2200,
      targetProteinGramsPerDay: 160,
      targetCarbsGramsPerDay: 220,
      targetFatGramsPerDay: 70,
    },
    foodPreferences: {
      cuisines: ["Indian", "Mexican", "Mediterranean"],
      proteinPreferences: ["Chicken", "Fish"],
      experiencePreferences: ["Saucy & flavorful"],
      allergies: ["Peanuts"],
      dietaryRestrictions: ["Shellfish"],
      dislikes: ["Olives"],
      varietyLevel: "balanced",
    },
    cookingPreferences: {
      prepFrequency: "once_weekly",
      maxPrepSessionMinutes: 90,
      cookingStyle: "ready_lunch_fresh_dinner",
      maxFinishMinutes: 10,
      useDinnerPrepForNextLunch: true,
    },
    lunchCandidates: PLAN007_LUNCH_POOL,
    dinnerCandidates: PLAN007_DINNER_POOL,
    ...overrides,
  };
}

function lunchSlot(
  candidateId: string,
  planningReason: string,
  extras: {
    prepIntent?: RankedWeeklyModelPayload["days"][number]["lunch"]["prepIntent"];
    lunchPreparationStrategy?: RankedWeeklyModelPayload["days"][number]["lunch"]["lunchPreparationStrategy"];
  } = {},
): RankedWeeklyModelPayload["days"][number]["lunch"] {
  return {
    candidateId,
    prepIntent: extras.prepIntent ?? "fully_prepped",
    lunchPreparationStrategy: extras.lunchPreparationStrategy ?? "independent_meal_prep",
    planningReason,
  };
}

function dinnerSlot(
  candidateId: string,
  planningReason: string,
  prepIntent: RankedWeeklyModelPayload["days"][number]["dinner"]["prepIntent"] = "quick_fresh_finish",
): RankedWeeklyModelPayload["days"][number]["dinner"] {
  return {
    candidateId,
    prepIntent,
    planningReason,
  };
}

/**
 * Valid V1 6-day lunch/dinner payload using supplied fixture IDs.
 * Exactly 4 unique candidates with strategic lunch/dinner repeats.
 * Direct leftover uses lamb-kofta (present in both pools).
 * Finish-prep dinners stay within 10 minutes. Sunday is omitted (flexible).
 */
export function sampleRankedWeekPayload(): RankedWeeklyModelPayload {
  return {
    strategySummary: {
      varietyApproach:
        "Four-meal repertoire with strategic lunch/dinner repeats across six covered days.",
      prepApproach:
        "Batch-friendly lunches with intentional repeats, one plausible piggyback, one rare leftover, and dinners finished in about 10 minutes.",
      ingredientReuseApproach:
        "Pairs well with an existing once-weekly batch-prep structure; only claim specific reuse when metadata makes it obvious.",
    },
    days: [
      {
        day: "monday",
        lunch: lunchSlot(
          "andhra-green-chilli-chicken",
          "Spicy Andhra lunch that meal-preps well as a primary batch dish.",
        ),
        dinner: dinnerSlot(
          "kerala-meen-pollichathu",
          "Adds a distinct banana-leaf fish dinner without a major extra prep burden.",
        ),
      },
      {
        day: "tuesday",
        lunch: lunchSlot(
          "kerala-beef-fry",
          "Second batch-friendly lunch; likely shares coconut-chili aromatics prep with Monday dinner when metadata supports it.",
          { lunchPreparationStrategy: "piggyback_prep" },
        ),
        dinner: dinnerSlot(
          "lamb-kofta",
          "Levantine lamb dinner diversifies flavor and can become Saturday's rare leftover.",
        ),
      },
      {
        day: "wednesday",
        lunch: lunchSlot(
          "andhra-green-chilli-chicken",
          "Repeated intentionally to reuse the batch-prepped dish while spacing the meal several days from its first appearance.",
        ),
        dinner: dinnerSlot(
          "kerala-meen-pollichathu",
          "Strategic dinner repeat of banana-leaf fish spaced from Monday.",
        ),
      },
      {
        day: "thursday",
        lunch: lunchSlot(
          "kerala-beef-fry",
          "Repeated intentionally to reuse Friday-bound batch prep while keeping lunch effort low.",
        ),
        dinner: dinnerSlot(
          "lamb-kofta",
          "Strategic dinner repeat of lamb kofta spaced from Tuesday.",
        ),
      },
      {
        day: "friday",
        lunch: lunchSlot(
          "andhra-green-chilli-chicken",
          "Repeated intentionally to finish the week with a meal-prep-friendly lunch already prepared.",
        ),
        dinner: dinnerSlot(
          "lamb-kofta",
          "Levantine lamb dinner can become Saturday's rare leftover.",
          "component_prepped",
        ),
      },
      {
        day: "saturday",
        lunch: lunchSlot(
          "lamb-kofta",
          "Rare direct leftover: Friday dinner becomes Saturday lunch.",
          { lunchPreparationStrategy: "direct_leftover" },
        ),
        dinner: dinnerSlot(
          "kerala-meen-pollichathu",
          "Strategic dinner repeat that reuses an already-selected fish without adjacent monotony.",
        ),
      },
    ],
  };
}

/**
 * Build a structurally valid independent-prep week with exactly `uniqueCount`
 * unique candidates (using lunch-only / dinner-only IDs to avoid cross-pool issues).
 * V1 covered days only (Mon–Sat). Unique counts other than 4 will fail V1 hydrate.
 */
export function sampleRankedWeekPayloadWithUniqueCount(
  uniqueCount: number,
): RankedWeeklyModelPayload {
  if (uniqueCount < 1 || uniqueCount > 12) {
    throw new Error(`uniqueCount must be between 1 and 12 (received ${uniqueCount}).`);
  }

  const lunchOnly = PLAN007_LUNCH_POOL.filter(
    (item) =>
      !PLAN007_DINNER_POOL.some(
        (dinner) => dinner.candidate.candidateId === item.candidate.candidateId,
      ),
  );
  const dinnerOnly = PLAN007_DINNER_POOL.filter(
    (item) =>
      !PLAN007_LUNCH_POOL.some(
        (lunch) => lunch.candidate.candidateId === item.candidate.candidateId,
      ),
  );

  const lunchUniqueTarget = Math.min(Math.ceil(uniqueCount / 2), lunchOnly.length);
  const dinnerUniqueTarget = Math.min(uniqueCount - lunchUniqueTarget, dinnerOnly.length);
  if (lunchUniqueTarget + dinnerUniqueTarget < uniqueCount) {
    throw new Error(
      `Cannot build ${uniqueCount} unique candidates from non-overlapping lunch/dinner fixture pools.`,
    );
  }

  const lunchIds = lunchOnly
    .slice(0, lunchUniqueTarget)
    .map((item) => item.candidate.candidateId);
  const dinnerIds = dinnerOnly
    .slice(0, dinnerUniqueTarget)
    .map((item) => item.candidate.candidateId);

  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;

  return {
    strategySummary: {
      varietyApproach: `Fixture targeting exactly ${uniqueCount} unique candidates.`,
      prepApproach: "Independent meal prep only for complexity boundary tests.",
      ingredientReuseApproach: "Conceptual reuse only.",
    },
    days: days.map((day, index) => ({
      day,
      lunch: lunchSlot(
        lunchIds[index % lunchIds.length]!,
        `Lunch slot ${index + 1} for complexity fixture.`,
      ),
      dinner: dinnerSlot(
        dinnerIds[index % dinnerIds.length]!,
        `Dinner slot ${index + 1} for complexity fixture.`,
        "fully_prepped",
      ),
    })),
  };
}
