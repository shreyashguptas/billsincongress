/**
 * Tests for the third-party exception filter.
 *
 * These build a real `$exception` properties payload — `$exception_list` with
 * `{ type, value, stacktrace }` entries — rather than a convenient shape, and
 * pass it through the same function the `before_send` hook calls. That is
 * deliberate: the first version of this filter read `$exception_values`, which
 * does not exist on a browser-side event, so it would have dropped nothing in
 * production while every test passed. Testing the extraction is the point.
 *
 * Every "drops" case is a verbatim message from production in the ten weeks to
 * 26 Aug 2026, with its recorded volume in the comment. Every "keeps" case is
 * a message from the same window that must survive because this codebase could
 * produce it — that group is the one that earns the filter its keep.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { exceptionList, shouldDropException, thirdPartySource } from "./error-filter";

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

/** A captured `$exception` event's properties, shaped as posthog-js sends it. */
function event(value: string, opts: { type?: string; frames?: number } = {}) {
  const frames = opts.frames ?? 3;
  return {
    $exception_level: "error",
    $exception_list: [
      {
        type: opts.type ?? "Error",
        value,
        mechanism: { handled: false, type: "onerror" },
        stacktrace:
          frames > 0
            ? { type: "raw", frames: Array.from({ length: frames }, () => ({ filename: "app.js" })) }
            : { type: "raw", frames: [] },
      },
    ],
  };
}

// The event shape itself

it("reads the list posthog-js actually sends", () => {
  assert.equal(exceptionList(event("boom")).length, 1);
  assert.equal(exceptionList(event("boom"))[0].value, "boom");
});

it("ignores the properties that only exist after ingestion", () => {
  // $exception_values / $exception_types are queryable in HogQL but are not on
  // the browser-side event. Reading them was the bug this test group exists for.
  const ingestedOnly = {
    $exception_values: ["Object Not Found Matching Id:2, MethodName:update, ParamCount:4"],
    $exception_types: ["UnhandledRejection"],
  };
  assert.deepEqual(exceptionList(ingestedOnly), []);
  assert.equal(
    shouldDropException(ingestedOnly),
    false,
    "must not depend on properties the browser never sends",
  );
});

// Drops: verbatim third-party messages from production

it("drops the Outlook link scanner, every id in the family", () => {
  // 142 events across ids 1,2,3,4,5,7,9 — the largest single source.
  for (const id of [1, 2, 3, 4, 5, 7, 9]) {
    const message = `Non-Error promise rejection captured with value: Object Not Found Matching Id:${id}, MethodName:update, ParamCount:4`;
    assert.equal(shouldDropException(event(message, { type: "UnhandledRejection" })), true, `id ${id}`);
  }
  assert.match(
    thirdPartySource(event("Object Not Found Matching Id:2, MethodName:update")) ?? "",
    /Outlook/,
  );
});

it("drops opaque cross-origin errors, which arrive with no frames", () => {
  // 133 events, 104 of them Firefox on iOS.
  assert.equal(shouldDropException(event("Script error.", { frames: 0 })), true);
});

it("drops browser-extension messaging failures", () => {
  assert.equal(
    shouldDropException(event("Invalid call to runtime.sendMessage(). Tab not found.")),
    true,
  );
  assert.equal(shouldDropException(event("feature named `pageContext` was not found")), true);
});

// Keeps: the group that matters

it("keeps a 'Script error.' that came with frames", () => {
  // Without the stack condition this rule would swallow a real error that
  // happened to carry a bare message.
  assert.equal(shouldDropException(event("Script error.", { frames: 4 })), false);
});

it("keeps everything that could be this app's own fault", () => {
  const ours = [
    "Minified React error #418; visit https://react.dev/errors/418?args[]=text&args[]=",
    "SecurityError: The operation is insecure.",
    "Failed to fetch",
    "NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
    "'TypeError' captured as exception with message: 'null is not an object (evaluating 'o.id')'",
    "NetworkError when attempting to fetch resource.",
    "error code: 520",
  ];
  for (const message of ours) {
    assert.equal(shouldDropException(event(message)), false, message.slice(0, 50));
  }
});

it("keeps an unrecognised message rather than guessing", () => {
  assert.equal(shouldDropException(event("Cannot read properties of undefined")), false);
});

// Malformed payloads must never throw inside before_send

it("survives a missing or oddly shaped payload", () => {
  assert.equal(shouldDropException(undefined), false);
  assert.equal(shouldDropException(null), false);
  assert.equal(shouldDropException({}), false);
  assert.equal(shouldDropException({ $exception_list: null }), false);
  assert.equal(shouldDropException({ $exception_list: "not a list" }), false);
  assert.equal(shouldDropException({ $exception_list: [null, 42, {}] }), false);
  assert.equal(shouldDropException({ $exception_list: [{ value: 42 }] }), false);
});

it("handles an entry with no stacktrace at all as having no stack", () => {
  const noStack = {
    $exception_list: [{ type: "Error", value: "Script error." }],
  };
  assert.equal(shouldDropException(noStack), true);
});

it("drops when any exception in a chain matches", () => {
  const chained = {
    $exception_list: [
      { type: "Error", value: "something ordinary", stacktrace: { frames: [{}] } },
      { type: "Error", value: "Object Not Found Matching Id:3, MethodName:update" },
    ],
  };
  assert.equal(shouldDropException(chained), true);
});

if (failures.length) {
  console.error(`\nerrorFilter: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`errorFilter: all ${passed} tests passed`);
