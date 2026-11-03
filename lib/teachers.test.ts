/**
 * The teacher sign-up test's pure rules: which visits count as coming from a
 * school site, where the line shows, and what the form accepts.
 * node:assert, no framework. Run via `pnpm test`.
 */
import assert from "node:assert/strict";
import {
  bannerAllowedOn,
  isPlausibleEmail,
  normalizeEmail,
  schoolSiteFor,
  signupSourceFrom,
} from "./teachers";

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

it("the school platforms that sent classes here are recognised", () => {
  assert.equal(schoolSiteFor("https://classroom.google.com/"), "google_classroom");
  assert.equal(schoolSiteFor("https://sdhc.instructure.com/courses/123"), "canvas");
  assert.equal(schoolSiteFor("https://teams.microsoft.com/"), "teams");
  assert.equal(schoolSiteFor("https://teams.live.com/v2/"), "teams");
  assert.equal(schoolSiteFor("https://app.schoology.com/course/1"), "schoology");
});

it("an ordinary site never counts, whatever its path or query says", () => {
  assert.equal(schoolSiteFor("https://www.bing.com/search?q=classroom.google.com"), null);
  assert.equal(schoolSiteFor("https://instructure.com.evil.example/"), null);
  assert.equal(schoolSiteFor("https://notinstructure.com/"), null);
  assert.equal(schoolSiteFor("https://docs.google.com/"), null);
  assert.equal(schoolSiteFor(""), null);
  assert.equal(schoolSiteFor(null), null);
  assert.equal(schoolSiteFor("not a url"), null);
});

it("the line stays off the teachers page and pages a reader came to finish", () => {
  for (const path of ["/teachers", "/sign-in", "/sign-up", "/account", "/pro", "/alerts/unsubscribe"]) {
    assert.equal(bannerAllowedOn(path), false, path);
  }
  for (const path of ["/", "/learn", "/bills", "/bills/119-hr-10803", "/members/A000001"]) {
    assert.equal(bannerAllowedOn(path), true, path);
  }
});

it("an email is trimmed and lower-cased, and must look like an address", () => {
  assert.equal(normalizeEmail("  Teacher@School.ORG "), "teacher@school.org");
  assert.equal(isPlausibleEmail("teacher@school.org"), true);
  for (const bad of ["", "teacher", "teacher@school", "@school.org", "a b@school.org", `${"a".repeat(250)}@x.org`]) {
    assert.equal(isPlausibleEmail(bad), false, bad);
  }
});

it("?from= is read only for the known ways in", () => {
  assert.equal(signupSourceFrom("email"), "email");
  assert.equal(signupSourceFrom("banner"), "banner");
  assert.equal(signupSourceFrom("footer"), "footer");
  assert.equal(signupSourceFrom("twitter"), "direct");
  assert.equal(signupSourceFrom(null), "direct");
});

if (failures.length > 0) {
  console.error(`teachers: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`teachers: ${passed} passed`);
