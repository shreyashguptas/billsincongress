/**
 * The congressional calendar (defects D15 and D16).
 *
 * The properties under test are the ones whose absence shipped falsehoods: that
 * an adjourned Congress reads as CLOSED, that the note orders the past tense
 * when it is, that the 3 January handover lands on the right side, and that the
 * note stays inside its prompt budget. Dates and counts below come from the
 * stored data, not from invention.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { calendarNote, congressForDate, congressWindow, isCongressClosed } from "./congressCalendar";

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

/** The note is prompt overhead on every request; the cap is ~90 words. */
const WORD_CAP = 90;
const words = (s: string) => s.trim().split(/\s+/).length;

/** The three Congresses we actually hold bills for, plus the next one. */
it("puts the 117th, 118th, 119th and 120th on their real two-year windows", () => {
  assert.deepEqual(congressWindow(117), {
    congress: 117,
    startDate: "2021-01-03",
    endDate: "2023-01-03",
  });
  assert.deepEqual(congressWindow(118), {
    congress: 118,
    startDate: "2023-01-03",
    endDate: "2025-01-03",
  });
  assert.deepEqual(congressWindow(119), {
    congress: 119,
    startDate: "2025-01-03",
    endDate: "2027-01-03",
  });
  assert.deepEqual(congressWindow(120), {
    congress: 120,
    startDate: "2027-01-03",
    endDate: "2029-01-03",
  });
});

it("makes each window end exactly where the next begins", () => {
  for (const n of [117, 118, 119, 120]) {
    assert.equal(congressWindow(n).endDate, congressWindow(n + 1).startDate);
  }
});

it("agrees with the 1789 convention used across the site", () => {
  // congressStartYear() in lib/congress.ts: 1789 + (n - 1) * 2. Only the YEAR
  // is shared; the day-of-year is this module's business.
  assert.equal(congressWindow(1).startDate.slice(0, 4), "1789");
  assert.equal(congressWindow(119).startDate.slice(0, 4), "2025");
});

it("dates pre-20th-Amendment terms to 4 March, not 3 January", () => {
  // parsePageContext accepts any congress 1-200, so a reader can put the 50th
  // in front of calendarNote. The 50th sat 1887-03-04 to 1889-03-04; the flat
  // "always 3 January" rule would have dated its adjournment two months early
  // and stated that wrong date to the model as fact.
  assert.deepEqual(congressWindow(1), {
    congress: 1,
    startDate: "1789-03-04",
    endDate: "1791-03-04",
  });
  assert.deepEqual(congressWindow(50), {
    congress: 50,
    startDate: "1887-03-04",
    endDate: "1889-03-04",
  });
  // The 73rd straddles the amendment: convened 1933-03-04, cut short 1935-01-03.
  assert.deepEqual(congressWindow(73), {
    congress: 73,
    startDate: "1933-03-04",
    endDate: "1935-01-03",
  });
  assert.deepEqual(congressWindow(74), {
    congress: 74,
    startDate: "1935-01-03",
    endDate: "1937-01-03",
  });
  assert.equal(calendarNote(50, "2026-08-30").includes("1889-03-04"), true);
});

it("puts a pre-1935 date on the right side of the 4 March handover", () => {
  assert.equal(congressForDate("1889-02-01"), 50); // 50th still sitting
  assert.equal(congressForDate("1889-03-04"), 51);
  assert.equal(congressForDate("1933-01-15"), 72); // before the amendment bit
  assert.equal(congressForDate("1933-03-04"), 73);
  assert.equal(congressForDate("1935-01-02"), 73); // shortened term, last day
  assert.equal(congressForDate("1935-01-03"), 74);
});

it("hands the 3 January boundary to the incoming Congress", () => {
  // The stored data has bills on both sides of this date: five 117th bills and
  // eighteen 118th bills carry introducedDate 2023-01-03.
  assert.equal(congressForDate("2025-01-02"), 118);
  assert.equal(congressForDate("2025-01-03"), 119);
  assert.equal(congressForDate("2023-01-02"), 117);
  assert.equal(congressForDate("2023-01-03"), 118);
});

it("reads dates in the middle of both years of a Congress", () => {
  assert.equal(congressForDate("2025-04-24"), 119); // Duty Drawback Clarification Act
  assert.equal(congressForDate("2026-08-27"), 119); // newest introducedDate we hold
  assert.equal(congressForDate("2024-12-31"), 118);
  assert.equal(congressForDate("2021-01-03"), 117); // oldest introducedDate we hold
  assert.equal(congressForDate("2022-06-15"), 117);
});

it("never reads a date through the local-time Date constructor", () => {
  // `new Date("2025-01-03")` is UTC midnight, which is 2 January in every US
  // timezone — the exact off-by-one this boundary cannot afford.
  assert.equal(congressForDate("2025-01-03"), 119);
  assert.equal(congressForDate("2027-01-03"), 120);
});

