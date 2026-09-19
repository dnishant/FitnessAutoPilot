import type {
  MealConcept,
  PrepFrequency,
  RankedCulinaryCandidate,
  RankedWeeklyMealSlot,
  RankedWeeklyStrategy,
} from "@fitness-autopilot/contracts";
import { collectRankedMealSlots } from "./ranked-weekly-strategy";
import type { MealExecutabilityFailure } from "../meal-portioning/executability";
import { isEligibleForBatchPrepRepertoire } from "./four-meal-repertoire";

/**
 * Bounded candidate replacement when a SELECTED candidate fails executability.
 * Reuses the ranked lunch/dinner pools — does not invent a parallel ranking system.
 *
 * V1 note: a failed core meal is replaced with ONE candidate across every slot that
 * referenced it (lunch and dinner). Splitting lunch/dinner replacements expands the
 * unique set past four meals and desyncs uniqueCandidateIds from day slots.
 */

export const MAX_EXECUTABLE_REPLACEMENT_ROUNDS = 8;

export type CandidateFailureRecord = {
  candidateId: string;
  code: MealExecutabilityFailure["code"];
  message: string;
};

export type StrategyReplacement = {
  failedCandidateId: string;
  replacementCandidateId: string;
  mealType: "lunch" | "dinner";
  slotCount: number;
};

export type ReplaceFailedCandidatesResult =
  | {
      ok: true;
      strategy: RankedWeeklyStrategy;
      replacements: StrategyReplacement[];
      failedCandidateIds: Set<string>;
    }
  | {
      ok: false;
      code: "EXECUTABLE_REPLACEMENT_EXHAUSTED";
      message: string;
      failedCandidateIds: Set<string>;
      unresolvedFailures: CandidateFailureRecord[];
      strategy: RankedWeeklyStrategy;
    };

function mealTypesForCandidate(
  strategy: RankedWeeklyStrategy,
  candidateId: string,
): Set<"lunch" | "dinner"> {
  const types = new Set<"lunch" | "dinner">();
  for (const slot of collectRankedMealSlots(strategy.days)) {
    if (slot.candidateId === candidateId) {
      types.add(slot.mealType);
    }
  }
  return types;
}

function uniqueRankedById(
  pool: readonly RankedCulinaryCandidate[],
): RankedCulinaryCandidate[] {
  const byId = new Map<string, RankedCulinaryCandidate>();
  for (const ranked of pool) {
    const id = ranked.candidate.candidateId;
    const existing = byId.get(id);
    if (!existing || ranked.rank < existing.rank) {
      byId.set(id, ranked);
    }
  }
  return [...byId.values()].sort((a, b) => a.rank - b.rank);
}

function pickReplacement(input: {
  pool: readonly RankedCulinaryCandidate[];
  usedIds: Set<string>;
  failedIds: Set<string>;
  conceptsByCandidateId?: Record<string, MealConcept>;
  prepFrequency?: PrepFrequency | null;
  maxFinishMinutes?: number | null;
}): RankedCulinaryCandidate | null {
  for (const ranked of input.pool) {
    const id = ranked.candidate.candidateId;
    if (input.failedIds.has(id)) continue;
    if (input.usedIds.has(id)) continue;
    if (input.conceptsByCandidateId && !input.conceptsByCandidateId[id]) continue;
    if (
      !isEligibleForBatchPrepRepertoire({
        mealPrepAdaptability: ranked.candidate.mealPrepAdaptability,
        estimatedFinishMinutesAfterPrep: ranked.candidate.estimatedFinishMinutesAfterPrep,
        maxFinishMinutes: input.maxFinishMinutes,
        prepFrequency: input.prepFrequency,
      })
    ) {
      continue;
    }
    return ranked;
  }
  return null;
}

function hydrateSlotName(
  slot: RankedWeeklyMealSlot,
  ranked: RankedCulinaryCandidate,
  concept?: MealConcept,
): RankedWeeklyMealSlot {
  return {
    ...slot,
    candidateId: ranked.candidate.candidateId,
    name: concept?.name ?? ranked.candidate.name,
    planningReason: `Replaced non-executable candidate ${slot.candidateId} with ${ranked.candidate.candidateId} after executability failure.`,
  };
}

