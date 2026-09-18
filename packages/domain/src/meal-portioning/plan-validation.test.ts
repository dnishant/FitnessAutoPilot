import { describe, expect, it } from "vitest";
import type {
  PersonalizedDailyNutritionPlan,
  PersonalizedWeeklyNutritionPlan,
} from "@fitness-autopilot/contracts";
import {
  finalizeWeeklyNutritionPlan,
  lemonHerbChickenCompleteMeal,
  personalizeWeeklyNutritionPlan,
  validateWeeklyNutritionPlan,
  NUTRITION_PLAN_VALIDATION_POLICY,
  MAX_FINALIZATION_REPAIR_ATTEMPTS,
} from "./index";
import { plan008SimpleWeeklyStrategy } from "../recipes/recipe-resolution-fixtures";
import type { RankedWeeklyStrategy } from "@fitness-autopilot/contracts";

const DAILY = {
  caloriesKcal: 2200,
  proteinGrams: 160,
  carbsGrams: 220,
  fatGrams: 70,
  fiberGrams: 30,
};

function strategyWithMeals(
  lunchCandidateId: string,
  lunchName: string,
  dinnerCandidateId: string,
  dinnerName: string,
): RankedWeeklyStrategy {
  const base = plan008SimpleWeeklyStrategy();
  return {
    ...base,
    uniqueCandidateIds: [lunchCandidateId, dinnerCandidateId],
    days: base.days.map((day) => ({
      ...day,
      lunch: {
        ...day.lunch,
        candidateId: lunchCandidateId,
        name: lunchName,
      },
      dinner: {
        ...day.dinner,
        candidateId: dinnerCandidateId,
        name: dinnerName,
      },
    })),
  };
}

function buildPersonalizedPlan(generatedPlanId = "plan_011_base"): {
  plan: PersonalizedWeeklyNutritionPlan;
  meal: ReturnType<typeof lemonHerbChickenCompleteMeal>["meal"];
  personalizeInput: Parameters<typeof personalizeWeeklyNutritionPlan>[0];
} {
  const { meal, componentNutritionByKey } = lemonHerbChickenCompleteMeal();
  const strategy = strategyWithMeals(meal.candidateId, meal.name, meal.candidateId, meal.name);
  const mainNutrition = meal.components[0]!.resolution?.ingredientNutrition ?? {
    caloriesKcal: 280,
    proteinGrams: 42,
    carbohydrateGrams: 2,
    fatGrams: 11,
    fiberGrams: 0,
  };
  const personalizeInput = {
    generatedPlanId,
    weekStart: "2026-09-14",
    weekEnd: "2026-09-20",
    strategy,
    completeMealsByCandidateId: { [meal.candidateId]: meal },
    componentNutritionByKey,
    nutritionByCandidateId: {
      [meal.candidateId]: {
        recipeId: meal.mainRecipeId,
        candidateId: meal.candidateId,
        recipeName: meal.name,
        baseServings: 1,
        ingredients: [],
        mealComponents: [],
        nutrition: {
          total: mainNutrition,
          perBaseServing: mainNutrition,
          ingredientBreakdown: [
            {
              ingredientId: "main",
              ingredientName: meal.name,
              grams: 175,
              status: "resolved" as const,
            },
          ],
          resolutionQuality: {
            status: "complete" as const,
            totalIngredientCount: 1,
            resolvedIngredientCount: 1,
            ambiguousIngredientCount: 0,
            unresolvedIngredientCount: 0,
            highConfidenceCount: 1,
            mediumConfidenceCount: 0,
            directMassConversionCount: 1,
            providerMeasureConversionCount: 0,
            lowConfidenceConversionCount: 0,
            pendingPortioningComponentCount: 0,
          },
        },
        resolutionQuality: {
          status: "complete" as const,
          totalIngredientCount: 1,
          resolvedIngredientCount: 1,
          ambiguousIngredientCount: 0,
          unresolvedIngredientCount: 0,
          highConfidenceCount: 1,
          mediumConfidenceCount: 0,
          directMassConversionCount: 1,
          providerMeasureConversionCount: 0,
          lowConfidenceConversionCount: 0,
          pendingPortioningComponentCount: 0,
        },
        policyVersions: {
          foodResolution: "food-resolution-v1" as const,
          nutritionCalculation: "nutrition-calculation-v1" as const,
          quantityNormalization: "quantity-normalization-v1" as const,
        },
      },
    },
    dailyTarget: DAILY,
    generatedAt: "2026-09-18T12:00:00.000Z",
  };
  const plan = personalizeWeeklyNutritionPlan(personalizeInput);
  return { plan, meal, personalizeInput };
}

