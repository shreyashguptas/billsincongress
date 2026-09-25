import { RateLimiter, HOUR, DAY } from "@convex-dev/rate-limiter";
import { getAuthUserId } from "@convex-dev/auth/server";
import { components, internal } from "./_generated/api";
import { query, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  ANONYMOUS_CHAT_DAILY_LIMIT,
  AUTHED_CHAT_DAILY_LIMIT,
  PRO_CHAT_DAILY_LIMIT,
  isPro,
} from "./plan";

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
  // Pro subscribers — keyed by userId, same window as above. A SEPARATE bucket
  // rather than a bigger rate on chatAuthedPerDay: a rate is fixed per limit
  // name, and a reader who upgrades mid-day starts on a fresh Pro allowance
  // instead of inheriting the free bucket's count.
  chatProPerDay: {
    kind: "fixed window",
    rate: PRO_CHAT_DAILY_LIMIT,
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
  // Opening Stripe Checkout or the billing portal, per signed-in reader. Each
  // call makes several Stripe API requests; a reader needs a handful an hour at
  // most, and this stops a script from spending the account's Stripe rate
  // limit (shared with the webhook re-reads) through one account.
  billingActionPerUser: {
    kind: "fixed window",
    rate: 20,
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
      const user = await ctx.db.get(userId);
      const pro = isPro(user);
      const name = pro ? "chatProPerDay" : "chatAuthedPerDay";
      const [status, quota] = await Promise.all([
        rateLimiter.check(ctx, name, { key: userId }),
        rateLimiter.getValue(ctx, name, { key: userId }),
      ]);
      const blocked = !status.ok;

      return {
        kind: "authed" as const,
        plan: pro ? ("pro" as const) : ("free" as const),
        max: pro ? PRO_CHAT_DAILY_LIMIT : AUTHED_CHAT_DAILY_LIMIT,
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

/**
 * Consumes one question from the caller's daily allowance. The ONLY place that
 * decides which bucket a signed-in reader draws from, so the plan check cannot
 * drift between the answer path and the usage display above.
 *
 * The plan is read from the users row, never from the request: `users.plan` is
 * written only by the Stripe webhook.
 */
export async function limitChatQuestion(
  ctx: ActionCtx,
  who: { userId: Id<"users"> } | { anonymousSessionId: string },
): Promise<{ ok: boolean; retryAfter?: number; max: number }> {
  if ("anonymousSessionId" in who) {
    const status = await rateLimiter.limit(ctx, "chatAnonPerDay", {
      key: who.anonymousSessionId,
    });
    return { ...status, max: ANONYMOUS_CHAT_DAILY_LIMIT };
  }
  const user = await ctx.runQuery(internal.users._getUserById, {
    userId: who.userId,
  });
  if (isPro(user)) {
    const status = await rateLimiter.limit(ctx, "chatProPerDay", { key: who.userId });
    return { ...status, max: PRO_CHAT_DAILY_LIMIT };
  }
  const status = await rateLimiter.limit(ctx, "chatAuthedPerDay", { key: who.userId });
  return { ...status, max: AUTHED_CHAT_DAILY_LIMIT };
}
