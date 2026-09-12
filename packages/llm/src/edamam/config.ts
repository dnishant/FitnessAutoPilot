/**
 * Server-only Edamam Recipe Search configuration.
 * Never import this module from Expo / browser / React Native client code.
 */

export type EdamamServerConfig = {
  appId: string;
  appKey: string;
  /** Default: https://api.edamam.com/api/recipes/v2 */
  baseUrl: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
};

export const DEFAULT_EDAMAM_BASE_URL = "https://api.edamam.com/api/recipes/v2";
export const DEFAULT_EDAMAM_TIMEOUT_MS = 12_000;

export type EdamamConfigError = {
  code: "PROVIDER_CONFIGURATION_ERROR";
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

export function loadEdamamServerConfig(
  reader: EnvReader = (key) => process.env[key],
): { ok: true; value: EdamamServerConfig } | { ok: false; error: EdamamConfigError } {
  const appId = readEnv(reader, "EDAMAM_APP_ID");
  const appKey = readEnv(reader, "EDAMAM_APP_KEY");
  if (!appId || !appKey) {
    return {
      ok: false,
      error: {
        code: "PROVIDER_CONFIGURATION_ERROR",
        message:
          "EDAMAM_APP_ID and EDAMAM_APP_KEY are required for recipe discovery.",
      },
    };
  }

  const baseUrl = readEnv(reader, "EDAMAM_BASE_URL") ?? DEFAULT_EDAMAM_BASE_URL;
  const timeoutRaw = readEnv(reader, "EDAMAM_TIMEOUT_MS");
  let timeoutMs = DEFAULT_EDAMAM_TIMEOUT_MS;
  if (timeoutRaw !== undefined) {
    const parsed = Number(timeoutRaw);
    if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 60_000) {
      return {
        ok: false,
        error: {
          code: "PROVIDER_CONFIGURATION_ERROR",
          message: "EDAMAM_TIMEOUT_MS must be between 1000 and 60000.",
        },
      };
    }
    timeoutMs = Math.floor(parsed);
  }

  return {
    ok: true,
    value: {
      appId,
      appKey,
      baseUrl,
      timeoutMs,
    },
  };
}