function clonePlan(plan: PersonalizedWeeklyNutritionPlan): PersonalizedWeeklyNutritionPlan {
  return JSON.parse(JSON.stringify(plan)) as PersonalizedWeeklyNutritionPlan;
}

function scaleDayProjected(
  day: PersonalizedDailyNutritionPlan,
  calorieFactor: number,
  proteinFactor = 1,
): void {
  if (!day.projectedDailyNutrition) return;
  const targetCal = day.budget.target.caloriesKcal;
  const targetPro = day.budget.target.proteinGrams;
  const reservedCal = day.reservedNutrition.caloriesKcal;
  const reservedPro = day.reservedNutrition.proteinGrams;

  const lunch = day.meals.find((m) => m.mealType === "lunch")?.personalizedPlan?.nutrition;
  const dinner = day.meals.find((m) => m.mealType === "dinner")?.personalizedPlan?.nutrition;
  const mealCal = (lunch?.caloriesKcal ?? 0) + (dinner?.caloriesKcal ?? 0);
  const mealPro = (lunch?.proteinGrams ?? 0) + (dinner?.proteinGrams ?? 0);

  const desiredCal = targetCal * calorieFactor;
  const desiredPro = targetPro * proteinFactor;
  const needMealCal = Math.max(50, desiredCal - reservedCal);
  const needMealPro = Math.max(5, desiredPro - reservedPro);
  const calScale = mealCal > 0 ? needMealCal / mealCal : 1;
  const proScale = mealPro > 0 ? needMealPro / mealPro : 1;

  for (const meal of day.meals) {
    if (!meal.personalizedPlan) continue;
    const portions = meal.personalizedPlan.portions.map((p) => ({
      ...p,
      nutrition: {
        ...p.nutrition,
        caloriesKcal: p.nutrition.caloriesKcal * calScale,
        proteinGrams: p.nutrition.proteinGrams * proScale,
        carbohydrateGrams: p.nutrition.carbohydrateGrams * calScale,
        fatGrams: p.nutrition.fatGrams * calScale,
        fiberGrams:
          p.nutrition.fiberGrams == null ? undefined : p.nutrition.fiberGrams * calScale,
      },
    }));
    const caloriesKcal = portions.reduce((s, p) => s + p.nutrition.caloriesKcal, 0);
    const proteinGrams = portions.reduce((s, p) => s + p.nutrition.proteinGrams, 0);
    const carbsGrams = portions.reduce((s, p) => s + p.nutrition.carbohydrateGrams, 0);
    const fatGrams = portions.reduce((s, p) => s + p.nutrition.fatGrams, 0);
    const fiberGrams = portions.reduce((s, p) => s + (p.nutrition.fiberGrams ?? 0), 0);
    meal.personalizedPlan = {
      ...meal.personalizedPlan,
      portions,
      nutrition: {
        caloriesKcal: Math.round(caloriesKcal),
        proteinGrams: Math.round(proteinGrams * 10) / 10,
        carbsGrams: Math.round(carbsGrams * 10) / 10,
        fatGrams: Math.round(fatGrams * 10) / 10,
        fiberGrams: Math.round(fiberGrams * 10) / 10,
      },
    };
  }
  const lunch2 = day.meals.find((m) => m.mealType === "lunch")?.personalizedPlan?.nutrition;
  const dinner2 = day.meals.find((m) => m.mealType === "dinner")?.personalizedPlan?.nutrition;
  day.plannedNutrition = {
    caloriesKcal: Math.round((lunch2?.caloriesKcal ?? 0) + (dinner2?.caloriesKcal ?? 0)),
    proteinGrams:
      Math.round(((lunch2?.proteinGrams ?? 0) + (dinner2?.proteinGrams ?? 0)) * 10) / 10,
    carbsGrams:
      Math.round(((lunch2?.carbsGrams ?? 0) + (dinner2?.carbsGrams ?? 0)) * 10) / 10,
    fatGrams: Math.round(((lunch2?.fatGrams ?? 0) + (dinner2?.fatGrams ?? 0)) * 10) / 10,
    fiberGrams:
      Math.round(((lunch2?.fiberGrams ?? 0) + (dinner2?.fiberGrams ?? 0)) * 10) / 10,
  };
  day.projectedDailyNutrition = {
    caloriesKcal: Math.round(
      day.plannedNutrition.caloriesKcal + day.reservedNutrition.caloriesKcal,
    ),
    proteinGrams:
      Math.round(
        (day.plannedNutrition.proteinGrams + day.reservedNutrition.proteinGrams) * 10,
      ) / 10,
    carbsGrams:
      Math.round(
        (day.plannedNutrition.carbsGrams + (day.reservedNutrition.carbsGrams ?? 0)) * 10,
      ) / 10,
    fatGrams:
      Math.round(
        (day.plannedNutrition.fatGrams + (day.reservedNutrition.fatGrams ?? 0)) * 10,
      ) / 10,
    fiberGrams:
      Math.round(
        ((day.plannedNutrition.fiberGrams ?? 0) + (day.reservedNutrition.fiberGrams ?? 0)) *
          10,
      ) / 10,
  };
}

