/**
 * Tests for the unsubscribe-token scrubber run on every PostHog event.
 *
 * The payloads mirror what posthog-js actually hands `before_send`: a
 * `$pageview` whose `$current_url` holds the token, the next page's
 * `$referrer`, person `$set_once` initial-URL properties, and a `$snapshot`
 * whose meta event carries the page `href`.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { REDACTED, redactEvent, redactUrl } from "./redact-secrets";

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

const TOKEN = "k57abc123def.Zm9vYmFyYmF6cXV4";
const URL_WITH_TOKEN = `https://billsincongress.com/alerts/unsubscribe?token=${TOKEN}`;

it("the token is replaced and the rest of the URL kept", () => {
  assert.equal(redactUrl(URL_WITH_TOKEN), `https://billsincongress.com/alerts/unsubscribe?token=${REDACTED}`);
  assert.equal(
    redactUrl(`https://billsincongress.com/alerts/unsubscribe?utm_source=email&token=${TOKEN}&x=1`),
    `https://billsincongress.com/alerts/unsubscribe?utm_source=email&token=${REDACTED}&x=1`,
  );
});

it("other pages, and a token param anywhere else, are untouched", () => {
  for (const url of [
    "https://billsincongress.com/bills/4318hr119",
    "https://billsincongress.com/account?token=not-ours",
    "https://billsincongress.com/?gclid=abc123",
  ]) {
    assert.equal(redactUrl(url), url);
  }
});

it("a $pageview on the unsubscribe page loses the token", () => {
  const event = redactEvent({
    event: "$pageview",
    properties: { $current_url: URL_WITH_TOKEN, $pathname: "/alerts/unsubscribe", $host: "billsincongress.com" },
  });
  assert.ok(!JSON.stringify(event).includes(TOKEN));
  assert.equal(event.properties.$pathname, "/alerts/unsubscribe");
});

it("the next page's referrer and the person's initial URL lose it too", () => {
  const event = redactEvent({
    event: "$pageview",
    properties: {
      $current_url: "https://billsincongress.com/account",
      $referrer: URL_WITH_TOKEN,
      $set_once: { $initial_current_url: URL_WITH_TOKEN, $initial_referrer: URL_WITH_TOKEN },
    },
    $set_once: { $initial_current_url: URL_WITH_TOKEN },
  });
  assert.ok(!JSON.stringify(event).includes(TOKEN));
});

it("a session replay's recorded page URL loses it", () => {
  const event = redactEvent({
    event: "$snapshot",
    properties: {
      $snapshot_data: [
        { type: 4, data: { href: URL_WITH_TOKEN, width: 1280, height: 800 }, timestamp: 1 },
        { type: 3, data: { source: 1 }, timestamp: 2 },
      ],
    },
  });
  assert.ok(!JSON.stringify(event).includes(TOKEN));
});

it("an event without properties passes through", () => {
  assert.deepEqual(redactEvent({ event: "x" }), { event: "x" });
  assert.equal(redactEvent(null), null);
});

if (failures.length) {
  console.error(`\nredactSecrets: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`redactSecrets: all ${passed} tests passed`);
