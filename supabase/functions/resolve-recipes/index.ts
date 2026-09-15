import { json, requireUser, serveWithCors } from "../_shared/http.ts";
import {
  RECIPE_RESOLUTION_PROMPT_VERSION,
  DEFAULT_RECIPE_RESOLUTION_CONCURRENCY,
  resolveUniqueCandidates,
  type RecipeResolutionError,
} from "../_shared/domain/recipes/recipe-resolution.ts";
import { ResolveRecipesRequestSchema } from "../_shared/contracts/recipe-resolution.ts";
import { createRecipeResolver } from "../_shared/llm/create-recipe-resolver.ts";
import { loadLlmServerConfig } from "../_shared/llm/config.ts";

function statusFor(error: RecipeResolutionError): number {
  switch (error.code) {
    case "INVALID_RESOLUTION_REQUEST":
    case "RECIPE_SCHEMA_VALIDATION_FAILED":
    case "CANDIDATE_IDENTITY_MISMATCH":
    case "CANDIDATE_NOT_FOUND":
    case "LLM_INVALID_STRUCTURED_OUTPUT":
    case "PARTIAL_WEEKLY_RESOLUTION_FAILURE":
      return 422;
    case "RATE_LIMITED":
      return 429;
    case "LLM_CONFIGURATION_ERROR":
      return 500;
    case "LLM_PROVIDER_ERROR":
      return 502;
    default:
      return 500;
  }
}

function asRecipeResolutionError(error: unknown): RecipeResolutionError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as RecipeResolutionError).code === "string" &&
    typeof (error as RecipeResolutionError).message === "string"
  ) {
    return error as RecipeResolutionError;
  }
  return {
    code: "LLM_PROVIDER_ERROR",
    message: error instanceof Error ? error.message : "Recipe resolution failed.",
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
      { error: { code: "INVALID_RESOLUTION_REQUEST", message: "Invalid JSON body" } },
      400,
    );
  }

  const parsed = ResolveRecipesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: {
          code: "INVALID_RESOLUTION_REQUEST",
          message: parsed.error.issues[0]?.message ?? "Invalid resolve-recipes request.",
          details: parsed.error.flatten(),
        },
      },
      422,
    );
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
  let requestId = `rr_${crypto.randomUUID()}`;
  const concurrency = parsed.data.concurrency ?? DEFAULT_RECIPE_RESOLUTION_CONCURRENCY;

  try {
    const resolver = createRecipeResolver({
      config: config.value,
      onLog: (event) => {
        requestId = event.requestId || requestId;
        console.log(
          JSON.stringify({
            fn: "resolve-recipes",
            ...event,
            errorMessage: event.errorMessage,
          }),
        );
      },
      maxAttempts: 6,
    });

    const result = await resolveUniqueCandidates({
      candidates: parsed.data.candidates,
      uniqueCandidateIds: parsed.data.uniqueCandidateIds,
      resolver,
      concurrency,
    });

    if (!result.ok) {
      const failures =
        result.error.details &&
        typeof result.error.details === "object" &&
        "failures" in (result.error.details as object)
          ? (result.error.details as { failures: unknown }).failures
          : undefined;
      const partialRecipes =
        result.error.details &&
        typeof result.error.details === "object" &&
        "recipesByCandidateId" in (result.error.details as object)
          ? (result.error.details as { recipesByCandidateId: unknown }).recipesByCandidateId
          : undefined;
      return json(
        {
          error: result.error,
          failures,
          result: partialRecipes
            ? {
                recipesByCandidateId: partialRecipes,
                uniqueCandidateIds:
                  parsed.data.uniqueCandidateIds ??
                  parsed.data.candidates.map((c) => c.candidateId),
                resolvedCount:
                  partialRecipes && typeof partialRecipes === "object"
                    ? Object.keys(partialRecipes as object).length
                    : 0,
                slotCount: parsed.data.candidates.length,
                resolverCallCount: (
                  parsed.data.uniqueCandidateIds ??
                  parsed.data.candidates.map((c) => c.candidateId)
                ).length,
              }
            : undefined,
          meta: {
            requestId,
            promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
            provider: "gemini",
            model: config.value.gemini.model,
            durationMs: Date.now() - started,
            concurrency,
          },
        },
        statusFor(result.error),
      );
    }

    return json({
      result: {
        recipesByCandidateId: result.value.recipesByCandidateId,
        uniqueCandidateIds: result.value.uniqueCandidateIds,
        resolvedCount: result.value.resolvedCount,
        slotCount: result.value.slotCount,
        resolverCallCount: result.value.resolverCallCount,
      },
      failures: result.value.failures,
      meta: {
        requestId,
        promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
        provider: "gemini",
        model: config.value.gemini.model,
        durationMs: Date.now() - started,
        concurrency,
        uniqueCandidateCount: result.value.uniqueCandidateIds.length,
        resolverCallCount: result.value.resolverCallCount,
      },
    });
  } catch (error) {
    const mapped = asRecipeResolutionError(error);
    return json({ error: mapped }, statusFor(mapped));
  }
});
