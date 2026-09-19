import { describe, expect, it } from "vitest";
import {
  buildIngredientFootprintFromMentions,
  collectExactIngredientUses,
  evaluateExactGroceryComplexity,
  flattenFootprintConcepts,
  scoreCandidateIngredientEconomy,
  toIngredientConcept,
} from "./index";
import {
  canonicalizeGroceryIngredientName,
  validateGroceryIdentityUnitCoherence,
} from "../../grocery/canonicalize";
import { categorizeGroceryItem } from "../../grocery/policy";
import { formatGroceryDisplay } from "../../grocery/units";
import { buildGroceryIdentityKey } from "../../grocery/identity";

describe("ingredient economy — Stage A predictive scoring", () => {
  it("rewards reuse without treating it as meal repetition", () => {
    const mealA = {
      candidateId: "a",
      name: "Chicken Tikka Rice Bowl",
      footprint: buildIngredientFootprintFromMentions({
        proteins: ["chicken"],
        produce: ["onion", "lime", "cilantro"],
        starches: ["rice"],
        flavor: ["yogurt", "cumin"],
      }),
    };
    const mealB = {
      candidateId: "b",
      name: "Chipotle Chicken Tacos",
      footprint: buildIngredientFootprintFromMentions({
        proteins: ["chicken"],
        produce: ["cabbage", "lime", "cilantro"],
        starches: ["tortillas"],
        flavor: ["chipotle"],
      }),
    };
    const mealC = {
      candidateId: "c",
      name: "Salmon Rice Bowl",
      footprint: buildIngredientFootprintFromMentions({
        proteins: ["salmon"],
        produce: ["cabbage"],
        starches: ["rice"],
        flavor: ["yogurt"],
      }),
    };
    const mealD = {
      candidateId: "d",
      name: "Specialty Antipasto Plate",
      footprint: buildIngredientFootprintFromMentions({
        proteins: ["beef"],
        specialty: ["specialty olives", "pine nuts", "prosciutto", "white wine"],
      }),
    };

    const ab = scoreCandidateIngredientEconomy({ candidate: mealB, selected: [mealA] });
    const ad = scoreCandidateIngredientEconomy({ candidate: mealD, selected: [mealA] });
    const abcVsAbd =
      scoreCandidateIngredientEconomy({ candidate: mealC, selected: [mealA, mealB] })
        .netEconomyScore >
      scoreCandidateIngredientEconomy({ candidate: mealD, selected: [mealA, mealB] })
        .netEconomyScore;

    expect(ab.sharedConceptKeys).toEqual(
      expect.arrayContaining(["chicken", "lime", "cilantro"]),
    );
    expect(ab.netEconomyScore).toBeGreaterThan(ad.netEconomyScore);
    expect(abcVsAbd).toBe(true);
    expect(ad.newSpecialtyKeys.length).toBeGreaterThanOrEqual(3);
  });

  it("penalizes one-off perishable specialty more than one-off pantry staple", () => {
    const base = {
      candidateId: "base",
      name: "Base",
      footprint: buildIngredientFootprintFromMentions({
        proteins: ["chicken"],
        produce: ["onion"],
      }),
    };
    const cuminOnly = {
      candidateId: "cumin",
      name: "Cumin Dish",
      footprint: buildIngredientFootprintFromMentions({
        proteins: ["chicken"],
        flavor: ["cumin"],
      }),
    };
    const herbOnly = {
      candidateId: "herb",
      name: "Specialty Herb Dish",
      footprint: buildIngredientFootprintFromMentions({
        proteins: ["chicken"],
        specialty: ["fresh curry leaves"],
        produce: ["curry leaves"],
      }),
    };

    const cuminScore = scoreCandidateIngredientEconomy({
      candidate: cuminOnly,
      selected: [base],
    });
    const herbScore = scoreCandidateIngredientEconomy({
      candidate: herbOnly,
      selected: [base],
    });
    expect(herbScore.freshWastePenalty + herbScore.specialtyPenalty).toBeGreaterThan(
      cuminScore.specialtyPenalty + cuminScore.freshWastePenalty,
    );
  });
});

