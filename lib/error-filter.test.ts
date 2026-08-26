/**
 * Tests for the third-party exception filter.
 *
 * Every "drops" case below is a verbatim message from production, taken from
 * the ten weeks to 26 Aug 2026 with its recorded volume in the comment. Every
 * "keeps" case is a message from the same window that must survive, because
 * this codebase could produce it.
 *
 * A filter is only as good as what it refuses to drop, so the second group is
 * the one that earns its keep.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { shouldDropException, thirdPartySource } from "./error-filter";

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

const exception = (message: string, hasStack = true) => ({
  values: [message],
  types: ["Error"],
  hasStack,
});

// ── Drops: verbatim third-party messages from production ───────────────────

it("drops the Outlook link scanner, every id in the family", () => {
  // 142 events across ids 1,2,3,4,5,7,9 — the largest single source.
  for (const id of [1, 2, 3, 4, 5, 7, 9]) {
    const m = `Non-Error promise rejection captured with value: Object Not Found Matching Id:${id}, MethodName:update, ParamCount:4`;
    assert.equal(shouldDropException(exception(m)), true, `id ${id}`);
  }
  assert.match(
    thirdPartySource(exception("Object Not Found Matching Id:2, MethodName:update")) ?? "",
    /Outlook/,
  );
});

it("drops opaque cross-origin errors, which carry no stack", () => {
  // 133 events, 104 of them Firefox on iOS.
  assert.equal(shouldDropException(exception("Script error.", false)), true);
});

it("drops browser-extension messaging failures", () => {
  assert.equal(
    shouldDropException(exception("Invalid call to runtime.sendMessage(). Tab not found.")),
    true,
  );
  assert.equal(
    shouldDropException(exception("feature named `pageContext` was not found")),
    true,
  );
});

// ── Keeps: the group that matters ──────────────────────────────────────────

it("keeps a 'Script error.' that came with a stack", () => {
  // Without the stack condition this rule would swallow a real error that
  // happened to carry a bare message.
  assert.equal(shouldDropException(exception("Script error.", true)), false);
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
  for (const m of ours) {
    assert.equal(shouldDropException(exception(m)), false, m.slice(0, 50));
  }
});

it("keeps an unrecognised message rather than guessing", () => {
  assert.equal(shouldDropException(exception("Cannot read properties of undefined")), false);
});

// ── Shape handling ─────────────────────────────────────────────────────────

it("survives a missing or oddly shaped payload", () => {
  assert.equal(shouldDropException({}), false);
  assert.equal(shouldDropException({ values: undefined }), false);
  assert.equal(shouldDropException({ values: [] }), false);
  assert.equal(shouldDropException({ values: [null, 42] as unknown }), false);
});

it("reads a bare string as well as the array form", () => {
  assert.equal(
    shouldDropException({ values: "Object Not Found Matching Id:2, MethodName:update" }),
    true,
  );
});

it("drops when any one of several messages matches", () => {
  assert.equal(
    shouldDropException({
      values: ["something ordinary", "Object Not Found Matching Id:3, MethodName:update"],
    }),
    true,
  );
});

if (failures.length) {
  console.error(`\nerrorFilter: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`errorFilter: all ${passed} tests passed`);
