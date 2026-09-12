import { describe, expect, it } from "vitest";
import {
  candidateDedupeKey,
  dedupeAndCapCandidates,
  extractEdamamExternalId,
  mapCuisineToEdamam,
  mapDietaryConstraintsToEdamam,
  mapMealTypeToEdamam,
  mapProteinToSearchQuery,
  MAX_RECIPE_DISCOVERY_EXTERNAL_SEARCHES,
  parseRecipeDiscoveryRequest,
  planRecipeDiscoverySearches,
} from "./discovery";
import type { RecipeDiscoveryCandidate } from "@fitness-autopilot/contracts";

function candidate(
  overrides: Partial<RecipeDiscoveryCandidate> &
    Pick<RecipeDiscoveryCandidate, "externalId" | "name">,
): RecipeDiscoveryCandidate {
  return {
    provider: "edamam",
    cuisineLabels: [],
    mealTypeLabels: [],
    dishTypeLabels: [],
    ingredientLines: [],
    ...overrides,
  };
}

describe("parseRecipeDiscoveryRequest", () => {
  it("applies default maxResults = 30", () => {
    const parsed = parseRecipeDiscoveryRequest({ mealType: "dinner" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.maxResults).toBe(30);
    }
  });

  it("rejects invalid maxResults", () => {
    const parsed = parseRecipeDiscoveryRequest({ maxResults: 999 });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("INVALID_REQUEST");
    }
  });
});

describe("mapMealTypeToEdamam", () => {
  it("maps breakfast and snack directly", () => {
    expect(mapMealTypeToEdamam("breakfast")).toEqual(["breakfast"]);
    expect(mapMealTypeToEdamam("snack")).toEqual(["snack"]);
  });

  it("maps lunch and dinner to lunch/dinner", () => {
    expect(mapMealTypeToEdamam("lunch")).toEqual(["lunch/dinner"]);
    expect(mapMealTypeToEdamam("dinner")).toEqual(["lunch/dinner"]);
  });
});

describe("mapCuisineToEdamam", () => {
  it("maps direct cuisine equivalents", () => {
    expect(mapCuisineToEdamam("indian")).toEqual(["indian"]);
    expect(mapCuisineToEdamam("Mexican")).toEqual(["mexican"]);
    expect(mapCuisineToEdamam("mediterranean")).toEqual(["mediterranean"]);
    expect(mapCuisineToEdamam("italian")).toEqual(["italian"]);
    expect(mapCuisineToEdamam("middle_eastern")).toEqual(["middle eastern"]);
  });

  it("expands East Asian to chinese, japanese, korean", () => {
    expect(mapCuisineToEdamam("east_asian")).toEqual([
      "chinese",
      "japanese",
      "korean",
    ]);
    expect(mapCuisineToEdamam("East Asian")).toEqual([
      "chinese",
      "japanese",
      "korean",
    ]);
  });

  it("does not invent mappings for other/surprise_me", () => {
    expect(mapCuisineToEdamam("other")).toBeNull();
    expect(mapCuisineToEdamam("surprise_me")).toBeNull();
  });
});

describe("mapProteinToSearchQuery", () => {
  it("maps catalog proteins to search terms", () => {
    expect(mapProteinToSearchQuery("chicken")).toBe("chicken");
    expect(mapProteinToSearchQuery("beans_lentils")).toBe("lentils");
    expect(mapProteinToSearchQuery("shrimp")).toBe("shrimp");
  });
});

