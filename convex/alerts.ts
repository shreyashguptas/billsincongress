/**
 * Bill alerts — a Pro reader follows a bill and gets one email on any day it
 * moves. The "what is new" rule and the email itself live in alertDigest.ts
 * (pure, tested); this file is the database and scheduling around them.
 *
 * Daily run (convex/crons.ts, after the overnight sync has landed):
 *   runDigests pages through billAlerts by user and schedules one
 *   sendDigestForUser per reader. That mutation reads the reader's bills,
 *   schedules at most one email (email.deliver, which hands it to
 *   PostHog), and advances the watermarks in the SAME transaction — so a bill
 *   is never reported twice, and never marked reported without the email
 *   having been scheduled.
 */
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./users";
import { MAX_ALERTS_PER_USER, isPro } from "./plan";
import {
  hasNews,
  newActionsSince,
  renderDigestEmail,
  watermarkFor,
  type ActionRow,
  type BillChange,
} from "./alertDigest";

/** Upper bound on actions read for one bill. The longest carry a few hundred. */
const MAX_ACTIONS_READ = 1000;
/** Alert rows handled per page of the daily run. */
const DIGEST_PAGE_SIZE = 200;

function siteUrl(): string {
  return (process.env.SITE_URL ?? "https://billsincongress.com").replace(/\/+$/, "");
}

/**
 * A bill's actions dated on or after `since`, or all of them when `since` is
 * undefined. Read through the date index, so checking a followed bill that did
 * not move reads only the actions on its last reported day (usually one or
 * two), never its whole history. That keeps a reader following 100 long bills
 * well inside one mutation's read limits.
 */
async function readActionsSince(
  ctx: QueryCtx,
  billId: string,
  since: string | undefined,
): Promise<ActionRow[]> {
  const rows = await ctx.db
    .query("billActions")
    .withIndex("by_billId_and_actionDate", (q) =>
      since === undefined ? q.eq("billId", billId) : q.eq("billId", billId).gte("actionDate", since),
    )
    .take(MAX_ACTIONS_READ);
  return rows.map((r) => ({ actionDate: r.actionDate, text: r.text }));
}

async function billById(ctx: QueryCtx, billId: string) {
  return ctx.db
    .query("bills")
    .withIndex("by_billId", (q) => q.eq("billId", billId))
    .first();
}

// ── Unsubscribe links ──────────────────────────────────────────────────────
//
// Every digest carries a link that stops all alert emails without signing in
// (PostHog also adds a List-Unsubscribe header mail clients show as a button). The token is
// `<userId>.<HMAC of the userId>`, so it cannot be forged for another reader
// and needs no table. Rotating ALERTS_UNSUBSCRIBE_SECRET voids every old link.

function base64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function unsubscribeSignature(userId: string): Promise<string> {
  const secret = process.env.ALERTS_UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("ALERTS_UNSUBSCRIBE_SECRET is not set");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`alerts-unsubscribe:${userId}`),
  );
  return base64url(sig);
}

