/**
 * Validate a `?redirect=` param so a phisher can't bounce a freshly-signed-in
 * user out to an attacker domain. Rules:
 *   - Must start with a single "/" (same-origin path)
 *   - "//foo" is rejected — that's a protocol-relative URL the browser would
 *     resolve as cross-origin
 *   - Anything else falls back to the safe default
 *
 * The OAuth path is already guarded server-side by `convex/auth.ts`'s
 * redirect callback (allowlists billsincongress.com + localhost). This
 * helper covers the password and email-verification flows, which finish
 * client-side via `router.push()`.
 */
const SAFE_REDIRECT_BASE = "https://billsincongress.com";

function decodeRedirect(value: string): string | null {
  let current = value;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      return null;
    }
  }
  return current;
}

export function safeRedirect(
  target: string | null | undefined,
  fallback = "/account",
): string {
  if (!target) return fallback;

  const value = target.trim();
  if (value !== target) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;

  const decoded = decodeRedirect(value);
  if (!decoded) return fallback;
  if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) {
    return fallback;
  }

  try {
    const resolved = new URL(value, SAFE_REDIRECT_BASE);
    if (resolved.origin !== SAFE_REDIRECT_BASE) return fallback;
  } catch {
    return fallback;
  }

  return value;
}
