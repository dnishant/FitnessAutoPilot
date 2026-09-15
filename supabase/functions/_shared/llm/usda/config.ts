/**
 * Server-only USDA FoodData Central configuration.
 * Never import from Expo / browser / React Native client code.
 */

export type UsdaServerConfig = {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxAttempts: number;
};

export type UsdaConfigError = {
  code: "FOOD_PROVIDER_CONFIGURATION_ERROR";
  message: string;
};

export type EnvReader = (key: string) => string | undefined;

function readEnv(reader: EnvReader, key: string): string | undefined {
  const value = reader(key);
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export const DEFAULT_USDA_BASE_URL = "https://api.nal.usda.gov/fdc/v1";
export const DEFAULT_USDA_TIMEOUT_MS = 12_000;
export const DEFAULT_USDA_MAX_ATTEMPTS = 3;

export function loadUsdaServerConfig(
  reader: EnvReader = (key) => Deno.env.get(key),
): { ok: true; value: UsdaServerConfig } | { ok: false; error: UsdaConfigError } {
  const apiKey = readEnv(reader, "USDA_API_KEY") ?? readEnv(reader, "FDC_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: "FOOD_PROVIDER_CONFIGURATION_ERROR",
        message: "USDA_API_KEY (or FDC_API_KEY) is required for FoodData Central requests.",
      },
    };
  }

  const timeoutRaw = readEnv(reader, "USDA_TIMEOUT_MS");
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : DEFAULT_USDA_TIMEOUT_MS;
  const attemptsRaw = readEnv(reader, "USDA_MAX_ATTEMPTS");
  const maxAttempts = attemptsRaw ? Number(attemptsRaw) : DEFAULT_USDA_MAX_ATTEMPTS;

  return {
    ok: true,
    value: {
      apiKey,
      baseUrl: readEnv(reader, "USDA_BASE_URL") ?? DEFAULT_USDA_BASE_URL,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_USDA_TIMEOUT_MS,
      maxAttempts:
        Number.isFinite(maxAttempts) && maxAttempts >= 1
          ? Math.min(6, Math.floor(maxAttempts))
          : DEFAULT_USDA_MAX_ATTEMPTS,
    },
  };
}