/**
 * Replace every slot that references a failed candidate with the next ranked
 * pool member. Same failed ID across lunch and dinner is replaced coherently
 * with a single replacement ID (required for V1 four-meal weeks).
 */
export function replaceFailedCandidatesInStrategy(input: {
  strategy: RankedWeeklyStrategy;
  failures: readonly MealExecutabilityFailure[];
  lunchPool: readonly RankedCulinaryCandidate[];
  dinnerPool: readonly RankedCulinaryCandidate[];
  failedCandidateIds: Set<string>;
  conceptsByCandidateId?: Record<string, MealConcept>;
  prepFrequency?: PrepFrequency | null;
  maxFinishMinutes?: number | null;
}): ReplaceFailedCandidatesResult {
  const failedCandidateIds = new Set(input.failedCandidateIds);
  const unresolvedFailures: CandidateFailureRecord[] = [];
  const replacements: StrategyReplacement[] = [];

  let days = input.strategy.days.map((day) => ({
    ...day,
    lunch: { ...day.lunch },
    dinner: { ...day.dinner },
  }));

  const usedIds = new Set(
    collectRankedMealSlots(days).map((slot) => slot.candidateId),
  );

  const unionPool = uniqueRankedById([...input.lunchPool, ...input.dinnerPool]);

  // Dedupe failures by candidateId (first typed reason wins).
  const uniqueFailures = new Map<string, MealExecutabilityFailure>();
  for (const failure of input.failures) {
    failedCandidateIds.add(failure.candidateId);
    if (!uniqueFailures.has(failure.candidateId)) {
      uniqueFailures.set(failure.candidateId, failure);
    }
  }

  for (const [failedId, failure] of uniqueFailures) {
    const mealTypes = mealTypesForCandidate({ ...input.strategy, days }, failedId);
    if (mealTypes.size === 0) {
      continue;
    }

    const ranked = pickReplacement({
      pool: unionPool,
      usedIds,
      failedIds: failedCandidateIds,
      conceptsByCandidateId: input.conceptsByCandidateId,
      prepFrequency: input.prepFrequency,
      maxFinishMinutes: input.maxFinishMinutes,
    });

    if (!ranked) {
      unresolvedFailures.push({
        candidateId: failedId,
        code: failure.code,
        message: `${failure.message} No batch-prep-eligible replacement available in ranked pools.`,
      });
      continue;
    }

    const replacementId = ranked.candidate.candidateId;
    days = days.map((day) => {
      let next = day;
      for (const mealType of mealTypes) {
        const slot = next[mealType];
        if (slot.candidateId !== failedId) continue;
        next = {
          ...next,
          [mealType]: hydrateSlotName(
            slot,
            ranked,
            input.conceptsByCandidateId?.[replacementId],
          ),
        };
      }
      return next;
    });

    for (const mealType of mealTypes) {
      const countForType = collectRankedMealSlots(days).filter(
        (s) => s.mealType === mealType && s.candidateId === replacementId,
      ).length;
      if (countForType > 0) {
        replacements.push({
          failedCandidateId: failedId,
          replacementCandidateId: replacementId,
          mealType,
          slotCount: countForType,
        });
      }
    }

    usedIds.delete(failedId);
    usedIds.add(replacementId);
  }

  const uniqueCandidateIds = [
    ...new Set(collectRankedMealSlots(days).map((slot) => slot.candidateId)),
  ];

  const strategy: RankedWeeklyStrategy = {
    ...input.strategy,
    days,
    uniqueCandidateIds,
  };

  if (unresolvedFailures.length > 0 && replacements.length === 0) {
    return {
      ok: false,
      code: "EXECUTABLE_REPLACEMENT_EXHAUSTED",
      message:
        "Bounded recovery exhausted: no executable replacements remain in ranked pools.",
      failedCandidateIds,
      unresolvedFailures,
      strategy,
    };
  }

  if (unresolvedFailures.length > 0) {
    // Partial replacements still advance the strategy; caller re-assesses.
    // If nothing new is executable after subsequent rounds, caller fails the plan.
  }

  return {
    ok: true,
    strategy,
    replacements,
    failedCandidateIds,
  };
}

export function recordExecutabilityFailures(
  existing: Set<string>,
  failures: readonly MealExecutabilityFailure[],
): Set<string> {
  const next = new Set(existing);
  for (const failure of failures) {
    next.add(failure.candidateId);
  }
  return next;
}
