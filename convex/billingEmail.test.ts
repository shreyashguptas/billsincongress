/**
 * Unit tests for the Pro plan-change emails. node:assert, no framework.
 * Run via `pnpm test`.
 */
import assert from "node:assert/strict";
import { formatBillingDate, renderBillingEmail } from "./billingEmail";
import type { BillingNotice } from "./plan";

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

const ctx = { siteUrl: "https://billsincongress.com", periodEnd: 1792883021, interval: "month" as const };
const ALL: BillingNotice[] = [
  { kind: "welcome", returning: false },
  { kind: "welcome", returning: true },
  { kind: "cancel_scheduled" },
  { kind: "cancel_withdrawn" },
  { kind: "payment_failed" },
  { kind: "ended", reason: "canceled" },
  { kind: "ended", reason: "payment_failed" },
  { kind: "ended", reason: "paused" },
];

it("dates read as the reader's calendar day in US Eastern time", () => {
  // 1792897200 = 2026-10-25 03:00 UTC, which is still Oct 24 in New York.
  assert.equal(formatBillingDate(1792897200), "October 24, 2026");
});

it("every email has a subject, both parts, and a way to act", () => {
  for (const n of ALL) {
    const e = renderBillingEmail(n, ctx);
    assert.ok(e.subject.length > 5, JSON.stringify(n));
    assert.ok(e.text.includes("https://billsincongress.com/"), `text link: ${JSON.stringify(n)}`);
    assert.ok(e.bodyHtml.includes('href="https://billsincongress.com/'), `html link: ${JSON.stringify(n)}`);
  }
});

it("never states an amount: receipts are Stripe's", () => {
  for (const n of ALL) {
    const e = renderBillingEmail(n, ctx);
    assert.ok(!/\$\d/.test(e.text + e.bodyHtml), JSON.stringify(n));
  }
});

it("a cancellation names the last day and says no further charge", () => {
  const e = renderBillingEmail({ kind: "cancel_scheduled" }, ctx);
  assert.equal(e.subject, "Your Pro plan ends on October 24, 2026");
  assert.ok(e.text.includes("won't be charged again") || e.text.includes("will not be charged again"));
  assert.ok(e.text.includes("stay saved"));
});

it("without a known period end, no date is invented", () => {
  const e = renderBillingEmail({ kind: "cancel_scheduled" }, { siteUrl: ctx.siteUrl });
  assert.ok(!/\b20\d\d\b/.test(e.subject + e.text), e.subject);
});

it("the end of Pro says whether payment was the reason", () => {
  assert.match(renderBillingEmail({ kind: "ended", reason: "payment_failed" }, ctx).text, /couldn't collect payment/);
  assert.doesNotMatch(renderBillingEmail({ kind: "ended", reason: "canceled" }, ctx).text, /payment/);
});

it("reads the same with remote content blocked (Apple Mail Privacy Protection)", () => {
  for (const n of ALL) {
    const { html } = renderBillingEmail(n, ctx);
    for (const remote of ["<img", "<link", "@import", "@font-face", "url(", "background-image"]) {
      assert.ok(!html.toLowerCase().includes(remote), `${remote} in ${JSON.stringify(n)}`);
    }
  }
});

it("sends PostHog the email without a second document shell", () => {
  for (const n of ALL) {
    const e = renderBillingEmail(n, ctx);
    assert.ok(!/<(!doctype|html|head|body)\b/i.test(e.bodyHtml));
    assert.ok(e.html.includes(e.bodyHtml));
  }
});

if (failures.length > 0) {
  console.error(`billingEmail: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`billingEmail: ${passed} passed`);
