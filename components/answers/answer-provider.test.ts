/**
 * The `done` frame is an UNTYPED seam, and this test is the only thing watching it.
 *
 * convex/answer.ts writes the frame with `JSON.stringify`; answer-provider.tsx
 * reads it back with `JSON.parse`, so every field arrives as `any`. TypeScript
 * cannot see across that gap: `Boolean(data.askedReader)` compiles perfectly
 * against a server that never sends `askedReader`, and just returns false
 * forever.
 *
 * That is not hypothetical. D31 shipped the `ask_reader` tool and set
 * `askedReader` on the AnswerResult, but nobody added it to `send("done", ...)`,
 * so the clarifying question would have rendered as an ordinary answer — the
 * exact silent-guessing failure D31 exists to end — with a green typecheck.
 * `truncatedByLength` went the same way one commit later.
 *
 * So: every key the server puts on the `done` frame must be read by the client.
 * If a field is added server-side and deliberately not consumed, this test is
 * the place to say so out loud rather than letting it rot unnoticed.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const here = join(__dirname);
const server = readFileSync(join(here, "..", "..", "convex", "answer.ts"), "utf8");
const client = readFileSync(join(here, "answer-provider.tsx"), "utf8");

/**
 * The keys of the object literal passed to `send("done", { ... })`, read out of
 * the source rather than hand-copied — a hand-copied list would drift the same
 * way the client did.
 */
function doneFrameKeys(source: string): string[] {
  const start = source.indexOf('send("done", {');
  assert.notEqual(start, -1, 'convex/answer.ts no longer contains send("done", {');
  const open = source.indexOf("{", start);
  let depth = 0;
  let close = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  assert.notEqual(close, -1, "unbalanced braces in the done payload");
  const body = source.slice(open + 1, close);
  const keys: string[] = [];
  for (const line of body.split("\n")) {
    const match = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(line);
    if (match) keys.push(match[1]);
  }
  return keys;
}

const keys = doneFrameKeys(server);

it("finds a done payload worth checking", () => {
  // A regex that silently matched nothing would make every test below vacuous.
  assert.ok(keys.length >= 8, `only found ${keys.length} keys on the done frame: ${keys}`);
  assert.ok(keys.includes("sources"), `no 'sources' key among ${keys}`);
});

it("reads every field the server puts on the done frame", () => {
  for (const key of keys) {
    assert.ok(
      client.includes(`data.${key}`),
      `convex/answer.ts sends '${key}' on the done frame and ` +
        `components/answers/answer-provider.tsx never reads data.${key}`,
    );
  }
});

it("threads the clarifying-question flag all the way to a Turn", () => {
  // D31's whole front end hangs off this one boolean: the provider must put it
  // ON the turn, not merely glance at it, or answer-thread.tsx has nothing to
  // branch on and the question renders as a stated fact.
  assert.ok(keys.includes("askedReader"), "the done frame no longer carries askedReader");
  assert.match(
    client,
    /askedReader:\s*Boolean\(data\.askedReader\)/,
    "answer-provider.tsx no longer sets askedReader on the finished turn",
  );
});

it("reports the clarifying question and the cut-off answer to analytics", () => {
  // Both props are REQUIRED on analytics.answerReceived. Hard-coding either to
  // a literal would compile and would quietly report a constant.
  assert.match(
    client,
    /asked_reader:\s*Boolean\(data\.askedReader\)/,
    "answer_received no longer reports asked_reader from the wire",
  );
  assert.match(
    client,
    /truncated_by_length:\s*Boolean\(data\.truncatedByLength\)/,
    "answer_received no longer reports truncated_by_length from the wire",
  );
});

console.log(`\nanswers/answer-provider: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
