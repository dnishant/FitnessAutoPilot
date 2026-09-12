/**
 * Development-only recipe discovery against the live Edamam Recipe Search API.
 *
 * Usage:
 *   EDAMAM_APP_ID=... EDAMAM_APP_KEY=... pnpm --filter @fitness-autopilot/llm discover:dev
 *
 * Optional:
 *   DISCOVERY_SCENARIO=indian-chicken   (or all)
 *
 * Never prints credentials. Does not call Gemini.
 */
import {
  createRecipeDiscoveryProvider,
  loadEdamamServerConfig,
} from "../src/index";
import type { RecipeDiscoveryRequest } from "@fitness-autopilot/contracts";

type Scenario = {
  id: string;
  request: RecipeDiscoveryRequest;
};

const SCENARIOS: Scenario[] = [
  {
    id: "indian-chicken",
    request: {
      mealType: "dinner",
      cuisines: ["indian"],
      proteins: ["chicken"],
      highProteinPreferred: true,
      maxResults: 20,
    },
  },
  {
    id: "indian-fish",
    request: {
      mealType: "dinner",
      cuisines: ["indian"],
      proteins: ["fish"],
      highProteinPreferred: true,
      maxResults: 20,
    },
  },
  {
    id: "mexican-chicken",
    request: {
      mealType: "dinner",
      cuisines: ["mexican"],
      proteins: ["chicken"],
      highProteinPreferred: true,
      maxResults: 20,
    },
  },
  {
    id: "mediterranean-chicken",
    request: {
      mealType: "dinner",
      cuisines: ["mediterranean"],
      proteins: ["chicken"],
      highProteinPreferred: true,
      maxResults: 20,
    },
  },
  {
    id: "east-asian-shrimp",
    request: {
      mealType: "dinner",
      cuisines: ["east_asian"],
      proteins: ["shrimp"],
      highProteinPreferred: true,
      maxResults: 20,
    },
  },
  {
    id: "italian-fish",
    request: {
      mealType: "dinner",
      cuisines: ["italian"],
      proteins: ["fish"],
      highProteinPreferred: true,
      maxResults: 20,
    },
  },
];

function summarize(result: {
  candidates: Array<{
    name: string;
    sourceName?: string;
    externalId: string;
  }>;
  metadata: {
    totalReturned: number;
    externalRequestsMade: number;
    durationMs?: number;
    appliedConstraints?: string[];
    unsupportedConstraints?: string[];
  };
}) {
  const names = result.candidates.map((c) => c.name);
  const sources = [
    ...new Set(
      result.candidates
        .map((c) => c.sourceName)
        .filter((value): value is string => !!value),
    ),
  ];
  const uniqueIds = new Set(result.candidates.map((c) => c.externalId));
  return {
    totalReturned: result.metadata.totalReturned,
    externalRequestsMade: result.metadata.externalRequestsMade,
    durationMs: result.metadata.durationMs,
    uniqueExternalIds: uniqueIds.size,
    duplicateNamesCollapsedById: names.length === uniqueIds.size,
    sourceCount: sources.length,
    sources: sources.slice(0, 12),
    sampleNames: names.slice(0, 15),
    appliedConstraints: result.metadata.appliedConstraints,
    unsupportedConstraints: result.metadata.unsupportedConstraints,
  };
}

async function main() {
  const config = loadEdamamServerConfig();
  if (!config.ok) {
    console.error(config.error);
    console.error(
      "Set EDAMAM_APP_ID and EDAMAM_APP_KEY (see supabase/.env.example).",
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        provider: "edamam",
        note: "Credentials loaded from env (not printed)",
        maxExternalSearchesPerRequest: 4,
      },
      null,
      2,
    ),
  );

  const scenarioFilter = (process.env.DISCOVERY_SCENARIO ?? "all").trim();
  const selected =
    scenarioFilter === "all"
      ? SCENARIOS
      : SCENARIOS.filter((s) => s.id === scenarioFilter);

  if (selected.length === 0) {
    console.error(`Unknown DISCOVERY_SCENARIO="${scenarioFilter}"`);
    process.exit(1);
  }

  const provider = createRecipeDiscoveryProvider({
    config: config.value,
    onLog: (event) => {
      console.error(JSON.stringify(event));
    },
  });

  for (const scenario of selected) {
    console.log(`\n=== ${scenario.id} ===`);
    console.log(JSON.stringify({ request: scenario.request }, null, 2));
    try {
      const result = await provider.search(scenario.request);
      console.log(JSON.stringify(summarize(result), null, 2));
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            error:
              error && typeof error === "object"
                ? error
                : { message: String(error) },
          },
          null,
          2,
        ),
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
