import { RateLimiter, HOUR, DAY, MINUTE } from "@convex-dev/rate-limiter";
import { getAuthUserId } from "@convex-dev/auth/server";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const ANONYMOUS_CHAT_DAILY_LIMIT = 5;
const AUTHED_CHAT_DAILY_LIMIT = 100;

// ─── Public API limits ─────────────────────────────────────────────────────
// Limits are looked up by `(plan, scope)` so that future paid tiers can
// raise them with a one-line change. For v1 free === pro on purpose: we
// want to ship the API, observe real usage, then design tiers from data
// instead of from the armchair.
//
// Token bucket on the hourly limit so a legitimate burst (one-off backfill,
// 800 requests in 5 minutes) is fine; sustained abuse still trips the daily
// fixed window.
export const API_TOKEN_HOURLY_LIMIT = 1000;
export const API_TOKEN_DAILY_LIMIT = 10000;
// Per-IP edge limit, applied BEFORE the token check so an attacker burning
// through invalid tokens can't pummel Convex.
export const API_IP_PER_MINUTE_LIMIT = 100;
// Re-auth OTP issuance cap (per user) before they can mint a token. Tighter
// than the email-bombing cap because this is a higher-value flow.
export const API_REAUTH_OTP_PER_HOUR = 5;

// ─── Limit definitions ─────────────────────────────────────────────────────
// `start: 5 * HOUR` aligns the 24h fixed window to Unix-epoch + 5h, which is
// midnight US Eastern (EST). During EDT (mid-March → early November) the
// reset will land 1h later (1 AM ET) — the UI surfaces the actual reset time
// so users always see something accurate. See plan file for the DST trade-off.
//
// `kind: "fixed window"` grants all tokens at once at the start of each
// window; no token-bucket carry-over.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Anonymous visitors — keyed by an HTTP-only browser session cookie minted by
  // the Next.js route handler. This keeps casual use available without exposing
  // unlimited AI spend to every page view.
  chatAnonPerDay: {
    kind: "fixed window",
    rate: ANONYMOUS_CHAT_DAILY_LIMIT,
    period: DAY,
    start: 5 * HOUR,
  },
  // Logged-in users — keyed by userId. Email-verification status is
  // intentionally NOT a factor; that gate is reserved for the Pro upgrade
  // (PR 3+).
  chatAuthedPerDay: {
    kind: "fixed window",
    rate: AUTHED_CHAT_DAILY_LIMIT,
    period: DAY,
    start: 5 * HOUR,
  },
  // OTP issuance, keyed by email address. Caps the email-bombing surface
  // (an attacker can't trigger dozens of OTP emails to a victim's inbox)
  // and meaningfully slows OTP brute force (5 codes/hr × 1-in-1M space).
  // Applied to BOTH the verify-email signup flow and the password-reset
  // flow — same provider mechanic, same threat model. Send-side only;
  // verify-side throttling is owned by the @convex-dev/auth library.
  otpRequestPerEmail: {
    kind: "fixed window",
    rate: 5,
    period: HOUR,
  },
  // Public API — per-token hourly bucket. Token-bucket so bursts are fine
  // and tokens refill continuously instead of cliff-resetting.
  apiTokenPerHour: {
    kind: "token bucket",
    rate: API_TOKEN_HOURLY_LIMIT,
    period: HOUR,
    capacity: API_TOKEN_HOURLY_LIMIT,
  },
  // Public API — per-token daily fixed window. Aligned to 5 AM UTC = midnight
  // EST so the reset is predictable for our primary US audience.
  apiTokenPerDay: {
    kind: "fixed window",
    rate: API_TOKEN_DAILY_LIMIT,
    period: DAY,
    start: 5 * HOUR,
  },
  // Public API — per-IP edge limit. Cheap reject path for attackers spraying
  // invalid tokens; honest single-machine callers will never hit this.
  apiIpPerMinute: {
    kind: "fixed window",
    rate: API_IP_PER_MINUTE_LIMIT,
    period: MINUTE,
  },
  // Token-mint re-auth OTPs, keyed by userId. 5/hr is plenty for a user
  // legitimately generating tokens; tight enough to slow OTP brute force.
  apiTokenReauthOtpPerUser: {
    kind: "fixed window",
    rate: API_REAUTH_OTP_PER_HOUR,
    period: HOUR,
  },
});

