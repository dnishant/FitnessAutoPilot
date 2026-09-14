/**
 * Development-only one-shot PLAN-007.1 ranked weekly strategy generation.
 *
 * Usage:
 *   GEMINI_API_KEY=... pnpm --filter @fitness-autopilot/llm generate:ranked-weekly-strategy:dev
 *   VARIETY_LEVEL=simple|balanced|high PREP_FREQUENCY=once_weekly|twice_weekly|throughout_week \
 *     pnpm --filter @fitness-autopilot/llm generate:ranked-weekly-strategy:dev
 */
import type { PrepFrequency, VarietyLevel } from "@fitness-autopilot/contracts";
import {
  PLAN007_LARGE_DINNER_POOL,
  PLAN007_LARGE_LUNCH_POOL,
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  calculateRankedWeeklyStrategyQualityStats,
  sampleRankedWeeklyStrategyRequest,
} from "@fitness-autopilot/domain";
import {
  createGoogleGenAiContentClient,
  createWeeklyStrategyGenerator,
  loadLlmServerConfig,
} from "../src/index";

function readVarietyLevel(): VarietyLevel {
  const value = process.env.VARIETY_LEVEL ?? "balanced";
  if (value === "simple" || value === "balanced" || value === "high") {
    return value;
  }
  throw new Error(`Invalid VARIETY_LEVEL=${value}`);
}

function readPrepFrequency(): PrepFrequency {
  const value = process.env.PREP_FREQUENCY ?? "once_weekly";
  if (value === "once_weekly" || value === "twice_weekly" || value === "throughout_week") {
    return value;
  }
  throw new Error(`Invalid PREP_FREQUENCY=${value}`);
}

async function main() {
  const config = loadLlmServerConfig();
  if (!config.ok) {
    console.error(config.error);
    process.exit(1);
  }

  const varietyLevel = readVarietyLevel();
  const prepFrequency = readPrepFrequency();
  const lunchPoolSize = varietyLevel === "high" ? 14 : 12;
  const dinnerPoolSize = varietyLevel === "high" ? 14 : 12;

  console.log(
    JSON.stringify(
      {
        provider: config.value.provider,
        model: config.value.gemini.model,
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
        varietyLevel,
        prepFrequency,
        lunchPoolSize,
        dinnerPoolSize,
        note: "API key loaded from env (not printed)",
      },
      null,
      2,
    ),
  );

  let geminiCallCount = 0;
  const baseClient = createGoogleGenAiContentClient(config.value.gemini.apiKey);
  const countingClient = {
    generateContent: async (
      ...args: Parameters<typeof baseClient.generateContent>
    ) => {
      geminiCallCount += 1;
      return baseClient.generateContent(...args);
    },
  };

  const generator = createWeeklyStrategyGenerator({
    config: config.value,
    geminiClient: countingClient,
    onLog: (event) => {
      console.error(JSON.stringify(event, null, 2));
    },
  });

  const base = sampleRankedWeeklyStrategyRequest({
    lunchCandidates: PLAN007_LARGE_LUNCH_POOL.slice(0, lunchPoolSize),
    dinnerCandidates: PLAN007_LARGE_DINNER_POOL.slice(0, dinnerPoolSize),
  });
  const request = {
    ...base,
    foodPreferences: {
      ...base.foodPreferences,
      varietyLevel,
    },
    cookingPreferences: {
      ...base.cookingPreferences,
      prepFrequency,
      cookingStyle: "ready_lunch_fresh_dinner" as const,
      maxFinishMinutes: 10 as const,
      useDinnerPrepForNextLunch: true,
    },
  };

  const strategy = await generator.generateRankedWeeklyStrategy(request);
  const stats = calculateRankedWeeklyStrategyQualityStats(strategy, request);

  const summary = {
    varietyLevel,
    prepFrequency,
    cookingStyle: request.cookingPreferences.cookingStyle,
    promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
    geminiCallCount,
    complexityRetry: strategy.metadata.complexityRetry ?? null,
    uniqueCandidateCount: stats.uniqueCandidateCount,
    uniqueLunchCandidateCount: stats.uniqueLunchCandidateCount,
    uniqueDinnerCandidateCount: stats.uniqueDinnerCandidateCount,
    repeatedMealSlotCount: stats.repeatedMealSlotCount,
    preferredUniqueRange: stats.preferredUniqueCandidateRange,
    hardMaxUniqueCandidates: stats.hardMaxUniqueCandidates,
    complexityStatus: stats.complexityStatus,
    piggybackLunchCount: stats.piggybackLunchCount,
    directLeftoverLunchCount: stats.directLeftoverLunchCount,
    candidateUsage: stats.candidateUsage.map((item) => ({
      name: item.name,
      count: item.count,
      slots: item.slots,
    })),
    week: strategy.days.map((day) => ({
      day: day.day,
      lunch: {
        name: day.lunch.name,
        candidateId: day.lunch.candidateId,
        prepIntent: day.lunch.prepIntent,
        lunchPreparationStrategy: day.lunch.lunchPreparationStrategy,
        planningReason: day.lunch.planningReason,
      },
      dinner: {
        name: day.dinner.name,
        candidateId: day.dinner.candidateId,
        prepIntent: day.dinner.prepIntent,
        planningReason: day.dinner.planningReason,
      },
    })),
  };

  console.log(JSON.stringify({ summary, strategy, stats, geminiCallCount }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
