import { v } from "convex/values";
import { RateLimiter, HOUR, DAY } from "@convex-dev/rate-limiter";
import { getAuthUserId } from "@convex-dev/auth/server";
import { components } from "./_generated/api";
import { query } from "./_generated/server";

// ─── Limit definitions ─────────────────────────────────────────────────────
// `start: 5 * HOUR` aligns the 24h fixed window to Unix-epoch + 5h, which is
// midnight US Eastern (EST). During EDT (mid-March → early November) the
// reset will land 1h later (1 AM ET) — the UI surfaces the actual reset time
// so users always see something accurate. See plan file for the DST trade-off.
//
// `kind: "fixed window"` grants all tokens at once at the start of each
// window; no token-bucket carry-over.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Anonymous browsers — keyed by browser sessionId
  chatAnonPerDay: {
    kind: "fixed window",
    rate: 5,
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
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    const isAuthed = userId !== null;
    const limitName = isAuthed ? "chatAuthedPerDay" : "chatAnonPerDay";
    const max = isAuthed ? 100 : 5;
    const key = isAuthed ? userId! : sessionId;

    const status = await rateLimiter.check(ctx, limitName, { key });
    const blocked = !status.ok;
    const resetAt = blocked
      ? Date.now() + (status.retryAfter ?? 0)
      : null;

    return {
      kind: isAuthed ? ("authed" as const) : ("anonymous" as const),
      max,
      blocked,
      resetAt,
    };
  },
});
