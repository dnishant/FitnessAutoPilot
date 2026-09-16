import { json, requireUser, serveWithCors } from "../_shared/http.ts";
import {
  ComposeMealsRequestSchema,
  DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
  MEAL_COMPOSITION_POLICY_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
} from "../_shared/contracts/meal-composition.ts";
import { composeWeeklyMeals } from "../_shared/domain/meal-composition/compose.ts";
import { createMealCompositionProvider } from "../_shared/llm/create-meal-composition-provider.ts";
import { createFoodResolver } from "../_shared/llm/create-food-resolver.ts";
import { loadLlmServerConfig } from "../_shared/llm/config.ts";

function statusFor(code?: string): number {
  switch (code) {
    case "INVALID_COMPOSITION_REQUEST":
    case "INVALID_COMPOSITION":
    case "HARD_CONSTRAINT_CONFLICT":
      return 422;
    case "RATE_LIMITED":
      return 429;
    case "LLM_CONFIGURATION_ERROR":
      return 500;
    case "COMPOSITION_PROVIDER_ERROR":
    case "COMPONENT_RESOLUTION_FAILED":
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
          code: "INVALID_COMPOSITION_REQUEST",
          message: "Invalid JSON body",
        },
      },
      400,
    );
  }

  const parsed = ComposeMealsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: {
          code: "INVALID_COMPOSITION_REQUEST",
          message: parsed.error.issues[0]?.message ?? "Invalid compose-meals request.",
          details: parsed.error.flatten(),
        },
      },
      422,
    );
  }

  const llmConfig = loadLlmServerConfig((key) => Deno.env.get(key));
  if (!llmConfig.ok) {
    return json({ error: llmConfig.error }, 500);
  }

  const started = Date.now();
  const requestId = `mc_${crypto.randomUUID()}`;
  const concurrency = parsed.data.concurrency ?? DEFAULT_MEAL_COMPOSITION_CONCURRENCY;

  try {
    const provider = createMealCompositionProvider({
      config: llmConfig.value,
      env: (key) => Deno.env.get(key),
      onLog: (event) => {
        console.log(JSON.stringify({ fn: "compose-meals", requestId, ...event }));
      },
    });

    const foodResolver =
      parsed.data.resolveAddedComponents === false
        ? null
        : createFoodResolver({
            enableSemanticDisambiguation: true,
            env: (key) => Deno.env.get(key),
            onLog: (event) => {
              console.log(JSON.stringify({ fn: "compose-meals-food", requestId, ...event }));
            },
          });

    const { result, failures } = await composeWeeklyMeals({
      ...parsed.data,
      provider,
      foodResolver,
      providerMeta: {
        provider: "gemini",
        model: llmConfig.value.gemini.model,
      },
      concurrency,
      slotCount: parsed.data.slotCount ?? parsed.data.recipes.length,
    });

    if (failures.length > 0 && result.mealCount === 0) {
      return json(
        {
          error: failures[0],
          failures,
        },
        statusFor(failures[0]?.code),
      );
    }

    return json({
      result,
      failures: failures.length > 0 ? failures : undefined,
      meta: {
        requestId,
        promptVersion: MEAL_COMPOSITION_PROMPT_VERSION,
        policyVersion: MEAL_COMPOSITION_POLICY_VERSION,
        provider: "gemini",
        model: llmConfig.value.gemini.model,
        durationMs: Date.now() - started,
        concurrency,
      },
    });
  } catch (error) {
    return json(
      {
        error: {
          code: "COMPOSITION_PROVIDER_ERROR",
          message: error instanceof Error ? error.message : "Meal composition failed.",
        },
      },
      502,
    );
  }
});
