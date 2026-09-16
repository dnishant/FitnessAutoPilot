import type {
  CanonicalFood,
  ExternalFoodRecord,
  FoodResolutionCandidate,
  FoodResolutionResult,
  IngredientFoodMapping,
  ResolvedRecipeIngredient,
} from "@fitness-autopilot/contracts";
import {
  FOOD_DISAMBIGUATION_PROMPT_VERSION,
  FOOD_RESOLUTION_POLICY_VERSION,
} from "@fitness-autopilot/contracts";
import {
  emptyDiagnostics,
  type FoodResolutionMemoryCache,
  type FoodResolutionStore,
  type MutableDiagnostics,
  FoodResolutionMemoryCache as MemoryCache,
} from "./caches";
import { matchBuiltinFood } from "./builtin-foods";
import { scoreFoodCandidates, selectFoodCandidate } from "./candidate-scoring";
import type { FoodDataProvider } from "./food-data-provider";
import { FoodDataProviderException } from "./food-data-provider";
import { buildIngredientResolutionKey } from "./ingredient-key";
import { hasRequiredCanonicalNutrition } from "./nutrient-mapper";

export type SemanticFoodDisambiguator = {
  chooseCandidate(input: {
    ingredient: ResolvedRecipeIngredient;
    searchQuery: string;
    measurementState: string;
    candidates: FoodResolutionCandidate[];
  }): Promise<{ externalId: string; reason: string } | null>;
};

export type FoodResolverOptions = {
  provider: FoodDataProvider;
  store?: FoodResolutionStore;
  cache?: FoodResolutionMemoryCache;
  disambiguator?: SemanticFoodDisambiguator | null;
  enableSemanticDisambiguation?: boolean;
  preferGeneric?: boolean;
  now?: () => Date;
  createFoodId?: () => string;
  diagnostics?: MutableDiagnostics;
  /** In-flight dedupe for concurrent identical keys. */
  inflight?: Map<string, Promise<FoodResolutionResult>>;
};

export interface FoodResolver {
  resolve(ingredient: ResolvedRecipeIngredient): Promise<FoodResolutionResult>;
  getDiagnostics(): MutableDiagnostics;
}

