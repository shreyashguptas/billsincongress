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
export function safeRedirect(target: string | null | undefined, fallback = "/account"): string {
  if (!target) return fallback;
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  return target;
}
