/**
 * Tests for the IndexNow key.
 *
 * The key exists in two places that must agree: the constant in
 * `convex/indexNow.ts` that signs submissions, and the file served at a public
 * URL that proves we control the domain.
 *
 * If they disagree, every submission returns 403 and nothing on our side says
 * why — the queue drains against a rejected key and the work is lost. That is
 * too quiet a failure to leave to a comment asking people to be careful, so the
 * tests read both from disk and compare them. (A third copy in `lib/indexnow.ts`
 * existed only to be compared here; it was removed on 2026-10-01.)
 *
 * The Convex module is read as text rather than imported: it pulls in the
 * Convex runtime, which does not load under plain tsx.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");
const CONVEX_SOURCE = readFileSync(join(ROOT, "convex", "indexNow.ts"), "utf8");

/** A string constant declared in convex/indexNow.ts. */
function convexConstant(pattern: RegExp, name: string): string {
  const match = CONVEX_SOURCE.match(pattern);
  if (!match) throw new Error(`could not find ${name} in convex/indexNow.ts`);
  return match[1];
}

const INDEXNOW_KEY = convexConstant(/export const INDEXNOW_KEY = "([^"]+)"/, "INDEXNOW_KEY");
const INDEXNOW_HOST = convexConstant(/const INDEXNOW_HOST = "([^"]+)"/, "INDEXNOW_HOST");
/** The keyLocation sent with every submission, resolved from its template. */
const INDEXNOW_KEY_LOCATION = convexConstant(
  /const INDEXNOW_KEY_LOCATION = `([^`]+)`/,
  "INDEXNOW_KEY_LOCATION",
)
  .replace("${INDEXNOW_HOST}", INDEXNOW_HOST)
  .replace("${INDEXNOW_KEY}", INDEXNOW_KEY);

/** Any file in public/ whose name could be an IndexNow key. */
function keyFiles(): string[] {
  return readdirSync(PUBLIC_DIR).filter((f) => /^[A-Za-z0-9-]{16,128}\.txt$/.test(f));
}

// The constant and the served file must agree

it("the served file is named for the key", () => {
  assert.ok(
    keyFiles().includes(`${INDEXNOW_KEY}.txt`),
    `expected public/${INDEXNOW_KEY}.txt; found: ${keyFiles().join(", ") || "no key-shaped files"}`,
  );
});

it("the served file contains the key and nothing else", () => {
  const contents = readFileSync(join(PUBLIC_DIR, `${INDEXNOW_KEY}.txt`), "utf8");
  assert.equal(
    contents,
    INDEXNOW_KEY,
    "the file must be exactly the key — a trailing newline is enough for an engine to reject it",
  );
});

it("there is exactly one key file, so a rotated key leaves nothing behind", () => {
  assert.deepEqual(
    keyFiles(),
    [`${INDEXNOW_KEY}.txt`],
    "a rotated key must replace the old file, not sit alongside it — an engine that fetches the stale one rejects everything",
  );
});

// The key and URLs must satisfy the protocol

it("the key satisfies the protocol's character and length rules", () => {
  // 8–128 characters of a-z, A-Z, 0-9 and dashes.
  assert.match(INDEXNOW_KEY, /^[A-Za-z0-9-]+$/);
  assert.ok(INDEXNOW_KEY.length >= 8, "too short");
  assert.ok(INDEXNOW_KEY.length <= 128, "too long");
});

it("the key file sits at the root, so it can vouch for every URL", () => {
  // A key at /somewhere/key.txt only validates URLs under /somewhere/. At the
  // root it validates the whole site, which is what a 55,000-page sitemap needs.
  assert.equal(INDEXNOW_KEY_LOCATION, `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`);
  const path = new URL(INDEXNOW_KEY_LOCATION).pathname;
  assert.equal(path.split("/").length, 2, `key must be at the root, got ${path}`);
});

it("the key file is on the same host as the pages it vouches for", () => {
  // A keyLocation on another host is rejected with 422.
  assert.equal(new URL(INDEXNOW_KEY_LOCATION).host, INDEXNOW_HOST);
});

// The key must not be mistaken for a secret, or vice versa

it("the key is documented as published rather than secret", () => {
  // A 32-character hex string in a committed file is exactly what a secret
  // scanner is built to stop. If the explanation is ever deleted, the next
  // person to run a security audit has no way to tell this apart from a leak.
  assert.match(CONVEX_SOURCE, /not a credential/i);
  assert.match(CONVEX_SOURCE, /public URL/i);
});

if (failures.length) {
  console.error(`\nindexNow: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`indexNow: all ${passed} tests passed`);
