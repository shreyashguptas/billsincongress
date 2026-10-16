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
  billHubs,
  ALL_HUBS,
  RESERVED_BILL_SLUGS,
  TOPIC_HUBS,
  hubByPath,
  hubDateLabel,
  hubHref,
  hubSortScope,
  hubsOfKind,
  parseHubOrder,
  policyAreaFromSlug,
  topicSlug,
} from "./hubs";
import { POLICY_AREAS } from "./constants/filters";
import { DESCRIPTION_MIN, SEO_TITLE_MAX } from "./seo";

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

it("has two chambers, seven statuses and one topic per policy area", () => {
  assert.equal(hubsOfKind("chamber").length, 2);
  assert.equal(hubsOfKind("status").length, 7);
  assert.equal(TOPIC_HUBS.length, POLICY_AREAS.length);
});

it("has a page for the bills nearest to becoming law", () => {
  // 80 (passed both chambers) and 90 (on the President's desk) were left out on
  // a 2026-08-29 measurement that they were empty; on 2026-10-14 the 119th held
  // 52 and 3. Only 95 (signed, not yet numbered), a gap of a day or two, has none.
  const stages = hubsOfKind("status").map((h) => h.filter.progressStage);
  for (const stage of ["80", "90"]) assert.ok(stages.includes(stage), `stage ${stage} has no hub`);
  assert.ok(!stages.includes("95"));
});

it("states no count in a stage explainer, because counts change daily", () => {
  for (const hub of hubsOfKind("status")) {
    assert.doesNotMatch(hub.explainer, /\d{2,}[,\d]*/, `${hub.path} states a number`);
  }
});

it("gives every hub a heading, both meta fields and a real explainer", () => {
  for (const hub of ALL_HUBS) {
    assert.ok(hub.heading.length > 0, `${hub.path} has no heading`);
    assert.ok(hub.metaTitle.length > 0, `${hub.path} has no metaTitle`);
    // Bing Webmaster Tools flagged hub titles up to 106 characters "Title too
    // long" and short descriptions "too short" (Oct 2026).
    assert.ok(
      hub.metaTitle.length <= SEO_TITLE_MAX,
      `${hub.path} title is ${hub.metaTitle.length} chars, over ${SEO_TITLE_MAX}`,
    );
    assert.ok(
      hub.metaDescription.length >= DESCRIPTION_MIN && hub.metaDescription.length <= 160,
      `${hub.path} description is ${hub.metaDescription.length} chars, outside ${DESCRIPTION_MIN}–160`,
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

// --- order ----------------------------------------------------------------

it("reads ?sort=oldest and treats anything else as newest first", () => {
  assert.equal(parseHubOrder("oldest"), "oldest");
  assert.equal(parseHubOrder(["oldest", "newest"]), "oldest");
  assert.equal(parseHubOrder(undefined), "newest");
  assert.equal(parseHubOrder("newest"), "newest");
  assert.equal(parseHubOrder("random"), "newest");
});

it("builds hub URLs with no parameters for the defaults", () => {
  const hub = hubByPath("/bills/enacted")!;
  assert.equal(hubHref(hub, {}), "/bills/enacted");
  assert.equal(hubHref(hub, { page: 1, order: "newest" }), "/bills/enacted");
  assert.equal(hubHref(hub, { page: 2 }), "/bills/enacted?page=2");
  assert.equal(hubHref(hub, { order: "oldest" }), "/bills/enacted?sort=oldest");
  assert.equal(hubHref(hub, { page: 3, order: "oldest" }), "/bills/enacted?sort=oldest&page=3");
});

it("gives every hub a sort scope listSorted can serve", () => {
  for (const hub of ALL_HUBS) {
    const scope = hubSortScope(hub);
    if (hub.kind === "status") assert.equal(scope.kind, "stage", hub.path);
    if (hub.kind === "topic") assert.equal(scope.kind, "topic", hub.path);
    if (hub.kind === "chamber") assert.equal(scope.kind, "chamber", hub.path);
    if (scope.kind === "stage") assert.ok(Number.isInteger(scope.progressStage), hub.path);
  }
});

it("labels every stage hub's date with what it is", () => {
  for (const hub of hubsOfKind("status")) {
    assert.notEqual(hubDateLabel(hub, "stageDate"), "Reached this stage", `${hub.path} has no label`);
  }
  assert.equal(hubDateLabel(hubByPath("/bills/enacted")!, "stageDate"), "Became law");
  assert.equal(hubDateLabel(hubByPath("/bills/house")!, "latestActionDate"), "Latest action");
});

it("links a bill to its topic, stage and chamber pages, and a resolution to no stage page", () => {
  const paths = (billType: string, stage: number, policyArea: string | null) =>
    billHubs({ billType, stage, policyArea }).map((h) => h.path);
  assert.deepEqual(paths("hr", 60, "Energy"), ["/bills/topic/energy", "/bills/passed-one-chamber", "/bills/house"]);
  // S.Res. 156 (119th), agreed to by the Senate: "Bills that passed one
  // chamber" would read as half-way to law.
  assert.deepEqual(paths("sres", 60, "Native Americans"), ["/bills/topic/native-americans", "/bills/senate"]);
  assert.deepEqual(paths("hconres", 80, null), ["/bills/house"]);
  // Stage 50 has no hub; no topic yet means no topic link.
  assert.deepEqual(paths("s", 50, null), ["/bills/senate"]);
});

if (failures.length > 0) {
  console.error(`\nhubs: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`hubs: all ${passed} tests passed`);