// ─── Public query: current chat quota status ───────────────────────────────
// The chat UI calls this only AFTER hitting RATE_LIMITED (to render the
// dialog with up-to-the-second reset time) and on initial load (so a
// disabled state survives a refresh). It never consumes a token.
//
// We don't expose a remaining-count number here on purpose — the chosen UX
// only shows anything when the user is already blocked, so we just need
// (a) "are you blocked?" and (b) "when does it reset?".
export const getChatUsage = query({
  args: {
    anonymousSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId !== null) {
      const [status, quota] = await Promise.all([
        rateLimiter.check(ctx, "chatAuthedPerDay", { key: userId }),
        rateLimiter.getValue(ctx, "chatAuthedPerDay", { key: userId }),
      ]);
      const blocked = !status.ok;

      return {
        kind: "authed" as const,
        max: AUTHED_CHAT_DAILY_LIMIT,
        blocked,
        resetAt: null,
        retryAfterMs: blocked ? (status.retryAfter ?? 0) : null,
        requiresAuth: false,
        quota,
      };
    }

    if (!args.anonymousSessionId) {
      return {
        kind: "anonymous" as const,
        max: ANONYMOUS_CHAT_DAILY_LIMIT,
        blocked: false,
        resetAt: null,
        retryAfterMs: null,
        requiresAuth: false,
        remaining: ANONYMOUS_CHAT_DAILY_LIMIT,
        used: 0,
      };
    }

    const [status, quota] = await Promise.all([
      rateLimiter.check(ctx, "chatAnonPerDay", { key: args.anonymousSessionId }),
      rateLimiter.getValue(ctx, "chatAnonPerDay", { key: args.anonymousSessionId }),
    ]);
    const blocked = !status.ok;

    return {
      kind: "anonymous" as const,
      max: ANONYMOUS_CHAT_DAILY_LIMIT,
      blocked,
      resetAt: null,
      retryAfterMs: blocked ? (status.retryAfter ?? 0) : null,
      requiresAuth: false,
      quota,
    };
  },
});

// ─── Public API rate-limit consumers ───────────────────────────────────────
// These are mutations (not queries) because consuming a token is a write.
// Called by the Next.js /api/v1/* route handlers via ConvexHttpClient.
//
// They are deliberately public so the unauthenticated route handler can
// reach them — but they're harmless to call: the worst an attacker can do
// is burn down their own IP bucket. The token-id mutations require an
// id<"apiTokens">, which can't be forged.

export const consumeApiIp = mutation({
  args: { ip: v.string() },
  handler: async (ctx, args) => {
    // An attacker can forge x-forwarded-for. Truncating to 64 chars
    // before keying means oversize values can't slip past the gate by
    // failing length validation; it also bounds the bucket-key
    // cardinality so memory usage stays predictable.
    const key = (args.ip ?? "").slice(0, 64);
    if (!key) {
      // No IP at all (no x-forwarded-for, no x-real-ip) — degrade
      // gracefully. The per-token bucket below still protects any path
      // that requires authentication; the unauth'd OPTIONS / openapi
      // routes don't need this gate.
      return { ok: true, remaining: API_IP_PER_MINUTE_LIMIT };
    }
    const result = await rateLimiter.limit(ctx, "apiIpPerMinute", {
      key,
    });
    return {
      ok: result.ok,
      remaining: 0, // not exposed by limit(); UI doesn't need it
      retryAfterMs: result.ok ? undefined : result.retryAfter,
    };
  },
});

export const consumeApiTokenHourly = mutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, args) => {
    const result = await rateLimiter.limit(ctx, "apiTokenPerHour", {
      key: args.tokenId,
    });
    const value = await rateLimiter.getValue(ctx, "apiTokenPerHour", {
      key: args.tokenId,
    });
    return {
      ok: result.ok,
      remaining: Math.max(0, Math.floor(value.value)),
      retryAfterMs: result.ok ? undefined : result.retryAfter,
    };
  },
});

export const consumeApiTokenDaily = mutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, args) => {
    const result = await rateLimiter.limit(ctx, "apiTokenPerDay", {
      key: args.tokenId,
    });
    const value = await rateLimiter.getValue(ctx, "apiTokenPerDay", {
      key: args.tokenId,
    });
    return {
      ok: result.ok,
      remaining: Math.max(0, Math.floor(value.value)),
      retryAfterMs: result.ok ? undefined : result.retryAfter,
    };
  },
});
