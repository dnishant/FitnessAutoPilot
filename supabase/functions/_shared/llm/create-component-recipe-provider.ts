import type { ComponentRecipeProvider } from "../domain/index.ts";
import { mealCompositionError } from "../domain/index.ts";
import { loadLlmServerConfig, type EnvReader, type LlmServerConfig } from "./config.ts";
import type { GeminiContentClient } from "./gemini/client.ts";
import { GeminiComponentRecipeProvider } from "./gemini/component-recipe-provider.ts";
import { createGoogleGenAiContentClient } from "./gemini/google-client.ts";

export function createComponentRecipeProvider(options: {
  env?: EnvReader;
  config?: LlmServerConfig;
  client?: GeminiContentClient;
  maxAttempts?: number;
} = {}): ComponentRecipeProvider {
  const configResult =
    options.config !== undefined
      ? { ok: true as const, value: options.config }
      : loadLlmServerConfig(options.env);
  if (!configResult.ok) {
    throw mealCompositionError("LLM_CONFIGURATION_ERROR", configResult.error.message);
  }
  const { gemini } = configResult.value;
  const client = options.client ?? createGoogleGenAiContentClient(gemini.apiKey);
  return new GeminiComponentRecipeProvider({
    model: gemini.model,
    client,
    maxAttempts: options.maxAttempts,
  });
}
