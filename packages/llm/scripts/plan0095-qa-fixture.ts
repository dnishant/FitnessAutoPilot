/**
 * Local QA: compose six Simple repertoire dishes through lightweight concepts
 * then selected detailed resolution. MockMealCompositionProvider only — no live Gemini.
 *
 * Usage: pnpm --filter @fitness-autopilot/llm plan0095:qa:fixture
 */
import {
  composeWeeklyMeals,
  MockMealCompositionProvider,
  plan009SimpleResolvedRecipes,
  detectExistingMealRoles,
} from "@fitness-autopilot/domain";

async function main() {
  const recipes = plan009SimpleResolvedRecipes().map((r) => {
    // Emphasize dry Indian/Caribbean plates that need companions in fixtures.
    if (
      r.candidateId === "tikka-chicken" ||
      r.candidateId === "kerala-beef-fry" ||
      r.candidateId === "jamaican-jerk-chicken"
    ) {
      return {
        ...r,
        experienceProfile: {
          ...r.experienceProfile,
          moistureLevel: "dry" as const,
        },
      };
    }
    return r;
  });

  const provider = new MockMealCompositionProvider();
  const { result, failures } = await composeWeeklyMeals({
    recipes,
    provider,
    resolveAddedComponents: false,
    targetCalories: 2250,
    allergies: [],
    dietaryRestrictions: [],
    dislikes: [],
    providerMeta: { provider: "mock", model: "qa-fixture" },
    slotCount: 14,
  });

  console.log("=== Lightweight composition + selected resolution QA ===\n");
  console.log("Fiber target:", result.fiberTarget);
  console.log("Diagnostics:", result.diagnostics);
  console.log("Failures:", failures.length ? failures : "none");
  console.log("");

  for (const id of result.uniqueCandidateIds) {
    const recipe = recipes.find((r) => r.candidateId === id)!;
    const meal = result.mealsByCandidateId[id]!;
    const detected = detectExistingMealRoles(recipe);
    const added = meal.components.filter((c) => c.source === "composition_engine");
    console.log(`## ${meal.name}`);
    console.log("Existing roles:", detected.profile);
    console.log(
      "Added:",
      added.length
        ? added.map((c) => `${c.name} (${c.role}, ${c.definitionKind})`).join("; ")
        : "(none)",
    );
    console.log(
      "Plate:",
      meal.components.map((c) => `[${c.source}/${c.role}] ${c.name}`).join(" + "),
    );
    console.log("");
  }

  console.log("Shared components:", Object.keys(result.sharedComponentsByKey));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
