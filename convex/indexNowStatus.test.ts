/**
 * Tests for IndexNow response handling.
 *
 * The consequences are asymmetric, so the assertions are about behaviour
 * rather than status codes: a batch retried after acceptance is wasted work, a
 * batch dropped after a 429 is lost, and a queue drained against a rejected
 * key discards real work while looking like progress.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { interpretIndexNowStatus } from "./indexNowStatus";

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

it("treats 200 and 202 as done", () => {
  // 202 is the normal answer to the very first submission, before the engine
  // has fetched the key file. Retrying it would announce everything twice.
  assert.equal(interpretIndexNowStatus(200).kind, "accepted");
  assert.equal(interpretIndexNowStatus(202).kind, "accepted");
});

it("stops rather than retries when told it looks like spam", () => {
  const outcome = interpretIndexNowStatus(429);
  assert.equal(outcome.kind, "stop");
  assert.match(outcome.kind === "stop" ? outcome.reason : "", /back off/);
});

it("stops on a rejected key instead of draining the queue against it", () => {
  const outcome = interpretIndexNowStatus(403);
  assert.equal(outcome.kind, "stop");
  assert.match(outcome.kind === "stop" ? outcome.reason : "", /key file/);
});

it("drops what can never succeed, so it cannot block the queue", () => {
  assert.equal(interpretIndexNowStatus(422).kind, "drop");
  assert.equal(interpretIndexNowStatus(400).kind, "drop");
});

it("retries anything unrecognised, including 5xx and network failure", () => {
  for (const status of [500, 502, 503, 504, 418, 0]) {
    assert.equal(interpretIndexNowStatus(status).kind, "retry", String(status));
  }
});

it("never leaves a status unhandled", () => {
  // Every branch returns, so an unlisted status cannot fall through to
  // undefined and crash the action mid-batch.
  for (let status = 0; status < 600; status++) {
    const outcome = interpretIndexNowStatus(status);
    assert.ok(
      ["accepted", "retry", "stop", "drop"].includes(outcome.kind),
      `status ${status} produced ${JSON.stringify(outcome)}`,
    );
  }
});

it("keeps the queue only when the batch might still succeed", () => {
  // "accepted" and "drop" mean delete; "stop" and "retry" mean leave in place.
  const deletes = (s: number) => ["accepted", "drop"].includes(interpretIndexNowStatus(s).kind);
  assert.equal(deletes(200), true);
  assert.equal(deletes(202), true);
  assert.equal(deletes(422), true);
  assert.equal(deletes(400), true);
  assert.equal(deletes(429), false, "a rate-limited batch must survive to be retried");
  assert.equal(deletes(403), false, "a key problem must not consume the queue");
  assert.equal(deletes(503), false);
});

if (failures.length) {
  console.error(`\nindexNowStatus: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`indexNowStatus: all ${passed} tests passed`);
