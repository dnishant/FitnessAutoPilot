/**
 * Development-only culinary discovery against live Gemini + Google Search grounding.
 *
 * Usage:
 *   GEMINI_API_KEY=... pnpm --filter @fitness-autopilot/llm discover:culinary:dev
 * Optional:
 *   LLM_PROVIDER=gemini
 *   GEMINI_MODEL=gemini-3.6-flash
 */
import {
  createCulinaryDiscoveryProvider,
  loadLlmServerConfig,
} from "../src/index";

const request = {
  mealType: "dinner" as const,
  cuisines: ["Indian"],
  proteinPreferences: ["Chicken"],
  experiencePreferences: ["Saucy & flavorful", "Spicy"],
  allergies: [] as string[],
  dietaryRestrictions: [] as string[],
  dislikes: [] as string[],
  cookingPreferences: {
    cookingStyle: "ready_lunch_fresh_dinner",
    maxFinishMinutes: 15,
  },
  targetCandidateCount: 8,
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
        note: "API key loaded from env (not printed); Google Search grounding enabled",
      },
      null,
      2,
    ),
  );

  const provider = createCulinaryDiscoveryProvider({
    config: config.value,
    onLog: (event) => {
      console.error(JSON.stringify(event, null, 2));
    },
  });

  const result = await provider.discover(request);
  console.log(
    JSON.stringify(
      {
        returnedCandidateCount: result.candidates.length,
        searchQueries: result.discoveryMetadata.searchQueries,
        uniqueDomainCount: result.discoveryMetadata.uniqueDomainCount,
        durationMs: result.discoveryMetadata.durationMs,
        candidates: result.candidates.map((c) => ({
          name: c.name,
          cuisineFamily: c.cuisineFamily,
          regionalStyle: c.regionalStyle,
          source: c.source,
          flavorFamilies: c.flavorFamilies,
          cookingTechniques: c.cookingTechniques,
        })),
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
