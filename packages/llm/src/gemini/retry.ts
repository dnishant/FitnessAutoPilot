/**
 * Shared Gemini provider reliability helpers for PLAN-008+.
 * Bounded retries with Retry-After support, exponential backoff + jitter,
 * and typed RATE_LIMITED classification.
 */

export type RateLimitInfo = {
  isRateLimited: boolean;
  retryAfterMs?: number;
};

const RATE_LIMIT_RE =
  /\b(429|rate[\s_-]?limit|quota|resource[_ ]?exhausted|too many requests)\b/i;
const TRANSIENT_RE =
  /\b(503|UNAVAILABLE|high demand|temporarily unavailable|try again later)\b/i;

export function classifyGeminiProviderError(error: unknown): RateLimitInfo {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : NaN;
  const isRateLimited =
    status === 429 ||
    status === 503 ||
    RATE_LIMIT_RE.test(message) ||
    TRANSIENT_RE.test(message);
  if (!isRateLimited) {
    return { isRateLimited: false };
  }
  const retryAfterMs = parseRetryAfterMs(error, message);
  return { isRateLimited: true, retryAfterMs };
}

export function parseRetryAfterMs(error: unknown, message = ""): number | undefined {
  if (error && typeof error === "object") {
    const rec = error as Record<string, unknown>;
    if (typeof rec.retryAfterMs === "number" && Number.isFinite(rec.retryAfterMs)) {
      return Math.max(0, rec.retryAfterMs);
    }
    if (typeof rec.retryAfter === "number" && Number.isFinite(rec.retryAfter)) {
      return Math.max(0, rec.retryAfter * 1000);
    }
    if (typeof rec.retryAfter === "string") {
      const asNumber = Number(rec.retryAfter);
      if (Number.isFinite(asNumber)) {
        return Math.max(0, asNumber * 1000);
      }
    }
  }
  const headerMatch = message.match(/retry-after[=:\s]+(\d+)/i);
  if (headerMatch?.[1]) {
    return Math.max(0, Number(headerMatch[1]) * 1000);
  }
  return undefined;
}

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
};

export function computeBackoffDelayMs(input: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryAfterMs?: number;
  random?: () => number;
}): number {
  if (typeof input.retryAfterMs === "number" && input.retryAfterMs > 0) {
    return Math.min(input.maxDelayMs, input.retryAfterMs);
  }
  const exp = Math.min(input.maxDelayMs, input.baseDelayMs * 2 ** Math.max(0, input.attempt - 1));
  const jitter = (input.random ?? Math.random)() * Math.min(250, exp * 0.2);
  return Math.min(input.maxDelayMs, Math.floor(exp + jitter));
}

export async function withGeminiRetries<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 4);
  const baseDelayMs = options.baseDelayMs ?? 800;
  const maxDelayMs = options.maxDelayMs ?? 12_000;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const shouldRetry =
    options.shouldRetry ??
    ((error: unknown) => classifyGeminiProviderError(error).isRateLimited);

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const { retryAfterMs } = classifyGeminiProviderError(error);
      const delayMs = computeBackoffDelayMs({
        attempt,
        baseDelayMs,
        maxDelayMs,
        retryAfterMs,
        random: options.random,
      });
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
  throw lastError;
}
