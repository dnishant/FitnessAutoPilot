import { json, requireUser, serveWithCors } from "../_shared/http.ts";
import {
  DEFAULT_FOOD_RESOLUTION_CONCURRENCY,
  FOOD_RESOLUTION_POLICY_VERSION,
  NUTRITION_CALCULATION_POLICY_VERSION,
  QUANTITY_NORMALIZATION_POLICY_VERSION,
  ResolveRecipeNutritionRequestSchema,
} from "../_shared/contracts/food-resolution.ts";
import { resolveWeeklyRecipeNutrition } from "../_shared/domain/food-resolution/recipe-nutrition.ts";
import { FoodDataProviderException } from "../_shared/domain/food-resolution/food-data-provider.ts";
import { createFoodResolver } from "../_shared/llm/create-food-resolver.ts";
import { loadUsdaServerConfig } from "../_shared/llm/usda/config.ts";

function statusFor(error: { code?: string }): number {
  switch (error.code) {
    case "FOOD_PROVIDER_CONFIGURATION_ERROR":
      return 500;
    case "FOOD_PROVIDER_RATE_LIMITED":
      return 429;
    case "FOOD_PROVIDER_TIMEOUT":
      return 504;
    case "FOOD_PROVIDER_NOT_FOUND":
    case "FOOD_PROVIDER_INVALID_RESPONSE":
      return 422;
    case "FOOD_PROVIDER_ERROR":
      return 502;
    default:
      return 500;
  }
}

serveWithCors(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(
      {
        error: {
          code: "INVALID_FOOD_RESOLUTION_REQUEST",
          message: "Invalid JSON body",
        },
      },
      400,
    );
  }

  const parsed = ResolveRecipeNutritionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: {
          code: "INVALID_FOOD_RESOLUTION_REQUEST",
          message: parsed.error.issues[0]?.message ?? "Invalid resolve-recipe-nutrition request.",
          details: parsed.error.flatten(),
        },
      },
      422,
    );
  }

  const usdaConfig = loadUsdaServerConfig((key) => Deno.env.get(key));
  if (!usdaConfig.ok) {
    return json({ error: usdaConfig.error }, 500);
  }

  const started = Date.now();
  const requestId = `frn_${crypto.randomUUID()}`;
  const concurrency = parsed.data.concurrency ?? DEFAULT_FOOD_RESOLUTION_CONCURRENCY;

  try {
    const resolver = createFoodResolver({
      enableSemanticDisambiguation: parsed.data.enableSemanticDisambiguation !== false,
      env: (key) => Deno.env.get(key),
      onLog: (event) => {
        console.log(
          JSON.stringify({
            fn: "resolve-recipe-nutrition",
            requestId,
            ...event,
          }),
        );
      },
    });

    const result = await resolveWeeklyRecipeNutrition({
      recipes: parsed.data.recipes,
      uniqueCandidateIds: parsed.data.uniqueCandidateIds,
      resolver,
      concurrency,
      slotCount: parsed.data.recipes.length,
    });

    return json({
      result,
      meta: {
        requestId,
        foodResolutionPolicy: FOOD_RESOLUTION_POLICY_VERSION,
        nutritionCalculationPolicy: NUTRITION_CALCULATION_POLICY_VERSION,
        quantityNormalizationPolicy: QUANTITY_NORMALIZATION_POLICY_VERSION,
        provider: "usda",
        durationMs: Date.now() - started,
        concurrency,
      },
    });
  } catch (error) {
    if (error instanceof FoodDataProviderException) {
      return json({ error: error.toError() }, statusFor(error));
    }
    return json(
      {
        error: {
          code: "FOOD_PROVIDER_ERROR",
          message: error instanceof Error ? error.message : "Food resolution failed.",
        },
      },
      500,
    );
  }
});