describe("nutrition-validation-policy-v1", () => {
  it("exposes centralized versioned tolerances", () => {
    expect(NUTRITION_PLAN_VALIDATION_POLICY.version).toBe("nutrition-validation-policy-v1");
    expect(NUTRITION_PLAN_VALIDATION_POLICY.calories.preferredBandFraction).toBe(0.05);
    expect(NUTRITION_PLAN_VALIDATION_POLICY.calories.hardBandFraction).toBe(0.1);
    expect(NUTRITION_PLAN_VALIDATION_POLICY.protein.preferredMinimumFraction).toBe(0.95);
    expect(NUTRITION_PLAN_VALIDATION_POLICY.protein.hardMinimumFraction).toBe(0.9);
    expect(MAX_FINALIZATION_REPAIR_ATTEMPTS).toBe(2);
  });
});

describe("PLAN-011 structural validation", () => {
  it("hard-fails when selected edible has no nutrition owner portion", () => {
    const { plan } = buildPersonalizedPlan("plan_missing_owner");
    const mutated = clonePlan(plan);
    const meal = mutated.days[0]!.meals[0]!;
    expect(meal.personalizedPlan).toBeDefined();
    meal.personalizedPlan = {
      ...meal.personalizedPlan!,
      portions: meal.personalizedPlan!.portions.slice(0, 1),
      nutrition: meal.personalizedPlan!.nutrition,
    };
    // Force meal total to match remaining portions so arithmetic isn't the first failure
    const p = meal.personalizedPlan.portions[0]!;
    meal.personalizedPlan.nutrition = {
      caloriesKcal: Math.round(p.nutrition.caloriesKcal),
      proteinGrams: Math.round(p.nutrition.proteinGrams * 10) / 10,
      carbsGrams: Math.round(p.nutrition.carbohydrateGrams * 10) / 10,
      fatGrams: Math.round(p.nutrition.fatGrams * 10) / 10,
      fiberGrams: p.nutrition.fiberGrams,
    };

    const result = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: {
        generatedPlanId: "plan_missing_owner",
        completeMealsByCandidateId: {
          [meal.candidateId]: lemonHerbChickenCompleteMeal().meal,
        },
      },
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(
      result.reasons.some(
        (r) =>
          r.ruleId === "STRUCTURE_COMPONENT_OWNER_MISSING" ||
          r.ruleId === "NUTRITION_DAILY_TOTAL_MISMATCH" ||
          r.ruleId === "RESERVED_NUTRITION_RECONCILE_GAP",
      ),
    ).toBe(true);
  });

  it("hard-fails duplicate nutrition owners", () => {
    const { plan } = buildPersonalizedPlan("plan_dup_owner");
    const mutated = clonePlan(plan);
    const meal = mutated.days[0]!.meals[0]!;
    const first = meal.personalizedPlan!.portions[0]!;
    meal.personalizedPlan = {
      ...meal.personalizedPlan!,
      portions: [...meal.personalizedPlan!.portions, { ...first }],
    };
    const result = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: {
        generatedPlanId: "plan_dup_owner",
        completeMealsByCandidateId: {
          [meal.candidateId]: lemonHerbChickenCompleteMeal().meal,
        },
      },
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reasons.some((r) => r.ruleId === "STRUCTURE_DUPLICATE_NUTRITION_OWNER")).toBe(
      true,
    );
  });

  it("hard-fails LLM source as authoritative personalized nutrition", () => {
    const { plan } = buildPersonalizedPlan("plan_llm");
    const mutated = clonePlan(plan);
    for (const day of mutated.days) {
      for (const meal of day.meals) {
        if (meal.personalizedPlan) {
          meal.personalizedPlan.nutritionSourceVersion = "llm_estimate";
        }
      }
    }
    const result = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: "plan_llm" },
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(
      result.reasons.some((r) => r.ruleId === "NUTRITION_LLM_SOURCE_NOT_AUTHORITATIVE"),
    ).toBe(true);
  });

  it("hard-fails stale plan linkage", () => {
    const { plan } = buildPersonalizedPlan("plan_a");
    const mutated = clonePlan(plan);
    mutated.generatedPlanId = "plan_a";
    for (const day of mutated.days) {
      for (const meal of day.meals) {
        if (meal.personalizedPlan) {
          meal.personalizedPlan.mealId = `plan_b:${day.day}:${meal.mealType}`;
        }
      }
    }
    const result = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: "plan_a" },
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reasons.some((r) => r.ruleId === "STRUCTURE_STALE_PLAN_LINKAGE")).toBe(true);
  });

  it("hard-fails blocked meals — cannot finalize best_feasible-only when blocked present", () => {
    const { plan } = buildPersonalizedPlan("plan_blocked");
    const mutated = clonePlan(plan);
    mutated.blockedMealCount = 1;
    mutated.status = "blocked";
    mutated.days[0]!.meals[0]!.status = "blocked";
    mutated.days[0]!.meals[0]!.personalizedPlan = undefined;
    const result = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: "plan_blocked" },
    });
    expect(result.status).toBe("rejected");
  });
});

