import type { WeeklyStrategyGenerator } from "@fitness-autopilot/domain";
import { weeklyStrategyError } from "@fitness-autopilot/domain";
import { loadLlmServerConfig, type EnvReader, type LlmServerConfig } from "./config";
import type { GeminiContentClient } from "./gemini/client";
import { createGoogleGenAiContentClient } from "./gemini/google-client";
import {
  GeminiWeeklyStrategyGenerator,
  type WeeklyStrategyLogEvent,
} from "./gemini/weekly-strategy-generator";

export type CreateWeeklyStrategyGeneratorOptions = {
  env?: EnvReader;
  config?: LlmServerConfig;
  geminiClient?: GeminiContentClient;
  onLog?: (event: WeeklyStrategyLogEvent) => void;
};

export function createWeeklyStrategyGenerator(
  options: CreateWeeklyStrategyGeneratorOptions = {},
): WeeklyStrategyGenerator {
  const configResult =
    options.config !== undefined
      ? { ok: true as const, value: options.config }
      : loadLlmServerConfig(options.env);
  if (!configResult.ok) {
    throw weeklyStrategyError(configResult.error.code, configResult.error.message);
  }

  const { gemini } = configResult.value;
  const client = options.geminiClient ?? createGoogleGenAiContentClient(gemini.apiKey);
  return new GeminiWeeklyStrategyGenerator({
    model: gemini.model,
    client,
    onLog: options.onLog,
  });
}
