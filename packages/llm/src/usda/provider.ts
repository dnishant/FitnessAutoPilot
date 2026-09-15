import type { FoodSearchQuery, FoodSearchResult, ExternalFoodRecord } from "@fitness-autopilot/contracts";
import {
  FoodDataProviderException,
  type FoodDataProvider,
} from "@fitness-autopilot/domain";
import {
  DEFAULT_USDA_MAX_ATTEMPTS,
  DEFAULT_USDA_TIMEOUT_MS,
  type UsdaServerConfig,
} from "./config";
import { mapUsdaFoodDetail, mapUsdaSearchHit } from "./map-usda";

export type UsdaFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type UsdaFoodDataProviderOptions = {
  config: UsdaServerConfig;
  fetchImpl?: UsdaFetch;
  sleep?: (ms: number) => Promise<void>;
  onLog?: (event: Record<string, unknown>) => void;
};

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(res: Response): number | undefined {
  const header = res.headers.get("retry-after");
  if (!header) return undefined;
  const asNumber = Number(header);
  if (Number.isFinite(asNumber)) return Math.max(0, asNumber * 1000);
  return undefined;
}

export class UsdaFoodDataProvider implements FoodDataProvider {
  readonly providerId = "usda" as const;
  private readonly config: UsdaServerConfig;
  private readonly fetchImpl: UsdaFetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onLog?: (event: Record<string, unknown>) => void;

  constructor(options: UsdaFoodDataProviderOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? sleepMs;
    this.onLog = options.onLog;
  }

  async searchFoods(query: FoodSearchQuery): Promise<FoodSearchResult[]> {
    const pageSize = query.pageSize ?? 25;
    const body: Record<string, unknown> = {
      query: query.query,
      pageSize,
      pageNumber: 1,
    };
    if (query.dataTypes && query.dataTypes.length > 0) {
      body.dataType = query.dataTypes;
    }

    const json = await this.requestJson<{ foods?: unknown[] }>("POST", "/foods/search", body);
    const foods = Array.isArray(json.foods) ? json.foods : [];
    const mapped: FoodSearchResult[] = [];
    for (const food of foods) {
      const hit = mapUsdaSearchHit(food as Parameters<typeof mapUsdaSearchHit>[0]);
      if (hit) mapped.push(hit);
    }
    return mapped;
  }

  async getFood(externalFoodId: string): Promise<ExternalFoodRecord> {
    const json = await this.requestJson<Record<string, unknown>>(
      "GET",
      `/food/${encodeURIComponent(externalFoodId)}`,
    );
    const mapped = mapUsdaFoodDetail(json as Parameters<typeof mapUsdaFoodDetail>[0]);
    if (!mapped) {
      throw new FoodDataProviderException({
        code: "FOOD_PROVIDER_INVALID_RESPONSE",
        message: `USDA food ${externalFoodId} could not be mapped to canonical nutrition.`,
      });
    }
    return mapped;
  }

  private async requestJson<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const maxAttempts = this.config.maxAttempts ?? DEFAULT_USDA_MAX_ATTEMPTS;
    let lastError: FoodDataProviderException | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutMs = this.config.timeoutMs ?? DEFAULT_USDA_TIMEOUT_MS;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const url = new URL(`${this.config.baseUrl.replace(/\/$/, "")}${path}`);
      url.searchParams.set("api_key", this.config.apiKey);

      try {
        const res = await this.fetchImpl(url.toString(), {
          method,
          headers: body
            ? { "Content-Type": "application/json", Accept: "application/json" }
            : { Accept: "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (res.status === 404) {
          throw new FoodDataProviderException({
            code: "FOOD_PROVIDER_NOT_FOUND",
            message: `USDA resource not found: ${path}`,
          });
        }

        if (res.status === 429 || res.status === 503) {
          const retryAfterMs = parseRetryAfterMs(res) ?? 500 * attempt;
          lastError = new FoodDataProviderException({
            code: "FOOD_PROVIDER_RATE_LIMITED",
            message: `USDA rate-limited or unavailable (HTTP ${res.status}).`,
            retryAfterMs,
          });
          this.onLog?.({
            provider: "usda",
            event: "retry",
            attempt,
            status: res.status,
            retryAfterMs,
            path,
          });
          if (attempt < maxAttempts) {
            await this.sleep(retryAfterMs);
            continue;
          }
          throw lastError;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new FoodDataProviderException({
            code: "FOOD_PROVIDER_ERROR",
            message: `USDA request failed (HTTP ${res.status}): ${text.slice(0, 200)}`,
            details: { status: res.status, path },
          });
        }

        return (await res.json()) as T;
      } catch (error) {
        if (error instanceof FoodDataProviderException) {
          if (
            error.code === "FOOD_PROVIDER_RATE_LIMITED" &&
            attempt < maxAttempts
          ) {
            lastError = error;
            await this.sleep(error.retryAfterMs ?? 500 * attempt);
            continue;
          }
          throw error;
        }
        const aborted =
          error instanceof Error &&
          (error.name === "AbortError" || /aborted|timeout/i.test(error.message));
        if (aborted) {
          lastError = new FoodDataProviderException({
            code: "FOOD_PROVIDER_TIMEOUT",
            message: `USDA request timed out after ${timeoutMs}ms (${path}).`,
          });
          if (attempt < maxAttempts) {
            await this.sleep(250 * attempt);
            continue;
          }
          throw lastError;
        }
        throw new FoodDataProviderException({
          code: "FOOD_PROVIDER_ERROR",
          message: error instanceof Error ? error.message : "USDA request failed.",
        });
      } finally {
        clearTimeout(timer);
      }
    }

    throw (
      lastError ??
      new FoodDataProviderException({
        code: "FOOD_PROVIDER_ERROR",
        message: "USDA request failed after retries.",
      })
    );
  }
}
