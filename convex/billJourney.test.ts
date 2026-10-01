/**
 * Unit tests for the bill journey: the stage dates and moments drawn on a bill
 * page. Fixtures are real action texts from Congress.gov.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework; the
 * file is excluded from Convex bundling because its name ends in `.test.ts`.
 */
import assert from "node:assert/strict";
import { buildJourney, committeeName, parseTally, type JourneyAction } from "./billJourney";
import { BillStages } from "./billStage";

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

const act = (actionDate: string, text: string, extra: Partial<JourneyAction> = {}): JourneyAction => ({
  actionDate,
  text,
  ...extra,
});

// S. 1071 (119th), the NDAA for FY2026, abridged. Its House passage reads
// "Passed House", which the stage calculator recognises.
const ndaa: JourneyAction[] = [
  act("2025-03-14", "Read twice and referred to the Committee on Veterans' Affairs."),
  act("2025-08-01", "Passed Senate without amendment by Unanimous Consent."),
  act("2025-12-10", "On passage Passed by the Yeas and Nays: 312 - 112 (Roll no. 343)."),
  act("2025-12-10", "Passed House with an amendment."),
  act("2025-12-18", "Presented to President."),
  act("2025-12-18", "Signed by President."),
  act("2025-12-18", "Became Public Law No: 119-60."),
  // Paperwork after the signing is not part of the road.
  act("2026-02-11", "Reported by the Committee on Armed Services. H. Rept. 119-400."),
];

it("dates every stage the bill reached, from its own actions", () => {
  const j = buildJourney(ndaa, "2025-03-14");
  assert.deepEqual(j.steps, [
    { stage: BillStages.INTRODUCED, date: "2025-03-14" },
    { stage: BillStages.IN_COMMITTEE, date: "2025-03-14" },
    { stage: BillStages.PASSED_ONE_CHAMBER, date: "2025-08-01" },
    { stage: BillStages.PASSED_BOTH_CHAMBERS, date: "2025-12-10" },
    { stage: BillStages.BECAME_LAW, date: "2025-12-18" },
  ]);
  assert.equal(j.finalStage, BillStages.BECAME_LAW);
  assert.equal(j.actionCount, ndaa.length);
});

it("takes each chamber's tally from the same day's roll call", () => {
  const j = buildJourney(ndaa, "2025-03-14");
  const house = j.events.find((e) => e.kind === "passed" && e.chamber === "house");
  assert.equal(house?.yeas, 312);
  assert.equal(house?.nays, 112);
  const senate = j.events.find((e) => e.kind === "passed" && e.chamber === "senate");
  assert.equal(senate?.how, "unanimous consent");
  assert.equal(senate?.yeas, undefined);
});

it("names the public law and the committee in the reader's words", () => {
  const j = buildJourney(ndaa, "2025-03-14");
  assert.equal(j.events.find((e) => e.kind === "became_law")?.label, "Became Public Law 119-60");
  assert.equal(
    j.events.find((e) => e.kind === "referred")?.label,
    "Sent to the Committee on Veterans' Affairs",
  );
});

it("records a committee's recorded vote", () => {
  const j = buildJourney(
    [
      act("2025-03-31", "Referred to the Committee on Energy and Commerce, and in addition to the Committees on Education and Workforce, for a period to be subsequently determined by the Speaker."),
      act("2025-04-29", "Ordered to be Reported (Amended) by the Yeas and Nays: 36 - 13."),
      act("2025-04-29", "Committee Consideration and Mark-up Session Held"),
    ],
    "2025-03-31",
  );
  const vote = j.events.find((e) => e.kind === "committee_vote");
  assert.equal(vote?.yeas, 36);
  assert.equal(vote?.nays, 13);
  assert.equal(
    j.events.find((e) => e.kind === "referred")?.label,
    "Sent to the Committee on Energy and Commerce and others",
  );
});

