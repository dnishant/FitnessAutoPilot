import type { RecipeGenerator } from "../domain/index.ts";
import { recipeGenerationError } from "../domain/index.ts";
import { loadLlmServerConfig, type EnvReader, type LlmServerConfig } from "./config.ts";
import type { GeminiContentClient } from "./gemini/client.ts";
import { createGoogleGenAiContentClient } from "./gemini/google-client.ts";
import {
  GeminiRecipeGenerator,
  type RecipeGenerationLogEvent,
} from "./gemini/recipe-generator.ts";

export type CreateRecipeGeneratorOptions = {
  env?: EnvReader;
  config?: LlmServerConfig;
  geminiClient?: GeminiContentClient;
  onLog?: (event: RecipeGenerationLogEvent) => void;
};

export function createRecipeGenerator(
  options: CreateRecipeGeneratorOptions = {},
): RecipeGenerator {
  const configResult =
    options.config !== undefined
      ? { ok: true as const, value: options.config }
      : loadLlmServerConfig(options.env);
  if (!configResult.ok) {
    throw recipeGenerationError(
      configResult.error.code,
      configResult.error.message,
    );
  }

  const { gemini } = configResult.value;
  const client = options.geminiClient ?? createGoogleGenAiContentClient(gemini.apiKey);
  return new GeminiRecipeGenerator({
    model: gemini.model,
    client,
    onLog: options.onLog,
  });
}
