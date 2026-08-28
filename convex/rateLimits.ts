import { RateLimiter, HOUR, DAY } from "@convex-dev/rate-limiter";
import { getAuthUserId } from "@convex-dev/auth/server";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import { v } from "convex/values";

const ANONYMOUS_CHAT_DAILY_LIMIT = 5;
const AUTHED_CHAT_DAILY_LIMIT = 100;

// `start: 5 * HOUR` aligns the 24h fixed window to Unix-epoch + 5h = midnight
// US Eastern (EST); during EDT the reset lands at 1 AM ET, and the UI shows the
// actual reset time either way. `kind: "fixed window"` grants all tokens at the
// start of each window — no token-bucket carry-over.
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
  // intentionally NOT a factor here.
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
});

// Read-only chat quota status — never consumes a token. The UI calls it after
// a RATE_LIMITED response (to show the reset time) and on initial load, so a
// blocked state survives a refresh.
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
