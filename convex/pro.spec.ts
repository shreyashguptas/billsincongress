/// <reference types="vite/client" />
/**
 * The Pro plan and bill alerts, run as real Convex functions against an
 * in-memory database (convex-test). Nothing here reaches Stripe, PostHog or any
 * deployment: `fetch` is stubbed to fail loudly unless a test replaces it.
 *
 * Each case is a way a reader could be wronged: charged but not upgraded,
 * mailed twice, mailed nothing when a bill moved, mailed after cancelling, or
 * unsubscribed by someone else.
 */
import Stripe from "stripe";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { AUTHED_CHAT_DAILY_LIMIT, PRO_CHAT_DAILY_LIMIT } from "./plan";

const modules = import.meta.glob("./**/*.ts");

process.env.ALERTS_UNSUBSCRIBE_SECRET = "test-secret-not-for-production";
process.env.SITE_URL = "https://billsincongress.test";
process.env.STRIPE_SECRET_KEY = "sk_test_not_a_real_key";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
delete process.env.ALERT_EMAILS_LIVE; // alert emails off unless a test turns them on

const BILL = "4318hr119";

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;

async function seed(t: T, opts: { plan?: "free" | "pro"; email?: string } = {}) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: opts.email ?? "reader@example.com",
      name: "Reader",
      ...(opts.plan ? { plan: opts.plan } : {}),
    });
    await ctx.db.insert("bills", {
      billId: BILL,
      congress: 119,
      billType: "hr",
      billNumber: "4318",
      billTypeLabel: "H.R.",
      title: "Rural Broadband Permitting Act of 2026",
      introducedDate: "2026-09-01",
      progressStage: 40,
      progressDescription: "In Committee",
      latestActionDate: "2026-09-02",
      updatedAt: "2026-09-02T00:00:00Z",
    });
    for (const a of [
      { actionDate: "2026-09-01", text: "Introduced in House" },
      { actionDate: "2026-09-02", text: "Referred to the Committee on Energy and Commerce." },
    ]) {
      await ctx.db.insert("billActions", { billId: BILL, ...a });
    }
    return userId;
  });
}

/** What the sync does: a new action plus the bill's denormalised fields. */
async function billMoves(
  t: T,
  action: { actionDate: string; text: string },
  stage?: { progressStage: number; progressDescription: string },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("billActions", { billId: BILL, ...action });
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", BILL))
      .unique();
    await ctx.db.patch(bill!._id, { latestActionDate: action.actionDate, ...(stage ?? {}) });
  });
}

function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

