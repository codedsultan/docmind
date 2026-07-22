const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_DELAY_MS = 1000;

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  /** HTTP status codes that trigger a retry (default: 429 and >= 500) */
  retryableStatuses?: (status: number) => boolean;
}

/** Returns true for 429 and 5xx responses — the default retry predicate. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a function that returns a Response with exponential-backoff retry.
 *
 * - Network errors (fetch throws): retried, then re-thrown after all attempts.
 * - Retryable HTTP statuses (429, 5xx by default): retried, then the final
 *   response is returned so the caller can emit its own error message.
 * - Non-retryable HTTP errors: returned immediately (no retry consumed).
 *
 * @param fn - Factory that produces a fetch call; called once per attempt.
 * @param onRetry - Optional callback invoked before each retry (for logging).
 */
export async function withRetry(
  fn: () => Promise<Response>,
  opts: RetryOptions = {},
  onRetry?: (attempt: number, status: number | null, error: unknown) => void,
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_DELAY_MS;
  const shouldRetry = opts.retryableStatuses ?? isRetryableStatus;

  let lastNetworkError: unknown = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let response: Response;

    try {
      response = await fn();
    } catch (err) {
      lastNetworkError = err;
      lastResponse = null;
      if (attempt < maxRetries - 1) {
        onRetry?.(attempt, null, err);
        await delay(baseDelayMs * Math.pow(2, attempt));
      }
      continue;
    }

    lastNetworkError = null;

    if (shouldRetry(response.status)) {
      lastResponse = response;
      if (attempt < maxRetries - 1) {
        onRetry?.(
          attempt,
          response.status,
          new Error(`HTTP ${response.status}`),
        );
        await delay(baseDelayMs * Math.pow(2, attempt));
      }
      continue;
    }

    // Non-retryable response (success or non-retryable error) — return as-is
    return response;
  }

  // After exhausting retries: network errors throw, HTTP errors return the last response
  if (lastNetworkError !== null) {
    if (lastNetworkError instanceof Error) {
      throw lastNetworkError;
    }
    throw new Error(`Unexpected error: ${JSON.stringify(lastNetworkError)}`);
  }

  return lastResponse!;
}