describe("ingredient economy — Stage B exact complexity", () => {
  it("flags pathological one-off specialty weeks as excessive", () => {
    const uses = collectExactIngredientUses([
      { candidateId: "a", ingredientName: "chicken" },
      { candidateId: "a", ingredientName: "salt" },
      { candidateId: "b", ingredientName: "prosciutto" },
      { candidateId: "b", ingredientName: "pine nuts" },
      { candidateId: "b", ingredientName: "specialty olives" },
      { candidateId: "b", ingredientName: "white wine" },
      { candidateId: "b", ingredientName: "capers" },
      { candidateId: "c", ingredientName: "guajillo chiles" },
      { candidateId: "c", ingredientName: "pasilla chiles" },
      { candidateId: "c", ingredientName: "curry leaves" },
      { candidateId: "d", ingredientName: "fresh cilantro" },
      { candidateId: "e", ingredientName: "fresh parsley" },
      { candidateId: "f", ingredientName: "fresh mint" },
      // inflate unique count toward pathological
      ...Array.from({ length: 40 }, (_, i) => ({
        candidateId: `x${i}`,
        ingredientName: `unique produce ${i}`,
      })),
    ]);
    const metrics = evaluateExactGroceryComplexity({
      ingredientUses: uses,
      uniqueMealConcepts: 10,
      varietyLevel: "balanced",
    });
    expect(metrics.band).toBe("excessive");
    expect(metrics.oneOffSpecialtyIngredients).toBeGreaterThan(2);
  });

  it("accepts compact overlapping weeks for balanced", () => {
    const uses = collectExactIngredientUses([
      { candidateId: "tikka", ingredientName: "chicken" },
      { candidateId: "tikka", ingredientName: "yogurt" },
      { candidateId: "tikka", ingredientName: "onion" },
      { candidateId: "tikka", ingredientName: "cilantro" },
      { candidateId: "tikka", ingredientName: "lime" },
      { candidateId: "tikka", ingredientName: "rice" },
      { candidateId: "tikka", ingredientName: "cumin" },
      { candidateId: "tikka", ingredientName: "salt" },
      { candidateId: "tacos", ingredientName: "chicken" },
      { candidateId: "tacos", ingredientName: "tortillas" },
      { candidateId: "tacos", ingredientName: "onion" },
      { candidateId: "tacos", ingredientName: "cilantro" },
      { candidateId: "tacos", ingredientName: "lime" },
      { candidateId: "tacos", ingredientName: "cabbage" },
      { candidateId: "lemon", ingredientName: "chicken" },
      { candidateId: "lemon", ingredientName: "lemon" },
      { candidateId: "lemon", ingredientName: "garlic" },
      { candidateId: "lemon", ingredientName: "olive oil" },
      { candidateId: "lemon", ingredientName: "rice" },
      { candidateId: "salmon", ingredientName: "salmon" },
      { candidateId: "salmon", ingredientName: "cabbage" },
      { candidateId: "salmon", ingredientName: "rice" },
      { candidateId: "salmon", ingredientName: "yogurt" },
    ]);
    const metrics = evaluateExactGroceryComplexity({
      ingredientUses: uses,
      uniqueMealConcepts: 4,
      varietyLevel: "balanced",
    });
    expect(metrics.band).not.toBe("excessive");
    expect(metrics.ingredientReuseRatio).toBeGreaterThan(0.3);
  });

  it("accepts a realistic four-recipe grocery footprint for balanced V1", () => {
    // ~45 unique rows across 4 meals with shared aromatics — typical meal-prep week.
    const shared = ["onion", "garlic", "olive oil", "salt", "black pepper", "cumin"];
    const meals: Array<{ id: string; extras: string[] }> = [
      {
        id: "tikka",
        extras: [
          "chicken",
          "yogurt",
          "rice",
          "cilantro",
          "lime",
          "ginger",
          "turmeric",
          "garam masala",
          "tomato",
        ],
      },
      {
        id: "tacos",
        extras: [
          "chicken",
          "tortillas",
          "cabbage",
          "cilantro",
          "lime",
          "chili powder",
          "sour cream",
          "avocado",
        ],
      },
      {
        id: "keema",
        extras: [
          "ground beef",
          "rice",
          "peas",
          "tomato",
          "ginger",
          "coriander",
          "turmeric",
          "garam masala",
        ],
      },
      {
        id: "salmon",
        extras: [
          "salmon",
          "potato",
          "broccoli",
          "lemon",
          "parsley",
          "butter",
          "paprika",
        ],
      },
    ];
    const rows = meals.flatMap((meal) =>
      [...shared, ...meal.extras].map((ingredientName) => ({
        candidateId: meal.id,
        ingredientName,
      })),
    );
    const metrics = evaluateExactGroceryComplexity({
      ingredientUses: collectExactIngredientUses(rows),
      uniqueMealConcepts: 4,
      varietyLevel: "balanced",
    });
    expect(metrics.uniqueCanonicalIngredients).toBeLessThanOrEqual(58);
    expect(metrics.band).not.toBe("excessive");
  });
});

