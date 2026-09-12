import {
  recipeDiscoveryError,
  type RecipeDiscoveryProvider,
} from "@fitness-autopilot/domain";
import {
  loadEdamamServerConfig,
  type EdamamServerConfig,
  type EnvReader,
} from "./edamam/config";
import type { EdamamHttpClient } from "./edamam/http";
import {
  EdamamRecipeDiscoveryProvider,
  type RecipeDiscoveryLogEvent,
} from "./edamam/recipe-discovery-provider";

export type CreateRecipeDiscoveryProviderOptions = {
  env?: EnvReader;
  config?: EdamamServerConfig;
  httpClient?: EdamamHttpClient;
  onLog?: (event: RecipeDiscoveryLogEvent) => void;
};

/**
 * Factory for server-side recipe discovery.
 * PLAN-005: Edamam is the only configured provider.
 */
export function createRecipeDiscoveryProvider(
  options: CreateRecipeDiscoveryProviderOptions = {},
): RecipeDiscoveryProvider {
  const configResult =
    options.config !== undefined
      ? { ok: true as const, value: options.config }
      : loadEdamamServerConfig(options.env);
  if (!configResult.ok) {
    throw recipeDiscoveryError(
      configResult.error.code,
      configResult.error.message,
    );
  }

  return new EdamamRecipeDiscoveryProvider({
    config: configResult.value,
    httpClient: options.httpClient,
    onLog: options.onLog,
  });
}
