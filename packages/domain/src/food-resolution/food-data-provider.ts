import type {
  ExternalFoodRecord,
  FoodSearchQuery,
  FoodSearchResult,
} from "@fitness-autopilot/contracts";

/**
 * Provider-independent food data port.
 * USDA is an implementation, not the domain model.
 */

export type FoodDataProviderErrorCode =
  | "FOOD_PROVIDER_CONFIGURATION_ERROR"
  | "FOOD_PROVIDER_ERROR"
  | "FOOD_PROVIDER_NOT_FOUND"
  | "FOOD_PROVIDER_RATE_LIMITED"
  | "FOOD_PROVIDER_TIMEOUT"
  | "FOOD_PROVIDER_INVALID_RESPONSE";

export type FoodDataProviderError = {
  code: FoodDataProviderErrorCode;
  message: string;
  details?: unknown;
  retryAfterMs?: number;
};

export class FoodDataProviderException extends Error {
  readonly code: FoodDataProviderErrorCode;
  readonly details?: unknown;
  readonly retryAfterMs?: number;

  constructor(error: FoodDataProviderError) {
    super(error.message);
    this.name = "FoodDataProviderException";
    this.code = error.code;
    this.details = error.details;
    this.retryAfterMs = error.retryAfterMs;
  }

  toError(): FoodDataProviderError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryAfterMs: this.retryAfterMs,
    };
  }
}

export interface FoodDataProvider {
  readonly providerId: "usda" | string;
  searchFoods(query: FoodSearchQuery): Promise<FoodSearchResult[]>;
  getFood(externalFoodId: string): Promise<ExternalFoodRecord>;
}