describe("PLAN-012 grocery canonicalization", () => {
  it("merges garlic aliases and strips usage annotations", () => {
    const variants = [
      "Fresh garlic",
      "Garlic",
      "Garlic cloves",
      "garlic, minced",
      "Garlic (for filling)",
      "Garlic (for sauce)",
    ];
    const keys = variants.map((name) =>
      buildGroceryIdentityKey({ displayName: name, preparation: name.includes("minced") ? "minced" : null }),
    );
    expect(new Set(keys).size).toBe(1);
    const parsed = canonicalizeGroceryIngredientName({
      displayName: "Garlic (for sauce), minced",
      preparation: "minced",
    });
    expect(parsed.conceptKey).toBe("garlic");
    expect(parsed.usageAnnotation).toMatch(/sauce/i);
    expect(parsed.preparationAnnotation).toMatch(/minced/i);
  });

  it("merges olive oil and parsley aliases but not fresh vs dried / powder", () => {
    expect(
      buildGroceryIdentityKey({ displayName: "Extra Virgin Olive Oil" }),
    ).toBe(buildGroceryIdentityKey({ displayName: "Extra-virgin olive oil" }));
    expect(buildGroceryIdentityKey({ displayName: "EVOO" })).toBe(
      buildGroceryIdentityKey({ displayName: "olive oil" }),
    );
    expect(
      buildGroceryIdentityKey({ displayName: "Fresh Flat-Leaf Parsley" }),
    ).toBe(buildGroceryIdentityKey({ displayName: "Fresh Italian flat-leaf parsley" }));
    expect(
      buildGroceryIdentityKey({ displayName: "garlic" }),
    ).not.toBe(buildGroceryIdentityKey({ displayName: "garlic powder" }));
    expect(
      buildGroceryIdentityKey({ displayName: "fresh parsley" }),
    ).not.toBe(buildGroceryIdentityKey({ displayName: "dried parsley" }));
  });

  it("ceilings fractional count display without mutating required quantity semantics", () => {
    const eggs = formatGroceryDisplay({ quantity: 1.42, unit: "eggs", family: "count" });
    expect(eggs.displayQuantity).toBe(2);
    expect(eggs.displayLabel).toMatch(/^2 egg/);
    const clove = formatGroceryDisplay({ quantity: 0.86, unit: "clove", family: "count" });
    expect(clove.displayQuantity).toBe(1);
  });

  it("rejects impossible pasta/tortilla identity-unit mappings", () => {
    const bad = validateGroceryIdentityUnitCoherence({
      conceptKey: "pasta gluten-free corn cooked",
      displayName: "Pasta, gluten-free, corn, cooked",
      unit: "tortilla",
    });
    expect(bad.ok).toBe(false);
  });

  it("categorizes produce, meat, tortillas, and excludes cooking liquid", () => {
    expect(categorizeGroceryItem({ displayName: "asparagus" })).toBe("produce");
    expect(categorizeGroceryItem({ displayName: "cherry tomatoes" })).toBe("produce");
    expect(categorizeGroceryItem({ displayName: "flank steak" })).toBe("meat_seafood");
    expect(categorizeGroceryItem({ displayName: "corn tortillas" })).toBe("grains_bakery");
    expect(toIngredientConcept("cumin").burdenClass).toBe("common_staple");
  });

  it("keeps family-level planning distinct from exact purchasing when needed", () => {
    const red = toIngredientConcept("red onion");
    const yellow = toIngredientConcept("yellow onion");
    expect(red.familyKey).toBe("onion");
    expect(yellow.familyKey).toBe("onion");
    // Exact grocery identity still distinguishes red onion when purchasing matters.
    expect(red.conceptKey).not.toBe(yellow.conceptKey);
  });
});

describe("ingredient footprint flatten", () => {
  it("dedupes concepts across footprint buckets", () => {
    const fp = buildIngredientFootprintFromMentions({
      proteins: ["chicken"],
      core: ["chicken", "onion"],
      produce: ["onion", "lime"],
    });
    const flat = flattenFootprintConcepts(fp);
    expect(flat.filter((c) => c.conceptKey === "chicken")).toHaveLength(1);
    expect(flat.filter((c) => c.conceptKey === "onion")).toHaveLength(1);
  });
});
