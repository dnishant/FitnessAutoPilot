import type { FoodResolver } from "@fitness-autopilot/domain";
import {
  DefaultFoodResolver,
  FoodResolutionMemoryCache,
  emptyDiagnostics,
  type FoodDataProvider,
  type FoodResolutionStore,
  type SemanticFoodDisambiguator,
} from "@fitness-autopilot/domain";
import type { LlmServerConfig } from "./config";
import { loadLlmServerConfig } from "./config";
import { GeminiFoodDisambiguator } from "./gemini/food-disambiguator";
import { loadUsdaServerConfig } from "./usda/config";
import { UsdaFoodDataProvider } from "./usda/provider";

export type CreateFoodResolverOptions = {
  provider?: FoodDataProvider;
  store?: FoodResolutionStore;
  cache?: FoodResolutionMemoryCache;
  disambiguator?: SemanticFoodDisambiguator | null;
  enableSemanticDisambiguation?: boolean;
  llmConfig?: LlmServerConfig;
  env?: (key: string) => string | undefined;
  onLog?: (event: Record<string, unknown>) => void;
};

/**
 * Server-side factory: USDA provider + optional Gemini disambiguation.
 */
export function createFoodResolver(options: CreateFoodResolverOptions = {}): FoodResolver {
  const env = options.env ?? ((key: string) => process.env[key]);
  const diagnostics = emptyDiagnostics();
  const cache = options.cache ?? new FoodResolutionMemoryCache();
  const inflight = new Map();

  let provider = options.provider;
  if (!provider) {
    const usdaConfig = loadUsdaServerConfig(env);
    if (!usdaConfig.ok) {
      throw new Error(usdaConfig.error.message);
    }
    provider = new UsdaFoodDataProvider({
      config: usdaConfig.value,
      onLog: options.onLog,
    });
  }

  let disambiguator = options.disambiguator;
  const enableSemantic = options.enableSemanticDisambiguation !== false;
  if (disambiguator === undefined && enableSemantic) {
    if (options.llmConfig) {
      disambiguator = new GeminiFoodDisambiguator({
        config: options.llmConfig,
        onLog: (event) => options.onLog?.(event),
      });
    } else {
      const llmConfig = loadLlmServerConfig(env);
      if (llmConfig.ok) {
        disambiguator = new GeminiFoodDisambiguator({
          config: llmConfig.value,
          onLog: (event) => options.onLog?.(event),
        });
      } else {
        disambiguator = null;
      }
    }
  }

  return new DefaultFoodResolver({
    provider,
    store: options.store,
    cache,
    disambiguator: disambiguator ?? null,
    enableSemanticDisambiguation: enableSemantic && disambiguator != null,
    diagnostics,
    inflight,
  });
}