it("a bill with no actions is introduced and nothing else", () => {
  const j = buildJourney([], "2026-09-29");
  assert.deepEqual(j.steps, [{ stage: BillStages.INTRODUCED, date: "2026-09-29" }]);
  assert.deepEqual(j.events.map((e) => e.kind), ["introduced"]);
});

it("a veto is a veto, never a signing", () => {
  const j = buildJourney(
    [
      act("2025-05-01", "Referred to the Committee on Natural Resources."),
      act("2025-07-01", "Passed House by voice vote."),
      act("2025-09-01", "Passed Senate without amendment by Unanimous Consent."),
      act("2025-09-10", "Presented to President."),
      act("2025-09-20", "Vetoed by President."),
    ],
    "2025-05-01",
  );
  assert.equal(j.finalStage, BillStages.VETOED);
  assert.equal(j.steps[j.steps.length - 1].stage, BillStages.VETOED);
  assert.ok(!j.events.some((e) => e.kind === "signed"));
  assert.equal(j.events.find((e) => e.kind === "passed" && e.chamber === "house")?.how, "voice vote");
});

it("parses tallies in every wording Congress.gov uses", () => {
  assert.deepEqual(parseTally("On passage Passed by the Yeas and Nays: 366 - 57 (Roll no. 151)."), { yeas: 366, nays: 57 });
  assert.deepEqual(parseTally("Passed Senate with an amendment by Yea-Nay Vote. 68 - 30. Record Vote Number: 172."), { yeas: 68, nays: 30 });
  assert.deepEqual(parseTally("On passage Passed by recorded vote: 218 - 214 (Roll no. 145)."), { yeas: 218, nays: 214 });
  assert.deepEqual(
    parseTally("On motion to suspend the rules and pass the bill, as amended Agreed to by the Yeas and Nays: (2/3 required): 366 - 57 (Roll no. 151)."),
    { yeas: 366, nays: 57 },
  );
  assert.equal(parseTally("Passed Senate without amendment by Unanimous Consent."), null);
});

it("keeps commas inside a committee's name", () => {
  assert.equal(
    committeeName("Received in the Senate and Read twice and referred to the Committee on Health, Education, Labor, and Pensions."),
    "Health, Education, Labor, and Pensions",
  );
  assert.equal(committeeName("Referred to the Committee on the Judiciary."), "the Judiciary");
});

it("a House suspension vote keeps its tally", () => {
  const j = buildJourney(
    [
      act("2025-03-31", "Referred to the Committee on Energy and Commerce."),
      act("2025-06-04", "On agreeing to the Pettersen amendment Agreed to by voice vote."),
      act("2025-06-04", "On motion to suspend the rules and pass the bill, as amended Agreed to by the Yeas and Nays: (2/3 required): 366 - 57 (Roll no. 151)."),
      act("2025-06-04", "Passed House by the Yeas and Nays: (2/3 required): 366 - 57."),
    ],
    "2025-03-31",
  );
  const house = j.events.find((e) => e.kind === "passed" && e.chamber === "house");
  assert.equal(house?.yeas, 366);
  assert.equal(house?.nays, 57);
  assert.equal(house?.how, undefined);
});

it("how a bill passed comes from the passage, not a same-day discharge", () => {
  const j = buildJourney(
    [
      act("2025-09-18", "Senate Committee on Finance discharged by Unanimous Consent."),
      act("2025-09-18", "Passed Senate with an amendment by Voice Vote."),
    ],
    "2025-03-01",
  );
  assert.equal(j.events.find((e) => e.kind === "passed")?.how, "voice vote");
});

it("a resolution is agreed to, not passed", () => {
  const j = buildJourney(
    [act("2026-09-10", "Passed Senate without amendment by Unanimous Consent.")],
    "2026-09-08",
    "sconres",
  );
  assert.equal(j.events.find((e) => e.kind === "passed")?.label, "Agreed to in the Senate");
});

if (failures.length) {
  console.error(`billJourney: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`billJourney: ${passed} passed`);
