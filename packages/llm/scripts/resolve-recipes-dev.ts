/**
 * Development-only PLAN-008 recipe resolution for the Simple weekly repertoire.
 *
 * Usage:
 *   GEMINI_API_KEY=... pnpm --filter @fitness-autopilot/llm resolve:recipes:dev
 */
import {
  PLAN008_SIMPLE_CANDIDATES,
  PLAN008_SIMPLE_UNIQUE_IDS,
  RECIPE_RESOLUTION_PROMPT_VERSION,
  plan008SimpleWeeklyStrategy,
  resolveWeeklyStrategyRecipes,
  plan008SimpleCandidateLookup,
} from "@fitness-autopilot/domain";
import {
  createGoogleGenAiContentClient,
  createRecipeResolver,
  loadLlmServerConfig,
} from "../src/index";

async function main() {
  const config = loadLlmServerConfig();
  if (!config.ok) {
    console.error(config.error);
    process.exit(1);
  }

  const strategy = plan008SimpleWeeklyStrategy();
  console.log(
    JSON.stringify(
      {
        provider: config.value.provider,
        model: config.value.gemini.model,
        promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
        weeklySlots: 14,
        uniqueCandidates: PLAN008_SIMPLE_UNIQUE_IDS.length,
        candidateNames: PLAN008_SIMPLE_CANDIDATES.map((c) => c.name),
        note: "API key loaded from env (not printed)",
      },
      null,
      2,
    ),
  );

  let geminiCallCount = 0;
  const baseClient = createGoogleGenAiContentClient(config.value.gemini.apiKey);
  const countingClient = {
    generateContent: async (...args: Parameters<typeof baseClient.generateContent>) => {
      geminiCallCount += 1;
      return baseClient.generateContent(...args);
    },
  };

  const resolver = createRecipeResolver({
    config: config.value,
    geminiClient: countingClient,
    onLog: (event) => {
      console.error(
        JSON.stringify({
          event: "resolve_log",
          success: event.success,
          candidateId: event.candidateId,
          durationMs: event.durationMs,
          errorCode: event.errorCode,
          searchGrounded: event.searchGrounded,
        }),
      );
    },
  });

  const result = await resolveWeeklyStrategyRecipes({
    strategy,
    candidatesById: plan008SimpleCandidateLookup(),
    resolver,
    options: { concurrency: 3 },
  });

  if (!result.ok) {
    console.error(JSON.stringify({ ok: false, error: result.error }, null, 2));
    process.exit(1);
  }

  const recipes = Object.values(result.value.recipesByCandidateId).map((recipe) => ({
    candidateId: recipe.candidateId,
    name: recipe.name,
    source: recipe.source.name,
    baseServings: recipe.baseServings,
    ingredientCount: recipe.ingredients.length,
    instructionCount: recipe.instructions.length,
    mealComponents: recipe.mealComponents.map((c) => ({
      name: c.name,
      type: c.type,
      relationship: c.relationship,
    })),
    experienceProfile: recipe.experienceProfile,
    resolutionMetadata: recipe.resolutionMetadata,
  }));

  console.log(
    JSON.stringify(
      {
        ok: true,
        geminiCallCount,
        resolverCallCount: result.value.resolverCallCount,
        uniqueCandidateCount: result.value.uniqueCandidateIds.length,
        slotCount: result.value.slotCount,
        recipes,
        chickenTikka: result.value.recipesByCandidateId["tikka-chicken"],
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