describe("mapDietaryConstraintsToEdamam", () => {
  it("applies supported dietary constraints", () => {
    const mapped = mapDietaryConstraintsToEdamam({
      allergies: ["Peanuts", "Dairy"],
      dietaryRestrictions: ["vegan", "gluten-free"],
    });
    expect(mapped.healthLabels).toEqual([
      "dairy-free",
      "gluten-free",
      "peanut-free",
      "vegan",
    ]);
    expect(mapped.unsupported).toEqual([]);
    expect(mapped.applied.length).toBe(4);
  });

  it("reports unsupported constraints without inventing filters", () => {
    const mapped = mapDietaryConstraintsToEdamam({
      allergies: ["Nightshades"],
      dietaryRestrictions: ["halal", "low-FODMAP-custom"],
    });
    expect(mapped.healthLabels).toEqual([]);
    expect(mapped.unsupported).toEqual([
      "allergy:Nightshades",
      "restriction:halal",
      "restriction:low-FODMAP-custom",
    ]);
  });
});

describe("planRecipeDiscoverySearches", () => {
  it("includes protein preferences in search queries and caps external calls", () => {
    const parsed = parseRecipeDiscoveryRequest({
      mealType: "dinner",
      cuisines: ["indian"],
      proteins: ["chicken", "fish", "paneer", "tofu", "beef"],
      highProteinPreferred: true,
      allergies: ["Peanuts"],
      dislikes: ["Olives"],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const planned = planRecipeDiscoverySearches(parsed.value);
    expect(planned.searches.length).toBeLessThanOrEqual(
      MAX_RECIPE_DISCOVERY_EXTERNAL_SEARCHES,
    );
    expect(planned.searches.length).toBe(4);
    expect(planned.searches.map((s) => s.query)).toEqual([
      "chicken",
      "fish",
      "paneer",
      "tofu",
    ]);
    expect(planned.searches[0]?.cuisineTypes).toEqual(["indian"]);
    expect(planned.searches[0]?.mealTypes).toEqual(["lunch/dinner"]);
    expect(planned.searches[0]?.dietLabels).toEqual(["high-protein"]);
    expect(planned.searches[0]?.healthLabels).toContain("peanut-free");
    expect(planned.constraintReport.appliedConstraints).toContain(
      "diet:high-protein",
    );
    expect(planned.constraintReport.unsupportedConstraints).toContain(
      "dislike:Olives",
    );
  });

  it("places East Asian expansion on a single search (not one call per sub-cuisine)", () => {
    const parsed = parseRecipeDiscoveryRequest({
      mealType: "dinner",
      cuisines: ["east_asian"],
      proteins: ["shrimp"],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const planned = planRecipeDiscoverySearches(parsed.value);
    expect(planned.searches).toHaveLength(1);
    expect(planned.searches[0]?.cuisineTypes).toEqual([
      "chinese",
      "japanese",
      "korean",
    ]);
    expect(planned.searches[0]?.query).toBe("shrimp");
  });

  it("documents max external searches constant", () => {
    expect(MAX_RECIPE_DISCOVERY_EXTERNAL_SEARCHES).toBe(4);
  });
});

describe("dedupeAndCapCandidates", () => {
  it("removes duplicates by provider + externalId and caps results", () => {
    const input = [
      candidate({ externalId: "a", name: "A1" }),
      candidate({ externalId: "a", name: "A duplicate" }),
      candidate({ externalId: "b", name: "B" }),
      candidate({ externalId: "c", name: "C" }),
      candidate({ externalId: "d", name: "D" }),
    ];
    const result = dedupeAndCapCandidates(input, 2);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.externalId)).toEqual(["a", "b"]);
    expect(candidateDedupeKey(result[0]!)).toBe("edamam::a");
  });

  it("does not dedupe solely by recipe name", () => {
    const input = [
      candidate({ externalId: "1", name: "Chicken Curry" }),
      candidate({ externalId: "2", name: "Chicken Curry" }),
    ];
    expect(dedupeAndCapCandidates(input, 10)).toHaveLength(2);
  });
});

describe("extractEdamamExternalId", () => {
  it("extracts a stable id from Edamam recipe URIs", () => {
    expect(
      extractEdamamExternalId(
        "http://www.edamam.com/ontologies/edamam.owl#recipe_b79327d05b8e5b838ad6cfd9576b30b6",
      ),
    ).toBe("b79327d05b8e5b838ad6cfd9576b30b6");
  });
});
