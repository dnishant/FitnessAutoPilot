import type {
  RecipeDiscoveryCandidate,
  RecipeDiscoveryRequest,
  RecipeDiscoveryResult,
} from "@fitness-autopilot/contracts";
import {
  dedupeAndCapCandidates,
  isRecipeDiscoveryError,
  MAX_RECIPE_DISCOVERY_EXTERNAL_SEARCHES,
  parseRecipeDiscoveryRequest,
  planRecipeDiscoverySearches,
  RECIPE_DISCOVERY_PROVIDER_EDAMAM,
  recipeDiscoveryError,
  type RecipeDiscoveryError,
  type RecipeDiscoveryProvider,
  type RecipeDiscoverySearchPlan,
} from "@fitness-autopilot/domain";
import type { EdamamServerConfig } from "./config";
import {
  createFetchEdamamHttpClient,
  sanitizeEdamamLogText,
  type EdamamHttpClient,
} from "./http";
import { normalizeEdamamHit, parseEdamamSearchResponse } from "./normalize";

export type RecipeDiscoveryLogEvent = {
  provider: string;
  requestId: string;
  durationMs: number;
  success: boolean;
  externalRequestsMade: number;
  totalReturned?: number;
  errorCode?: string;
  errorMessage?: string;
  mealType?: string;
  highProteinPreferred?: boolean;
};

export type EdamamRecipeDiscoveryProviderOptions = {
  config: EdamamServerConfig;
  httpClient?: EdamamHttpClient;
  requestIdFactory?: () => string;
  now?: () => number;
  onLog?: (event: RecipeDiscoveryLogEvent) => void;
};

