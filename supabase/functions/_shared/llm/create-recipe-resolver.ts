import type { RecipeResolver } from "../domain/index.ts";
import { recipeResolutionError } from "../domain/index.ts";
import { loadLlmServerConfig, type EnvReader, type LlmServerConfig } from "./config.ts";
import type { GeminiContentClient } from "./gemini/client.ts";
import { createGoogleGenAiContentClient } from "./gemini/google-client.ts";
import {
  GeminiRecipeResolver,
  type RecipeResolutionLogEvent,
} from "./gemini/recipe-resolver.ts";

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
