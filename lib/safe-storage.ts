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
