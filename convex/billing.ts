/**
 * Pro subscriptions through Stripe Checkout and the Stripe customer portal.
 *
 * The flow, and the one rule that keeps it safe:
 *   1. `startCheckout` sends a signed-in reader to a Stripe-hosted Checkout page.
 *   2. Stripe calls `/stripe/webhook` (convex/http.ts) when the subscription is
 *      created, changes or ends. `handleStripeWebhook` verifies the signature,
 *      re-reads the subscription from Stripe, and `applySubscription` writes
 *      `users.plan`.
 *   3. Every gate (question allowance, bill alerts) reads `users.plan`.
 *
 * Only step 2 ever writes the plan. Returning from Checkout proves nothing — a
 * reader can open the success URL by hand — so the success page just waits for
 * the webhook.
 *
 * Billing runs on OffGrid LLC's Stripe account, which may later sell other
 * products. Every object created here is tagged
 * `metadata.app = "billsincongress"`, and the webhook ignores subscriptions
 * without that tag, so another product's subscribers can never change a plan
 * here.
 */
import Stripe from "stripe";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  httpAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { planForStatus, subscriptionUpdate, PRO_CHAT_DAILY_LIMIT, MAX_ALERTS_PER_USER } from "./plan";

export const APP_TAG = "billsincongress";

type Interval = "month" | "year";

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ConvexError("BILLING_NOT_CONFIGURED");
  // Convex's default runtime has fetch and Web Crypto, not Node's http module.
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

function siteUrl(): string {
  return (process.env.SITE_URL ?? "https://billsincongress.com").replace(/\/+$/, "");
}

function priceIdFor(interval: Interval): string {
  const id =
    interval === "year"
      ? process.env.STRIPE_PRICE_PRO_YEARLY
      : process.env.STRIPE_PRICE_PRO_MONTHLY;
  if (!id) throw new ConvexError("BILLING_NOT_CONFIGURED");
  return id;
}

/** The signed-in reader's billing state, for the account and Pro pages. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      plan: user.plan === "pro" ? ("pro" as const) : ("free" as const),
      subscriptionStatus: user.stripeSubscriptionStatus ?? null,
      interval:
        user.stripePriceId === undefined
          ? null
          : user.stripePriceId === process.env.STRIPE_PRICE_PRO_YEARLY
            ? ("year" as const)
            : ("month" as const),
      currentPeriodEnd: user.stripeCurrentPeriodEnd ?? null, // unix seconds
      cancelAtPeriodEnd: user.cancelAtPeriodEnd ?? false,
      hasBillingAccount: user.stripeCustomerId !== undefined,
      limits: { questionsPerDay: PRO_CHAT_DAILY_LIMIT, alertBills: MAX_ALERTS_PER_USER },
    };
  },
});

export const _userForBilling = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => ctx.db.get(userId),
});

export const _setCustomerId = internalMutation({
  args: { userId: v.id("users"), stripeCustomerId: v.string() },
  handler: async (ctx, { userId, stripeCustomerId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("USER_MISSING");
    // Never overwrite an existing link: two tabs racing to Checkout must end
    // up on one customer. The idempotency key below makes both calls return
    // the same customer anyway; this keeps the row honest if it ever doesn't.
    if (user.stripeCustomerId === undefined) {
      await ctx.db.patch(userId, { stripeCustomerId });
    }
  },
});

async function customerFor(
  stripe: Stripe,
  ctx: ActionCtx,
  user: Doc<"users">,
): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  // Keyed by user, so a retried or doubled request creates ONE customer. We do
  // not look customers up by email: the Stripe account can hold customers of
  // other products, and a matching address is not the same person's billing.
  const customer = await stripe.customers.create(
    {
      email: user.email,
      name: user.name,
      metadata: { app: APP_TAG, userId: user._id },
    },
    { idempotencyKey: `bic-customer-${user._id}` },
  );
  await ctx.runMutation(internal.billing._setCustomerId, {
    userId: user._id,
    stripeCustomerId: customer.id,
  });
  return customer.id;
}

/** Subscription states that are still a live billing relationship. */
const LIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "unpaid",
  "paused",
]);

