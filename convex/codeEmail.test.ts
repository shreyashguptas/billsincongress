/**
 * Unit tests for the sign-up and password-reset code emails. node:assert, no
 * framework. Run via `pnpm test`.
 */
import assert from "node:assert/strict";
import { renderCodeEmail } from "./codeEmail";
import { emailRequest } from "./posthogEmail";

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

it("the code is plain text in both the HTML and text parts", () => {
  const email = renderCodeEmail("verify", "042917");
  assert.equal(email.subject, "Verify your email — Bills.Congress");
  assert.ok(email.text.startsWith("Your verification code is 042917."));
  assert.ok(email.bodyHtml.includes(">042917</p>"));
  assert.ok(email.text.includes("15 minutes"));
});

it("the reset email says it is a reset, not a sign-up", () => {
  const email = renderCodeEmail("reset", "123456");
  assert.equal(email.subject, "Reset your password — Bills.Congress");
  assert.ok(email.text.startsWith("Your password-reset code is 123456."));
  assert.ok(email.bodyHtml.includes("Reset your password"));
});

it("reads the same with remote content blocked (Apple Mail Privacy Protection)", () => {
  const { html } = renderCodeEmail("verify", "042917");
  for (const remote of ["<img", "<link", "@import", "@font-face", "url(", "background-image"]) {
    assert.ok(!html.toLowerCase().includes(remote), remote);
  }
});

it("sends PostHog the email without a second document shell", () => {
  const email = renderCodeEmail("verify", "042917");
  assert.ok(!/<(!doctype|html|head|body)\b/i.test(email.bodyHtml));
  assert.ok(email.html.includes(email.bodyHtml));
});

it("every send carries the shared secret and one distinct id", () => {
  process.env.POSTHOG_EMAIL_CODES_WEBHOOK_URL = "https://webhooks.posthog.test/codes";
  process.env.POSTHOG_EMAIL_WEBHOOK_SECRET = "s3cret";
  const { url, init } = emailRequest("codes", { to: "a@b.test", subject: "S", text: "T" });
  assert.equal(url, "https://webhooks.posthog.test/codes");
  assert.equal(init.headers.authorization, "Bearer s3cret");
  const body = JSON.parse(init.body);
  assert.equal(body.distinct_id, "bills-congress-mailer");
  assert.equal(body.stream, "codes");
  assert.equal(body.html, "");
});

it("a missing webhook setting is an error, not a silent drop", () => {
  delete process.env.POSTHOG_EMAIL_ALERTS_WEBHOOK_URL;
  assert.throws(
    () => emailRequest("alerts", { to: "a@b.test", subject: "S", text: "T" }),
    /POSTHOG_EMAIL_ALERTS_WEBHOOK_URL/,
  );
});

if (failures.length > 0) {
  console.error(`codeEmail: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`codeEmail: ${passed} passed`);