it("rejects a date that is not ISO rather than guessing a Congress", () => {
  assert.throws(() => congressForDate("Jan 3, 2025"), RangeError);
  assert.throws(() => congressForDate("2025-1-3"), RangeError);
});

it("knows the 118th is closed today and the 119th is not", () => {
  assert.equal(isCongressClosed(118, "2026-08-30"), true);
  assert.equal(isCongressClosed(117, "2026-08-30"), true);
  assert.equal(isCongressClosed(119, "2026-08-30"), false);
});

it("closes a Congress on its adjournment day, not the day after", () => {
  assert.equal(isCongressClosed(118, "2025-01-02"), false);
  assert.equal(isCongressClosed(118, "2025-01-03"), true);
  assert.equal(isCongressClosed(119, "2027-01-03"), true);
});

it("treats a Congress that has not convened as not closed", () => {
  assert.equal(isCongressClosed(120, "2026-08-30"), false);
});

it("tells the model today's date whatever the Congress", () => {
  for (const n of [117, 118, 119, 120]) {
    assert.ok(calendarNote(n, "2026-08-30").includes("2026-08-30"), `${n} omits today`);
  }
});

it("orders the past tense for a Congress that has adjourned", () => {
  // The live failure: "18,229 bills from the 118th, sitting in committee". The
  // 118th holds exactly 18,229 bills at progressStage 40 — all of them dead.
  const note = calendarNote(118, "2026-08-30");
  assert.ok(note.includes("adjourned"), "does not say the Congress adjourned");
  assert.ok(note.includes("2025-01-03"), "does not date the adjournment");
  assert.ok(note.includes("past tense"), "does not order the past tense");
  assert.ok(note.includes("in committee"), "does not resolve 'in committee'");
  for (const banned of ["pending", "waiting", "active"]) {
    assert.ok(note.includes(banned), `does not forbid describing bills as ${banned}`);
  }
  assert.ok(!note.includes("snapshot"), "a finished Congress is not a snapshot");
});

it("does not tell the model that enacted bills died with the Congress", () => {
  // 274 bills from the 118th and 365 from the 117th became law (progressStage
  // 100 in the stored data). An unqualified "every bill in it died" invites the
  // opposite falsehood to D15 — denying laws that exist — so the death clause
  // is scoped to bills unfinished at adjournment.
  const note = calendarNote(118, "2026-08-30");
  assert.ok(
    !/[Ee]very bill in it died/.test(note),
    "claims every bill died, including the 274 that became law",
  );
  assert.ok(note.includes("unfinished"), "does not scope the deaths to unfinished bills");
  assert.ok(note.includes("remain law"), "does not say enacted bills are still law");
});

it("calls the sitting Congress a snapshot that will grow", () => {
  const note = calendarNote(119, "2026-08-30");
  assert.ok(note.includes("snapshot"), "does not call the totals a snapshot");
  assert.ok(note.includes("in progress"), "does not say the Congress is in progress");
  assert.ok(!note.includes("adjourned"), "a sitting Congress has not adjourned");
});

it("does not describe an unconvened Congress as sitting or finished", () => {
  const note = calendarNote(120, "2026-08-30");
  assert.ok(note.includes("not convened"), "does not say it has not convened");
  assert.ok(!note.includes("adjourned"), "an unconvened Congress has not adjourned");
  assert.ok(!note.includes("snapshot"), "an unconvened Congress has no totals to snapshot");
});

it("switches branch on the day the Congress ends", () => {
  assert.ok(calendarNote(118, "2025-01-02").includes("snapshot"));
  assert.ok(calendarNote(118, "2025-01-03").includes("adjourned"));
});

it("keeps every branch inside the prompt word budget", () => {
  for (const [n, asOf] of [
    [118, "2026-08-30"], // closed
    [119, "2026-08-30"], // sitting
    [120, "2026-08-30"], // not yet convened
    [121, "2026-08-30"], // ordinal suffix that is not "th"
  ] as Array<[number, string]>) {
    const count = words(calendarNote(n, asOf));
    assert.ok(count <= WORD_CAP, `congress ${n} note is ${count} words, cap is ${WORD_CAP}`);
  }
});

it("names Congresses with the right ordinal suffix", () => {
  assert.ok(calendarNote(121, "2026-08-30").includes("121st Congress"));
  assert.ok(calendarNote(122, "2026-08-30").includes("122nd Congress"));
  assert.ok(calendarNote(123, "2026-08-30").includes("123rd Congress"));
  assert.ok(calendarNote(119, "2026-08-30").includes("119th Congress"));
});

it("leaves no placeholder or undefined in any note", () => {
  for (const n of [117, 118, 119, 120]) {
    const note = calendarNote(n, "2026-08-30");
    assert.ok(!note.includes("undefined"), `${n}`);
    assert.ok(!note.includes("NaN"), `${n}`);
  }
});

console.log(`\ncatalog/congressCalendar: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
