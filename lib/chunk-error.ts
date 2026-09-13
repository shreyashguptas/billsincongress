/**
 * Recognising and recovering from the stale-asset chunk failure.
 *
 * This site ships content-hashed JavaScript chunks and deploys often. A tab
 * opened before a deploy still runs the old bundle, so a later client-side
 * navigation asks for a chunk the new deploy no longer serves and the dynamic
 * import throws. The reader is left on a dead page with no way forward.
 *
 * The recognition is kept pure and separate from the React error boundaries
 * that use it (`app/error.tsx`, `app/global-error.tsx`), so it can be tested
 * without rendering — see `lib/chunk-error.test.ts`.
 */
import { safeSessionStorage } from '@/lib/safe-storage';

/** How different engines phrase a failed chunk / dynamic-import load. */
const CHUNK_ERROR_MESSAGE_PATTERNS = [
  /Loading chunk [^\s]+ failed/i,
  /Failed to load chunk/i,
  /Loading CSS chunk/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
];

/**
 * Whether an error is a stale-asset chunk failure. Next.js names it
 * `ChunkLoadError`, but not every engine sets `name`, so the message is checked
 * too — different browsers phrase the same failure in different ways.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === 'ChunkLoadError') return true;
  if (typeof message !== 'string') return false;
  return CHUNK_ERROR_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

/** sessionStorage key holding the timestamp of the last chunk-triggered reload. */
const RELOAD_AT_KEY = 'chunk-reload-at';

/**
 * Reload to pick up fresh assets, but never within this window of the last
 * reload. Inside the window we assume the reload did not help (a genuinely
 * broken deploy) and leave the reader on the retry control instead of looping.
 */
const RELOAD_WINDOW_MS = 10_000;

/**
 * Do one guarded full reload to recover from a chunk failure. Reloads only when
 * one has not happened within the window; otherwise it does nothing and the
 * boundary's visible retry control carries the reader from there.
 */
export function reloadForChunkError(now: number = Date.now()): void {
  const last = Number(safeSessionStorage.getItem(RELOAD_AT_KEY)) || 0;
  if (now - last < RELOAD_WINDOW_MS) return;
  safeSessionStorage.setItem(RELOAD_AT_KEY, String(now));
  // Read the guard back before acting on it. `safeSessionStorage` swallows a
  // blocked write by design, which is right for the persistence it was built
  // for — losing a saved filter costs nothing. Here the write IS the guard, so
  // a silent no-op is not a degraded reload, it is an unbounded one: the stamp
  // reads 0 forever, every chunk error clears the window, and a deploy the
  // reload cannot fix refreshes the tab until the reader closes it. Safari with
  // "Block all cookies" is exactly the population lib/safe-storage.ts exists
  // for, so this is not hypothetical. When the stamp did not stick, do nothing
  // and let the boundary's retry control carry the reader instead.
  if (Number(safeSessionStorage.getItem(RELOAD_AT_KEY)) !== now) return;
  if (typeof window !== 'undefined') window.location.reload();
}
