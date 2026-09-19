import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { NutritionTarget } from "@fitness-autopilot/contracts";
import {
  calculateRankedWeeklyStrategyQualityStats,
  sampleRankedWeekPayload,
  sampleRankedWeekPayloadWithUniqueCount,
  sampleRankedWeeklyStrategyRequest,
  validateRankedWeeklyStrategy,
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
} from "@fitness-autopilot/domain";
import {
  RANKED_WEEKLY_STRATEGY_FUNCTION_NAME,
  RANKED_WEEK_PREVIEW_SCENARIOS,
  applyRankedWeekScenario,
  buildRankedCandidateUsageRows,
  buildRankedPromptPreview,
  buildRankedQualityStatRows,
  buildRankedWeeklyDayViews,
  plateForCandidate,
  buildRankedWeeklyStrategyRequestFromPreview,
  canStartRankedWeeklyGeneration,
  createRankedWeeklyStrategyPreviewUiState,
  humanizeRankedWeeklyStrategyError,
  invokeGenerateRankedWeeklyStrategy,
  lunchPreparationStrategyLabel,
  rankedWeeklyPreviewContainsSecrets,
  scenarioPools,
  type RankedWeeklyStrategyQualityStatsLike,
} from "./ranked-weekly-strategy-preview";
import {
  WEEKLY_STRATEGY_FUNCTION_NAME,
  WEEKLY_STRATEGY_PREVIEW_ROUTE,
} from "./weekly-strategy-preview";

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(here, "../..");

const nutritionTarget = {
  id: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
  goalId: "33333333-3333-3333-3333-333333333333",
  estimatedMaintenanceCalories: 2500,
  targetCalories: 2200,
  proteinG: 160,
  fatG: 70,
  fatMinG: 60,
  fatMaxG: 80,
  carbohydrateG: 220,
  desiredRateKgPerWeek: -0.5,
  algorithmName: "nutrition-target" as const,
  algorithmVersion: "nutrition-target-v1",
  inputSnapshot: {},
  validFrom: "2026-09-10T00:00:00.000Z",
  createdAt: "2026-09-10T00:00:00.000Z",
} satisfies NutritionTarget;

