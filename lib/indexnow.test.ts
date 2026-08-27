/**
 * Tests for the IndexNow key.
 *
 * The key exists in three places that must agree: this module's constant, the
 * constant in `convex/indexNow.ts` that signs submissions, and the file served
 * at a public URL that proves we control the domain. They are separate because
 * Convex bundles its own directory and cannot import from `lib/`.
 *
 * If any two disagree, every submission returns 403 and nothing on our side
 * says why — the queue drains against a rejected key and the work is lost.
 * That is too quiet a failure to leave to a comment asking people to be
 * careful, so the tests read all three from disk and compare them.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INDEXNOW_HOST, INDEXNOW_KEY, indexNowKeyUrl } from "./indexnow";

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

/** Any file in public/ whose name could be an IndexNow key. */
function keyFiles(): string[] {
  return readdirSync(PUBLIC_DIR).filter((f) => /^[A-Za-z0-9-]{16,128}\.txt$/.test(f));
}

// ── The three copies must agree ────────────────────────────────────────────

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

it("the Convex constant matches this one", () => {
  // Read as text rather than imported: convex/indexNow.ts pulls in the Convex
  // runtime, which does not load under plain tsx.
  const source = readFileSync(join(ROOT, "convex", "indexNow.ts"), "utf8");
  const match = source.match(/export const INDEXNOW_KEY = "([^"]+)"/);
  assert.ok(match, "could not find INDEXNOW_KEY in convex/indexNow.ts");
  assert.equal(
    match![1],
    INDEXNOW_KEY,
    "convex/indexNow.ts signs submissions with a different key than the one being served",
  );
});

it("there is exactly one key file, so a rotated key leaves nothing behind", () => {
  assert.deepEqual(
    keyFiles(),
    [`${INDEXNOW_KEY}.txt`],
    "a rotated key must replace the old file, not sit alongside it — an engine that fetches the stale one rejects everything",
  );
});

// ── The key and URLs must satisfy the protocol ─────────────────────────────

it("the key satisfies the protocol's character and length rules", () => {
  // 8–128 characters of a-z, A-Z, 0-9 and dashes.
  assert.match(INDEXNOW_KEY, /^[A-Za-z0-9-]+$/);
  assert.ok(INDEXNOW_KEY.length >= 8, "too short");
  assert.ok(INDEXNOW_KEY.length <= 128, "too long");
});

it("the key file sits at the root, so it can vouch for every URL", () => {
  // A key at /somewhere/key.txt only validates URLs under /somewhere/. At the
  // root it validates the whole site, which is what a 55,000-page sitemap needs.
  assert.equal(indexNowKeyUrl(), `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`);
  const path = new URL(indexNowKeyUrl()).pathname;
  assert.equal(path.split("/").length, 2, `key must be at the root, got ${path}`);
});

it("the key file is on the same host as the pages it vouches for", () => {
  // A keyLocation on another host is rejected with 422.
  assert.equal(new URL(indexNowKeyUrl()).host, INDEXNOW_HOST);
});

// ── The key must not be mistaken for a secret, or vice versa ───────────────

it("the key is documented as published rather than secret", () => {
  // A 32-character hex string in a committed file is exactly what a secret
  // scanner is built to stop. If the explanation is ever deleted, the next
  // person to run a security audit has no way to tell this apart from a leak.
  const source = readFileSync(join(ROOT, "lib", "indexnow.ts"), "utf8");
  assert.match(source, /not a credential/i);
  assert.match(source, /public URL/i);
});

if (failures.length) {
  console.error(`\nindexNow: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`indexNow: all ${passed} tests passed`);
