import { json, requireUser } from "../_shared/http.ts";
import {
  WEEKLY_STRATEGY_PROMPT_VERSION,
  calculateWeeklyStrategyStats,
  parseWeeklyStrategyRequest,
  type WeeklyStrategyError,
} from "../_shared/domain/planning/weekly-strategy.ts";
import { createWeeklyStrategyGenerator } from "../_shared/llm/create-weekly-strategy-generator.ts";
import { loadLlmServerConfig } from "../_shared/llm/config.ts";

function statusFor(error: WeeklyStrategyError): number {
  switch (error.code) {
    case "INVALID_WEEKLY_STRATEGY_REQUEST":
    case "WEEKLY_STRATEGY_VALIDATION_FAILED":
    case "LLM_INVALID_STRUCTURED_OUTPUT":
      return 422;
    case "LLM_CONFIGURATION_ERROR":
      return 500;
    case "LLM_PROVIDER_ERROR":
      return 502;
    default:
      return 500;
  }
}

function asWeeklyStrategyError(error: unknown): WeeklyStrategyError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as WeeklyStrategyError).code === "string" &&
    typeof (error as WeeklyStrategyError).message === "string"
  ) {
    return error as WeeklyStrategyError;
  }
  return {
    code: "LLM_PROVIDER_ERROR",
    message: error instanceof Error ? error.message : "Weekly strategy generation failed.",
  };
}

Deno.serve(async (req) => {
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
      { error: { code: "INVALID_WEEKLY_STRATEGY_REQUEST", message: "Invalid JSON body" } },
      400,
    );
  }

  const parsed = parseWeeklyStrategyRequest(body);
  if (!parsed.ok) {
    return json({ error: parsed.error }, statusFor(parsed.error));
  }

  const config = loadLlmServerConfig((key) => Deno.env.get(key));
  if (!config.ok) {
    return json(
      {
        error: {
          code: config.error.code,
          message: config.error.message,
        },
      },
      500,
    );
  }

  const started = Date.now();
  let requestId = `ws_${crypto.randomUUID()}`;
  try {
    const generator = createWeeklyStrategyGenerator({
      config: config.value,
      onLog: (event) => {
        requestId = event.requestId;
        console.log(
          JSON.stringify({
            event: "generate_weekly_strategy",
            provider: event.provider,
            model: event.model,
            promptVersion: event.promptVersion,
            requestId: event.requestId,
            durationMs: event.durationMs,
            success: event.success,
            errorCode: event.errorCode,
            usageMetadata: event.usageMetadata,
            varietyLevel: event.varietyLevel,
            cookingStyle: event.cookingStyle,
            userIdPresent: true,
          }),
        );
      },
    });

    const strategy = await generator.generateWeeklyStrategy(parsed.value);
    const stats = calculateWeeklyStrategyStats(strategy);
    return json({
      strategy,
      stats,
      meta: {
        requestId,
        promptVersion: WEEKLY_STRATEGY_PROMPT_VERSION,
        provider: config.value.provider,
        model: config.value.gemini.model,
        durationMs: Date.now() - started,
      },
    });
  } catch (error) {
    const mapped = asWeeklyStrategyError(error);
    console.log(
      JSON.stringify({
        event: "generate_weekly_strategy",
        provider: config.value.provider,
        model: config.value.gemini.model,
        promptVersion: WEEKLY_STRATEGY_PROMPT_VERSION,
        requestId,
        durationMs: Date.now() - started,
        success: false,
        errorCode: mapped.code,
      }),
    );
    return json({ error: mapped }, statusFor(mapped));
  }
});
