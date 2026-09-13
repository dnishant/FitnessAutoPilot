import { json, requireUser, serveWithCors } from "../_shared/http.ts";
import {
  CULINARY_DISCOVERY_PROMPT_VERSION,
  parseCulinaryDiscoveryRequest,
  type CulinaryDiscoveryError,
} from "../_shared/domain/recipes/culinary-discovery.ts";
import { createCulinaryDiscoveryProvider } from "../_shared/llm/create-culinary-discovery-provider.ts";
import { loadLlmServerConfig } from "../_shared/llm/config.ts";

function statusFor(error: CulinaryDiscoveryError): number {
  switch (error.code) {
    case "INVALID_DISCOVERY_REQUEST":
    case "DISCOVERY_SCHEMA_VALIDATION_FAILED":
    case "LLM_INVALID_STRUCTURED_OUTPUT":
    case "DISCOVERY_NOT_GROUNDED":
      return 422;
    case "LLM_CONFIGURATION_ERROR":
      return 500;
    case "LLM_PROVIDER_ERROR":
      return 502;
    default:
      return 500;
  }
}

function asCulinaryDiscoveryError(error: unknown): CulinaryDiscoveryError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as CulinaryDiscoveryError).code === "string" &&
    typeof (error as CulinaryDiscoveryError).message === "string"
  ) {
    return error as CulinaryDiscoveryError;
  }
  return {
    code: "LLM_PROVIDER_ERROR",
    message: error instanceof Error ? error.message : "Culinary discovery failed.",
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
      { error: { code: "INVALID_DISCOVERY_REQUEST", message: "Invalid JSON body" } },
      400,
    );
  }

  const parsed = parseCulinaryDiscoveryRequest(body);
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
  let requestId = `cd_${crypto.randomUUID()}`;
  try {
    const provider = createCulinaryDiscoveryProvider({
      config: config.value,
      maxGroundingAttempts: 1,
      onLog: (event) => {
        requestId = event.requestId;
        console.log(
          JSON.stringify({
            event: "culinary_discovery",
            provider: event.provider,
            model: event.model,
            promptVersion: event.promptVersion,
            requestId: event.requestId,
            durationMs: event.durationMs,
            success: event.success,
            errorCode: event.errorCode,
            errorMessage: event.errorMessage,
            usageMetadata: event.usageMetadata,
            mealType: event.mealType,
            requestedCandidateCount: event.requestedCandidateCount,
            returnedCandidateCount: event.returnedCandidateCount,
            searchQueryCount: event.searchQueryCount,
            googleSearchEnabled: event.googleSearchEnabled,
            userIdPresent: true,
          }),
        );
      },
    });

    const result = await provider.discover(parsed.value);
    return json({
      result,
      meta: {
        requestId,
        promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
        provider: config.value.provider,
        model: config.value.gemini.model,
        durationMs: Date.now() - started,
      },
    });
  } catch (error) {
    const mapped = asCulinaryDiscoveryError(error);
    console.log(
      JSON.stringify({
        event: "culinary_discovery",
        provider: config.value.provider,
        model: config.value.gemini.model,
        promptVersion: CULINARY_DISCOVERY_PROMPT_VERSION,
        requestId,
        durationMs: Date.now() - started,
        success: false,
        errorCode: mapped.code,
        errorMessage: mapped.message,
      }),
    );
    return json({ error: mapped }, statusFor(mapped));
  }
});
