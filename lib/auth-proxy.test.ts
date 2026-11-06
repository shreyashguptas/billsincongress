/**
 * Tests for passing Google sign-in through billsincongress.com.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { middlewareShouldHandleCode, oauthCookieHeader, oauthUpstreamPath } from "./auth-proxy";

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

it("the sign-in start and return pages are passed through", () => {
  assert.deepEqual(oauthUpstreamPath("/api/auth/signin/google"), {
    path: "/api/auth/signin/google",
    provider: "google",
  });
  assert.deepEqual(oauthUpstreamPath("/api/auth/callback/google/"), {
    path: "/api/auth/callback/google",
    provider: "google",
  });
});

it("nothing else under /api/auth reaches Convex", () => {
  for (const path of [
    "/api/auth",
    "/api/auth/",
    "/api/auth/signin",
    "/api/auth/signout/google",
    "/api/auth/callback/google/extra",
    "/api/auth/callback/..",
    "/api/auth/callback/%2e%2e",
    "/api/auth/.well-known/jwks.json",
  ]) {
    assert.equal(oauthUpstreamPath(path), null, path);
  }
});

it("only the provider's own sign-in cookies are forwarded", () => {
  const header =
    "__Host-googleOAuthstate=s; __convexAuthJWT=jwt; __Host-googleOAuthpkce=p; " +
    "__convexAuthRefreshToken=r; ph_phc_x_posthog=%7B%7D; __Host-googleRedirectTo=%2Fbills";
  assert.equal(
    oauthCookieHeader("google", header),
    "__Host-googleOAuthstate=s; __Host-googleOAuthpkce=p; __Host-googleRedirectTo=%2Fbills",
  );
});

it("a localhost backend's unprefixed cookies are forwarded too", () => {
  assert.equal(oauthCookieHeader("google", "googleOAuthstate=s; other=1"), "googleOAuthstate=s");
});

it("no cookies, or none of the provider's, sends no cookie header", () => {
  assert.equal(oauthCookieHeader("google", null), null);
  assert.equal(oauthCookieHeader("google", "__convexAuthJWT=jwt"), null);
});

// The reader got this: Google sends them back to /api/auth/callback/google?code=…,
// the middleware takes Google's code for one of ours, fails to swap it, and
// redirects them with the code stripped, so the sign-in never finishes.
it("the middleware leaves the code on the OAuth pages alone", () => {
  assert.equal(middlewareShouldHandleCode("/api/auth/callback/google"), false);
  assert.equal(middlewareShouldHandleCode("/api/auth/signin/google"), false);
});

it("the middleware still swaps the code on the page a sign-in returns to", () => {
  assert.equal(middlewareShouldHandleCode("/"), true);
  assert.equal(middlewareShouldHandleCode("/account"), true);
});

it("the middleware is wired to that check", () => {
  const source = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.ok(
    /shouldHandleCode:\s*\(request\)\s*=>\s*middlewareShouldHandleCode\(request\.nextUrl\.pathname\)/.test(source),
    "middleware.ts no longer passes middlewareShouldHandleCode as shouldHandleCode",
  );
});

if (failures.length) {
  console.error(`\nauthProxy: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`authProxy: all ${passed} tests passed`);
