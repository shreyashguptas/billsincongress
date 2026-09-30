/**
 * The pieces of convex/aiTrace.ts that do not need a Convex runtime: clipping,
 * reading ids from the browser, and where a flush goes. The recording itself,
 * end to end through `/answer/stream`, is convex/aiTrace.spec.ts.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import {
  AnswerTrace,
  clip,
  clipMessages,
  MAX_MESSAGE_CHARS,
  readTraceIdentity,
} from "./aiTrace";

let passed = 0;
const failures: string[] = [];
const pending: Promise<void>[] = [];

function it(name: string, fn: () => void | Promise<void>) {
  const record = (err: unknown) =>
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`,
    );
  try {
    const out = fn();
    if (out instanceof Promise) pending.push(out.then(() => void passed++, record));
    else passed++;
  } catch (err) {
    record(err);
  }
}

it("clips long text and says how much was cut", () => {
  assert.equal(clip("short", 10), "short");
  assert.equal(clip("x".repeat(15), 10), `${"x".repeat(10)}… [clipped 5 characters]`);
});

it("clips only the messages that are too long, and keeps their roles", () => {
  const big = "r".repeat(MAX_MESSAGE_CHARS + 100);
  const out = clipMessages([
    { role: "system", content: "rules" },
    { role: "tool", content: big },
    { role: "assistant", content: null },
  ]);
  assert.equal(out[0].content, "rules");
  assert.equal(out[1].role, "tool");
  assert.ok(out[1].content!.startsWith("r".repeat(MAX_MESSAGE_CHARS)));
  assert.ok(out[1].content!.endsWith("[clipped 100 characters]"));
  assert.equal(out[2].content, null);
});

it("accepts PostHog-shaped ids and drops anything else", () => {
  assert.deepEqual(
    readTraceIdentity({
      distinctId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      sessionId: "0199a1b2-c3d4",
      conversationId: "k57abc123",
    }),
    {
      distinctId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      sessionId: "0199a1b2-c3d4",
      conversationId: "k57abc123",
    },
  );
  assert.deepEqual(readTraceIdentity({ distinctId: "has spaces", sessionId: 7 }), {});
  assert.deepEqual(readTraceIdentity({ distinctId: "a".repeat(201) }), {});
  assert.deepEqual(readTraceIdentity(null), {});
  assert.deepEqual(readTraceIdentity("nope"), {});
});

it("sends nothing without a key, and nothing when nothing was recorded", async () => {
  let calls = 0;
  const fakeFetch = (async () => {
    calls++;
    return new Response("{}");
  }) as typeof fetch;
  const t = new AnswerTrace();
  t.span({ name: "fetch_dataset", input: {}, output: "[]", latencyMs: 1 });
  assert.equal(await t.flush({}, fakeFetch), false);
  assert.equal(await new AnswerTrace().flush({ key: "phc_x" }, fakeFetch), false);
  assert.equal(calls, 0);
});

it("posts to the configured https host, or PostHog US when it is not https", async () => {
  const urls: string[] = [];
  const fakeFetch = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response("{}");
  }) as typeof fetch;
  for (const host of ["https://eu.i.posthog.com/", "http://evil.example", undefined]) {
    const t = new AnswerTrace();
    t.span({ name: "x", input: {}, output: "", latencyMs: 0 });
    await t.flush({ key: "phc_x", host }, fakeFetch);
  }
  assert.deepEqual(urls, [
    "https://eu.i.posthog.com/batch/",
    "https://us.i.posthog.com/batch/",
    "https://us.i.posthog.com/batch/",
  ]);
});

it("never throws when PostHog cannot be reached", async () => {
  const t = new AnswerTrace();
  t.span({ name: "x", input: {}, output: "", latencyMs: 0 });
  const failing = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await t.flush({ key: "phc_x" }, failing), false);
  } finally {
    console.error = originalError;
  }
});

it("the trace's latency runs from creation to finish", () => {
  let now = 1_000;
  const t = new AnswerTrace({ traceId: "t1", now: () => now });
  now = 4_500;
  t.finish({ question: "q", answer: "a", outcome: "answered" });
  const [trace] = t.recorded();
  assert.equal(trace.event, "$ai_trace");
  assert.equal(trace.properties.$ai_latency, 3.5);
  assert.equal(trace.properties.$ai_trace_id, "t1");
});

Promise.all(pending).then(() => {
  console.log(`\naiTrace: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
});
