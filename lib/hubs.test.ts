/**
 * Unit tests for the hub taxonomy.
 *
 * The load-bearing property is the last one: chamber and status hubs live at
 * `/bills/<slug>`, which is the same namespace as individual bill pages at
 * `/bills/<billId>`. If a slug could ever look like a bill id, a hub would
 * shadow a real bill page (or vice versa) and the failure would be a silently
 * wrong page rather than an error.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import {
  ALL_HUBS,
  RESERVED_BILL_SLUGS,
  TOPIC_HUBS,
  hubByPath,
  hubsOfKind,
  policyAreaFromSlug,
  topicSlug,
} from "./hubs";
import { POLICY_AREAS } from "./constants/filters";

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

// --- slugs ----------------------------------------------------------------

it("slugifies the awkward policy area names", () => {
  assert.equal(topicSlug("Health"), "health");
  assert.equal(topicSlug("Arts, Culture, Religion"), "arts-culture-religion");
  assert.equal(
    topicSlug("Science, Technology, Communications"),
    "science-technology-communications",
  );
  assert.equal(
    topicSlug("Civil Rights and Liberties, Minority Issues"),
    "civil-rights-and-liberties-minority-issues",
  );
});

it("never produces a leading, trailing or doubled dash", () => {
  for (const area of POLICY_AREAS) {
    const slug = topicSlug(area);
    assert.ok(!slug.startsWith("-"), `${area} -> ${slug}`);
    assert.ok(!slug.endsWith("-"), `${area} -> ${slug}`);
    assert.ok(!slug.includes("--"), `${area} -> ${slug}`);
    assert.ok(slug.length > 0, `${area} produced an empty slug`);
  }
});

it("round-trips every policy area through its slug", () => {
  for (const area of POLICY_AREAS) {
    assert.equal(policyAreaFromSlug(topicSlug(area)), area);
  }
});

it("returns null for a slug that names no policy area", () => {
  for (const slug of ["", "not-a-topic", "health-", "HEALTH", "9631hr119"]) {
    assert.equal(policyAreaFromSlug(slug), null, `unexpected match for ${slug}`);
  }
});

it("gives every policy area a distinct slug", () => {
  const slugs = POLICY_AREAS.map(topicSlug);
  assert.equal(new Set(slugs).size, slugs.length, "two policy areas collide");
});

// --- the collision property ----------------------------------------------

/** Mirrors the stored `billId` format: number, then type letters, then congress. */
const BILL_ID = /^\d+[a-z]+\d+$/;

it("no hub slug can be mistaken for a bill id", () => {
  // A bill id always starts with a digit; a slug never does. If this ever
  // fails, a hub page and a bill page are fighting over the same URL.
  for (const slug of RESERVED_BILL_SLUGS) {
    assert.ok(
      !BILL_ID.test(slug),
      `${slug} matches the bill id shape and would shadow a bill page`,
    );
    assert.ok(/^[a-z]/.test(slug), `${slug} should start with a letter`);
  }
});

it("recognises real bill ids as bill ids, so the guard above means something", () => {
  // Guards the guard: if BILL_ID stopped matching real ids, the test above
  // would pass vacuously.
  for (const id of ["9631hr119", "1hr119", "142hjres119", "5202s119"]) {
    assert.ok(BILL_ID.test(id), `${id} should look like a bill id`);
  }
});

// --- the hub set ----------------------------------------------------------

it("has a unique path for every hub", () => {
  const paths = ALL_HUBS.map((h) => h.path);
  assert.equal(new Set(paths).size, paths.length, "duplicate hub path");
});

it("finds hubs by path and returns null otherwise", () => {
  assert.equal(hubByPath("/bills/house")?.kind, "chamber");
  assert.equal(hubByPath("/bills/enacted")?.kind, "status");
  assert.equal(hubByPath("/bills/nope"), null);
});

it("has two chambers, five statuses and one topic per policy area", () => {
  assert.equal(hubsOfKind("chamber").length, 2);
  assert.equal(hubsOfKind("status").length, 5);
  assert.equal(TOPIC_HUBS.length, POLICY_AREAS.length);
});

it("omits the progress stages that are empty in every congress", () => {
  // 80 (passed both), 90 (to President) and 95 (signed) measured 0 across
  // c117-c119; a page for them would be permanently blank.
  const stages = hubsOfKind("status").map((h) => h.filter.progressStage);
  for (const empty of ["80", "90", "95"]) {
    assert.ok(!stages.includes(empty), `stage ${empty} should have no hub`);
  }
});

it("gives every hub a heading, both meta fields and a real explainer", () => {
  for (const hub of ALL_HUBS) {
    assert.ok(hub.heading.length > 0, `${hub.path} has no heading`);
    assert.ok(hub.metaTitle.length > 0, `${hub.path} has no metaTitle`);
    assert.ok(
      hub.metaDescription.length >= 50,
      `${hub.path} description too short to be useful`,
    );
    // The explainer is what stops a hub being a doorway page. A stub would
    // defeat the entire point, so require real prose.
    assert.ok(
      hub.explainer.length >= 120,
      `${hub.path} explainer is a stub (${hub.explainer.length} chars)`,
    );
  }
});

it("gives every hub exactly one filter dimension", () => {
  for (const hub of ALL_HUBS) {
    const set = Object.values(hub.filter).filter((v) => v !== undefined);
    assert.equal(set.length, 1, `${hub.path} filters on ${set.length} things`);
  }
});

if (failures.length > 0) {
  console.error(`\nhubs: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`hubs: all ${passed} tests passed`);
