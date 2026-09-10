import { json, requireUser, serveWithCors } from "../_shared/http.ts";
import {
  RECIPE_GENERATION_PROMPT_VERSION,
  parseRecipeGenerationRequest,
  type RecipeGenerationError,
} from "../_shared/domain/recipes/generation.ts";
import { createRecipeGenerator } from "../_shared/llm/create-recipe-generator.ts";
import { loadLlmServerConfig } from "../_shared/llm/config.ts";

function statusFor(error: RecipeGenerationError): number {
  switch (error.code) {
    case "INVALID_GENERATION_REQUEST":
    case "RECIPE_SCHEMA_VALIDATION_FAILED":
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

function asRecipeGenerationError(error: unknown): RecipeGenerationError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as RecipeGenerationError).code === "string" &&
    typeof (error as RecipeGenerationError).message === "string"
  ) {
    return error as RecipeGenerationError;
  }
  return {
    code: "LLM_PROVIDER_ERROR",
    message: error instanceof Error ? error.message : "Recipe generation failed.",
  };
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
    return json({ error: { code: "INVALID_GENERATION_REQUEST", message: "Invalid JSON body" } }, 400);
  }

  const parsed = parseRecipeGenerationRequest(body);
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
  let requestId = `rg_${crypto.randomUUID()}`;
  try {
    const generator = createRecipeGenerator({
      config: config.value,
      onLog: (event) => {
        requestId = event.requestId;
        console.log(
          JSON.stringify({
            event: "generate_recipe",
            provider: event.provider,
            model: event.model,
            promptVersion: event.promptVersion,
            requestId: event.requestId,
            durationMs: event.durationMs,
            success: event.success,
            errorCode: event.errorCode,
            usageMetadata: event.usageMetadata,
            mealType: event.mealType,
            varietyLevel: event.varietyLevel,
            userIdPresent: true,
          }),
        );
      },
    });

    const recipe = await generator.generateRecipe(parsed.value);
    return json({
      recipe,
      meta: {
        requestId,
        promptVersion: RECIPE_GENERATION_PROMPT_VERSION,
        provider: config.value.provider,
        model: config.value.gemini.model,
        durationMs: Date.now() - started,
      },
    });
  } catch (error) {
    const mapped = asRecipeGenerationError(error);
    console.log(
      JSON.stringify({
        event: "generate_recipe",
        provider: config.value.provider,
        model: config.value.gemini.model,
        promptVersion: RECIPE_GENERATION_PROMPT_VERSION,
        requestId,
        durationMs: Date.now() - started,
        success: false,
        errorCode: mapped.code,
      }),
    );
    return json({ error: mapped }, statusFor(mapped));
  }
});
