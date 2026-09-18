import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RECIPE_RESOLUTION_CONCURRENCY,
  RECIPE_RESOLUTION_PROMPT_VERSION,
} from "@fitness-autopilot/contracts";
import {
  buildRecipeResolutionPrompt,
  getUniqueCandidatesFromWeeklyStrategy,
  mapWithConcurrency,
  parseRecipeResolutionRequest,
  resolveUniqueCandidates,
  resolveWeeklyStrategyRecipes,
  validateResolvedRecipe,
  type RecipeResolver,
} from "./recipe-resolution";
import {
  PLAN008_SIMPLE_UNIQUE_IDS,
  makeResolvedRecipeFixture,
  plan008SimpleCandidateLookup,
  plan008SimpleWeeklyStrategy,
} from "./recipe-resolution-fixtures";
import { CHICKEN_TIKKA } from "./candidate-ranking-fixtures";

describe("PLAN-008 recipe resolution domain", () => {
  it("exports prompt version recipe-resolution-v2", () => {
    expect(RECIPE_RESOLUTION_PROMPT_VERSION).toBe("recipe-resolution-v2");
    expect(DEFAULT_RECIPE_RESOLUTION_CONCURRENCY).toBe(2);
  });

  it("extracts 6 unique candidates from the 14-slot Simple strategy", () => {
    const strategy = plan008SimpleWeeklyStrategy();
    const unique = getUniqueCandidatesFromWeeklyStrategy(strategy);
    expect(strategy.days).toHaveLength(7);
    expect(unique).toHaveLength(6);
    expect(unique).toEqual([...PLAN008_SIMPLE_UNIQUE_IDS]);
  });

  it("builds a taste-first nutrition-complete prompt", () => {
    const prompt = buildRecipeResolutionPrompt({ candidate: CHICKEN_TIKKA });
    expect(prompt.version).toBe("recipe-resolution-v2");
    expect(prompt.systemInstruction).toContain("Taste, cuisine identity");
    expect(prompt.systemInstruction).toContain("Do NOT transform the meal into diet food");
    expect(prompt.systemInstruction).toContain("Do NOT copy source prose");
    expect(prompt.systemInstruction).toContain("Estimate by ingredient-aware arithmetic");
    expect(prompt.userPrompt).toContain("tikka-chicken");
    expect(prompt.userPrompt).toContain("Serious Eats");
    expect(prompt.userPrompt).toContain('nutrition.source MUST be "llm_estimate"');
  });

  it("validates a well-formed resolved recipe and forces candidateId", () => {
    const request = { candidate: CHICKEN_TIKKA };
    const fixture = makeResolvedRecipeFixture(CHICKEN_TIKKA, {
      candidateId: "wrong-id",
      mealComponents: [
        {
          componentId: "main",
          name: "Chicken Tikka",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
        {
          componentId: "rice",
          name: "Basmati rice",
          type: "carb_side",
          required: true,
          purpose: "Meal completion",
          relationship: "recommended_side",
        },
        {
          componentId: "chutney",
          name: "Mint chutney",
          type: "condiment",
          required: false,
          purpose: "Cooling contrast",
          relationship: "optional",
        },
      ],
    });
    const validated = validateResolvedRecipe(fixture, request);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value.candidateId).toBe("tikka-chicken");
      expect(validated.value.mealComponents.some((c) => c.relationship === "intrinsic")).toBe(
        true,
      );
      expect(
        validated.value.mealComponents.some((c) => c.relationship === "recommended_side"),
      ).toBe(true);
      expect(validated.value.mealComponents.some((c) => c.relationship === "optional")).toBe(
        true,
      );
    }
  });

  it("rejects missing ingredients, bad scaling, empty instructions, zero servings", () => {
    const request = { candidate: CHICKEN_TIKKA };
    const base = makeResolvedRecipeFixture(CHICKEN_TIKKA);

    expect(
      validateResolvedRecipe({ ...base, ingredients: [] }, request).ok,
    ).toBe(false);
    expect(
      validateResolvedRecipe(
        {
          ...base,
          ingredients: [{ ...base.ingredients[0], quantity: -1 }],
        },
        request,
      ).ok,
    ).toBe(false);
    expect(
      validateResolvedRecipe({ ...base, instructions: [] }, request).ok,
    ).toBe(false);
    expect(
      validateResolvedRecipe(
        {
          ...base,
          ingredients: [
            {
              ...base.ingredients[0],
              scalingBehavior: "not_a_behavior",
            },
          ],
        },
        request,
      ).ok,
    ).toBe(false);
    expect(
      validateResolvedRecipe(
        {
          ...base,
          supportedPrepModes: [{ ...base.supportedPrepModes[0], mode: "batch_only" }],
        },
        request,
      ).ok,
    ).toBe(false);
    expect(validateResolvedRecipe({ ...base, baseServings: 0 }, request).ok).toBe(false);
  });

  it("strips loose macro fields but accepts structured llm_estimate nutrition", () => {
    const request = { candidate: CHICKEN_TIKKA };
    const base = makeResolvedRecipeFixture(CHICKEN_TIKKA);
    const withLoose = validateResolvedRecipe(
      { ...base, calories: 550, proteinGrams: 55 },
      request,
    );
    expect(withLoose.ok).toBe(true);
    if (withLoose.ok) {
      expect(withLoose.value.nutrition?.source).toBe("llm_estimate");
      expect((withLoose.value as { calories?: number }).calories).toBeUndefined();
    }

    const inconsistent = validateResolvedRecipe(
      {
        ...base,
        nutrition: {
          source: "llm_estimate",
          total: {
            caloriesKcal: 500,
            proteinGrams: 100,
            carbohydrateGrams: 100,
            fatGrams: 100,
          },
          perServing: {
            caloriesKcal: 125,
            proteinGrams: 25,
            carbohydrateGrams: 25,
            fatGrams: 25,
          },
        },
      },
      request,
    );
    expect(inconsistent.ok).toBe(false);
    if (!inconsistent.ok) {
      expect(inconsistent.error.message).toMatch(/inconsistent|macros/i);
    }
  });

  it("resolves unique candidates concurrently without slot duplication", async () => {
    const strategy = plan008SimpleWeeklyStrategy();
    const lookup = plan008SimpleCandidateLookup();
    let calls = 0;
    const resolver: RecipeResolver = {
      async resolve(request) {
        calls += 1;
        await new Promise((r) => setTimeout(r, 5));
        return makeResolvedRecipeFixture(request.candidate);
      },
    };

    const result = await resolveWeeklyStrategyRecipes({
      strategy,
      candidatesById: lookup,
      resolver,
      options: { concurrency: 3 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.slotCount).toBe(14);
      expect(result.value.uniqueCandidateIds).toHaveLength(6);
      expect(result.value.resolverCallCount).toBe(6);
      expect(result.value.resolvedCount).toBe(6);
      expect(calls).toBe(6);
      expect(Object.keys(result.value.recipesByCandidateId)).toHaveLength(6);
    }
  });

  it("returns typed failure without substituting another dish", async () => {
    const strategy = plan008SimpleWeeklyStrategy();
    const lookup = plan008SimpleCandidateLookup();
    const resolver: RecipeResolver = {
      async resolve(request) {
        if (request.candidate.candidateId === "kerala-beef-fry") {
          throw {
            code: "LLM_PROVIDER_ERROR",
            message: "Provider timeout",
          };
        }
        return makeResolvedRecipeFixture(request.candidate);
      },
    };

    const result = await resolveWeeklyStrategyRecipes({
      strategy,
      candidatesById: lookup,
      resolver,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PARTIAL_WEEKLY_RESOLUTION_FAILURE");
      const failures = (result.error.details as { failures: Array<{ candidateId: string }> })
        .failures;
      expect(failures).toHaveLength(1);
      expect(failures[0]?.candidateId).toBe("kerala-beef-fry");
      const recipes = (result.error.details as { recipesByCandidateId: Record<string, unknown> })
        .recipesByCandidateId;
      expect(recipes["tikka-chicken"]).toBeDefined();
      expect(recipes["kerala-beef-fry"]).toBeUndefined();
    }
  });

  it("serially retries RATE_LIMITED candidates and recovers", async () => {
    const strategy = plan008SimpleWeeklyStrategy();
    const lookup = plan008SimpleCandidateLookup();
    const attempts = new Map<string, number>();
    const resolver: RecipeResolver = {
      async resolve(request) {
        const id = request.candidate.candidateId;
        const n = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, n);
        if (id === "tikka-chicken" && n === 1) {
          throw { code: "RATE_LIMITED", message: "503 UNAVAILABLE high demand" };
        }
        return makeResolvedRecipeFixture(request.candidate);
      },
    };

    const result = await resolveWeeklyStrategyRecipes({
      strategy,
      candidatesById: lookup,
      resolver,
      options: { sleep: async () => undefined },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.resolvedCount).toBe(6);
      expect(result.value.resolverCallCount).toBe(7);
      expect(attempts.get("tikka-chicken")).toBe(2);
    }
  });

  it("mapWithConcurrency respects the concurrency bound", async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6];
    await mapWithConcurrency(items, 2, async (n) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
      return n * 2;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("parseRecipeResolutionRequest rejects invalid payloads", () => {
    expect(parseRecipeResolutionRequest({}).ok).toBe(false);
    expect(parseRecipeResolutionRequest({ candidate: CHICKEN_TIKKA }).ok).toBe(true);
  });

  it("resolveUniqueCandidates resolves only requested IDs", async () => {
    const resolver: RecipeResolver = {
      resolve: vi.fn(async (request) => makeResolvedRecipeFixture(request.candidate)),
    };
    const result = await resolveUniqueCandidates({
      candidates: [...plan008SimpleCandidateLookup().values()],
      uniqueCandidateIds: ["tikka-chicken", "thai-green-curry"],
      resolver,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.resolverCallCount).toBe(2);
      expect(Object.keys(result.value.recipesByCandidateId).sort()).toEqual([
        "thai-green-curry",
        "tikka-chicken",
      ]);
    }
    expect(resolver.resolve).toHaveBeenCalledTimes(2);
  });
});