describe("ranked weekly strategy preview", () => {
  it("keeps the PLAN-004.5 route and uses the same generate-weekly-strategy function", () => {
    expect(WEEKLY_STRATEGY_PREVIEW_ROUTE).toBe("/weekly-strategy-preview");
    expect(RANKED_WEEKLY_STRATEGY_FUNCTION_NAME).toBe(WEEKLY_STRATEGY_FUNCTION_NAME);
    const screen = readFileSync(join(mobileRoot, "app/weekly-strategy-preview.tsx"), "utf8");
    expect(screen).toContain("generateRankedWeeklyStrategy");
    expect(screen).toContain("Discover lunch");
    expect(screen).toContain("Discover dinner");
    expect(screen).not.toContain("@google/genai");
  });

  it("loads fixture pools for Balanced/Simple/High/Tikka/Small scenarios", () => {
    const balanced = scenarioPools("balanced");
    expect(balanced.lunchCandidates.length).toBeGreaterThanOrEqual(12);
    expect(balanced.dinnerCandidates.length).toBeGreaterThanOrEqual(12);
    expect(balanced.varietyLevel).toBe("balanced");
    expect(scenarioPools("simple").varietyLevel).toBe("simple");
    expect(scenarioPools("high").varietyLevel).toBe("high");
    expect(scenarioPools("tikka").lunchCandidates.some((item) => item.candidate.name.includes("Tikka"))).toBe(
      true,
    );
    expect(scenarioPools("small").lunchCandidates).toHaveLength(4);
    expect(scenarioPools("small").dinnerCandidates).toHaveLength(5);
    expect(RANKED_WEEK_PREVIEW_SCENARIOS).toHaveLength(5);
  });

  it("builds a ranked request from session preferences plus candidate pools", () => {
    const request = buildRankedWeeklyStrategyRequestFromPreview(
      {
        nutritionTarget,
        mealPreferences: null,
        cookingPreferences: null,
      },
      scenarioPools("balanced").lunchCandidates,
      scenarioPools("balanced").dinnerCandidates,
      "balanced",
    );
    expect(request).not.toBeNull();
    if (!request) {
      return;
    }
    expect(request.lunchCandidates.length).toBeGreaterThanOrEqual(12);
    expect(request.dinnerCandidates.length).toBeGreaterThanOrEqual(12);
    expect(request.foodPreferences.varietyLevel).toBe("balanced");
    expect(request.nutrition.targetCaloriesPerDay).toBe(2200);
  });

  it("renders day views, quality stats, and candidate usage from a validated week", () => {
    const request = sampleRankedWeeklyStrategyRequest();
    const validated = validateRankedWeeklyStrategy(sampleRankedWeekPayload(), request, {
      provider: "gemini",
      model: "test",
      promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    const stats = calculateRankedWeeklyStrategyQualityStats(validated.value, request);
    const days = buildRankedWeeklyDayViews(
      validated.value,
      request.lunchCandidates,
      request.dinnerCandidates,
    );
    expect(days).toHaveLength(6);
    expect(days[0]?.lunch.name).toBe("Andhra Green Chilli Chicken");
    expect(days[0]?.lunchRank).toMatch(/Rank #/);
    expect(buildRankedQualityStatRows(stats, { varietyLevel: "balanced" }).some(
      (row) => row.label === "Unique dishes",
    )).toBe(true);
    expect(
      buildRankedQualityStatRows(stats).some((row) => row.label === "Complexity status"),
    ).toBe(true);
    expect(buildRankedCandidateUsageRows(stats).length).toBe(stats.uniqueCandidateCount);
    expect(buildRankedCandidateUsageRows(stats)[0]?.label).toMatch(/— \d+ meals?/);
    expect(lunchPreparationStrategyLabel("piggyback_prep")).toBe("Piggyback prep");
    expect(
      plateForCandidate("tikka-chicken", {
        "tikka-chicken": {
          candidateId: "tikka-chicken",
          name: "Chicken Tikka",
          main: {
            componentId: "main",
            role: "main",
            name: "Chicken Tikka",
            relationship: "intrinsic",
            source: "candidate",
            reason: "main",
            definitionKind: "recipe_component",
            normalizedComponentKey: "main:chicken tikka",
          },
          components: [
            {
              componentId: "rice",
              role: "carbohydrate",
              name: "Basmati Rice",
              relationship: "required_companion",
              source: "composition_engine",
              reason: "starch",
              definitionKind: "atomic_food",
              normalizedComponentKey: "carbohydrate:basmati rice",
            },
          ],
          compositionProfile: {
            hasPrimaryProtein: true,
            hasMeaningfulCarbohydrate: true,
            hasMeaningfulVegetableOrFruit: false,
            hasMeaningfulFiberSource: false,
            hasSauceOrMoistureComponent: false,
            addedComponentRoles: ["carbohydrate"],
          },
          metadata: {
            promptVersion: "meal-composition-v2",
            policyVersion: "meal-composition-v1",
            createdAt: "2026-09-16T00:00:00.000Z",
          },
        },
      }),
    ).toEqual(["Chicken Tikka", "Basmati Rice"]);
    expect(
      buildRankedQualityStatRows(stats).some(
        (row) => row.label === "Unique components in selected week",
      ),
    ).toBe(true);
  });

  it("does not throw when building rows from old PLAN-007 stats without complexity/slots fields", () => {
    // Shape returned by Edge Functions before PLAN-007.1 deployment.
    const legacyStats: RankedWeeklyStrategyQualityStatsLike = {
      totalMealSlots: 14,
      uniqueCandidateCount: 2,
      repeatedMealSlotCount: 12,
      uniqueCuisineCount: 1,
      uniqueProteinCount: 1,
      uniqueFlavorFamilyCount: 1,
      directLeftoverLunchCount: 2,
      piggybackLunchCount: 3,
      independentLunchCount: 2,
      adjacentSameCandidateCount: 0,
      adjacentSameCuisineCount: 2,
      adjacentHighSimilarityCount: 1,
      maxAdjacentSimilarity: 0.42,
      averageCandidateRank: 1.5,
      candidateUsage: [
        {
          candidateId: "dish-a",
          name: "Chicken Bowl",
          count: 7,
          mealTypes: ["lunch", "dinner"],
          // no slots
        },
        {
          candidateId: "dish-b",
          name: "Chicken Bowl",
          count: 7,
          mealTypes: ["lunch"],
          // duplicate display label risk — keys must stay unique
        },
      ],
    };

    expect(() => buildRankedQualityStatRows(legacyStats, { varietyLevel: "balanced" })).not.toThrow();
    expect(() => buildRankedCandidateUsageRows(legacyStats)).not.toThrow();

    const qualityRows = buildRankedQualityStatRows(legacyStats, { varietyLevel: "balanced" });
    expect(qualityRows.find((row) => row.label === "Unique lunch dishes")?.value).toBe("(n/a)");
    // Policy fallback still surfaces preferred/hard max from varietyLevel when stats omit them.
    expect(qualityRows.find((row) => row.label === "Preferred unique range")?.value).toBe("4–4");
    expect(qualityRows.find((row) => row.label === "Complexity status")?.value).toBe("(n/a)");
    expect(qualityRows.find((row) => row.label === "Hard max unique dishes")?.value).toBe("4");
    expect(qualityRows.find((row) => row.label === "Cooking techniques")?.value).toBe("(n/a)");

    const usageRows = buildRankedCandidateUsageRows(legacyStats);
    expect(usageRows).toHaveLength(2);
    expect(usageRows[0]?.value).toMatch(/Lunch/);
    expect(usageRows[0]?.key).toBe("dish-a:0");
    expect(usageRows[1]?.key).toBe("dish-b:1");
    expect(new Set(usageRows.map((row) => row.key)).size).toBe(usageRows.length);
  });

  it("rebuilds the PLAN-007.1 prompt locally without secrets", () => {
    const request = sampleRankedWeeklyStrategyRequest();
    const prompt = buildRankedPromptPreview(request);
    expect(prompt.version).toBe("weekly-strategy-ranked-v1.5.0");
    expect(prompt.userPrompt).toContain("andhra-green-chilli-chicken");
    expect(prompt.systemInstruction).toContain("Variety is a constraint to prevent boredom");
    expect(prompt.systemInstruction).toContain("WEEKLY REPERTOIRE FIRST");
    expect(rankedWeeklyPreviewContainsSecrets(prompt.systemInstruction)).toBe(false);
    expect(rankedWeeklyPreviewContainsSecrets(prompt.userPrompt)).toBe(false);
  });

  // V1 hydrate requires exactly 4 unique meals — cannot build 13-unique fixtures anymore.
  it.skip("rejects excessive unique-candidate stats from the preview invoke path (legacy)", async () => {
    const request = sampleRankedWeeklyStrategyRequest();
    const strategy = validateRankedWeeklyStrategy(
      sampleRankedWeekPayloadWithUniqueCount(13),
      request,
      {
        provider: "test",
        model: "test-model",
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
      },
    );
    expect(strategy.ok).toBe(true);
    if (!strategy.ok) {
      return;
    }
    const stats = calculateRankedWeeklyStrategyQualityStats(strategy.value, request);
    const result = await invokeGenerateRankedWeeklyStrategy(async () => ({
      data: {
        strategy: strategy.value,
        stats,
        meta: {
          requestId: "ws_test",
          promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
          provider: "gemini",
          model: "test-model",
          providerCallCount: 2,
          firstAttemptUniqueCandidates: 13,
          finalUniqueCandidates: 13,
          complexityRetry: {
            occurred: true,
            providerCallCount: 2,
            firstAttemptUniqueCandidates: 13,
            finalAttemptUniqueCandidates: 13,
          },
        },
      },
      error: null,
    }), request);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("EXCESSIVE_WEEKLY_COMPLEXITY");
    expect(result.error.message).not.toMatch(/did not run a corrective complexity retry/i);
    expect(result.error.diagnostics).toContain('"hardMaxUniqueCandidates":10');
    expect(result.error.diagnostics).toContain('"finalAttemptUniqueCandidateCount":13');
    expect(result.error.diagnostics).toContain('"likelyStaleEdge":false');
  });

  it.skip("flags a stale Edge response that returns 13 unique without a complexity retry (legacy)", async () => {
    const request = sampleRankedWeeklyStrategyRequest();
    const strategy = validateRankedWeeklyStrategy(
      sampleRankedWeekPayloadWithUniqueCount(13),
      request,
      {
        provider: "test",
        model: "test-model",
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
      },
    );
    expect(strategy.ok).toBe(true);
    if (!strategy.ok) {
      return;
    }
    const stats = calculateRankedWeeklyStrategyQualityStats(strategy.value, request);
    const result = await invokeGenerateRankedWeeklyStrategy(async () => ({
      data: {
        strategy: strategy.value,
        stats,
        meta: {
          requestId: "ws_stale",
          promptVersion: "weekly-strategy-ranked-v1",
          provider: "gemini",
          model: "test-model",
        },
      },
      error: null,
    }), request);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("EXCESSIVE_WEEKLY_COMPLEXITY");
    expect(result.error.message).toMatch(/did not run a corrective complexity retry/i);
    expect(result.error.message).toMatch(/Redeploy the generate-weekly-strategy Edge Function/i);
    expect(result.error.diagnostics).toContain('"likelyStaleEdge":true');
    expect(humanizeRankedWeeklyStrategyError(result.error.message, result.error.code)).toMatch(
      /Redeploy the generate-weekly-strategy Edge Function/i,
    );
  });

  it("accepts a guarded successful response through the preview invoke path", async () => {
    const request = sampleRankedWeeklyStrategyRequest();
    const strategy = validateRankedWeeklyStrategy(sampleRankedWeekPayload(), request, {
      provider: "test",
      model: "test-model",
      promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
    });
    expect(strategy.ok).toBe(true);
    if (!strategy.ok) {
      return;
    }
    const stats = calculateRankedWeeklyStrategyQualityStats(strategy.value, request);
    const result = await invokeGenerateRankedWeeklyStrategy(async () => ({
      data: {
        strategy: strategy.value,
        stats,
        meta: {
          requestId: "ws_ok",
          promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
          provider: "gemini",
          model: "test-model",
          providerCallCount: 1,
          finalUniqueCandidates: stats.uniqueCandidateCount,
        },
      },
      error: null,
    }), request);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.stats.uniqueCandidateCount).toBeLessThanOrEqual(4);
    expect(result.meta?.providerCallCount).toBe(1);
  });

  it("does not start generation while busy or with empty pools", () => {
    const idle = createRankedWeeklyStrategyPreviewUiState();
    expect(canStartRankedWeeklyGeneration(idle)).toBe(true);
    expect(canStartRankedWeeklyGeneration({ ...idle, busy: true })).toBe(false);
    expect(canStartRankedWeeklyGeneration({ ...idle, lunchCandidates: [] })).toBe(false);
    const next = applyRankedWeekScenario(idle, "small");
    expect(next.lunchCandidates).toHaveLength(4);
    expect(next.dinnerCandidates).toHaveLength(5);
  });
});