/**
 * Stripe Checkout does not stop a customer from buying the same subscription
 * twice, and `users.plan` lags payment by the few seconds the webhook takes.
 * A reader who pays, goes Back and presses Subscribe again, or who has /pro in
 * two tabs, would otherwise be billed twice. So ask Stripe, not our row:
 *
 * - a live subscription for this site already exists → refuse (ALREADY_PRO
 *   when it grants Pro, SUBSCRIPTION_NEEDS_ATTENTION when it is unpaid or
 *   paused, which the billing portal fixes);
 * - any Checkout page this customer still has open for this site is expired,
 *   so of two tabs only the newest can be paid.
 */
async function refuseSecondSubscription(stripe: Stripe, customerId: string): Promise<void> {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  const live = subs.data.find(
    (s) => s.metadata?.app === APP_TAG && LIVE_SUBSCRIPTION_STATUSES.has(s.status),
  );
  if (live) {
    throw new ConvexError(
      planForStatus(live.status) === "pro" ? "ALREADY_PRO" : "SUBSCRIPTION_NEEDS_ATTENTION",
    );
  }
  const open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 20 });
  for (const session of open.data) {
    if (session.metadata?.app === APP_TAG) await stripe.checkout.sessions.expire(session.id);
  }
}

/** Returns the Stripe Checkout URL to send the reader to. */
export const startCheckout = action({
  args: { interval: v.union(v.literal("month"), v.literal("year")) },
  handler: async (ctx, { interval }): Promise<{ url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("UNAUTHENTICATED");
    const user: Doc<"users"> | null = await ctx.runQuery(internal.billing._userForBilling, {
      userId,
    });
    if (!user) throw new ConvexError("USER_MISSING");
    if (!user.email) throw new ConvexError("EMAIL_REQUIRED");
    // Fast path; the authoritative check is refuseSecondSubscription below.
    if (user.plan === "pro") throw new ConvexError("ALREADY_PRO");

    const stripe = stripeClient();
    const customerId = await customerFor(stripe, ctx, user);
    await refuseSecondSubscription(stripe, customerId);
    const tag = { app: APP_TAG, userId };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: priceIdFor(interval), quantity: 1 }],
      subscription_data: { metadata: tag },
      metadata: tag,
      allow_promotion_codes: true,
      // Reader-facing copy on Stripe's page; keep it in step with app/pro.
      custom_text: {
        submit: {
          message:
            "Cancel any time from your account page. Reading the site stays free either way.",
        },
      },
      success_url: `${siteUrl()}/account?checkout=success`,
      cancel_url: `${siteUrl()}/pro?checkout=canceled`,
    });
    if (!session.url) throw new ConvexError("CHECKOUT_UNAVAILABLE");
    return { url: session.url };
  },
});

