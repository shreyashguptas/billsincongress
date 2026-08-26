/**
 * Tests for the shared-cache allowlist.
 *
 * The consequence of a wrong answer is asymmetric, so the tests are too. A
 * public page wrongly excluded is slow; a personalised page wrongly included
 * puts one signed-in visitor's HTML in a cache other people read. The second
 * group below is the one that matters.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isPubliclyCacheable } from "./cacheable-routes";

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

// ── Public pages ───────────────────────────────────────────────────────────

it("caches the public pages", () => {
  for (const path of ["/", "/about", "/learn", "/privacy", "/terms"]) {
    assert.equal(isPubliclyCacheable(path), true, path);
  }
});

it("caches the whole bills tree, as it did before", () => {
  for (const path of [
    "/bills",
    "/bills/2s119",
    "/bills/house",
    "/bills/topic/health",
    "/bills/enacted",
  ]) {
    assert.equal(isPubliclyCacheable(path), true, path);
  }
});

// ── The group that matters ─────────────────────────────────────────────────

it("never caches a personalised or auth-flow route", () => {
  for (const path of [
    "/account",
    "/account/settings",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/api/auth/callback",
  ]) {
    assert.equal(isPubliclyCacheable(path), false, path);
  }
});

it("treats any nested api segment as an API route", () => {
  // Preserves the `!pathname.includes("api")` guard this replaced.
  assert.equal(isPubliclyCacheable("/bills/api/whatever"), false);
  assert.equal(isPubliclyCacheable("/api"), false);
});

it("does not let a lookalike path inherit a public prefix", () => {
  // `/billsomething` must not match the `/bills` prefix.
  assert.equal(isPubliclyCacheable("/billsomething"), false);
  assert.equal(isPubliclyCacheable("/accounts-payable"), false);
});

it("normalises trailing slashes and casing", () => {
  assert.equal(isPubliclyCacheable("/learn/"), true);
  assert.equal(isPubliclyCacheable("/Learn"), true);
  assert.equal(isPubliclyCacheable("/Account/"), false);
  assert.equal(isPubliclyCacheable("/ACCOUNT"), false);
});

it("does not cache an unknown route", () => {
  assert.equal(isPubliclyCacheable("/whatever-this-is"), false);
});

// ── The list must not drift from the routes that exist ─────────────────────

it("every page route is a deliberate yes or no, none forgotten", () => {
  // A new route added to app/ without a decision here is the failure mode an
  // allowlist has: it silently loses caching. Fail the build instead, so the
  // choice is made once, on purpose.
  const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
  const routes: string[] = [];

  const walk = (dir: string, urlPath: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // Route groups "(name)" and private folders "_name" add no URL segment.
        if (entry.startsWith("_")) continue;
        const segment = entry.startsWith("(") ? "" : `/${entry}`;
        walk(full, urlPath + segment);
      } else if (entry === "page.tsx") {
        routes.push(urlPath || "/");
      }
    }
  };
  walk(appDir, "");

  // Dynamic segments stand in for a real value so the path shape is realistic.
  const concrete = routes.map((r) =>
    r.replace("[id]", "2s119").replace("[slug]", "health"),
  );

  const KNOWN_PUBLIC = new Set([
    "/",
    "/about",
    "/learn",
    "/privacy",
    "/terms",
  ]);
  const KNOWN_PRIVATE = new Set([
    "/account",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
  ]);

  const undecided = concrete.filter(
    (r) => !KNOWN_PUBLIC.has(r) && !KNOWN_PRIVATE.has(r) && !r.startsWith("/bills"),
  );
  assert.deepEqual(
    undecided,
    [],
    `these routes exist but nobody decided whether they may be cached:\n` +
      undecided.map((r) => `      ${r}`).join("\n") +
      `\n    Add each to PUBLIC_EXACT in lib/cacheable-routes.ts, or to the\n` +
      `    private list in this test if it is personalised.`,
  );

  for (const r of concrete) {
    if (KNOWN_PUBLIC.has(r) || r.startsWith("/bills")) {
      assert.equal(isPubliclyCacheable(r), true, `${r} should be cacheable`);
    } else {
      assert.equal(isPubliclyCacheable(r), false, `${r} must not be cacheable`);
    }
  }
});

if (failures.length) {
  console.error(`\ncacheableRoutes: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`cacheableRoutes: all ${passed} tests passed`);