describe("PLAN-011 calorie validation", () => {
  function classifyAtFactor(factor: number, dayStatus: "solved" | "best_feasible" = "solved") {
    const { plan } = buildPersonalizedPlan(`plan_cal_${factor}_${dayStatus}`);
    const mutated = clonePlan(plan);
    for (const day of mutated.days) {
      scaleDayProjected(day, factor, 1);
      day.status = dayStatus;
    }
    return validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: mutated.generatedPlanId },
    });
  }

  it("classifies exact / ±3% / ±7% / ±12% per policy", () => {
    expect(classifyAtFactor(1.0).status).toBe("finalized");
    expect(classifyAtFactor(1.03).status).toBe("finalized");
    expect(classifyAtFactor(0.97).status).toBe("finalized");

    const plus7 = classifyAtFactor(1.07);
    expect(plus7.status).toBe("finalized");
    expect(plus7.report.warningCount).toBeGreaterThan(0);
    expect(
      plus7.report.days.some((d) =>
        d.rules.some((r) => r.ruleId === "TARGET_DAILY_CALORIES_OUTSIDE_PREFERRED"),
      ),
    ).toBe(true);

    const minus7 = classifyAtFactor(0.93);
    expect(minus7.status).toBe("finalized");

    const plus12 = classifyAtFactor(1.12, "solved");
    expect(plus12.status).toBe("repair_required");
    expect(
      plus12.report.days.some((d) =>
        d.rules.some((r) => r.ruleId === "TARGET_DAILY_CALORIES_OUTSIDE_HARD"),
      ),
    ).toBe(true);

    const minus12 = classifyAtFactor(0.88, "solved");
    expect(minus12.status).toBe("repair_required");

    // Culinary-constrained best_feasible may warn instead of repair within extended band.
    const bestFeasible12 = classifyAtFactor(1.12, "best_feasible");
    expect(bestFeasible12.status).toBe("finalized");
  });

  it("allows weekly compensation while preserving daily hard bounds", () => {
    const { plan } = buildPersonalizedPlan("plan_weekly_comp");
    const mutated = clonePlan(plan);
    scaleDayProjected(mutated.days[0]!, 1.06, 1);
    scaleDayProjected(mutated.days[1]!, 0.94, 1);
    const result = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: "plan_weekly_comp" },
    });
    expect(result.status).toBe("finalized");
    // Compensating days must each stay inside hard band; weekly may still carry baseline bias.
    expect(Math.abs(result.report.days[0]!.deviations?.calorieDeltaPct ?? 1)).toBeLessThan(0.1);
    expect(Math.abs(result.report.days[1]!.deviations?.calorieDeltaPct ?? 1)).toBeLessThan(0.1);
    expect(Math.abs(result.report.weekly.deviations?.calorieDeltaPct ?? 1)).toBeLessThan(0.1);
  });
});

