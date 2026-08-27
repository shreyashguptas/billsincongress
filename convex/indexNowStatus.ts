/**
 * What to do about an IndexNow response, rather than only what it said.
 *
 * Pure and dependency-free so it can be tested without a deployment — the same
 * split as `convex/chamber.ts` and `convex/billStage.ts`.
 *
 * The distinction that matters operationally is between "these URLs are done"
 * and "put them back". A batch retried after a 200 is wasted work; a batch
 * dropped after a 429 is lost silently.
 */

export type IndexNowOutcome =
  | { kind: "accepted"; status: number }
  | { kind: "retry"; status: number; reason: string }
  | { kind: "stop"; status: number; reason: string }
  | { kind: "drop"; status: number; reason: string };

/**
 * Statuses the protocol documents:
 *   200 accepted · 202 accepted, key not yet validated · 400 bad format
 *   403 key invalid · 422 URLs outside this host/key's scope · 429 spam
 */
export function interpretIndexNowStatus(status: number): IndexNowOutcome {
  // 202 means the key file has not been fetched yet, which is normal on the
  // first submission after publishing it. Retrying would double-submit.
  if (status === 200 || status === 202) return { kind: "accepted", status };

  // Treated as spam. The correct response is to stop, not to retry harder — a
  // domain that has never used IndexNow announcing tens of thousands of URLs
  // is the exact pattern the spec warns about.
  if (status === 429) {
    return { kind: "stop", status, reason: "rate limited — back off, do not retry" };
  }

  // The key file is missing, unreachable, or does not contain the key. Every
  // subsequent request fails identically, so continuing to drain the queue
  // against a broken key would discard real work while appearing to progress.
  if (status === 403) {
    return { kind: "stop", status, reason: "key rejected — check the key file is served" };
  }

  // Our bug: a URL did not match the host or the key's scope. Retrying cannot
  // help, and leaving them queued blocks everything behind them forever.
  if (status === 422) {
    return { kind: "drop", status, reason: "URLs rejected for this host/key — fix the URLs" };
  }

  // Malformed body — also our bug, also not retryable.
  if (status === 400) {
    return { kind: "drop", status, reason: "malformed request body" };
  }

  // Anything else, including 5xx and the 0 used for a network failure, is
  // assumed transient.
  return { kind: "retry", status, reason: "unexpected status — will retry" };
}
