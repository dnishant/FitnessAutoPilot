import type { CulinaryDiscoveryProvider } from "@fitness-autopilot/domain";
import { culinaryDiscoveryError } from "@fitness-autopilot/domain";
import { loadLlmServerConfig, type EnvReader, type LlmServerConfig } from "./config";
import type { GeminiContentClient } from "./gemini/client";
import { createGoogleGenAiContentClient } from "./gemini/google-client";
import {
  GeminiGroundedCulinaryDiscoveryProvider,
  type CulinaryDiscoveryLogEvent,
} from "./gemini/culinary-discovery-provider";

export type CreateCulinaryDiscoveryProviderOptions = {
  env?: EnvReader;
  config?: LlmServerConfig;
  geminiClient?: GeminiContentClient;
  onLog?: (event: CulinaryDiscoveryLogEvent) => void;
  maxGroundingAttempts?: number;
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
    maxGroundingAttempts: options.maxGroundingAttempts,
  });
}