function createRequestId(): string {
  return `rd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapHttpStatusToError(status: number, bodyPreview: string): RecipeDiscoveryError {
  const sanitized = sanitizeEdamamLogText(bodyPreview);
  if (status === 401 || status === 403) {
    return recipeDiscoveryError(
      "PROVIDER_AUTH_FAILED",
      "Edamam authentication failed.",
      { status },
    );
  }
  if (status === 429) {
    return recipeDiscoveryError(
      "PROVIDER_RATE_LIMITED",
      "Edamam rate limit exceeded.",
      { status },
    );
  }
  if (status >= 500) {
    return recipeDiscoveryError(
      "PROVIDER_UNAVAILABLE",
      "Edamam service unavailable.",
      { status, bodyPreview: sanitized },
    );
  }
  return recipeDiscoveryError(
    "PROVIDER_BAD_RESPONSE",
    `Edamam returned HTTP ${status}.`,
    { status, bodyPreview: sanitized },
  );
}

export class EdamamRecipeDiscoveryProvider implements RecipeDiscoveryProvider {
  readonly provider = RECIPE_DISCOVERY_PROVIDER_EDAMAM;
  private readonly config: EdamamServerConfig;
  private readonly httpClient: EdamamHttpClient;
  private readonly requestIdFactory: () => string;
  private readonly now: () => number;
  private readonly onLog?: (event: RecipeDiscoveryLogEvent) => void;

  constructor(options: EdamamRecipeDiscoveryProviderOptions) {
    this.config = options.config;
    this.httpClient = options.httpClient ?? createFetchEdamamHttpClient();
    this.requestIdFactory = options.requestIdFactory ?? createRequestId;
    this.now = options.now ?? (() => Date.now());
    this.onLog = options.onLog;
  }

  async search(request: RecipeDiscoveryRequest): Promise<RecipeDiscoveryResult> {
    const started = this.now();
    const requestId = this.requestIdFactory();
    let externalRequestsMade = 0;

    try {
      const parsed = parseRecipeDiscoveryRequest(request);
      if (!parsed.ok) {
        throw parsed.error;
      }

      const planned = planRecipeDiscoverySearches(parsed.value);
      if (planned.searches.length > MAX_RECIPE_DISCOVERY_EXTERNAL_SEARCHES) {
        throw recipeDiscoveryError(
          "INVALID_REQUEST",
          `Search plan exceeded max external searches (${MAX_RECIPE_DISCOVERY_EXTERNAL_SEARCHES}).`,
        );
      }

      const collected: RecipeDiscoveryCandidate[] = [];
      for (const searchPlan of planned.searches) {
        const hits = await this.executeSearch(searchPlan);
        externalRequestsMade += 1;
        for (const hit of hits) {
          const candidate = normalizeEdamamHit(hit);
          if (candidate) {
            collected.push(candidate);
          }
        }
      }

      const candidates = dedupeAndCapCandidates(collected, planned.maxResults);
      if (candidates.length === 0) {
        throw recipeDiscoveryError(
          "NO_RESULTS",
          "No recipe candidates matched the discovery request.",
          {
            externalRequestsMade,
            appliedConstraints: planned.constraintReport.appliedConstraints,
            unsupportedConstraints: planned.constraintReport.unsupportedConstraints,
          },
        );
      }

      const result: RecipeDiscoveryResult = {
        candidates,
        metadata: {
          provider: this.provider,
          totalReturned: candidates.length,
          externalRequestsMade,
          durationMs: this.now() - started,
          appliedConstraints: planned.constraintReport.appliedConstraints,
          unsupportedConstraints: planned.constraintReport.unsupportedConstraints,
        },
      };

      this.onLog?.({
        provider: this.provider,
        requestId,
        durationMs: result.metadata.durationMs ?? this.now() - started,
        success: true,
        externalRequestsMade,
        totalReturned: result.metadata.totalReturned,
        mealType: parsed.value.mealType,
        highProteinPreferred: parsed.value.highProteinPreferred,
      });

      return result;
    } catch (error) {
      const mapped = isRecipeDiscoveryError(error)
        ? error
        : recipeDiscoveryError(
            "PROVIDER_UNAVAILABLE",
            sanitizeEdamamLogText(
              error instanceof Error ? error.message : "Recipe discovery failed.",
            ),
          );

      this.onLog?.({
        provider: this.provider,
        requestId,
        durationMs: this.now() - started,
        success: false,
        externalRequestsMade,
        errorCode: mapped.code,
        errorMessage: sanitizeEdamamLogText(mapped.message),
        mealType: request.mealType,
        highProteinPreferred: request.highProteinPreferred,
      });

      throw mapped;
    }
  }

  private async executeSearch(plan: RecipeDiscoverySearchPlan) {
    const url = this.buildSearchUrl(plan);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.httpClient.request({
        url,
        method: "GET",
        headers: {
          Accept: "application/json",
          "Edamam-Account-User": "fitness-autopilot",
        },
        signal: controller.signal,
      });

      if (response.status < 200 || response.status >= 300) {
        throw mapHttpStatusToError(response.status, response.bodyText.slice(0, 300));
      }

      const parsed = parseEdamamSearchResponse(response.bodyText);
      if (!parsed.ok) {
        throw parsed.error;
      }
      return parsed.hits;
    } catch (error) {
      if (isRecipeDiscoveryError(error)) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw recipeDiscoveryError(
          "PROVIDER_UNAVAILABLE",
          "Edamam request timed out.",
        );
      }
      throw recipeDiscoveryError(
        "PROVIDER_UNAVAILABLE",
        sanitizeEdamamLogText(
          error instanceof Error ? error.message : "Edamam network request failed.",
        ),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildSearchUrl(plan: RecipeDiscoverySearchPlan): string {
    const url = new URL(this.config.baseUrl);
    url.searchParams.set("type", "public");
    url.searchParams.set("app_id", this.config.appId);
    url.searchParams.set("app_key", this.config.appKey);
    // Request a page large enough for maxResults; Edamam caps page size ~100.
    const to = Math.min(Math.max(plan.maxResults, 1), 100);
    url.searchParams.set("from", "0");
    url.searchParams.set("to", String(to));

    if (plan.query) {
      url.searchParams.set("q", plan.query);
    }

    for (const cuisine of plan.cuisineTypes) {
      url.searchParams.append("cuisineType", cuisine);
    }
    for (const mealType of plan.mealTypes) {
      url.searchParams.append("mealType", mealType);
    }
    for (const diet of plan.dietLabels) {
      url.searchParams.append("diet", diet);
    }
    for (const health of plan.healthLabels) {
      url.searchParams.append("health", health);
    }

    // Prefer fields we normalize; avoids pulling unused blobs.
    for (const field of [
      "uri",
      "label",
      "image",
      "source",
      "url",
      "yield",
      "dietLabels",
      "healthLabels",
      "cuisineType",
      "mealType",
      "dishType",
      "ingredientLines",
      "calories",
      "totalNutrients",
    ]) {
      url.searchParams.append("field", field);
    }

    return url.toString();
  }
}
