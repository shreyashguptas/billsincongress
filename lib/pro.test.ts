/**
 * Every state the account page's plan card can be in, and what it tells the
 * reader. node:assert, no framework. Run via `pnpm test`.
 */
import assert from "node:assert/strict";
import { planCardView, type PlanCardInput } from "./pro";

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

const opts = { checkoutReturned: false, waitedLong: false, formatDate: () => "Oct 24, 2026" };
const base: PlanCardInput = {
  plan: "free",
  subscriptionStatus: null,
  interval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasBillingAccount: false,
};
const pro: PlanCardInput = {
  ...base,
  plan: "pro",
  subscriptionStatus: "active",
  interval: "month",
  currentPeriodEnd: 1792883021,
  hasBillingAccount: true,
};

it("never subscribed: Free, the pitch, See Pro, no billing button", () => {
  const v = planCardView(base, opts);
  assert.deepEqual([v.label, v.subscribe, v.showManage, v.tone], ["Free", "See Pro", false, "normal"]);
});

it("active: Pro, cadence, renewal date, Manage billing, no upsell", () => {
  const v = planCardView(pro, opts);
  assert.deepEqual([v.label, v.cadence, v.message, v.showManage, v.subscribe], ["Pro", "monthly", "Renews Oct 24, 2026.", true, null]);
  assert.equal(planCardView({ ...pro, interval: "year" }, opts).cadence, "yearly");
});

it("cancelled but still paid up: keeps Pro until the date, says how to undo", () => {
  const v = planCardView({ ...pro, cancelAtPeriodEnd: true }, opts);
  assert.equal(v.label, "Pro");
  assert.match(v.message, /until Oct 24, 2026 and won't be charged again/);
  assert.match(v.message, /renew under Manage billing/);
});

it("renewal failed, Stripe retrying: still Pro, shown as a warning", () => {
  const v = planCardView({ ...pro, subscriptionStatus: "past_due" }, opts);
  assert.deepEqual([v.label, v.tone, v.showManage], ["Pro", "warning", true]);
});

it("back from Checkout before the webhook: confirming, then a plain warning after a minute", () => {
  const waiting = planCardView(base, { ...opts, checkoutReturned: true });
  assert.match(waiting.message, /confirming with Stripe/);
  assert.equal(waiting.subscribe, null); // no second Subscribe button while paying
  const long = planCardView(base, { ...opts, checkoutReturned: true, waitedLong: true });
  assert.equal(long.tone, "warning");
  assert.match(long.message, /hi@billsincongress\.com/);
});

it("ended normally: Free, followed bills kept, Subscribe again, invoices still reachable", () => {
  const v = planCardView({ ...base, subscriptionStatus: "canceled", hasBillingAccount: true }, opts);
  assert.deepEqual([v.label, v.subscribe, v.showManage], ["Free", "Subscribe again", true]);
  assert.match(v.message, /still saved/);
});

it("an old ?checkout=success link does not claim a payment on an ended plan", () => {
  const v = planCardView({ ...base, subscriptionStatus: "canceled", hasBillingAccount: true }, { ...opts, checkoutReturned: true });
  assert.doesNotMatch(v.message, /Payment received/);
});

it("stopped for non-payment: fix the card, not a new purchase", () => {
  const v = planCardView({ ...base, subscriptionStatus: "unpaid", hasBillingAccount: true }, opts);
  assert.deepEqual([v.tone, v.subscribe, v.showManage], ["warning", null, true]);
});

it("paused: resume in billing, no new purchase", () => {
  const v = planCardView({ ...base, subscriptionStatus: "paused", hasBillingAccount: true }, opts);
  assert.deepEqual([v.subscribe, v.showManage], [null, true]);
});

it("first payment still processing, or expired unpaid", () => {
  const pending = planCardView({ ...base, subscriptionStatus: "incomplete", hasBillingAccount: true }, opts);
  assert.equal(pending.subscribe, null);
  const expired = planCardView({ ...base, subscriptionStatus: "incomplete_expired", hasBillingAccount: true }, opts);
  assert.equal(expired.subscribe, "Subscribe again");
  assert.match(expired.message, /weren't charged/);
});

it("no state ever offers a second purchase to someone on Pro", () => {
  for (const status of ["active", "trialing", "past_due"]) {
    for (const cancel of [false, true]) {
      const v = planCardView({ ...pro, subscriptionStatus: status, cancelAtPeriodEnd: cancel }, opts);
      assert.equal(v.subscribe, null, `${status}/${cancel}`);
    }
  }
});

if (failures.length > 0) {
  console.error(`pro: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`pro: ${passed} passed`);
