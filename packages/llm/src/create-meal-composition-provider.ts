import type { MealCompositionProvider } from "@fitness-autopilot/domain";
import { mealCompositionError } from "@fitness-autopilot/domain";
import { loadLlmServerConfig, type EnvReader, type LlmServerConfig } from "./config";
import type { GeminiContentClient } from "./gemini/client";
import { createGoogleGenAiContentClient } from "./gemini/google-client";
import {
  GeminiMealCompositionProvider,
  type MealCompositionLogEvent,
} from "./gemini/meal-composition-provider";

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
