import type {
  CulinaryDiscoveryCandidate,
  RankedCulinaryCandidate,
  RankedWeeklyStrategyRequest,
} from "@fitness-autopilot/contracts";
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
} from "../recipes/candidate-ranking-fixtures";
import type { RankedWeeklyModelPayload } from "./ranked-weekly-strategy";

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
 * Valid 7-day lunch/dinner payload using supplied fixture IDs.
 * Direct leftover uses lamb-kofta (present in both pools).
 * Finish-prep dinners stay within 10 minutes.
 */
export function sampleRankedWeekPayload(): RankedWeeklyModelPayload {
  return {
    strategySummary: {
      varietyApproach:
        "Rotate Andhra, Kerala, Mexican, Cajun, Sichuan, Levantine, and Thai experiences with two strategic repeats.",
      prepApproach:
        "Ready lunches, one piggyback pair, one rare leftover, and dinners finished in about 10 minutes.",
      ingredientReuseApproach:
        "Likely ingredient/prep reuse of rice, onions, herbs, citrus, and chili aromatics — conceptual only.",
    },
    days: [
      {
        day: "monday",
        lunch: lunchSlot(
          "andhra-green-chilli-chicken",
          "Spicy Andhra lunch that meal-preps well.",
        ),
        dinner: dinnerSlot(
          "kerala-meen-pollichathu",
          "Banana-leaf fish after a spicy Indian lunch; different technique and region.",
        ),
      },
      {
        day: "tuesday",
        lunch: lunchSlot(
          "kerala-beef-fry",
          "Different Kerala lunch; aromatics can piggyback off Monday dinner.",
          { lunchPreparationStrategy: "piggyback_prep" },
        ),
        dinner: dinnerSlot(
          "cajun-blackened-redfish",
          "Louisiana blackening is a distinct fish experience from banana-leaf roast.",
        ),
      },
      {
        day: "wednesday",
        lunch: lunchSlot(
          "pollo-pipian-verde",
          "Pepita-sauce chicken for a different Mexican lunch experience.",
          { prepIntent: "component_prepped" },
        ),
        dinner: dinnerSlot(
          "tandoori-chicken",
          "Tandoori roast is spaced away from the Andhra lunch and uses a 9-minute finish.",
        ),
      },
      {
        day: "thursday",
        lunch: lunchSlot(
          "andhra-green-chilli-chicken",
          "Strategic repeat of a high-ranking lunch that preps well.",
        ),
        dinner: dinnerSlot(
          "jamaican-jerk-chicken",
          "Jerk heat is a different spice tradition than tandoori yogurt-chili.",
        ),
      },
      {
        day: "friday",
        lunch: lunchSlot(
          "mapo-tofu",
          "Sichuan mala stew diversifies the week.",
          { prepIntent: "component_prepped", lunchPreparationStrategy: "piggyback_prep" },
        ),
        dinner: dinnerSlot(
          "lamb-kofta",
          "Levantine lamb kebab for weekend variety.",
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
          "quick-fresh-dinner",
          "Chile-lime shrimp tacos keep Saturday dinner fast and distinct.",
        ),
      },
      {
        day: "sunday",
        lunch: lunchSlot(
          "thai-green-curry",
          "Thai green curry is a different coconut-chili experience.",
          { prepIntent: "component_prepped" },
        ),
        dinner: dinnerSlot(
          "kerala-meen-pollichathu",
          "Repeat banana-leaf fish at the end of the week to keep Sunday effort low.",
        ),
      },
    ],
  };
}
