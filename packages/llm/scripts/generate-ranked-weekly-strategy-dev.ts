/**
 * Development-only one-shot PLAN-007 ranked weekly strategy generation.
 *
 * Usage:
 *   GEMINI_API_KEY=... pnpm --filter @fitness-autopilot/llm generate:ranked-weekly-strategy:dev
 */
import {
  RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
  calculateRankedWeeklyStrategyQualityStats,
  sampleRankedWeeklyStrategyRequest,
} from "@fitness-autopilot/domain";
import { createWeeklyStrategyGenerator, loadLlmServerConfig } from "../src/index";

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
        promptVersion: RANKED_WEEKLY_STRATEGY_PROMPT_VERSION,
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
  const original = generator.generateRankedWeeklyStrategy.bind(generator);
  generator.generateRankedWeeklyStrategy = async (req) => {
    geminiCallCount += 1;
    return original(req);
  };

  const request = sampleRankedWeeklyStrategyRequest();
  const strategy = await generator.generateRankedWeeklyStrategy(request);
  const stats = calculateRankedWeeklyStrategyQualityStats(strategy, request);

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