async function makePro(t: T, userId: Id<"users">, subscriptionId = "sub_1") {
  return t.mutation(internal.billing.applySubscription, {
    userId,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: subscriptionId,
    status: "active",
    priceId: "price_monthly",
    currentPeriodEnd: 1_800_000_000,
    cancelAtPeriodEnd: false,
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("network access in a test");
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("plan comes only from the subscription", () => {
  test("a free reader cannot follow a bill", async () => {
    const t = setup();
    const userId = await seed(t);
    await expect(asUser(t, userId).mutation(api.alerts.toggle, { billId: BILL })).rejects.toThrow(
      /PRO_REQUIRED/,
    );
  });

  test("an active subscription makes the reader Pro; cancelling makes them free", async () => {
    const t = setup();
    const userId = await seed(t);
    await makePro(t, userId);
    expect((await asUser(t, userId).query(api.billing.status, {}))?.plan).toBe("pro");

    await t.mutation(internal.billing.applySubscription, {
      userId,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "canceled",
      cancelAtPeriodEnd: false,
    });
    expect((await asUser(t, userId).query(api.billing.status, {}))?.plan).toBe("free");
  });

  test("a failed card (past_due) keeps Pro while Stripe retries", async () => {
    const t = setup();
    const userId = await seed(t);
    await t.mutation(internal.billing.applySubscription, {
      userId,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "past_due",
      cancelAtPeriodEnd: false,
    });
    expect((await asUser(t, userId).query(api.billing.status, {}))?.plan).toBe("pro");
  });

  test("an OLD subscription ending does not downgrade a reader on a newer one", async () => {
    const t = setup();
    const userId = await seed(t);
    await makePro(t, userId, "sub_new");
    const result = await t.mutation(internal.billing.applySubscription, {
      userId,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_old",
      status: "canceled",
      cancelAtPeriodEnd: false,
    });
    expect(result.applied).toBe(false);
    expect((await asUser(t, userId).query(api.billing.status, {}))?.plan).toBe("pro");
  });

  test("a subscription can be matched by its Stripe customer when the tag is missing", async () => {
    const t = setup();
    const userId = await seed(t);
    await t.run((ctx) => ctx.db.patch(userId, { stripeCustomerId: "cus_linked" }));
    await t.mutation(internal.billing.applySubscription, {
      stripeCustomerId: "cus_linked",
      stripeSubscriptionId: "sub_1",
      status: "active",
      cancelAtPeriodEnd: false,
    });
    expect((await asUser(t, userId).query(api.billing.status, {}))?.plan).toBe("pro");
  });

  test("Pro raises the question allowance shown to the reader", async () => {
    const t = setup();
    const userId = await seed(t);
    const free = await asUser(t, userId).query(api.rateLimits.getChatUsage, {});
    expect(free.max).toBe(AUTHED_CHAT_DAILY_LIMIT);
    await makePro(t, userId);
    const pro = await asUser(t, userId).query(api.rateLimits.getChatUsage, {});
    expect(pro.max).toBe(PRO_CHAT_DAILY_LIMIT);
  });
});

describe("daily digest", () => {
  async function followedByPro(t: T) {
    const userId = await seed(t, { plan: "free" });
    await makePro(t, userId);
    await asUser(t, userId).mutation(api.alerts.toggle, { billId: BILL });
    return userId;
  }

  test("nothing new since following means no email", async () => {
    const t = setup();
    const userId = await followedByPro(t);
    const r = await t.mutation(internal.alerts.sendDigestForUser, { userId });
    expect(r).toMatchObject({ sent: false, reason: "nothing_new" });
  });

  test("a new action is emailed once, and the same day's rerun sends nothing", async () => {
    const t = setup();
    const userId = await followedByPro(t);
    await billMoves(t, { actionDate: "2026-09-23", text: "Ordered to be Reported." });

    const first = await t.mutation(internal.alerts.sendDigestForUser, { userId });
    expect(first).toMatchObject({ sent: true, bills: 1 });
    const again = await t.mutation(internal.alerts.sendDigestForUser, { userId });
    expect(again).toMatchObject({ sent: false, reason: "nothing_new" });

    const [alert] = await t.run((ctx) => ctx.db.query("billAlerts").collect());
    expect(alert.lastSeenActionDate).toBe("2026-09-23");
    expect(alert.lastEmailedAt).toBeTypeOf("number");
  });

  test("an action posted late for an already-reported day is still emailed", async () => {
    const t = setup();
    const userId = await followedByPro(t);
    await billMoves(t, { actionDate: "2026-09-23", text: "Ordered to be Reported." });
    await t.mutation(internal.alerts.sendDigestForUser, { userId });

    await billMoves(t, { actionDate: "2026-09-23", text: "Reported by the Committee on Energy and Commerce." });
    const next = await t.mutation(internal.alerts.sendDigestForUser, { userId });
    expect(next).toMatchObject({ sent: true, bills: 1 });
  });

  test("a status change is emailed", async () => {
    const t = setup();
    const userId = await followedByPro(t);
    await billMoves(
      t,
      { actionDate: "2026-09-23", text: "On passage Passed by recorded vote: 368 - 51." },
      { progressStage: 60, progressDescription: "Passed One Chamber" },
    );
    const r = await t.mutation(internal.alerts.sendDigestForUser, { userId });
    expect(r).toMatchObject({ sent: true });
    const [alert] = await t.run((ctx) => ctx.db.query("billAlerts").collect());
    expect(alert.lastSeenStage).toBe(60);
  });

  test("a cancelled reader keeps their list but gets no email", async () => {
    const t = setup();
    const userId = await followedByPro(t);
    await t.mutation(internal.billing.applySubscription, {
      userId,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "canceled",
      cancelAtPeriodEnd: false,
    });
    await billMoves(t, { actionDate: "2026-09-23", text: "Ordered to be Reported." });
    const r = await t.mutation(internal.alerts.sendDigestForUser, { userId });
    expect(r).toMatchObject({ sent: false, reason: "not_eligible" });
    expect(await t.run((ctx) => ctx.db.query("billAlerts").collect())).toHaveLength(1);
  });

  test("with alert emails off, the digest is recorded but nothing reaches PostHog", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const t = setup();
    const userId = await followedByPro(t);
    await billMoves(t, { actionDate: "2026-09-23", text: "Ordered to be Reported." });
    await t.mutation(internal.alerts.sendDigestForUser, { userId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  describe("live", () => {
    const LIVE_ENV = {
      ALERT_EMAILS_LIVE: "true",
      POSTHOG_EMAIL_ALERTS_WEBHOOK_URL: "https://webhooks.posthog.test/alerts",
      POSTHOG_EMAIL_WEBHOOK_SECRET: "test-webhook-secret",
    };
    beforeEach(() => {
      Object.assign(process.env, LIVE_ENV);
      vi.useFakeTimers();
    });
    afterEach(() => {
      for (const k of Object.keys(LIVE_ENV)) delete process.env[k];
      vi.useRealTimers();
    });

    test("the digest goes to the alerts workflow, with the secret, once", async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('{"status":"ok"}', { status: 200 });
      });
      const t = setup();
      const userId = await followedByPro(t);
      await billMoves(t, { actionDate: "2026-09-23", text: "Ordered to be Reported." });
      await t.mutation(internal.alerts.sendDigestForUser, { userId });
      await t.mutation(internal.alerts.sendDigestForUser, { userId }); // same-day rerun
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(LIVE_ENV.POSTHOG_EMAIL_ALERTS_WEBHOOK_URL);
      const headers = calls[0].init.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer test-webhook-secret");
      const body = JSON.parse(calls[0].init.body as string);
      expect(body).toMatchObject({ stream: "alerts", to: "reader@example.com" });
      expect(body.subject).toContain("H.R. 4318");
      expect(body.html).toContain("Ordered to be Reported.");
      // One distinct id for every send: no PostHog profile per recipient.
      expect(body.distinct_id).toBe("bills-congress-mailer");
    });

    test("a PostHog outage is retried; a rejected secret is not", async () => {
      let status = 503;
      let attempts = 0;
      vi.stubGlobal("fetch", async () => {
        attempts++;
        return new Response("nope", { status });
      });
      const t = setup();
      const userId = await followedByPro(t);
      await billMoves(t, { actionDate: "2026-09-23", text: "Ordered to be Reported." });
      await t.mutation(internal.alerts.sendDigestForUser, { userId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(attempts).toBe(3);

      status = 401;
      attempts = 0;
      await billMoves(t, { actionDate: "2026-09-24", text: "Placed on the Union Calendar." });
      await t.mutation(internal.alerts.sendDigestForUser, { userId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(attempts).toBe(1);
    });
  });

  test("the daily run schedules one digest per reader", async () => {
    const t = setup();
    await followedByPro(t);
    const r = await t.mutation(internal.alerts.runDigests, {});
    expect(r).toMatchObject({ scheduled: 1, done: true });
  });
});

describe("unsubscribe link", () => {
  test("the reader's own token stops every alert; a forged one does nothing", async () => {
    const t = setup();
    const userId = await seed(t);
    await makePro(t, userId);
    await asUser(t, userId).mutation(api.alerts.toggle, { billId: BILL });

    const forged = await t.mutation(api.alerts.unsubscribeWithToken, {
      token: `${userId}.not-the-signature`,
    });
    expect(forged.ok).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("billAlerts").collect())).toHaveLength(1);

    const { unsubscribeToken } = await import("./alerts");
    const token = await unsubscribeToken(userId);
    const real = await t.mutation(api.alerts.unsubscribeWithToken, { token });
    expect(real).toMatchObject({ ok: true, removed: 1 });
    expect(await t.run((ctx) => ctx.db.query("billAlerts").collect())).toHaveLength(0);
  });

  test("unfollowing works after Pro has ended", async () => {
    const t = setup();
    const userId = await seed(t);
    await makePro(t, userId);
    await asUser(t, userId).mutation(api.alerts.toggle, { billId: BILL });
    await t.mutation(internal.billing.applySubscription, {
      userId,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "canceled",
      cancelAtPeriodEnd: false,
    });
    const r = await asUser(t, userId).mutation(api.alerts.toggle, { billId: BILL });
    expect(r.following).toBe(false);
  });
});

describe("Stripe webhook", () => {
  const stripe = new Stripe("sk_test_not_a_real_key", {
    httpClient: Stripe.createFetchHttpClient(),
  });

  /** A subscription as the sandbox returned it, for the given user. */
  function sandboxSubscription(userId: string, status = "active") {
    return {
      id: "sub_1UJLg1EGs4LR10Cz9lOlblKj",
      object: "subscription",
      status,
      customer: "cus_VJzf8MhuI7y8L9",
      metadata: { app: "billsincongress", userId },
      cancel_at_period_end: false,
      cancel_at: null,
      items: {
        object: "list",
        data: [
          {
            id: "si_VJzfAbyi1PyJGg",
            object: "subscription_item",
            current_period_end: 1792883021,
            price: { id: "price_1UJLfPEGs4LR10CzBQpz8c0b", object: "price" },
          },
        ],
      },
    };
  }

  async function deliver(t: T, event: object, secret = "whsec_test_secret") {
    const payload = JSON.stringify(event);
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret,
      cryptoProvider: Stripe.createSubtleCryptoProvider(),
    });
    return t.fetch("/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      body: payload,
    });
  }

  test("a signed subscription event re-reads the subscription and makes the reader Pro", async () => {
    const t = setup();
    const userId = await seed(t);
    const retrieved: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      retrieved.push(String(url));
      return new Response(JSON.stringify(sandboxSubscription(userId)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const res = await deliver(t, {
      id: "evt_1",
      object: "event",
      type: "customer.subscription.created",
      data: { object: sandboxSubscription(userId, "incomplete") },
    });
    expect(res.status).toBe(200);
    // The stale "incomplete" in the event body was ignored; Stripe's current
    // state ("active") was fetched and applied.
    expect(retrieved.some((u) => u.includes("/v1/subscriptions/sub_1UJLg1EGs4LR10Cz9lOlblKj"))).toBe(true);
    const status = await asUser(t, userId).query(api.billing.status, {});
    expect(status).toMatchObject({ plan: "pro", currentPeriodEnd: 1792883021 });

    // Stripe redelivers the same event: acknowledged, not re-applied.
    const again = await deliver(t, {
      id: "evt_1",
      object: "event",
      type: "customer.subscription.created",
      data: { object: sandboxSubscription(userId, "incomplete") },
    });
    expect(await again.json()).toMatchObject({ duplicate: true });
  });

  test("a forged signature is rejected and changes nothing", async () => {
    const t = setup();
    const userId = await seed(t);
    const res = await deliver(
      t,
      {
        id: "evt_forged",
        object: "event",
        type: "customer.subscription.created",
        data: { object: sandboxSubscription(userId) },
      },
      "whsec_someone_else",
    );
    expect(res.status).toBe(400);
    expect((await asUser(t, userId).query(api.billing.status, {}))?.plan).toBe("free");
  });

  test("events the site does not use are acknowledged and ignored", async () => {
    const t = setup();
    const res = await deliver(t, {
      id: "evt_2",
      object: "event",
      type: "invoice.paid",
      data: { object: { id: "in_1", object: "invoice" } },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "invoice.paid" });
  });
});
