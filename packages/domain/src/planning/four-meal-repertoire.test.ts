import { describe, expect, it } from "vitest";
import {
  V1_CORE_MEAL_COUNT,
  V1_COVERED_DAY_COUNT,
  V1_FLEXIBLE_DAY_DEFAULT,
  V1_PLANNED_LUNCH_DINNER_SLOTS,
} from "@fitness-autopilot/contracts";
import { makeRankingCandidate } from "../recipes/candidate-ranking-fixtures";
import { makeRankedCandidate } from "./ranked-weekly-strategy-fixtures";
import {
  assignFourMealsToWeek,
  buildV1WeeklyStrategy,
  selectFourMealRepertoire,
} from "./four-meal-repertoire";

/**
 * V1 four-meal repertoire acceptance matrix (subset):
 * A — combinatorial set selection (not independent top-4)
 * B — culinary repetition / variety penalty
 * C — stable CoreMealId across assignment
 * F — exactly 12 lunch/dinner slots across 6 covered days
 * J — flexible Sunday omitted from covered days
 */

function rankedMeal(
  id: string,
  overrides: Omit<Parameters<typeof makeRankingCandidate>[0], "candidateId"> & {
    score?: number;
    rank?: number;
  },
) {
  const { score, rank, name, ...candidateOverrides } = overrides;
  return makeRankedCandidate(
    makeRankingCandidate({
      ...candidateOverrides,
      candidateId: id,
      name: name ?? id,
    }),
    rank ?? 1,
    score ?? 90,
  );
}

