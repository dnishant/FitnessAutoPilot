import type {
  CanonicalFood,
  FoodResolutionDiagnostics,
  IngredientFoodMapping,
} from "../../contracts/index.ts";

export type FoodResolutionCacheStats = {
  mappingHits: number;
  foodHits: number;
};

/**
 * In-memory caches for a resolution operation (and optionally longer-lived).
 */
export class FoodResolutionMemoryCache {
  private readonly foodsById = new Map<string, CanonicalFood>();
  private readonly foodsByExternalId = new Map<string, CanonicalFood>();
  private readonly mappingsByKey = new Map<string, IngredientFoodMapping>();
  private stats: FoodResolutionCacheStats = { mappingHits: 0, foodHits: 0 };

  getStats(): FoodResolutionCacheStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { mappingHits: 0, foodHits: 0 };
  }

  getFoodById(foodId: string): CanonicalFood | undefined {
    const hit = this.foodsById.get(foodId);
    if (hit) this.stats.foodHits += 1;
    return hit;
  }

  getFoodByExternalId(provider: string, externalId: string): CanonicalFood | undefined {
    const hit = this.foodsByExternalId.get(`${provider}:${externalId}`);
    if (hit) this.stats.foodHits += 1;
    return hit;
  }

  putFood(food: CanonicalFood): void {
    this.foodsById.set(food.foodId, food);
    this.foodsByExternalId.set(`${food.source.provider}:${food.source.externalId}`, food);
  }

  getMapping(resolutionKey: string): IngredientFoodMapping | undefined {
    const hit = this.mappingsByKey.get(resolutionKey);
    if (hit) this.stats.mappingHits += 1;
    return hit;
  }

  putMapping(mapping: IngredientFoodMapping): void {
    this.mappingsByKey.set(mapping.resolutionKey, mapping);
  }
}

export function emptyDiagnostics(): FoodResolutionDiagnostics {
  return {
    totalIngredients: 0,
    uniqueResolutionKeys: 0,
    mappingCacheHits: 0,
    canonicalFoodCacheHits: 0,
    providerSearchCount: 0,
    providerDetailFetchCount: 0,
    semanticDisambiguationCount: 0,
    resolvedCount: 0,
    ambiguousCount: 0,
    notFoundCount: 0,
    builtinResolvedCount: 0,
  };
}

export type MutableDiagnostics = FoodResolutionDiagnostics;

/**
 * Optional persistent store for canonical foods / ingredient mappings.
 * Edge implementations may back this with Supabase; tests use memory.
 */
export interface FoodResolutionStore {
  getMapping?(resolutionKey: string): Promise<IngredientFoodMapping | null>;
  putMapping?(mapping: IngredientFoodMapping): Promise<void>;
  getFoodById?(foodId: string): Promise<CanonicalFood | null>;
  getFoodByExternalId?(
    provider: string,
    externalId: string,
  ): Promise<CanonicalFood | null>;
  putFood?(food: CanonicalFood): Promise<void>;
}

export class MemoryFoodResolutionStore implements FoodResolutionStore {
  private readonly cache = new FoodResolutionMemoryCache();

  async getMapping(resolutionKey: string): Promise<IngredientFoodMapping | null> {
    return this.cache.getMapping(resolutionKey) ?? null;
  }

  async putMapping(mapping: IngredientFoodMapping): Promise<void> {
    this.cache.putMapping(mapping);
  }

  async getFoodById(foodId: string): Promise<CanonicalFood | null> {
    return this.cache.getFoodById(foodId) ?? null;
  }

  async getFoodByExternalId(
    provider: string,
    externalId: string,
  ): Promise<CanonicalFood | null> {
    return this.cache.getFoodByExternalId(provider, externalId) ?? null;
  }

  async putFood(food: CanonicalFood): Promise<void> {
    this.cache.putFood(food);
  }

  /** Expose underlying cache for request-level reuse. */
  getMemoryCache(): FoodResolutionMemoryCache {
    return this.cache;
  }
}
