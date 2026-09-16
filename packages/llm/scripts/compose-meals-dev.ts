/**
 * Dev CLI for PLAN-009.5 meal composition against live Gemini (optional).
 * Prefer plan0095:qa:fixture for offline QA.
 */
import { ComposeMealsRequestSchema } from "@fitness-autopilot/contracts";
import { plan009SimpleResolvedRecipes } from "@fitness-autopilot/domain";
import { createMealCompositionProvider } from "../src/create-meal-composition-provider";
import { composeWeeklyMeals } from "@fitness-autopilot/domain";

async function main() {
  const recipes = plan009SimpleResolvedRecipes();
  const parsed = ComposeMealsRequestSchema.parse({
    recipes,
    uniqueCandidateIds: recipes.map((r) => r.candidateId),
    targetCalories: 2250,
    resolveAddedComponents: false,
    mealType: "dinner",
  });

  const provider = createMealCompositionProvider({
    onLog: (event) => console.log(JSON.stringify(event)),
  });

  const { result, failures } = await composeWeeklyMeals({
    ...parsed,
    provider,
    providerMeta: { provider: "gemini" },
  });

  console.log(JSON.stringify({ result, failures }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
