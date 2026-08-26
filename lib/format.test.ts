/**
 * Tests for locale-pinned formatting, and a guard against the bug returning.
 *
 * `(17607).toLocaleString()` renders "17,607" on the server (the Worker
 * defaults to en-US) and "17.607" or "17 607" in a pt-BR, de, sv or ru
 * browser. React treats the disagreement as a failed hydration, throws the
 * subtree away and re-renders it. That was the only recurring first-party
 * error the site had.
 *
 * A unit test on `formatCount` alone would not have caught it, because the bug
 * was 23 call sites that never went through a formatter. So the load-bearing
 * test here is the source scan: no rendered code may call `.toLocaleString()`
 * without saying which locale it means.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCount } from "./utils/format";

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

// ── The formatter ──────────────────────────────────────────────────────────

it("groups digits the American way, whatever the runtime default is", () => {
  assert.equal(formatCount(17607), "17,607");
  assert.equal(formatCount(1237), "1,237");
  assert.equal(formatCount(104), "104");
  assert.equal(formatCount(0), "0");
});

it("agrees with an explicitly constructed en-US formatter", () => {
  // If someone drops the pinned locale, this still passes on an en-US CI box —
  // which is exactly why the source scan below exists rather than only this.
  const explicit = new Intl.NumberFormat("en-US");
  for (const n of [0, 7, 104, 1237, 17607, 55484, 1234567]) {
    assert.equal(formatCount(n), explicit.format(n));
  }
});

// ── The guard: no unpinned locale formatting in rendered code ──────────────

/** `.toLocaleString()` with no arguments — the runtime decides, so it varies. */
const UNPINNED = /\.toLocaleString\(\s*\)/g;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNED = ["app", "components", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "_generated"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue; // fixtures live in test files
    out.push(full);
  }
  return out;
}

/**
 * Comments are prose, not code. `format.ts` documents the bug by quoting the
 * broken call, and a scanner that flagged its own explanation would push the
 * next person to delete the explanation.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

export function unpinnedCalls(source: string): number {
  return (stripComments(source).match(UNPINNED) ?? []).length;
}

it("flags an unpinned call, so a clean scan means something", () => {
  assert.equal(unpinnedCalls("<span>{count.toLocaleString()}</span>"), 1);
  assert.equal(unpinnedCalls("{a.toLocaleString()} and {b.toLocaleString()}"), 2);
});

it("accepts a call that names its locale", () => {
  assert.equal(unpinnedCalls("value.toLocaleString('en-US')"), 0);
  assert.equal(unpinnedCalls('value.toLocaleString("en-US", { style: "percent" })'), 0);
});

it("ignores the pattern when it appears in a comment", () => {
  assert.equal(unpinnedCalls("// never write x.toLocaleString() here"), 0);
  assert.equal(unpinnedCalls("/* x.toLocaleString() is the bug */"), 0);
  assert.equal(
    unpinnedCalls("/* x.toLocaleString() is the bug */\nconst s = y.toLocaleString();"),
    1,
    "a comment must not mask a real call on another line",
  );
});

it("no rendered code formats a number without naming a locale", () => {
  const offenders: string[] = [];
  for (const dir of SCANNED) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const n = unpinnedCalls(readFileSync(file, "utf8"));
      if (n > 0) offenders.push(`${relative(ROOT, file)} (${n})`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these call .toLocaleString() with no locale, so the server and a\n` +
      `non-en-US browser will disagree and React will discard the subtree:\n` +
      offenders.map((o) => `      ${o}`).join("\n") +
      `\n    Use formatCount() from @/lib/utils for counts. Times shown to a\n` +
      `    signed-in visitor may pass an explicit \`undefined\` locale — those\n` +
      `    render only after a client fetch, never in server HTML.`,
  );
});

if (failures.length) {
  console.error(`\nformat: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`format: all ${passed} tests passed`);
