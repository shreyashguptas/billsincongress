/**
 * Which OpenRouter failures get one more try. Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import {
  DEFAULT_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  isNetworkError,
  isRetryablePayload,
  isRetryableStatus,
  retryDelayMs,
} from "./transientRetry";

let passed = 0;
const failures: string[] = [];
function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`  ✗ ${name}\n    ${err instanceof Error ? err.message : String(err)}`);
  }
}

it("retries a rate limit and the gateway errors", () => {
  for (const status of [429, 502, 503, 504]) assert.equal(isRetryableStatus(status), true, String(status));
});

it("never retries a request that was refused for what it is", () => {
  for (const status of [400, 401, 402, 403, 404, 413, 500]) {
    assert.equal(isRetryableStatus(status), false, String(status));
  }
});

it("retries a provider timeout sent inside a 200", () => {
  // The shape of the two 2026-10-05 failures.
  assert.equal(
    isRetryablePayload({ message: "Provider timed out after 17011ms", code: 504, metadata: { error_type: "timeout" } }),
    true,
  );
  assert.equal(isRetryablePayload({ message: "rate-limited", code: "429" }), true);
});

it("does not retry a payload error that is not momentary, or is not an error at all", () => {
  assert.equal(isRetryablePayload({ message: "Invalid model", code: 400 }), false);
  assert.equal(isRetryablePayload({ message: "no code" }), false);
  assert.equal(isRetryablePayload("504"), false);
  assert.equal(isRetryablePayload(null), false);
  assert.equal(isRetryablePayload(undefined), false);
});

it("treats a fetch TypeError as a network failure, and nothing else", () => {
  // The 2026-10-13 failure: "error sending request for url (https://openrouter.ai/...)".
  assert.equal(isNetworkError(new TypeError("error sending request for url")), true);
  assert.equal(isNetworkError(new Error("OpenRouter 400 Bad Request")), false);
  assert.equal(isNetworkError("TypeError"), false);
});

it("waits half a second unless told otherwise, and never more than two", () => {
  assert.equal(retryDelayMs(null), DEFAULT_RETRY_DELAY_MS);
  assert.equal(retryDelayMs(undefined), DEFAULT_RETRY_DELAY_MS);
  assert.equal(retryDelayMs(""), DEFAULT_RETRY_DELAY_MS);
  assert.equal(retryDelayMs("soon"), DEFAULT_RETRY_DELAY_MS);
  assert.equal(retryDelayMs("-1"), DEFAULT_RETRY_DELAY_MS);
  assert.equal(retryDelayMs("1"), 1000);
  assert.equal(retryDelayMs("0"), 0);
  assert.equal(retryDelayMs("30"), MAX_RETRY_DELAY_MS);
  // An HTTP date is a valid Retry-After but not one we read; the default holds.
  assert.equal(retryDelayMs("Wed, 21 Oct 2026 07:28:00 GMT"), DEFAULT_RETRY_DELAY_MS);
});

if (failures.length > 0) {
  console.error(`transientRetry — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`transientRetry — ${passed} passed`);
export {};
