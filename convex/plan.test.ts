/**
 * Unit tests for what each Stripe status grants. node:assert, no framework.
 * Run via `pnpm test`.
 */
import assert from "node:assert/strict";
import {
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

if (failures.length > 0) {
  console.error(`plan: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`plan: ${passed} passed`);
