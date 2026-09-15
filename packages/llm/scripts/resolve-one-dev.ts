import { CHICKEN_TIKKA } from "@fitness-autopilot/domain";
import { createRecipeResolver, loadLlmServerConfig } from "../src/index";

async function main() {
  const config = loadLlmServerConfig();
  if (!config.ok) {
    console.error(config.error);
    process.exit(1);
  }
  const resolver = createRecipeResolver({
    config: config.value,
    maxAttempts: 6,
    onLog: (e) =>
      console.error(
        JSON.stringify({
          success: e.success,
          candidateId: e.candidateId,
          errorCode: e.errorCode,
          durationMs: e.durationMs,
        }),
      ),
  });
  const recipe = await resolver.resolve({ candidate: CHICKEN_TIKKA });
  console.log(JSON.stringify(recipe, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
