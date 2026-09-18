import type {
  MealConcept,
  RankedCulinaryCandidate,
  RankedWeeklyMealSlot,
  RankedWeeklyStrategy,
} from "@fitness-autopilot/contracts";
import { collectRankedMealSlots } from "./ranked-weekly-strategy";
import type { MealExecutabilityFailure } from "../meal-portioning/executability";

/**
 * Bounded candidate replacement when a SELECTED candidate fails executability.
 * Reuses the ranked lunch/dinner pools — does not invent a parallel ranking system.
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

function pickReplacement(input: {
  mealType: "lunch" | "dinner";
  pool: readonly RankedCulinaryCandidate[];
  usedIds: Set<string>;
  failedIds: Set<string>;
  conceptsByCandidateId?: Record<string, MealConcept>;
  /** IDs already chosen as replacements for the same failed candidate (may reuse). */
  allowIds?: Set<string>;
}): RankedCulinaryCandidate | null {
  for (const ranked of input.pool) {
    const id = ranked.candidate.candidateId;
    if (input.failedIds.has(id)) continue;
    if (input.usedIds.has(id) && !input.allowIds?.has(id)) continue;
    if (input.conceptsByCandidateId && !input.conceptsByCandidateId[id]) continue;
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
 * pool member of the same meal type. Same failed ID across multiple days is
 * replaced coherently (one replacement ID for all of that meal type).
 */
export function replaceFailedCandidatesInStrategy(input: {
  strategy: RankedWeeklyStrategy;
  failures: readonly MealExecutabilityFailure[];
  lunchPool: readonly RankedCulinaryCandidate[];
  dinnerPool: readonly RankedCulinaryCandidate[];
  failedCandidateIds: Set<string>;
  conceptsByCandidateId?: Record<string, MealConcept>;
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

    let replacedAny = false;
    /** Replacements chosen for this failedId may be reused across lunch/dinner. */
    const pendingReplacementIds = new Set<string>();

    for (const mealType of mealTypes) {
      const pool = mealType === "lunch" ? input.lunchPool : input.dinnerPool;
      const ranked = pickReplacement({
        mealType,
        pool,
        usedIds,
        failedIds: failedCandidateIds,
        conceptsByCandidateId: input.conceptsByCandidateId,
        allowIds: pendingReplacementIds,
      });
      if (!ranked) {
        unresolvedFailures.push({
          candidateId: failedId,
          code: failure.code,
          message: `${failure.message} No replacement available in ${mealType} pool.`,
        });
        continue;
      }

      const replacementId = ranked.candidate.candidateId;
      let slotCount = 0;
      days = days.map((day) => {
        const slot = day[mealType];
        if (slot.candidateId !== failedId) return day;
        slotCount += 1;
        return {
          ...day,
          [mealType]: hydrateSlotName(
            slot,
            ranked,
            input.conceptsByCandidateId?.[replacementId],
          ),
        };
      });
      pendingReplacementIds.add(replacementId);
      replacements.push({
        failedCandidateId: failedId,
        replacementCandidateId: replacementId,
        mealType,
        slotCount,
      });
      replacedAny = true;
    }

    usedIds.delete(failedId);
    for (const id of pendingReplacementIds) {
      usedIds.add(id);
    }

    if (!replacedAny) {
      unresolvedFailures.push({
        candidateId: failedId,
        code: failure.code,
        message: failure.message,
      });
    }
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
