/**
 * Development-only one-shot weekly strategy generation against the live Gemini API.
 *
 * Usage:
 *   GEMINI_API_KEY=... pnpm --filter @fitness-autopilot/llm generate:weekly-strategy:dev
 * Optional:
 *   LLM_PROVIDER=gemini
 *   GEMINI_MODEL=gemini-2.5-flash
 */
import {
  calculateWeeklyStrategyStats,
  WEEKLY_STRATEGY_PROMPT_VERSION,
} from "@fitness-autopilot/domain";
import {
  createWeeklyStrategyGenerator,
  loadLlmServerConfig,
} from "../src/index";

const request = {
  nutrition: {
    targetCaloriesPerDay: 2200,
    targetProteinGramsPerDay: 160,
    targetCarbsGramsPerDay: 220,
    targetFatGramsPerDay: 70,
  },
  foodPreferences: {
    cuisines: ["Indian", "Mexican", "Mediterranean", "East Asian"],
    proteinPreferences: ["Chicken", "Fish"],
    experiencePreferences: ["Saucy & flavorful"],
    allergies: [] as string[],
    dietaryRestrictions: [] as string[],
    dislikes: [] as string[],
    varietyLevel: "balanced" as const,
  },
  cookingPreferences: {
    prepFrequency: "once_weekly" as const,
    maxPrepSessionMinutes: 90 as const,
    cookingStyle: "ready_lunch_fresh_dinner" as const,
    maxFinishMinutes: 10 as const,
    useDinnerPrepForNextLunch: true,
  },
};

async function main() {
  const config = loadLlmServerConfig();
  if (!config.ok) {
    console.error(config.error);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        provider: config.value.provider,
        model: config.value.gemini.model,
        promptVersion: WEEKLY_STRATEGY_PROMPT_VERSION,
        note: "API key loaded from env (not printed)",
      },
      null,
      2,
    ),
  );

  let geminiCallCount = 0;
  const generator = createWeeklyStrategyGenerator({
    config: config.value,
    onLog: (event) => {
      console.error(JSON.stringify(event, null, 2));
    },
  });

  // Wrap client call counting via onLog success path is enough; also count factory usage.
  const originalGenerate = generator.generateWeeklyStrategy.bind(generator);
  generator.generateWeeklyStrategy = async (req) => {
    geminiCallCount += 1;
    return originalGenerate(req);
  };

  const strategy = await generator.generateWeeklyStrategy(request);
  const stats = calculateWeeklyStrategyStats(strategy);

  console.log(
    JSON.stringify(
      {
        strategy,
        stats,
        geminiCallCount,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
