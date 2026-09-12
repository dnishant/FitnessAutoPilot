/**
 * Narrow HTTP client for Edamam Recipe Search so tests can mock without live calls.
 */

export type EdamamHttpRequest = {
  url: string;
  method?: "GET";
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type EdamamHttpResponse = {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
};

export interface EdamamHttpClient {
  request(params: EdamamHttpRequest): Promise<EdamamHttpResponse>;
}

export function createFetchEdamamHttpClient(
  fetchImpl: typeof fetch = fetch,
): EdamamHttpClient {
  return {
    async request(params) {
      const response = await fetchImpl(params.url, {
        method: params.method ?? "GET",
        headers: params.headers,
        signal: params.signal,
      });
      const headerEntries: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headerEntries[key.toLowerCase()] = value;
      });
      return {
        status: response.status,
        headers: headerEntries,
        bodyText: await response.text(),
      };
    },
  };
}

/** Redact Edamam credentials from URLs and messages before logging. */
export function sanitizeEdamamLogText(text: string): string {
  return text
    .replace(/([?&]app_id=)[^&]*/gi, "$1[redacted]")
    .replace(/([?&]app_key=)[^&]*/gi, "$1[redacted]")
    .replace(/app_id[=:]\s*["']?[A-Za-z0-9_-]+/gi, "app_id=[redacted]")
    .replace(/app_key[=:]\s*["']?[A-Za-z0-9_-]+/gi, "app_key=[redacted]")
    .slice(0, 500);
}
