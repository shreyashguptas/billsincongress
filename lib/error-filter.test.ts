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
 * Every "drops" case is a verbatim message from production — the ten weeks to
 * 26 Aug 2026, plus the 30 days to 1 Oct 2026 for the wallet and in-app-browser
 * rules — with its recorded volume in the comment. Every "keeps" case is
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

it("drops the browser's benign ResizeObserver notice, which arrives with no frames", () => {
  // 3 events, 1 visitor, one 5-minute session on 2026-09-01, Edge on Windows.
  // The browser engine raises this itself and carries on with the next frame.
  assert.equal(
    shouldDropException(
      event("ResizeObserver loop completed with undelivered notifications.", { frames: 0 }),
    ),
    true,
  );
});

it("drops the ResizeObserver notice regardless of surrounding whitespace", () => {
  // The rule trims, as the 'Script error.' rule does. Without that this reads
  // as a different message and the notice returns to the error column, which
  // is the one failure mode a filter must not have: quiet and invisible.
  assert.equal(
    shouldDropException(
      event("  ResizeObserver loop completed with undelivered notifications. ", { frames: 0 }),
    ),
    true,
  );
});

it("drops the crypto-wallet script a browser injects, even though it carries a frame", () => {
  // 9 events, 1 visitor, one session on 2026-09-30, Brave on iOS. WebKit
  // attributes the injected script to the page ("global code", line 1), so the
  // event has one frame — the rule must not depend on a missing stack.
  const message = "undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')";
  assert.equal(shouldDropException(event(message, { type: "TypeError", frames: 1 })), true);
  assert.match(thirdPartySource(event(message, { type: "TypeError", frames: 1 })) ?? "", /wallet/);
});

it("drops Facebook's Android in-app browser losing its Java bridge", () => {
  // 1 event on 2026-09-26, FB_IAB user agent, every frame in
  // iabjs://navigation_performance_logger_android.
  assert.equal(
    shouldDropException(event("Error invoking postMessage: Java object is gone", { frames: 3 })),
    true,
  );
});

// Keeps: the group that matters

it("keeps a failed property write that does not name window.ethereum", () => {
  // The wallet rule matches the quoted expression, not the shape of the error.
  // The same mistake in this app's own code reads like these and must survive.
  const ours = [
    "undefined is not an object (evaluating 'e.selectedAddress = undefined')",
    "Cannot set properties of undefined (setting 'selectedAddress')",
    "undefined is not an object (evaluating 'window.posthog.capture')",
  ];
  for (const message of ours) {
    assert.equal(shouldDropException(event(message, { type: "TypeError" })), false, message);
  }
});

it("keeps postMessage failures that are not the Android Java bridge", () => {
  assert.equal(
    shouldDropException(
      event("Failed to execute 'postMessage' on 'Window': The target origin provided ('null') does not match the recipient window's origin ('https://billsincongress.com')."),
    ),
    false,
  );
});

it("keeps React's removeChild failure, even with the frames a translator would leave", () => {
  // 9 events, 3 visitors, 28-30 Sep 2026 — one Edge/zh-CN (likely
  // auto-translate), two en-US on ChromeOS. Every frame is React DOM inside our
  // bundle and all 9 came through the error boundaries, so each was a reader
  // looking at the error screen. Nothing on the event separates a translator
  // from a bug of ours, so it stays. See the note under RULES in error-filter.ts.
  const message =
    "NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.";
  assert.equal(shouldDropException(event(message, { type: "DOMException", frames: 10 })), false);
  assert.equal(shouldDropException(event(message, { type: "DOMException", frames: 0 })), false);
});

it("keeps a ReferenceError on a short global, even from the Bing app", () => {
  // 1 event, 2026-09-18, BingSapphire user agent. Probably Bing's script, but
  // not a signature only a third party can produce.
  assert.equal(shouldDropException(event("Can't find variable: _G", { type: "ReferenceError", frames: 1 })), false);
});

it("keeps a 'Script error.' that came with frames", () => {
  // Without the stack condition this rule would swallow a real error that
  // happened to carry a bare message.
  assert.equal(shouldDropException(event("Script error.", { frames: 4 })), false);
});

it("keeps a ResizeObserver error that came with frames", () => {
  // The no-stack condition guards the same way it does for 'Script error.'.
  assert.equal(
    shouldDropException(
      event("ResizeObserver loop completed with undelivered notifications.", { frames: 4 }),
    ),
    false,
  );
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
