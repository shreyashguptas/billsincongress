import { v } from "convex/values";
import { RateLimiter, HOUR, DAY } from "@convex-dev/rate-limiter";
import { getAuthUserId } from "@convex-dev/auth/server";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import { chatGatewayValidator, verifyChatGateway } from "./chatGateway";

// ─── Limit definitions ─────────────────────────────────────────────────────
// `start: 5 * HOUR` aligns the 24h fixed window to Unix-epoch + 5h, which is
// midnight US Eastern (EST). During EDT (mid-March → early November) the
// reset will land 1h later (1 AM ET) — the UI surfaces the actual reset time
// so users always see something accurate. See plan file for the DST trade-off.
//
// `kind: "fixed window"` grants all tokens at once at the start of each
// window; no token-bucket carry-over.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Anonymous browser session cap. The key is a server-signed httpOnly cookie
  // hash from the Next.js chat route, not a client-controlled localStorage ID.
  chatAnonPerDay: {
    kind: "fixed window",
    rate: 5,
    period: DAY,
    start: 5 * HOUR,
  },
  // Anonymous network-level cap. This makes deleting cookies/localStorage a
  // bounded abuse path instead of minting unlimited Groq calls.
  chatAnonNetworkPerDay: {
    kind: "fixed window",
    rate: 25,
    period: DAY,
    start: 5 * HOUR,
  },
  // Logged-in users — keyed by userId. Email-verification status is
  // intentionally NOT a factor; that gate is reserved for the Pro upgrade
  // (PR 3+).
  chatAuthedPerDay: {
    kind: "fixed window",
    rate: 100,
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

// ─── Public query: current chat quota status ───────────────────────────────
// The chat UI calls this only AFTER hitting RATE_LIMITED (to render the
// dialog with up-to-the-second reset time) and on initial load (so a
// disabled state survives a refresh). It never consumes a token.
//
// We don't expose a remaining-count number here on purpose — the chosen UX
// only shows anything when the user is already blocked, so we just need
// (a) "are you blocked?" and (b) "when does it reset?".
export const getChatUsage = query({
  args: { gateway: v.optional(chatGatewayValidator) },
  handler: async (ctx, { gateway }) => {
    const userId = await getAuthUserId(ctx);
    const isAuthed = userId !== null;
    const max = isAuthed ? 100 : 5;

    if (isAuthed) {
      const status = await rateLimiter.check(ctx, "chatAuthedPerDay", {
        key: userId!,
      });
      const blocked = !status.ok;
      return {
        kind: "authed" as const,
        max,
        blocked,
        resetAt: blocked ? Date.now() + (status.retryAfter ?? 0) : null,
      };
    }

    if (!(await verifyChatGateway(gateway))) {
      return {
        kind: "anonymous" as const,
        max,
        blocked: true,
        resetAt: null,
      };
    }

    const [sessionStatus, networkStatus] = await Promise.all([
      rateLimiter.check(ctx, "chatAnonPerDay", {
        key: gateway!.anonSessionKey,
      }),
      rateLimiter.check(ctx, "chatAnonNetworkPerDay", {
        key: gateway!.anonNetworkKey,
      }),
    ]);
    const blockedStatus = !sessionStatus.ok
      ? sessionStatus
      : !networkStatus.ok
        ? networkStatus
        : null;
    const blocked = blockedStatus !== null;
    const resetAt = blocked
      ? Date.now() + (blockedStatus.retryAfter ?? 0)
      : null;

    return {
      kind: "anonymous" as const,
      max,
      blocked,
      resetAt,
    };
  },
});