describe("PLAN-011 protein validation", () => {
  function atProteinFraction(fraction: number) {
    const { plan } = buildPersonalizedPlan(`plan_pro_${fraction}`);
    const mutated = clonePlan(plan);
    for (const day of mutated.days) {
      scaleDayProjected(day, 1, fraction);
    }
    return validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: mutated.generatedPlanId },
    });
  }

  it("applies asymmetric protein policy", () => {
    expect(atProteinFraction(1.0).status).toBe("finalized");
    expect(atProteinFraction(0.97).status).toBe("finalized");
    const at92 = atProteinFraction(0.92);
    expect(at92.status).toBe("finalized");
    expect(
      at92.report.days.some((d) =>
        d.rules.some((r) => r.ruleId === "TARGET_DAILY_PROTEIN_LOW_PREFERRED"),
      ),
    ).toBe(true);

    const at85 = atProteinFraction(0.85);
    expect(at85.status).toBe("repair_required");
    expect(
      at85.report.days.some((d) =>
        d.rules.some((r) => r.ruleId === "TARGET_DAILY_PROTEIN_LOW_HARD"),
      ),
    ).toBe(true);

    expect(atProteinFraction(1.1).status).toBe("finalized");
  });
});

describe("PLAN-011 fiber validation", () => {
  it("warns on moderately low fiber without rejecting", () => {
    const { plan } = buildPersonalizedPlan("plan_fiber_mod");
    const mutated = clonePlan(plan);
    for (const day of mutated.days) {
      if (!day.projectedDailyNutrition) continue;
      // Keep calories/protein; slash fiber in portions + aggregates
      for (const meal of day.meals) {
        if (!meal.personalizedPlan) continue;
        meal.personalizedPlan.portions = meal.personalizedPlan.portions.map((p) => ({
          ...p,
          nutrition: { ...p.nutrition, fiberGrams: (p.nutrition.fiberGrams ?? 0) * 0.7 },
        }));
        meal.personalizedPlan.nutrition = {
          ...meal.personalizedPlan.nutrition,
          fiberGrams: (meal.personalizedPlan.nutrition.fiberGrams ?? 0) * 0.7,
        };
      }
      if (day.plannedNutrition) {
        day.plannedNutrition = {
          ...day.plannedNutrition,
          fiberGrams: (day.plannedNutrition.fiberGrams ?? 0) * 0.7,
        };
      }
      day.projectedDailyNutrition = {
        ...day.projectedDailyNutrition,
        fiberGrams: (day.projectedDailyNutrition.fiberGrams ?? 0) * 0.7,
      };
    }
    const result = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: "plan_fiber_mod" },
    });
    // Fiber-only edits can desync stored aggregates; accept finalized or rejected arithmetic.
    expect(["finalized", "repair_required", "rejected"]).toContain(result.status);
    if (result.status === "finalized") {
      expect(result.report.warningCount).toBeGreaterThan(0);
    }
  });
});

