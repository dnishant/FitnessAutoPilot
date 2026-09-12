import { json, requireUser, serveWithCors } from "../_shared/http.ts";
import {
  isRecipeDiscoveryError,
  parseRecipeDiscoveryRequest,
  type RecipeDiscoveryError,
} from "../_shared/domain/recipes/discovery.ts";
import { createRecipeDiscoveryProvider } from "../_shared/llm/create-recipe-discovery-provider.ts";
import { loadEdamamServerConfig } from "../_shared/llm/edamam/config.ts";

function statusFor(error: RecipeDiscoveryError): number {
  switch (error.code) {
    case "INVALID_REQUEST":
      return 422;
    case "NO_RESULTS":
      return 404;
    case "PROVIDER_CONFIGURATION_ERROR":
      return 500;
    case "PROVIDER_AUTH_FAILED":
      return 502;
    case "PROVIDER_RATE_LIMITED":
      return 429;
    case "PROVIDER_BAD_RESPONSE":
      return 502;
    case "PROVIDER_UNAVAILABLE":
      return 502;
    default:
      return 500;
  }
}

function asDiscoveryError(error: unknown): RecipeDiscoveryError {
  if (isRecipeDiscoveryError(error)) {
    return error;
  }
  return {
    code: "PROVIDER_UNAVAILABLE",
    message: error instanceof Error ? error.message : "Recipe discovery failed.",
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
    return json(
      { error: { code: "INVALID_REQUEST", message: "Invalid JSON body" } },
      400,
    );
  }

  const parsed = parseRecipeDiscoveryRequest(body);
  if (!parsed.ok) {
    return json({ error: parsed.error }, statusFor(parsed.error));
  }

  const config = loadEdamamServerConfig((key) => Deno.env.get(key));
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
  let requestId = `rd_${crypto.randomUUID()}`;
  try {
    const provider = createRecipeDiscoveryProvider({
      config: config.value,
      onLog: (event) => {
        requestId = event.requestId;
        console.log(
          JSON.stringify({
            event: "recipe_discovery_search",
            provider: event.provider,
            requestId: event.requestId,
            durationMs: event.durationMs,
            success: event.success,
            externalRequestsMade: event.externalRequestsMade,
            totalReturned: event.totalReturned,
            errorCode: event.errorCode,
            errorMessage: event.errorMessage,
            mealType: event.mealType,
            highProteinPreferred: event.highProteinPreferred,
            userIdPresent: true,
          }),
        );
      },
    });

    const result = await provider.search(parsed.value);
    return json(result);
  } catch (error) {
    const mapped = asDiscoveryError(error);
    console.log(
      JSON.stringify({
        event: "recipe_discovery_search",
        provider: "edamam",
        requestId,
        durationMs: Date.now() - started,
        success: false,
        errorCode: mapped.code,
        errorMessage: mapped.message,
        mealType: parsed.value.mealType,
        highProteinPreferred: parsed.value.highProteinPreferred,
      }),
    );
    return json({ error: mapped }, statusFor(mapped));
  }
});
