/**
 * Which OpenRouter failures are worth one more try.
 *
 * Every "Failed to get a response." readers got in early October was upstream
 * and momentary: two provider timeouts (504, sent as an error inside a 200),
 * one "temporarily rate-limited upstream. Please retry shortly" (429) and one
 * network error before the request left (a fetch TypeError). Each ended the
 * reader's answer on the first attempt. A refusal of the request itself (400,
 * 401, 402, 403) is not momentary, and asking again only costs time.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */

/** HTTP statuses that say "try again shortly", not "this request is wrong". */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/** The wait before the one retry when the upstream names none. */
export const DEFAULT_RETRY_DELAY_MS = 500;
/** The longest wait honoured from a Retry-After; a reader is watching. */
export const MAX_RETRY_DELAY_MS = 2000;

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/**
 * The `error` OpenRouter puts in a 200 body when no provider could serve:
 * `{"message":"Provider timed out after 17011ms","code":504}`.
 */
export function isRetryablePayload(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const code = Number((error as { code?: unknown }).code);
  return Number.isInteger(code) && isRetryableStatus(code);
}

/**
 * A request that never got an HTTP answer. fetch rejects with a TypeError for
 * that ("error sending request for url ..."); anything else thrown is ours.
 */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

/** How long to wait before the retry, from a Retry-After header in seconds. */
export function retryDelayMs(retryAfter: string | null | undefined): number {
  const seconds = Number(retryAfter);
  if (retryAfter == null || retryAfter.trim() === "" || !Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_RETRY_DELAY_MS;
  }
  return Math.min(Math.round(seconds * 1000), MAX_RETRY_DELAY_MS);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