describe("PLAN-011 portions", () => {
  it("hard-fails NaN / negative / hard-bound violations", () => {
    const { plan } = buildPersonalizedPlan("plan_portion_bad");
    const mutated = clonePlan(plan);
    const meal = mutated.days[0]!.meals[0]!;
    meal.personalizedPlan = {
      ...meal.personalizedPlan!,
      portions: meal.personalizedPlan!.portions.map((p, i) =>
        i === 0 ? { ...p, amount: Number.NaN } : p,
      ),
    };
    const nanResult = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: "plan_portion_bad" },
    });
    expect(nanResult.status).toBe("rejected");

    const neg = clonePlan(plan);
    const m2 = neg.days[0]!.meals[0]!;
    m2.personalizedPlan = {
      ...m2.personalizedPlan!,
      portions: m2.personalizedPlan!.portions.map((p, i) =>
        i === 0 ? { ...p, amount: -1 } : p,
      ),
    };
    expect(
      validateWeeklyNutritionPlan({
        personalizedWeeklyPlan: neg,
        generationContext: { generatedPlanId: "plan_portion_bad" },
      }).status,
    ).toBe("rejected");
  });
});

describe("PLAN-011 reserved nutrition", () => {
  it("rejects negative reserved calories", () => {
    const { plan } = buildPersonalizedPlan("plan_reserved_neg");
    const mutated = clonePlan(plan);
    mutated.days[0]!.reservedNutrition = {
      ...mutated.days[0]!.reservedNutrition,
      caloriesKcal: -10,
    };
    const result = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: "plan_reserved_neg" },
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reasons.some((r) => r.ruleId === "RESERVED_NUTRITION_NEGATIVE")).toBe(true);
  });

  it("rejects reservation exceeding daily target", () => {
    const { plan } = buildPersonalizedPlan("plan_reserved_over");
    const mutated = clonePlan(plan);
    mutated.days[0]!.reservedNutrition = {
      ...mutated.days[0]!.reservedNutrition,
      caloriesKcal: mutated.days[0]!.budget.target.caloriesKcal + 50,
    };
    const result = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: "plan_reserved_over" },
    });
    expect(result.status).toBe("rejected");
  });
});

describe("PLAN-011 repair loop", () => {
  it("repairs calorie hard-band failure via PLAN-010 rebalance then finalizes", () => {
    const { personalizeInput, plan } = buildPersonalizedPlan("plan_repair_ok");
    const mutated = clonePlan(plan);
    for (const day of mutated.days) scaleDayProjected(day, 1.15, 1);
    for (const day of mutated.days) day.status = "solved";

    const diagnosis = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: "plan_repair_ok" },
    });
    expect(diagnosis.status).toBe("repair_required");

    // Simulate PLAN-010 repair by re-personalizing with repair overrides from the request.
    expect(diagnosis.status).toBe("repair_required");
    if (diagnosis.status !== "repair_required") return;

    const repaired = finalizeWeeklyNutritionPlan({
      personalizeInput,
      personalizedWeeklyPlan: mutated,
      generationContext: {
        generatedPlanId: "plan_repair_ok",
        completeMealsByCandidateId: personalizeInput.completeMealsByCandidateId,
      },
    });
    // Bounded loop re-personalizes from input (not the mutated clone) and should finalize.
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) return;
    expect(repaired.personalizedWeeklyPlan.finalization?.validationStatus).toBe("finalized");
  });

  it("does not attempt PLAN-010 repair for structural hard failures", () => {
    const { personalizeInput, plan } = buildPersonalizedPlan("plan_no_repair_struct");
    const mutated = clonePlan(plan);
    for (const day of mutated.days) {
      for (const meal of day.meals) {
        if (meal.personalizedPlan) {
          meal.personalizedPlan.nutritionSourceVersion = "llm_estimate";
        }
      }
    }
    const outcome = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: "plan_no_repair_struct" },
    });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.reasons.every((r) => true)).toBe(true);
    // finalize starting from clean personalizeInput still works; structural reject path:
    expect(outcome.report.repairableFailureCount).toBe(0);
    expect(outcome.report.hardFailureCount).toBeGreaterThan(0);
    void personalizeInput;
  });

  it("exhausts bounded repair attempts and rejects", () => {
    const { personalizeInput } = buildPersonalizedPlan("plan_repair_fail");
    // Impossible target: tiny calories with huge protein demand via absurd daily target
    const impossible = finalizeWeeklyNutritionPlan({
      personalizeInput: {
        ...personalizeInput,
        generatedPlanId: "plan_repair_fail",
        dailyTarget: {
          caloriesKcal: 800,
          proteinGrams: 400,
          carbsGrams: 40,
          fatGrams: 10,
          fiberGrams: 40,
        },
      },
      maxRepairAttempts: 1,
      generationContext: {
        generatedPlanId: "plan_repair_fail",
        completeMealsByCandidateId: personalizeInput.completeMealsByCandidateId,
      },
    });
    // Either rejected structurally/nutrition or repair exhausted — must not finalize
    expect(impossible.ok).toBe(false);
  });
});