function externalToCanonical(
  record: ExternalFoodRecord,
  foodId: string,
  nowIso: string,
): CanonicalFood | null {
  const nutrients = record.nutrientsPer100g;
  const mapped = {
    caloriesKcal: nutrients.caloriesKcal,
    proteinGrams: nutrients.proteinGrams,
    carbohydrateGrams: nutrients.carbohydrateGrams,
    fatGrams: nutrients.fatGrams,
    fiberGrams: nutrients.fiberGrams ?? null,
    missingRequired: [] as Array<
      "caloriesKcal" | "proteinGrams" | "carbohydrateGrams" | "fatGrams"
    >,
  };
  if (!Number.isFinite(nutrients.caloriesKcal)) mapped.missingRequired.push("caloriesKcal");
  if (!Number.isFinite(nutrients.proteinGrams)) mapped.missingRequired.push("proteinGrams");
  if (!Number.isFinite(nutrients.carbohydrateGrams)) {
    mapped.missingRequired.push("carbohydrateGrams");
  }
  if (!Number.isFinite(nutrients.fatGrams)) mapped.missingRequired.push("fatGrams");
  if (!hasRequiredCanonicalNutrition(mapped)) {
    return null;
  }
  return {
    foodId,
    canonicalName: record.canonicalName,
    source: {
      provider: "usda",
      externalId: record.externalId,
      dataType: record.source.dataType ?? null,
    },
    description: record.description,
    nutrientsPer100g: {
      caloriesKcal: nutrients.caloriesKcal,
      proteinGrams: nutrients.proteinGrams,
      carbohydrateGrams: nutrients.carbohydrateGrams,
      fatGrams: nutrients.fatGrams,
      fiberGrams: nutrients.fiberGrams ?? null,
    },
    measures: record.measures ?? [],
    metadata: record.metadata,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export class DefaultFoodResolver implements FoodResolver {
  private readonly provider: FoodDataProvider;
  private readonly store?: FoodResolutionStore;
  private readonly cache: FoodResolutionMemoryCache;
  private readonly disambiguator?: SemanticFoodDisambiguator | null;
  private readonly enableSemanticDisambiguation: boolean;
  private readonly preferGeneric: boolean;
  private readonly now: () => Date;
  private readonly createFoodId: () => string;
  private readonly diagnostics: MutableDiagnostics;
  private readonly inflight: Map<string, Promise<FoodResolutionResult>>;

  constructor(options: FoodResolverOptions) {
    this.provider = options.provider;
    this.store = options.store;
    this.cache = options.cache ?? new MemoryCache();
    this.disambiguator = options.disambiguator;
    this.enableSemanticDisambiguation = options.enableSemanticDisambiguation !== false;
    this.preferGeneric = options.preferGeneric !== false;
    this.now = options.now ?? (() => new Date());
    this.createFoodId = options.createFoodId ?? (() => crypto.randomUUID());
    this.diagnostics = options.diagnostics ?? emptyDiagnostics();
    this.inflight = options.inflight ?? new Map();
  }

  getDiagnostics(): MutableDiagnostics {
    return this.diagnostics;
  }

  async resolve(ingredient: ResolvedRecipeIngredient): Promise<FoodResolutionResult> {
    this.diagnostics.totalIngredients += 1;
    const keyParts = buildIngredientResolutionKey(ingredient);
    const existing = this.inflight.get(keyParts.resolutionKey);
    if (existing) {
      return existing;
    }
    const promise = this.resolveUnique(ingredient, keyParts.resolutionKey);
    this.inflight.set(keyParts.resolutionKey, promise);
    try {
      return await promise;
    } finally {
      // Keep completed promise for request-level dedupe of identical keys.
    }
  }

  private async resolveUnique(
    ingredient: ResolvedRecipeIngredient,
    resolutionKey: string,
  ): Promise<FoodResolutionResult> {
    const keyParts = buildIngredientResolutionKey(ingredient);
    this.diagnostics.uniqueResolutionKeys += 1;

    const builtin = matchBuiltinFood(ingredient.name);
    if (builtin) {
      this.diagnostics.resolvedCount += 1;
      this.diagnostics.builtinResolvedCount += 1;
      this.cache.putFood(builtin);
      return {
        status: "resolved",
        food: builtin,
        confidence: "high",
        matchReason: "Builtin non-caloric staple mapping.",
        resolutionMethod: "builtin",
      };
    }

    const cachedMapping =
      this.cache.getMapping(resolutionKey) ??
      (this.store?.getMapping ? await this.store.getMapping(resolutionKey) : null);
    if (cachedMapping) {
      this.diagnostics.mappingCacheHits += 1;
      const food =
        this.cache.getFoodById(cachedMapping.foodId) ??
        (this.store?.getFoodById ? await this.store.getFoodById(cachedMapping.foodId) : null);
      if (food) {
        this.diagnostics.canonicalFoodCacheHits += 1;
        this.diagnostics.resolvedCount += 1;
        this.cache.putFood(food);
        return {
          status: "resolved",
          food,
          confidence: cachedMapping.confidence,
          matchReason: `Cached ingredient mapping (${cachedMapping.resolutionMethod}).`,
          resolutionMethod: cachedMapping.resolutionMethod,
        };
      }
    }

    try {
      this.diagnostics.providerSearchCount += 1;
      const searchResults = await this.provider.searchFoods({
        query: keyParts.searchQuery,
        dataTypes: this.preferGeneric
          ? ["Foundation", "SR Legacy", "Survey (FNDDS)"]
          : undefined,
        pageSize: 25,
        requireGeneric: this.preferGeneric,
      });

      const scored = scoreFoodCandidates({
        query: keyParts.searchQuery,
        measurementState: keyParts.measurementState,
        role: ingredient.role,
        requireGeneric: this.preferGeneric,
        candidates: searchResults,
      });

      let selection = selectFoodCandidate(scored, { preferGeneric: this.preferGeneric });

      if (
        selection.kind === "ambiguous" &&
        this.enableSemanticDisambiguation &&
        this.disambiguator
      ) {
        this.diagnostics.semanticDisambiguationCount += 1;
        const candidates: FoodResolutionCandidate[] = selection.candidates.map((c) => ({
          externalId: c.externalId,
          description: c.description,
          dataType: c.dataType,
          brandName: c.brandName,
          score: c.score,
          matchReason: c.matchReason,
        }));
        const chosen = await this.disambiguator.chooseCandidate({
          ingredient,
          searchQuery: keyParts.searchQuery,
          measurementState: keyParts.measurementState,
          candidates,
        });
        if (chosen) {
          const allowed = new Set(candidates.map((c) => c.externalId));
          if (allowed.has(chosen.externalId)) {
            const match = scored.find((c) => c.externalId === chosen.externalId);
            if (match) {
              selection = {
                kind: "resolved",
                candidate: match,
                confidence: "medium",
              };
            }
          }
        }
      }

      if (selection.kind === "not_found") {
        this.diagnostics.notFoundCount += 1;
        return { status: "not_found", reason: selection.reason };
      }
      if (selection.kind === "ambiguous") {
        this.diagnostics.ambiguousCount += 1;
        return {
          status: "ambiguous",
          candidates: selection.candidates.map((c) => ({
            externalId: c.externalId,
            description: c.description,
            dataType: c.dataType,
            brandName: c.brandName,
            score: c.score,
            matchReason: c.matchReason,
          })),
          reason: selection.reason,
        };
      }

      const detailCached = this.cache.getFoodByExternalId(
        "usda",
        selection.candidate.externalId,
      );
      let food = detailCached;
      if (!food && this.store?.getFoodByExternalId) {
        food =
          (await this.store.getFoodByExternalId("usda", selection.candidate.externalId)) ??
          undefined;
        if (food) this.diagnostics.canonicalFoodCacheHits += 1;
      }
      if (!food) {
        this.diagnostics.providerDetailFetchCount += 1;
        const record = await this.provider.getFood(selection.candidate.externalId);
        const nowIso = this.now().toISOString();
        food = externalToCanonical(record, this.createFoodId(), nowIso) ?? undefined;
        if (!food) {
          this.diagnostics.notFoundCount += 1;
          return {
            status: "not_found",
            reason: `Provider food ${selection.candidate.externalId} missing required nutrients.`,
          };
        }
        this.cache.putFood(food);
        if (this.store?.putFood) await this.store.putFood(food);
      } else {
        this.cache.putFood(food);
      }

      const method =
        this.diagnostics.semanticDisambiguationCount > 0 && selection.confidence === "medium"
          ? ("semantic_disambiguation" as const)
          : ("deterministic" as const);

      const mapping: IngredientFoodMapping = {
        mappingId: this.createFoodId(),
        resolutionKey,
        normalizedIngredientName: keyParts.normalizedName,
        measurementState: keyParts.measurementState,
        foodId: food.foodId,
        confidence: selection.confidence,
        resolutionMethod: method,
        policyVersion: FOOD_RESOLUTION_POLICY_VERSION,
        createdAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      };
      this.cache.putMapping(mapping);
      if (this.store?.putMapping) await this.store.putMapping(mapping);

      this.diagnostics.resolvedCount += 1;
      return {
        status: "resolved",
        food,
        confidence: selection.confidence,
        matchReason: `${selection.candidate.matchReason}; score=${selection.candidate.score.toFixed(1)}`,
        resolutionMethod: method,
      };
    } catch (error) {
      if (error instanceof FoodDataProviderException) {
        if (
          error.code === "FOOD_PROVIDER_NOT_FOUND" ||
          error.code === "FOOD_PROVIDER_INVALID_RESPONSE"
        ) {
          this.diagnostics.notFoundCount += 1;
          return { status: "not_found", reason: error.message };
        }
        if (error.code === "FOOD_PROVIDER_RATE_LIMITED") {
          this.diagnostics.notFoundCount += 1;
          return {
            status: "not_found",
            reason: `Provider rate-limited while resolving ingredient: ${error.message}`,
          };
        }
        throw error;
      }
      throw error;
    }
  }
}

export { FOOD_DISAMBIGUATION_PROMPT_VERSION, FOOD_RESOLUTION_POLICY_VERSION };