/** Returns a Stripe customer-portal URL: change card, switch plan, cancel. */
export const openBillingPortal = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("UNAUTHENTICATED");
    const user: Doc<"users"> | null = await ctx.runQuery(internal.billing._userForBilling, {
      userId,
    });
    if (!user?.stripeCustomerId) throw new ConvexError("NO_BILLING_ACCOUNT");
    const stripe = stripeClient();
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${siteUrl()}/account`,
      ...(process.env.STRIPE_PORTAL_CONFIGURATION
        ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION }
        : {}),
    });
    return { url: portal.url };
  },
});

const vStatus = v.union(
  v.literal("active"),
  v.literal("trialing"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("incomplete"),
  v.literal("incomplete_expired"),
  v.literal("unpaid"),
  v.literal("paused"),
);

/** Records a webhook delivery; returns false when it was already processed. */
export const _claimEvent = internalMutation({
  args: { eventId: v.string(), type: v.string() },
  handler: async (ctx, { eventId, type }) => {
    const existing = await ctx.db
      .query("stripeEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique();
    if (existing?.status === "processed") return false;
    if (!existing) {
      await ctx.db.insert("stripeEvents", {
        eventId,
        type,
        receivedAt: Date.now(),
        status: "received",
      });
    }
    return true;
  },
});

export const _finishEvent = internalMutation({
  args: { eventId: v.string(), error: v.optional(v.string()) },
  handler: async (ctx, { eventId, error }) => {
    const row = await ctx.db
      .query("stripeEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, {
      status: error ? "failed" : "processed",
      processedAt: Date.now(),
      ...(error ? { error: error.slice(0, 500) } : {}),
    });
  },
});

/**
 * Writes one subscription's state onto its user. `users.plan` is derived from
 * the status here and nowhere else.
 */
export const applySubscription = internalMutation({
  args: {
    userId: v.optional(v.string()),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    status: vStatus,
    priceId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Prefer the id we stamped on the subscription at Checkout; fall back to
    // the customer link. normalizeId rejects anything that isn't a users id.
    let user: Doc<"users"> | null = null;
    const byTag = args.userId ? ctx.db.normalizeId("users", args.userId) : null;
    if (byTag) user = await ctx.db.get(byTag);
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
        .unique();
    }
    if (!user) {
      console.warn(`Stripe subscription ${args.stripeSubscriptionId} matches no user`);
      return { applied: false as const };
    }

    // An old subscription ending must not cancel a newer one. Only the
    // subscription the user is on, or one that grants Pro, may change the row.
    const grantsPro = planForStatus(args.status) === "pro";
    if (
      user.stripeSubscriptionId !== undefined &&
      user.stripeSubscriptionId !== args.stripeSubscriptionId &&
      !grantsPro
    ) {
      return { applied: false as const };
    }

    await ctx.db.patch(user._id, {
      plan: planForStatus(args.status),
      stripeCustomerId: user.stripeCustomerId ?? args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeSubscriptionStatus: args.status,
      stripePriceId: args.priceId,
      stripeCurrentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
    });
    return { applied: true as const, userId: user._id as Id<"users"> };
  },
});

const SUBSCRIPTION_EVENTS = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

/**
 * POST /stripe/webhook. Signature-verified; every other request is a 400.
 *
 * The event payload is used only to learn WHICH subscription changed. Its
 * current state is then fetched from Stripe, because webhooks can arrive out of
 * order and a stale `updated` event must not undo a newer cancellation.
 */
export const handleStripeWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret) return new Response("Webhook not configured", { status: 500 });
  if (!signature) return new Response("Missing signature", { status: 400 });

  const stripe = stripeClient();
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  if (!SUBSCRIPTION_EVENTS.has(event.type)) {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), { status: 200 });
  }
  const fresh = await ctx.runMutation(internal.billing._claimEvent, {
    eventId: event.id,
    type: event.type,
  });
  if (!fresh) return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });

  try {
    const obj = event.data.object as Stripe.Subscription | Stripe.Checkout.Session;
    const subscriptionId =
      obj.object === "subscription"
        ? obj.id
        : typeof obj.subscription === "string"
          ? obj.subscription
          : (obj.subscription?.id ?? null);
    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      // Not ours (another product on the same Stripe account): acknowledge
      // and do nothing.
      const update = subscriptionUpdate(sub, APP_TAG);
      if (update) await ctx.runMutation(internal.billing.applySubscription, update);
    }
    await ctx.runMutation(internal.billing._finishEvent, { eventId: event.id });
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.runMutation(internal.billing._finishEvent, { eventId: event.id, error: message });
    // 500 so Stripe retries; `_claimEvent` lets a failed event run again.
    return new Response("Webhook processing failed", { status: 500 });
  }
});