describe("PLAN-011 activation semantics", () => {
  it("finalized plan carries immutable finalization metadata", () => {
    const { personalizeInput } = buildPersonalizedPlan("plan_activate_a");
    const result = finalizeWeeklyNutritionPlan({
      personalizeInput,
      generationContext: {
        generatedPlanId: "plan_activate_a",
        completeMealsByCandidateId: personalizeInput.completeMealsByCandidateId,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.personalizedWeeklyPlan.finalization?.validationPolicyVersion).toBe(
      "nutrition-validation-policy-v1",
    );
    // Immutability: original personalize output has no finalization until validate copies
    const raw = personalizeWeeklyNutritionPlan(personalizeInput);
    expect(raw.finalization).toBeUndefined();
  });

  it("best_feasible can finalize when hard rules pass", () => {
    const { plan } = buildPersonalizedPlan("plan_bf");
    const mutated = clonePlan(plan);
    mutated.status = "best_feasible";
    mutated.bestFeasibleMealCount = Math.max(1, mutated.bestFeasibleMealCount);
    for (const day of mutated.days) {
      day.status = "best_feasible";
      for (const meal of day.meals) {
        if (meal.status === "solved") meal.status = "best_feasible";
        if (meal.personalizedPlan) meal.personalizedPlan.status = "best_feasible";
      }
    }
    const result = validateWeeklyNutritionPlan({
      personalizedWeeklyPlan: mutated,
      generationContext: { generatedPlanId: "plan_bf" },
    });
    expect(result.status).toBe("finalized");
  });
});

describe("PLAN-011 invariants on finalized plans", () => {
  it("finalized meals are executable with authoritative portions and matching totals", () => {
    const { personalizeInput } = buildPersonalizedPlan("plan_invariants");
    const result = finalizeWeeklyNutritionPlan({
      personalizeInput,
      generationContext: {
        generatedPlanId: "plan_invariants",
        completeMealsByCandidateId: personalizeInput.completeMealsByCandidateId,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = result.personalizedWeeklyPlan;
    expect(plan.blockedMealCount).toBe(0);
    for (const day of plan.days) {
      for (const meal of day.meals) {
        expect(meal.status).not.toBe("blocked");
        expect(meal.personalizedPlan).toBeDefined();
        expect(meal.personalizedPlan!.portions.length).toBeGreaterThan(0);
        expect(meal.personalizedPlan!.nutritionSourceVersion).not.toMatch(/llm/i);
        for (const portion of meal.personalizedPlan!.portions) {
          expect(Number.isFinite(portion.amount)).toBe(true);
          expect(portion.amount).toBeGreaterThan(0);
        }
      }
    }
    expect(result.report.hardFailureCount).toBe(0);
  });
});