describe("four-meal repertoire (V1 matrix)", () => {
  it("A: selects a combinatorial set, not independent top-4 scores", () => {
    // Four near-clones dominate individual scores but share cuisine+protein+form.
    const clones = [1, 2, 3, 4].map((n) =>
      rankedMeal(`clone-${n}`, {
        name: `Clone Chicken Bowl ${n}`,
        cuisineFamily: "American",
        primaryProtein: "Chicken",
        dishFormat: "bowl",
        flavorFamilies: ["savory"],
        mealPrepAdaptability: "fully_prepped",
        fitnessAdaptability: "easy",
        score: 99 - n,
        rank: n,
      }),
    );
    // Slightly lower individual scores but diverse cuisine/protein/form.
    const diverse = [
      rankedMeal("indian-tikka", {
        name: "Chicken Tikka",
        cuisineFamily: "Indian",
        primaryProtein: "Chicken",
        dishFormat: "tikka kebab",
        flavorFamilies: ["tandoori"],
        mealPrepAdaptability: "component_prepped",
        fitnessAdaptability: "easy",
        score: 82,
        rank: 5,
      }),
      rankedMeal("mexican-fish", {
        name: "Pescado Veracruzana",
        cuisineFamily: "Mexican",
        primaryProtein: "Fish",
        dishFormat: "stew",
        flavorFamilies: ["tomato", "olive"],
        mealPrepAdaptability: "component_prepped",
        fitnessAdaptability: "moderate",
        score: 81,
        rank: 6,
      }),
      rankedMeal("thai-curry", {
        name: "Thai Green Curry",
        cuisineFamily: "Thai",
        primaryProtein: "Shrimp",
        dishFormat: "curry",
        flavorFamilies: ["coconut", "chili"],
        mealPrepAdaptability: "fully_prepped",
        fitnessAdaptability: "moderate",
        score: 80,
        rank: 7,
      }),
      rankedMeal("beef-fry", {
        name: "Kerala Beef Fry",
        cuisineFamily: "Indian",
        primaryProtein: "Beef",
        dishFormat: "dry roast fry",
        flavorFamilies: ["coconut-chili"],
        mealPrepAdaptability: "fully_prepped",
        fitnessAdaptability: "easy",
        score: 79,
        rank: 8,
      }),
    ];

    const pool = [...clones, ...diverse];
    const selected = selectFourMealRepertoire({
      lunchPool: pool,
      dinnerPool: pool,
      varietyLevel: "high",
    });
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;

    const ids = selected.value.candidates.map((c) => c.ranked.candidate.candidateId);
    expect(ids).toHaveLength(V1_CORE_MEAL_COUNT);
    // Top-4 by score alone would be clone-1..4; combinatorial scoring should reject that set.
    const cloneCount = ids.filter((id) => id.startsWith("clone-")).length;
    expect(cloneCount).toBeLessThan(4);
    expect(selected.value.breakdown.repetitionPenalty).toBeLessThan(0.9);
  });

  it("B: applies a variety / repetition penalty to near-identical meals", () => {
    const identical = [1, 2, 3, 4].map((n) =>
      rankedMeal(`same-${n}`, {
        name: `Same Dish ${n}`,
        cuisineFamily: "Indian",
        primaryProtein: "Chicken",
        dishFormat: "tikka kebab",
        flavorFamilies: ["tandoori"],
        mealPrepAdaptability: "component_prepped",
        score: 90,
        rank: n,
      }),
    );
    const varied = [
      rankedMeal("a", {
        name: "A",
        cuisineFamily: "Indian",
        primaryProtein: "Chicken",
        dishFormat: "plate",
        flavorFamilies: ["savory"],
        mealPrepAdaptability: "fully_prepped",
        score: 88,
        rank: 1,
      }),
      rankedMeal("b", {
        name: "B",
        cuisineFamily: "Mexican",
        primaryProtein: "Fish",
        dishFormat: "stew",
        flavorFamilies: ["bright"],
        mealPrepAdaptability: "component_prepped",
        score: 87,
        rank: 2,
      }),
      rankedMeal("c", {
        name: "C",
        cuisineFamily: "Thai",
        primaryProtein: "Shrimp",
        dishFormat: "curry",
        flavorFamilies: ["spicy"],
        mealPrepAdaptability: "fully_prepped",
        score: 86,
        rank: 3,
      }),
      rankedMeal("d", {
        name: "D",
        cuisineFamily: "Italian",
        primaryProtein: "Beef",
        dishFormat: "skillet",
        flavorFamilies: ["herby"],
        mealPrepAdaptability: "component_prepped",
        score: 85,
        rank: 4,
      }),
    ];

    const identicalSet = selectFourMealRepertoire({
      lunchPool: identical,
      dinnerPool: identical,
      varietyLevel: "balanced",
    });
    const variedSet = selectFourMealRepertoire({
      lunchPool: varied,
      dinnerPool: varied,
      varietyLevel: "balanced",
    });
    expect(identicalSet.ok && variedSet.ok).toBe(true);
    if (!identicalSet.ok || !variedSet.ok) return;

    expect(identicalSet.value.breakdown.repetitionPenalty).toBeGreaterThan(
      variedSet.value.breakdown.repetitionPenalty,
    );
    expect(variedSet.value.breakdown.culinaryDiversity).toBeGreaterThan(
      identicalSet.value.breakdown.culinaryDiversity,
    );
    expect(variedSet.value.score).toBeGreaterThan(identicalSet.value.score);
  });

  it("C: assigns stable CoreMealId equal to candidateId across the repertoire", () => {
    const pool = [
      rankedMeal("tikka-chicken", {
        name: "Chicken Tikka",
        cuisineFamily: "Indian",
        primaryProtein: "Chicken",
        dishFormat: "tikka kebab",
        mealPrepAdaptability: "component_prepped",
        score: 90,
        rank: 1,
      }),
      rankedMeal("kerala-beef-fry", {
        name: "Kerala Beef Fry",
        cuisineFamily: "Indian",
        primaryProtein: "Beef",
        dishFormat: "dry roast fry",
        mealPrepAdaptability: "fully_prepped",
        score: 88,
        rank: 2,
      }),
      rankedMeal("jamaican-jerk-chicken", {
        name: "Jamaican Jerk Chicken",
        cuisineFamily: "Caribbean",
        primaryProtein: "Chicken",
        dishFormat: "grill",
        mealPrepAdaptability: "fully_prepped",
        score: 86,
        rank: 3,
      }),
      rankedMeal("thai-green-curry", {
        name: "Thai Green Curry",
        cuisineFamily: "Thai",
        primaryProtein: "Shrimp",
        dishFormat: "curry",
        mealPrepAdaptability: "component_prepped",
        score: 84,
        rank: 4,
      }),
    ];

    const built = buildV1WeeklyStrategy({
      lunchPool: pool,
      dinnerPool: pool,
      varietyLevel: "simple",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const { strategy } = built.value;
    expect(strategy.coreRepertoire).toBeDefined();
    for (const core of strategy.coreRepertoire!.coreMeals) {
      expect(core.coreMealId).toBe(core.candidateId);
      expect(strategy.uniqueCandidateIds).toContain(core.candidateId);
      expect(core.weeklyInstanceCount).toBe(core.mealInstanceSlots.length);
      expect(core.weeklyInstanceCount).toBeGreaterThan(0);
    }
    // Stable across re-assignment of the same scored set.
    const again = assignFourMealsToWeek({ repertoire: built.value.repertoireScore });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.coreRepertoire!.coreMeals.map((m) => m.coreMealId).sort()).toEqual(
      strategy.coreRepertoire!.coreMeals.map((m) => m.coreMealId).sort(),
    );
  });

  it("F: produces exactly 12 lunch/dinner slots across 6 covered days", () => {
    const pool = [
      rankedMeal("m1", {
        name: "Meal 1",
        cuisineFamily: "Indian",
        primaryProtein: "Chicken",
        dishFormat: "plate",
        mealPrepAdaptability: "fully_prepped",
        score: 90,
        rank: 1,
      }),
      rankedMeal("m2", {
        name: "Meal 2",
        cuisineFamily: "Mexican",
        primaryProtein: "Fish",
        dishFormat: "stew",
        mealPrepAdaptability: "component_prepped",
        score: 88,
        rank: 2,
      }),
      rankedMeal("m3", {
        name: "Meal 3",
        cuisineFamily: "Thai",
        primaryProtein: "Shrimp",
        dishFormat: "curry",
        mealPrepAdaptability: "fully_prepped",
        score: 86,
        rank: 3,
      }),
      rankedMeal("m4", {
        name: "Meal 4",
        cuisineFamily: "Italian",
        primaryProtein: "Beef",
        dishFormat: "skillet",
        mealPrepAdaptability: "component_prepped",
        score: 84,
        rank: 4,
      }),
    ];

    const built = buildV1WeeklyStrategy({ lunchPool: pool, dinnerPool: pool });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const { strategy } = built.value;
    expect(strategy.days).toHaveLength(V1_COVERED_DAY_COUNT);
    expect(strategy.uniqueCandidateIds).toHaveLength(V1_CORE_MEAL_COUNT);
    const slots = strategy.days.flatMap((d) => [d.lunch, d.dinner]);
    expect(slots).toHaveLength(V1_PLANNED_LUNCH_DINNER_SLOTS);
    expect(slots.every((s) => s.mealType === "lunch" || s.mealType === "dinner")).toBe(true);
    const instanceTotal = strategy.coreRepertoire!.coreMeals.reduce(
      (sum, m) => sum + m.weeklyInstanceCount,
      0,
    );
    expect(instanceTotal).toBe(V1_PLANNED_LUNCH_DINNER_SLOTS);
  });

  it("J: marks Sunday as flexible and omits it from covered days", () => {
    const pool = [
      rankedMeal("m1", {
        name: "Meal 1",
        cuisineFamily: "Indian",
        primaryProtein: "Chicken",
        dishFormat: "plate",
        mealPrepAdaptability: "fully_prepped",
        score: 90,
        rank: 1,
      }),
      rankedMeal("m2", {
        name: "Meal 2",
        cuisineFamily: "Mexican",
        primaryProtein: "Fish",
        dishFormat: "stew",
        mealPrepAdaptability: "component_prepped",
        score: 88,
        rank: 2,
      }),
      rankedMeal("m3", {
        name: "Meal 3",
        cuisineFamily: "Thai",
        primaryProtein: "Shrimp",
        dishFormat: "curry",
        mealPrepAdaptability: "fully_prepped",
        score: 86,
        rank: 3,
      }),
      rankedMeal("m4", {
        name: "Meal 4",
        cuisineFamily: "Italian",
        primaryProtein: "Beef",
        dishFormat: "skillet",
        mealPrepAdaptability: "component_prepped",
        score: 84,
        rank: 4,
      }),
    ];

    const built = buildV1WeeklyStrategy({ lunchPool: pool, dinnerPool: pool });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const { strategy } = built.value;
    expect(strategy.flexibleDay).toBe(V1_FLEXIBLE_DAY_DEFAULT);
    expect(strategy.days.map((d) => d.day)).not.toContain("sunday");
    expect(strategy.coreRepertoire!.flexibleDay).toBe("sunday");
    expect(strategy.coreRepertoire!.coveredDays).not.toContain("sunday");
    expect(strategy.coreRepertoire!.coveredDays).toHaveLength(V1_COVERED_DAY_COUNT);
  });
});
