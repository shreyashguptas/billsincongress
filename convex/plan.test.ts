/**
 * Unit tests for what each Stripe status grants. node:assert, no framework.
 * Run via `pnpm test`.
 */
import assert from "node:assert/strict";
import {
  billingNotice,
  ANONYMOUS_CHAT_DAILY_LIMIT,
  AUTHED_CHAT_DAILY_LIMIT,
  PRO_CHAT_DAILY_LIMIT,
  chatDailyLimitFor,
  isPro,
  planForStatus,
  subscriptionUpdate,
  toSubscriptionStatus,
  type StripeSubscriptionLike,
} from "./plan";

let passed = 0;
const failures: string[] = [];
function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`,
    );
  }
}

it("paying, trialing and retrying-a-card statuses grant Pro", () => {
  for (const s of ["active", "trialing", "past_due"]) assert.equal(planForStatus(s), "pro", s);
});

it("every ended or unpaid status is free", () => {
  for (const s of ["canceled", "incomplete", "incomplete_expired", "unpaid", "paused", undefined]) {
    assert.equal(planForStatus(s), "free", String(s));
  }
});

it("an unknown status from a future Stripe API is not trusted", () => {
  assert.equal(toSubscriptionStatus("some_new_status"), undefined);
  assert.equal(planForStatus("some_new_status"), "free");
});

it("a user row without a plan is free (auth inserts users without one)", () => {
  assert.equal(isPro({}), false);
  assert.equal(isPro(null), false);
  assert.equal(isPro({ plan: "pro" }), true);
});

it("question allowance: anonymous < signed in < Pro", () => {
  assert.equal(chatDailyLimitFor(null), ANONYMOUS_CHAT_DAILY_LIMIT);
  assert.equal(chatDailyLimitFor({}), AUTHED_CHAT_DAILY_LIMIT);
  assert.equal(chatDailyLimitFor({ plan: "free" }), AUTHED_CHAT_DAILY_LIMIT);
  assert.equal(chatDailyLimitFor({ plan: "pro" }), PRO_CHAT_DAILY_LIMIT);
  assert.ok(PRO_CHAT_DAILY_LIMIT > AUTHED_CHAT_DAILY_LIMIT);
});

// Trimmed from real replies of the Stripe sandbox (API 2026-08-26), 24 Sep 2026:
// a new $9/month subscription, then the same one after "cancel at period end".
const sandboxActive: StripeSubscriptionLike = {
  id: "sub_1UJLg1EGs4LR10Cz9lOlblKj",
  status: "active",
  customer: "cus_VJzf8MhuI7y8L9",
  metadata: { app: "billsincongress", userId: "sandbox_test_user" },
  cancel_at_period_end: false,
  cancel_at: null,
  items: {
    data: [{ price: { id: "price_1UJLfPEGs4LR10CzBQpz8c0b" }, current_period_end: 1792883021 }],
  },
};
const sandboxCancelling: StripeSubscriptionLike = {
  ...sandboxActive,
  cancel_at_period_end: true,
  cancel_at: 1792883021,
};

it("a real sandbox subscription maps to Pro with its renewal date", () => {
  assert.deepEqual(subscriptionUpdate(sandboxActive, "billsincongress"), {
    userId: "sandbox_test_user",
    stripeCustomerId: "cus_VJzf8MhuI7y8L9",
    stripeSubscriptionId: "sub_1UJLg1EGs4LR10Cz9lOlblKj",
    status: "active",
    priceId: "price_1UJLfPEGs4LR10CzBQpz8c0b",
    currentPeriodEnd: 1792883021,
    cancelAtPeriodEnd: false,
  });
});

it("cancelling at period end keeps Pro (status stays active) and records the end", () => {
  const update = subscriptionUpdate(sandboxCancelling, "billsincongress");
  assert.equal(update?.status, "active");
  assert.equal(planForStatus(update?.status), "pro");
  assert.equal(update?.cancelAtPeriodEnd, true);
});

it("the portal's cancel_at spelling alone also counts as ending", () => {
  const portal = { ...sandboxActive, cancel_at: 1792883021 };
  assert.equal(subscriptionUpdate(portal, "billsincongress")?.cancelAtPeriodEnd, true);
});

it("another product's subscription on the same Stripe account is ignored", () => {
  const other = { ...sandboxActive, metadata: { app: "something-else" } };
  assert.equal(subscriptionUpdate(other, "billsincongress"), null);
  assert.equal(subscriptionUpdate({ ...sandboxActive, metadata: null }, "billsincongress"), null);
});


// ── Which plan change gets an email ─────────────────────────────────────────

const free = { plan: "free" as const };
const active = { plan: "pro" as const, status: "active" as const, cancelAtPeriodEnd: false, subscriptionId: "sub_1" };

it("first subscription: a welcome, not a welcome back", () => {
  assert.deepEqual(billingNotice({}, { ...active }), { kind: "welcome", returning: false });
  // Checkout often records `incomplete` before `active` on the SAME subscription.
  assert.deepEqual(
    billingNotice({ ...free, status: "incomplete", subscriptionId: "sub_1" }, { ...active }),
    { kind: "welcome", returning: false },
  );
});

it("a new subscription after an old one ended: welcome back", () => {
  assert.deepEqual(
    billingNotice({ ...free, status: "canceled", subscriptionId: "sub_old" }, { ...active }),
    { kind: "welcome", returning: true },
  );
});

it("cancel at period end, and undoing it", () => {
  assert.deepEqual(billingNotice(active, { ...active, cancelAtPeriodEnd: true }), { kind: "cancel_scheduled" });
  assert.deepEqual(billingNotice({ ...active, cancelAtPeriodEnd: true }, active), { kind: "cancel_withdrawn" });
});

it("a failed renewal is announced once, not on every retry", () => {
  assert.deepEqual(billingNotice(active, { ...active, status: "past_due" }), { kind: "payment_failed" });
  assert.equal(billingNotice({ ...active, status: "past_due" }, { ...active, status: "past_due" }), null);
  // The retry succeeding needs no email: Stripe sends the receipt.
  assert.equal(billingNotice({ ...active, status: "past_due" }, active), null);
});

it("the end of Pro says why", () => {
  assert.deepEqual(billingNotice(active, { ...active, plan: "free", status: "canceled" }), { kind: "ended", reason: "canceled" });
  assert.deepEqual(billingNotice({ ...active, status: "past_due" }, { ...active, status: "canceled" }), { kind: "ended", reason: "payment_failed" });
  assert.deepEqual(billingNotice({ ...active, status: "past_due" }, { ...active, status: "unpaid" }), { kind: "ended", reason: "payment_failed" });
  assert.deepEqual(billingNotice(active, { ...active, status: "paused" }), { kind: "ended", reason: "paused" });
});

it("changes that are not news send nothing", () => {
  assert.equal(billingNotice(active, active), null); // a redelivered webhook
  assert.equal(billingNotice(active, { ...active, subscriptionId: "sub_1" }), null); // monthly ↔ yearly switch
  assert.equal(billingNotice({ ...free, status: "incomplete" }, { ...free, status: "incomplete_expired" }), null);
  assert.equal(billingNotice({ ...free, status: "canceled" }, { ...free, status: "canceled" }), null);
});

if (failures.length > 0) {
  console.error(`plan: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`plan: ${passed} passed`);
