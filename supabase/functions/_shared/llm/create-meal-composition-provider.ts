import type { MealCompositionProvider } from "../domain/index.ts";
import { mealCompositionError } from "../domain/index.ts";
import { loadLlmServerConfig, type EnvReader, type LlmServerConfig } from "./config.ts";
import type { GeminiContentClient } from "./gemini/client.ts";
import { createGoogleGenAiContentClient } from "./gemini/google-client.ts";
import {
  GeminiMealCompositionProvider,
  type MealCompositionLogEvent,
} from "./gemini/meal-composition-provider.ts";

export type CreateMealCompositionProviderOptions = {
  env?: EnvReader;
  config?: LlmServerConfig;
  client?: GeminiContentClient;
  onLog?: (event: MealCompositionLogEvent) => void;
  maxAttempts?: number;
};

/**
 * Server-side factory: Gemini meal composition provider.
 */
export function createMealCompositionProvider(
  options: CreateMealCompositionProviderOptions = {},
): MealCompositionProvider {
  const configResult =
    options.config !== undefined
      ? { ok: true as const, value: options.config }
      : loadLlmServerConfig(options.env);
  if (!configResult.ok) {
    throw mealCompositionError(
      "LLM_CONFIGURATION_ERROR",
      configResult.error.message,
    );
  }

  const { gemini } = configResult.value;
  const client = options.client ?? createGoogleGenAiContentClient(gemini.apiKey);
  return new GeminiMealCompositionProvider({
    model: gemini.model,
    client,
    onLog: options.onLog,
    maxAttempts: options.maxAttempts,
  });
}
