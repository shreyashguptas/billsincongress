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

  test("a bill with a long history: only what is new is reported, and a stage-only move keeps the action watermark", async () => {
    const t = setup();
    const userId = await followedByPro(t);
    // A long bill: hundreds of older actions the daily check must not re-report.
    await t.run(async (ctx) => {
      for (let i = 0; i < 400; i++) {
        await ctx.db.insert("billActions", { billId: BILL, actionDate: "2026-08-01", text: `Old action ${i}` });
      }
    });
    await billMoves(t, { actionDate: "2026-09-23", text: "Ordered to be Reported." });
    const first = await t.mutation(internal.alerts.sendDigestForUser, { userId });
    expect(first).toMatchObject({ sent: true, bills: 1 });

    // Quiet day: nothing new, nothing sent, watermark unchanged.
    const quiet = await t.mutation(internal.alerts.sendDigestForUser, { userId });
    expect(quiet).toMatchObject({ sent: false, reason: "nothing_new" });

    // Stage moves with no new action row: reported once, and the action
    // watermark stays on 2026-09-23 rather than resetting to empty.
    await t.run(async (ctx) => {
      const bill = await ctx.db.query("bills").withIndex("by_billId", (q) => q.eq("billId", BILL)).unique();
      await ctx.db.patch(bill!._id, { progressStage: 60, progressDescription: "Passed One Chamber" });
    });
    const staged = await t.mutation(internal.alerts.sendDigestForUser, { userId });
    expect(staged).toMatchObject({ sent: true, bills: 1 });
    const [alert] = await t.run((ctx) => ctx.db.query("billAlerts").collect());
    expect(alert.lastSeenActionDate).toBe("2026-09-23");
    expect(alert.lastSeenStage).toBe(60);
    const after = await t.mutation(internal.alerts.sendDigestForUser, { userId });
    expect(after).toMatchObject({ sent: false, reason: "nothing_new" });
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

describe("checkout", () => {
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_monthly_test";
  process.env.STRIPE_PRICE_PRO_YEARLY = "price_yearly_test";

  const list = (data: object[]) => ({ object: "list", data, has_more: false, url: "/v1/x" });

  /** A fake Stripe that records every request and answers from `subs`/`open`. */
  function fakeStripe(state: { subs: object[]; open: object[] }) {
    const calls: Array<{ method: string; path: string }> = [];
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, path: url.pathname });
      const json = (body: object) =>
        new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      if (url.pathname === "/v1/subscriptions") return json(list(state.subs));
      if (url.pathname === "/v1/checkout/sessions" && method === "GET") return json(list(state.open));
      if (url.pathname.endsWith("/expire")) return json({ id: url.pathname.split("/")[4], object: "checkout.session", status: "expired" });
      if (url.pathname === "/v1/checkout/sessions" && method === "POST")
        return json({ id: "cs_new", object: "checkout.session", url: "https://checkout.stripe.test/cs_new" });
      throw new Error(`unexpected Stripe call ${method} ${url.pathname}`);
    });
    return calls;
  }

  async function freeReaderWithCustomer(t: T) {
    const userId = await seed(t, { plan: "free" });
    await t.run((ctx) => ctx.db.patch(userId, { stripeCustomerId: "cus_1" }));
    return userId;
  }

  test("paid but not yet confirmed by the webhook: a second Subscribe is refused, no second Checkout", async () => {
    const t = setup();
    const userId = await freeReaderWithCustomer(t);
    const calls = fakeStripe({
      subs: [{ id: "sub_1", object: "subscription", status: "active", metadata: { app: "billsincongress", userId } }],
      open: [],
    });
    await expect(
      asUser(t, userId).action(api.billing.startCheckout, { interval: "month" }),
    ).rejects.toThrow(/ALREADY_PRO/);
    expect(calls.some((c) => c.method === "POST" && c.path === "/v1/checkout/sessions")).toBe(false);
  });

  test("an unpaid subscription sends the reader to billing, not to a new purchase", async () => {
    const t = setup();
    const userId = await freeReaderWithCustomer(t);
    fakeStripe({
      subs: [{ id: "sub_1", object: "subscription", status: "unpaid", metadata: { app: "billsincongress", userId } }],
      open: [],
    });
    await expect(
      asUser(t, userId).action(api.billing.startCheckout, { interval: "month" }),
    ).rejects.toThrow(/SUBSCRIPTION_NEEDS_ATTENTION/);
  });

  test("two tabs: the older open Checkout is expired so only one can be paid; other products are untouched", async () => {
    const t = setup();
    const userId = await freeReaderWithCustomer(t);
    const calls = fakeStripe({
      subs: [
        // Another OffGrid product's subscription on the same customer is not ours.
        { id: "sub_other", object: "subscription", status: "active", metadata: { app: "something-else" } },
      ],
      open: [
        { id: "cs_tab1", object: "checkout.session", status: "open", metadata: { app: "billsincongress", userId } },
        { id: "cs_other", object: "checkout.session", status: "open", metadata: { app: "something-else" } },
      ],
    });
    const { url } = await asUser(t, userId).action(api.billing.startCheckout, { interval: "month" });
    expect(url).toBe("https://checkout.stripe.test/cs_new");
    const expired = calls.filter((c) => c.path.endsWith("/expire")).map((c) => c.path);
    expect(expired).toEqual(["/v1/checkout/sessions/cs_tab1/expire"]);
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
