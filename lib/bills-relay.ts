/**
 * The public bills reads the browser may make through this site's own origin
 * instead of calling Convex directly.
 *
 * Some networks block `*.convex.cloud` while letting billsincongress.com
 * through — from 11 to 25 Sep 2026, 35 recorded sessions (almost all Edge on
 * Windows, on weekdays) had every browser-side Convex request fail with
 * "TypeError: Failed to fetch". The server-rendered first page worked, so the
 * list looked fine until the reader touched a filter, and then every change
 * said "No bills found".
 *
 * `/api/bills/query` runs these on the server, which can always reach Convex.
 * It is an allowlist of read-only queries that are already public at the
 * Convex URL, so the relay exposes nothing new. Pure and dependency-free so the
 * request check can be tested without a server.
 */

export const RELAYED_BILLS_QUERIES = ['list', 'listCount', 'listAllSponsors', 'getSyncStatus'] as const;

export type RelayedBillsQuery = (typeof RELAYED_BILLS_QUERIES)[number];

export const BILLS_RELAY_PATH = '/api/bills/query';

/** A request body the relay will run, or null for anything else. */
export function parseRelayRequest(
  body: unknown,
): { name: RelayedBillsQuery; args: Record<string, unknown> } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { name, args } = body as { name?: unknown; args?: unknown };
  if (typeof name !== 'string') return null;
  if (!(RELAYED_BILLS_QUERIES as readonly string[]).includes(name)) return null;
  if (args === undefined) return { name: name as RelayedBillsQuery, args: {} };
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  return { name: name as RelayedBillsQuery, args: args as Record<string, unknown> };
}

/**
 * Whether a failed direct Convex call means "the browser could not reach
 * Convex" rather than "Convex answered with an error".
 *
 * `fetch` rejects with a TypeError on a network failure in every browser
 * ("Failed to fetch", "NetworkError when attempting to fetch resource.",
 * "Load failed"). Convex's own failures — a thrown function, a bad argument, an
 * HTTP error status — arrive as plain `Error`s, and relaying those would only
 * fail the same way a second time.
 */
export function isUnreachable(error: unknown): boolean {
  return error instanceof TypeError;
}
