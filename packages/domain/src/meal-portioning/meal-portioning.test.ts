import { describe, expect, it } from "vitest";
import type { SolveMealPortionsRequest } from "@fitness-autopilot/contracts";
import { MEAL_PORTION_POLICY_VERSION } from "@fitness-autopilot/contracts";
import { buildPortionVariables } from "./build-variables";
import {
  chickenTikkaCompleteMealRequest,
  DEVELOPER_TEST_INTENT_600,
  DEVELOPER_TEST_INTENT_CALORIES_PROTEIN_ONLY,
  jamaicanJerkCompleteMealRequest,
  shrimpTacosCompleteMealRequest,
  thaiGreenCurryCompleteMealRequest,
} from "./fixtures";
import { nutritionForFoodGrams, nutritionForRecipeScale } from "./nutrition";
import { MEAL_PORTION_POLICY_V1 } from "./policy";
import { formatPortionSolverDiagnostics, solveMealPortions } from "./solver";
import { developerTestMealIntentFromDaily, solveWeeklyMealPortions } from "./weekly";

describe("PLAN-010 deterministic meal portion solver", () => {
  it("is deterministic for identical inputs", () => {
    const request = chickenTikkaCompleteMealRequest();
    const a = solveMealPortions(request);
    const b = solveMealPortions(request);
    const stripTiming = (plan: typeof a) => ({
      ...plan,
      diagnostics: {
        ...plan.diagnostics,
        solveTimeMs: 0,
      },
    });
    expect(stripTiming(a)).toEqual(stripTiming(b));
    expect(a.portions).toEqual(b.portions);
    expect(a.nutrition).toEqual(b.nutrition);
    expect(a.status).not.toBe("blocked");
  });

  it("scales nutrition linearly with grams / recipe scale", () => {
    const per100 = {
      caloriesKcal: 130,
      proteinGrams: 2.7,
      carbohydrateGrams: 28,
      fatGrams: 0.3,
      fiberGrams: 0.4,
    };
    const n180 = nutritionForFoodGrams(per100, 180);
    const n90 = nutritionForFoodGrams(per100, 90);
    expect(n90.caloriesKcal).toBeCloseTo(n180.caloriesKcal / 2, 8);
    expect(n90.proteinGrams).toBeCloseTo(n180.proteinGrams / 2, 8);

    const base = {
      caloriesKcal: 100,
      proteinGrams: 10,
      carbohydrateGrams: 5,
      fatGrams: 2,
      fiberGrams: 1,
    };
    expect(nutritionForRecipeScale(base, 1.5).proteinGrams).toBeCloseTo(15, 8);
  });

  it("keeps compound Kachumber as a single scalable unit", () => {
    const plan = solveMealPortions(chickenTikkaCompleteMealRequest());
    const kachumber = plan.portions.find((p) => p.componentId === "kachumber");
    expect(kachumber).toBeDefined();
    expect(kachumber!.unit).toBe("g");
    expect(kachumber!.internalScale).toBeDefined();
    // No independent cucumber/onion/lemon portions invented.
    expect(plan.portions.every((p) => !/cucumber|onion|lemon/i.test(p.displayName))).toBe(true);
  });

  it("keeps sauce within culinary bounds", () => {
    const plan = solveMealPortions(chickenTikkaCompleteMealRequest());
    const sauce = plan.portions.find((p) => p.componentId === "chutney")!;
    expect(sauce.amount).toBeGreaterThanOrEqual(25);
    expect(sauce.amount).toBeLessThanOrEqual(55);
  });

  it("keeps main above meaningful minimum", () => {
    const plan = solveMealPortions(
      chickenTikkaCompleteMealRequest({
        ...DEVELOPER_TEST_INTENT_600,
        targetCaloriesKcal: 420,
        targetProteinGrams: 35,
      }),
    );
    const main = plan.portions.find((p) => p.componentId === "main")!;
    // minScale 0.7 * 170g ≈ 119g
    expect(main.amount).toBeGreaterThanOrEqual(115);
  });

  it("allows carbohydrate flexibility within wider bounds", () => {
    const low = solveMealPortions(
      chickenTikkaCompleteMealRequest({
        targetCaloriesKcal: 480,
        targetProteinGrams: 45,
        isDeveloperTestIntent: true,
      }),
    );
    const high = solveMealPortions(
      chickenTikkaCompleteMealRequest({
        targetCaloriesKcal: 780,
        targetProteinGrams: 50,
        isDeveloperTestIntent: true,
      }),
    );
    const riceLow = low.portions.find((p) => p.componentId === "rice")!.amount;
    const riceHigh = high.portions.find((p) => p.componentId === "rice")!.amount;
    expect(riceHigh).toBeGreaterThan(riceLow);
    expect(riceLow).toBeGreaterThanOrEqual(80);
    expect(riceHigh).toBeLessThanOrEqual(320);
  });

  it("does not let vegetables disappear", () => {
    const plan = solveMealPortions(
      chickenTikkaCompleteMealRequest({
        targetCaloriesKcal: 450,
        targetProteinGrams: 40,
        isDeveloperTestIntent: true,
      }),
    );
    const veg = plan.portions.find((p) => p.componentId === "kachumber")!;
    expect(veg.amount).toBeGreaterThanOrEqual(70);
  });

  it("respects discrete tortilla counts", () => {
    const plan = solveMealPortions(shrimpTacosCompleteMealRequest());
    const tortillas = plan.portions.find((p) => p.componentId === "tortillas")!;
    expect(Number.isInteger(tortillas.amount)).toBe(true);
    expect(tortillas.unit).toBe("piece");
    expect(tortillas.amount).toBeGreaterThanOrEqual(1);
    expect(tortillas.amount).toBeLessThanOrEqual(4);
  });

  it("recalculates nutrition after practical rounding", () => {
    const plan = solveMealPortions(chickenTikkaCompleteMealRequest());
    const sumKcal = plan.portions.reduce((acc, p) => acc + p.nutrition.caloriesKcal, 0);
    expect(plan.nutrition.caloriesKcal).toBe(Math.round(sumKcal));
  });

  it("blocks when required canonical nutrition is missing", () => {
    const request: SolveMealPortionsRequest = {
      mealId: "broken",
      components: [
        {
          kind: "food_grams",
          componentId: "rice",
          displayName: "Rice",
          role: "carbohydrate",
          nutritionPer100g: {
            caloriesKcal: Number.NaN,
            proteinGrams: 2,
            carbohydrateGrams: 28,
            fatGrams: 0,
          },
        },
      ],
      nutritionIntent: DEVELOPER_TEST_INTENT_CALORIES_PROTEIN_ONLY,
    };
    const plan = solveMealPortions(request);
    expect(plan.status).toBe("blocked");
    expect(plan.diagnostics.blockReason).toBe("missing_canonical_nutrition");
  });

  it("blocks compound recipes without usable reference yield", () => {
    const request: SolveMealPortionsRequest = {
      mealId: "no-yield",
      components: [
        {
          kind: "recipe_scale",
          componentId: "slaw",
          displayName: "Mystery Slaw",
          role: "vegetable",
          baseNutrition: {
            caloriesKcal: 40,
            proteinGrams: 1,
            carbohydrateGrams: 8,
            fatGrams: 0.5,
          },
          requiresReferenceYield: true,
        },
      ],
      nutritionIntent: DEVELOPER_TEST_INTENT_600,
    };
    const plan = solveMealPortions(request);
    expect(plan.status).toBe("blocked");
    expect(plan.diagnostics.blockReason).toBe("missing_reference_yield");
  });

  it("returns best_feasible for near-target realistic plates", () => {
    const plan = solveMealPortions(chickenTikkaCompleteMealRequest());
    expect(["solved", "best_feasible"]).toContain(plan.status);
    expect(Math.abs(plan.nutrition.caloriesKcal - 600)).toBeLessThan(120);
  });

  it("blocks impossible calorie ceilings vs minimum culinary portions", () => {
    const plan = solveMealPortions(
      chickenTikkaCompleteMealRequest({
        targetCaloriesKcal: 80,
        targetProteinGrams: 10,
        isDeveloperTestIntent: true,
      }),
    );
    expect(plan.status).toBe("blocked");
    expect(plan.diagnostics.blockReason).toBe("minimum_exceeds_calorie_ceiling");
  });

  it("works with calories + protein only", () => {
    const plan = solveMealPortions(
      chickenTikkaCompleteMealRequest(DEVELOPER_TEST_INTENT_CALORIES_PROTEIN_ONLY),
    );
    expect(plan.status).not.toBe("blocked");
    expect(plan.intent.targetCarbsGrams).toBeUndefined();
  });

  it("considers full macro + fiber targets", () => {
    const plan = solveMealPortions(chickenTikkaCompleteMealRequest(DEVELOPER_TEST_INTENT_600));
    expect(plan.nutrition.fiberGrams).toBeDefined();
    expect(plan.diagnostics.fiberDeviationGrams).toBeDefined();
  });

  it("solves Jamaican Jerk with compound Rice & Peas as one unit", () => {
    const plan = solveMealPortions(jamaicanJerkCompleteMealRequest());
    expect(plan.status).not.toBe("blocked");
    const ricePeas = plan.portions.find((p) => p.componentId === "rice-peas")!;
    expect(ricePeas.internalScale).toBeDefined();
    expect(plan.portions.some((p) => /pigeon|coconut milk/i.test(p.displayName))).toBe(false);
  });

  it("portions an already-complete Thai Green Curry meal", () => {
    const plan = solveMealPortions(thaiGreenCurryCompleteMealRequest());
    expect(plan.portions).toHaveLength(2);
    expect(plan.status).not.toBe("blocked");
  });

  it("dedupes weekly solves by culinary identity + intent", () => {
    const intent = DEVELOPER_TEST_INTENT_600;
    const a = chickenTikkaCompleteMealRequest(intent);
    const b = {
      ...chickenTikkaCompleteMealRequest(intent),
      mealId: "meal-tikka-monday-lunch",
    };
    const differentIntent = {
      ...chickenTikkaCompleteMealRequest({
        ...intent,
        targetCaloriesKcal: 700,
      }),
      mealId: "meal-tikka-tuesday-lunch",
    };
    const result = solveWeeklyMealPortions({
      requests: [a, b, differentIntent],
    });
    expect(result.solves).toBe(2);
    expect(result.cacheHits).toBe(1);
  });

  it("labels developer daily-share intents as test allocation", () => {
    const intent = developerTestMealIntentFromDaily({
      dailyCalories: 2000,
      dailyProteinGrams: 150,
      mealType: "dinner",
    });
    expect(intent.isDeveloperTestIntent).toBe(true);
    expect(intent.targetCaloriesKcal).toBe(600);
    expect(intent.label).toMatch(/not PLAN-011/i);
  });

  it("builds variables from policy without scattering magic numbers", () => {
    const built = buildPortionVariables(
      chickenTikkaCompleteMealRequest().components,
      MEAL_PORTION_POLICY_V1,
    );
    expect(built.ok).toBe(true);
    if (built.ok) {
      const sauce = built.variables.find((v) => v.componentId === "chutney");
      expect(sauce?.kind).toBe("recipe_scale");
      if (sauce?.kind === "recipe_scale") {
        expect(sauce.maxScale).toBeLessThanOrEqual(1.25);
      }
    }
  });

  it("emits developer diagnostics", () => {
    const plan = solveMealPortions(chickenTikkaCompleteMealRequest());
    const text = formatPortionSolverDiagnostics(plan);
    expect(text).toContain("Chicken Tikka");
    expect(text).toContain(MEAL_PORTION_POLICY_VERSION);
    expect(text).toMatch(/Status:/);
  });

  it("reports practical solve performance for fixtures", () => {
    const fixtures = [
      chickenTikkaCompleteMealRequest(),
      jamaicanJerkCompleteMealRequest(),
      thaiGreenCurryCompleteMealRequest(),
      shrimpTacosCompleteMealRequest(),
    ];
    const times: number[] = [];
    let candidates = 0;
    for (const request of fixtures) {
      const plan = solveMealPortions(request);
      expect(plan.status).not.toBe("blocked");
      times.push(plan.diagnostics.solveTimeMs ?? 0);
      candidates += plan.diagnostics.candidatesEvaluated ?? 0;
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const worst = Math.max(...times);
    expect(avg).toBeLessThan(100);
    expect(worst).toBeLessThan(250);
    expect(candidates).toBeGreaterThan(0);
  });
});
