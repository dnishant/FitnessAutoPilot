import type { CulinaryDiscoveryProvider } from "../domain/index.ts";
import { culinaryDiscoveryError } from "../domain/index.ts";
import { loadLlmServerConfig, type EnvReader, type LlmServerConfig } from "./config.ts";
import type { GeminiContentClient } from "./gemini/client.ts";
import { createGoogleGenAiContentClient } from "./gemini/google-client.ts";
import {
  GeminiGroundedCulinaryDiscoveryProvider,
  type CulinaryDiscoveryLogEvent,
} from "./gemini/culinary-discovery-provider.ts";

export type CreateCulinaryDiscoveryProviderOptions = {
  env?: EnvReader;
  config?: LlmServerConfig;
  geminiClient?: GeminiContentClient;
  onLog?: (event: CulinaryDiscoveryLogEvent) => void;
};

export function createCulinaryDiscoveryProvider(
  options: CreateCulinaryDiscoveryProviderOptions = {},
): CulinaryDiscoveryProvider {
  const configResult =
    options.config !== undefined
      ? { ok: true as const, value: options.config }
      : loadLlmServerConfig(options.env);
  if (!configResult.ok) {
    throw culinaryDiscoveryError(configResult.error.code, configResult.error.message);
  }

  const { gemini } = configResult.value;
  const client = options.geminiClient ?? createGoogleGenAiContentClient(gemini.apiKey);
  return new GeminiGroundedCulinaryDiscoveryProvider({
    model: gemini.model,
    client,
    onLog: options.onLog,
  });
}
