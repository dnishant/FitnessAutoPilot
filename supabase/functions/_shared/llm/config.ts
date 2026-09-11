/**
 * Server-only LLM configuration.
 * Never import this module from Expo / browser / React Native client code.
 */

export type LlmProvider = "gemini";

export type LlmServerConfig = {
  provider: LlmProvider;
  gemini: {
    apiKey: string;
    model: string;
  };
};

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

export type LlmConfigError = {
  code: "LLM_CONFIGURATION_ERROR";
  message: string;
};

export type EnvReader = (key: string) => string | undefined;

function readEnv(reader: EnvReader, key: string): string | undefined {
  const value = reader(key);
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function loadLlmServerConfig(
  reader: EnvReader = (key) => Deno.env.get(key),
): { ok: true; value: LlmServerConfig } | { ok: false; error: LlmConfigError } {
  const providerRaw = (readEnv(reader, "LLM_PROVIDER") ?? "gemini").toLowerCase();
  if (providerRaw !== "gemini") {
    return {
      ok: false,
      error: {
        code: "LLM_CONFIGURATION_ERROR",
        message: `Unsupported LLM_PROVIDER "${providerRaw}". Only "gemini" is configured in PLAN-003.`,
      },
    };
  }

  const apiKey = readEnv(reader, "GEMINI_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: "LLM_CONFIGURATION_ERROR",
        message: "GEMINI_API_KEY is required for recipe generation.",
      },
    };
  }

  const model = readEnv(reader, "GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL;

  return {
    ok: true,
    value: {
      provider: "gemini",
      gemini: {
        apiKey,
        model,
      },
    },
  };
}