export async function unsubscribeToken(userId: Id<"users">): Promise<string> {
  return `${userId}.${await unsubscribeSignature(userId)}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function deleteAllAlerts(ctx: MutationCtx, userId: Id<"users">): Promise<number> {
  const rows = await ctx.db
    .query("billAlerts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(MAX_ALERTS_PER_USER * 2);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}

// ── Reader-facing ──────────────────────────────────────────────────────────

/** Drives the alert button on a bill page. Never throws for signed-out readers. */
export const statusForBill = query({
  args: { billId: v.string() },
  handler: async (ctx, { billId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { signedIn: false, pro: false, following: false };
    const user = await ctx.db.get(userId);
    const row = await ctx.db
      .query("billAlerts")
      .withIndex("by_user_and_bill", (q) => q.eq("userId", userId).eq("billId", billId))
      .unique();
    return { signedIn: true, pro: isPro(user), following: row !== null };
  },
});

/** Follow or unfollow a bill by email. Pro only; unfollowing always works. */
export const toggle = mutation({
  args: { billId: v.string() },
  handler: async (ctx, { billId }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("billAlerts")
      .withIndex("by_user_and_bill", (q) => q.eq("userId", user._id).eq("billId", billId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { following: false };
    }

    if (!isPro(user)) throw new ConvexError("PRO_REQUIRED");
    if (!user.email) throw new ConvexError("EMAIL_REQUIRED");

    const count = (
      await ctx.db
        .query("billAlerts")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(MAX_ALERTS_PER_USER)
    ).length;
    if (count >= MAX_ALERTS_PER_USER) throw new ConvexError("ALERT_LIMIT");

    const bill = await billById(ctx, billId);
    if (!bill) throw new ConvexError("BILL_NOT_FOUND");

    // Start from "everything so far is known": the first email reports only
    // what happens after the reader pressed the button.
    // Only the latest day's actions are needed: the watermark is that day plus
    // the fingerprints of what is on it.
    const watermark = watermarkFor(
      await readActionsSince(ctx, billId, bill.latestActionDate),
      bill.progressStage,
    );
    await ctx.db.insert("billAlerts", {
      userId: user._id,
      billId,
      createdAt: Date.now(),
      ...watermark,
    });
    return { following: true };
  },
});

/** The reader's followed bills, newest first, for the account page. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("billAlerts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_ALERTS_PER_USER);
    const out = await Promise.all(
      rows.map(async (row) => {
        const bill = await billById(ctx, row.billId);
        return {
          billId: row.billId,
          createdAt: row.createdAt,
          lastEmailedAt: row.lastEmailedAt ?? null,
          bill: bill
            ? {
                title: bill.title,
                billTypeLabel: bill.billTypeLabel,
                billNumber: bill.billNumber,
                congress: bill.congress,
                progressDescription: bill.progressDescription ?? null,
                latestActionDate: bill.latestActionDate ?? null,
              }
            : null,
        };
      }),
    );
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * The link in every digest. Needs no sign-in: the token proves which reader it
 * was sent to. Removes every followed bill, which stops the emails entirely.
 */
export const unsubscribeWithToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const dot = token.indexOf(".");
    if (dot <= 0) return { ok: false as const };
    const rawId = token.slice(0, dot);
    const userId = ctx.db.normalizeId("users", rawId);
    if (!userId) return { ok: false as const };
    const expected = await unsubscribeSignature(userId);
    if (!timingSafeEqual(token.slice(dot + 1), expected)) return { ok: false as const };
    const removed = await deleteAllAlerts(ctx, userId);
    return { ok: true as const, removed };
  },
});

// ── Daily digest ───────────────────────────────────────────────────────────

/**
 * One page of the daily run. Rows come in userId order, so a reader whose rows
 * straddle two pages is scheduled twice; the second run finds the watermarks
 * already advanced and sends nothing.
 */
export const runDigests = internalMutation({
  args: {
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("billAlerts")
      .withIndex("by_user")
      .paginate(args.paginationOpts ?? { numItems: DIGEST_PAGE_SIZE, cursor: null });

    const users = [...new Set(page.page.map((row) => row.userId))];
    for (const userId of users) {
      await ctx.scheduler.runAfter(0, internal.alerts.sendDigestForUser, { userId });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.alerts.runDigests, {
        paginationOpts: { numItems: DIGEST_PAGE_SIZE, cursor: page.continueCursor },
      });
    }
    return { scheduled: users.length, done: page.isDone };
  },
});

/** Stage order for "status changes first" in the email. */
function byNewsWeight(a: BillChange, b: BillChange): number {
  const sa = a.stageChange ? 1 : 0;
  const sb = b.stageChange ? 1 : 0;
  if (sa !== sb) return sb - sa;
  return b.newActions.length - a.newActions.length;
}

export const sendDigestForUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    // A lapsed subscription keeps its list (so re-subscribing restores it)
    // but gets no mail.
    if (!user || !isPro(user) || !user.email) return { sent: false, reason: "not_eligible" };

    const alerts = await ctx.db
      .query("billAlerts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_ALERTS_PER_USER);

    const changes: BillChange[] = [];
    const advance: Array<{ alert: Doc<"billAlerts">; next: ReturnType<typeof watermarkFor> }> = [];

    for (const alert of alerts) {
      const bill = await billById(ctx, alert.billId);
      if (!bill) continue;

      const stageMoved =
        bill.progressStage !== undefined && bill.progressStage !== alert.lastSeenStage;
      // A bill whose latest action is older than the watermark cannot have
      // anything new. Every other bill is checked, including the usual quiet
      // one whose latest action IS the watermark's day, because an action can
      // be posted late for that same day. That check reads only that day's
      // actions (readActionsSince), so it stays cheap.
      const maybeNewActions =
        bill.latestActionDate !== undefined &&
        (alert.lastSeenActionDate === undefined ||
          bill.latestActionDate >= alert.lastSeenActionDate);
      if (!stageMoved && !maybeNewActions) continue;

      const actions = await readActionsSince(ctx, alert.billId, alert.lastSeenActionDate);
      const fresh = newActionsSince(actions, alert);
      const change: BillChange = {
        billId: bill.billId,
        billTypeLabel: bill.billTypeLabel,
        billNumber: bill.billNumber,
        congress: bill.congress,
        title: bill.title,
        newActions: fresh,
        ...(stageMoved ? { stageChange: { from: alert.lastSeenStage, to: bill.progressStage! } } : {}),
      };
      if (!hasNews(change)) continue;
      changes.push(change);
      advance.push({
        alert,
        // Nothing on or after the old watermark (only the stage moved): keep
        // the action watermark as it was rather than resetting it to empty,
        // which would report the bill's whole history tomorrow.
        next:
          actions.length > 0
            ? watermarkFor(actions, bill.progressStage)
            : {
                lastSeenActionDate: alert.lastSeenActionDate,
                lastSeenActionFingerprints: alert.lastSeenActionFingerprints,
                lastSeenStage: bill.progressStage,
              },
      });
    }

    if (changes.length === 0) return { sent: false, reason: "nothing_new" };

    changes.sort(byNewsWeight);
    const token = await unsubscribeToken(userId);
    const site = siteUrl();
    const unsubscribeUrl = `${site}/alerts/unsubscribe?token=${encodeURIComponent(token)}`;
    const email = renderDigestEmail(
      changes,
      { siteUrl: site, manageUrl: `${site}/account#alerts`, unsubscribeUrl },
      new Date(),
    );

    // PostHog adds the one-click List-Unsubscribe header itself (the alerts
    // workflow sends as a "marketing" category); the footer link is ours.
    await ctx.scheduler.runAfter(0, internal.email.deliver, {
      stream: "alerts",
      to: user.email,
      subject: email.subject,
      html: email.bodyHtml,
      text: email.text,
    });

    const now = Date.now();
    for (const { alert, next } of advance) {
      await ctx.db.patch(alert._id, { ...next, lastEmailedAt: now });
    }
    return { sent: true, bills: changes.length };
  },
});
