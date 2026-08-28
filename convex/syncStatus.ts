/**
 * Pure, dependency-free sync-status helpers. NO Convex imports, so this module
 * is unit-testable under plain `tsx` (see syncStatus.test.ts) and safe to share
 * between Convex functions (sync.ts, congressApi.ts).
 */

// Bitmask constants for endpoint tracking
export const SYNC_DETAIL = 1; // bit 0
export const SYNC_ACTIONS = 2; // bit 1
export const SYNC_SUBJECTS = 4; // bit 2
export const SYNC_SUMMARIES = 8; // bit 3
export const SYNC_TEXT = 16; // bit 4
export const SYNC_COMPLETE = 31; // all endpoint bits set

// Enrichment bitmask (bills.extraSyncedBits) — kept SEPARATE from the endpoint
// bitmask above so the repair / SYNC_COMPLETE flow is untouched.
export const EXTRA_LEGISLATIVE_SUBJECTS = 1; // bit 0: all legislativeSubjects stored
export const EXTRA_TEXT_VERSIONS = 2; // bit 1: all text versions stored
export const EXTRA_COMPLETE = 3; // all enrichment bits set

const ENDPOINT_NAMES: Record<number, string> = {
  [SYNC_DETAIL]: "detail",
  [SYNC_ACTIONS]: "actions",
  [SYNC_SUBJECTS]: "subjects",
  [SYNC_SUMMARIES]: "summaries",
  [SYNC_TEXT]: "text",
};

export function getMissingEndpoints(mask: number): string[] {
  const missing: string[] = [];
  for (const [bit, name] of Object.entries(ENDPOINT_NAMES)) {
    if ((mask & Number(bit)) === 0) missing.push(name);
  }
  return missing;
}

export type SyncState = "complete" | "partial" | "legacy";

/**
 * Classify a bill's sync status from its stored bitmask:
 *   - undefined → "legacy"   (no syncedEndpoints field: pre-field bill, or a
 *                             freshly inserted bill not yet sub-synced)
 *   - >= 31     → "complete"
 *   - 0..30     → "partial"
 *
 * Mirrors the index range used to FIND incomplete bills: because Convex orders
 * `undefined` before all numbers, `.lt("syncedEndpoints", SYNC_COMPLETE)`
 * returns exactly the rows this classifies as NOT "complete".
 */
export function classifySyncState(
  syncedEndpoints: number | undefined,
): SyncState {
  if (syncedEndpoints === undefined) return "legacy";
  if (syncedEndpoints >= SYNC_COMPLETE) return "complete";
  return "partial";
}

/** True when a bill still needs repair (legacy or partial). */
export function isIncompleteMask(syncedEndpoints: number | undefined): boolean {
  return classifySyncState(syncedEndpoints) !== "complete";
}
