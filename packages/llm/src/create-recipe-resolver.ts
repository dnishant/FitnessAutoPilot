import type { RecipeResolver } from "@fitness-autopilot/domain";
import { recipeResolutionError } from "@fitness-autopilot/domain";
import { loadLlmServerConfig, type EnvReader, type LlmServerConfig } from "./config";
import type { GeminiContentClient } from "./gemini/client";
import { createGoogleGenAiContentClient } from "./gemini/google-client";
import {
  GeminiRecipeResolver,
  type RecipeResolutionLogEvent,
} from "./gemini/recipe-resolver";

export type CreateRecipeResolverOptions = {
  env?: EnvReader;
  config?: LlmServerConfig;
  geminiClient?: GeminiContentClient;
  onLog?: (event: RecipeResolutionLogEvent) => void;
  enableSearchGrounding?: boolean;
  maxAttempts?: number;
};

export function createRecipeResolver(
  options: CreateRecipeResolverOptions = {},
): RecipeResolver {
  const configResult =
    options.config !== undefined
      ? { ok: true as const, value: options.config }
      : loadLlmServerConfig(options.env);
  if (!configResult.ok) {
    throw recipeResolutionError(configResult.error.code, configResult.error.message);
  }

  const { gemini } = configResult.value;
  const client = options.geminiClient ?? createGoogleGenAiContentClient(gemini.apiKey);
  return new GeminiRecipeResolver({
    model: gemini.model,
    client,
    onLog: options.onLog,
    enableSearchGrounding: options.enableSearchGrounding,
    maxAttempts: options.maxAttempts,
  });
}
