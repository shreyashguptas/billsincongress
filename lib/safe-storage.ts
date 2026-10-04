/**
 * Browser storage that can never crash the page.
 *
 * Reaching for `window.localStorage` / `window.sessionStorage` can THROW rather
 * than return null. The common case in the wild is Safari with "Block all
 * cookies" (or a locked-down iOS profile): touching the property itself raises
 *   DOMException: SecurityError: The operation is insecure.
 * before any getItem/setItem call runs. Writes can additionally throw
 * QuotaExceededError when storage is full or in some private-browsing modes.
 *
 * Unguarded, that exception escapes during render and takes the whole page
 * down for that visitor — which is exactly what PostHog error tracking caught
 * on the homepage for Safari and Mobile Safari users.
 *
 * Every storage read/write in the app goes through these helpers. A visitor
 * with storage disabled loses persistence (saved bill filters, one-shot
 * flags) but still gets a working site.
 */

type StorageKind = 'localStorage' | 'sessionStorage';

/**
 * Resolve the underlying Storage, or null when it is unavailable — during SSR,
 * or when the browser refuses access. Callers never see the exception.
 */
function getStore(kind: StorageKind): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function createSafeStorage(kind: StorageKind) {
  return {
    /** Returns null when storage is unavailable or the key is unset. */
    getItem(key: string): string | null {
      const store = getStore(kind);
      if (!store) return null;
      try {
        return store.getItem(key);
      } catch {
        return null;
      }
    },

    /** Best-effort write. Silently does nothing when storage is unavailable. */
    setItem(key: string, value: string): void {
      const store = getStore(kind);
      if (!store) return;
      try {
        store.setItem(key, value);
      } catch {
        // Storage disabled or quota exceeded. Persistence is a convenience —
        // never worth breaking the page over.
      }
    },

    /** Best-effort delete. Silently does nothing when storage is unavailable. */
    removeItem(key: string): void {
      const store = getStore(kind);
      if (!store) return;
      try {
        store.removeItem(key);
      } catch {
        // Same reasoning as setItem.
      }
    },
  };
}

export const safeLocalStorage = createSafeStorage('localStorage');
export const safeSessionStorage = createSafeStorage('sessionStorage');

/** A Storage that lives only in this page's memory. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  };
}

/**
 * Gives libraries that read `window.localStorage` / `window.sessionStorage`
 * directly something to read when the browser refuses it. Convex Auth's
 * Next.js provider reads localStorage during render, above every component of
 * ours, so with storage blocked (seen on Android, 22 Sep 2026) the read threw
 * "SecurityError: Failed to read the 'localStorage' property" and every page
 * showed the error screen. A memory store keeps the page up; the cost is that a
 * sign-in on such a browser lasts only as long as the tab, which is all the
 * browser allows anyway.
 *
 * It must run before React hydrates, which is why `instrumentation-client.ts`
 * calls it first. Does nothing when storage works or during SSR, and returns
 * the stores it had to replace.
 */
export function shimBlockedStorage(): StorageKind[] {
  return (['localStorage', 'sessionStorage'] as const).filter(shimIfBlocked);
}

function shimIfBlocked(kind: StorageKind): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Reading the property is what throws; a working store needs no shim.
    void window[kind];
    return false;
  } catch {
    try {
      Object.defineProperty(window, kind, {
        value: memoryStorage(),
        configurable: true,
      });
      return true;
    } catch {
      return false;
    }
  }
}
