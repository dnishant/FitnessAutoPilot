/**
 * Development-only one-shot recipe generation against the live Gemini API.
 *
 * Usage:
 *   GEMINI_API_KEY=... pnpm --filter @fitness-autopilot/llm generate:dev
 * Optional:
 *   LLM_PROVIDER=gemini
 *   GEMINI_MODEL=gemini-2.5-flash
 */
import {
  createRecipeGenerator,
  loadLlmServerConfig,
} from "../src/index";

const request = {
  mealType: "dinner" as const,
  targetCalories: 650,
  targetProteinGrams: 50,
  cuisines: ["Indian", "Mexican", "Mediterranean", "East Asian"],
  proteinPreferences: ["Chicken", "Fish"],
  experiencePreferences: ["Saucy & flavorful", "Spicy"],
  allergies: [] as string[],
  dietaryRestrictions: [] as string[],
  dislikes: [] as string[],
  varietyLevel: "balanced" as const,
  cookingStyle: "ready_lunch_fresh_dinner",
  maxFinishMinutes: 10,
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
        note: "API key loaded from env (not printed)",
      },
      null,
      2,
    ),
  );

  const generator = createRecipeGenerator({
    config: config.value,
    onLog: (event) => {
      console.error(
        JSON.stringify(
          {
            ...event,
            // ensure no accidental key leakage in logs
          },
          null,
          2,
        ),
      );
    },
  });

  const recipe = await generator.generateRecipe(request);
  console.log(JSON.stringify(recipe, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
