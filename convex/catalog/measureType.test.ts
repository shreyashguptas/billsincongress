/**
 * Measure-type classification (defect D14). The eight types are fixed by
 * congressional practice, so these tests are mostly a table: every type through
 * every predicate, because a single wrong cell here becomes a confident wrong
 * sentence about what became law.
 *
 * The mix note is checked against the REAL 119th Congress split counted from
 * .truth-cache/bills.jsonl, not invented numbers.
 */
import assert from "node:assert/strict";
import { canBecomeLaw, isBill, measureClass, measureMixNote, measureNoun } from "./measureType";

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

/** type -> [class, isBill, canBecomeLaw, noun] */
const TABLE: Array<[string, string, boolean, boolean, string]> = [
  ["hr", "bill", true, true, "bill"],
  ["s", "bill", true, true, "bill"],
  ["hjres", "joint_resolution", false, true, "joint resolution"],
  ["sjres", "joint_resolution", false, true, "joint resolution"],
  ["hconres", "concurrent_resolution", false, false, "concurrent resolution"],
  ["sconres", "concurrent_resolution", false, false, "concurrent resolution"],
  ["hres", "simple_resolution", false, false, "simple resolution"],
  ["sres", "simple_resolution", false, false, "simple resolution"],
];

for (const [type, cls, bill, law, noun] of TABLE) {
  it(`classifies ${type}`, () => {
    assert.equal(measureClass(type), cls);
    assert.equal(isBill(type), bill, `isBill(${type})`);
    assert.equal(canBecomeLaw(type), law, `canBecomeLaw(${type})`);
    assert.equal(measureNoun(type), noun);
  });
}

it("counts only hr and s as bills", () => {
  const bills = TABLE.filter(([t]) => isBill(t)).map(([t]) => t);
  assert.deepEqual(bills, ["hr", "s"]);
});

it("counts exactly four types as able to become law", () => {
  const law = TABLE.filter(([t]) => canBecomeLaw(t)).map(([t]) => t);
  assert.deepEqual(law, ["hr", "s", "hjres", "sjres"]);
});

it("is case-insensitive", () => {
  assert.equal(measureClass("HR"), "bill");
  assert.equal(measureClass("SConRes"), "concurrent_resolution");
  assert.equal(isBill("S"), true);
  assert.equal(canBecomeLaw("HJRES"), true);
  assert.equal(measureNoun("HRES"), "simple resolution");
});

it("accepts the printed label as well as the type code", () => {
  // billTypeLabel ("H.Con.Res.") sits next to billType ("hconres") on the same
  // row; a caller passing the wrong one should still get the right answer.
  assert.equal(measureClass("H.R."), "bill");
  assert.equal(measureClass("S.J.Res."), "joint_resolution");
  assert.equal(measureClass("H.Con.Res."), "concurrent_resolution");
  assert.equal(measureClass(" S.Res. "), "simple_resolution");
});

it("returns null for an unrecognised type and never throws", () => {
  assert.equal(measureClass("xyz"), null);
  assert.equal(isBill("xyz"), false);
  assert.equal(canBecomeLaw("xyz"), false);
  assert.equal(measureNoun("xyz"), "xyz");
  assert.equal(measureClass(""), null);
  assert.equal(measureNoun(""), "");
});

// Real 119th Congress split, counted from .truth-cache/bills.jsonl. Sums to
// 18,476 — the exact congressStats.totalCount the model is handed as "all bills".
const CONGRESS_119 = {
  hr: 10183,
  s: 5367,
  hres: 1498,
  sres: 849,
  sjres: 212,
  hjres: 214,
  hconres: 114,
  sconres: 39,
};

it("the real 119th counts still sum to the stored total", () => {
  assert.equal(
    Object.values(CONGRESS_119).reduce((a, b) => a + b, 0),
    18476,
    "fixture drifted from congressStats.totalCount for the 119th",
  );
});

it("reports the real 119th split, bills apart from resolutions", () => {
  const note = measureMixNote(CONGRESS_119);
  assert.ok(note.includes("18,476"), "missing the measure total");
  assert.ok(note.includes("15,550"), "missing bills proper (hr + s)");
  assert.ok(note.includes("426"), "missing joint resolutions");
  assert.ok(note.includes("2,347"), "missing simple resolutions");
  assert.ok(note.includes("153"), "missing concurrent resolutions");
  // 2,500 measures in the 119th can never become law. That is the whole point.
  assert.ok(note.includes("2,500"), "missing the never-become-law count");
  assert.ok(note.includes("2,926"), "missing the overstatement of 'bills'");
  assert.ok(/measures, not bills/i.test(note), "does not warn that totals are measures");
});

it("does not fabricate numbers for an empty map", () => {
  const note = measureMixNote({});
  assert.equal(/\d/.test(note), false, `generic note leaked digits: ${note}`);
  assert.ok(/measures, not bills/i.test(note));
});

it("treats an all-zero map as having nothing to report", () => {
  assert.equal(measureMixNote({ hr: 0, sres: 0 }), measureMixNote({}));
});

it("keeps unrecognised types out of the bill and resolution counts", () => {
  const note = measureMixNote({ hr: 10, xyz: 3 });
  assert.ok(note.includes("13 measures"), "unknown types must still count toward the total");
  assert.ok(note.includes("3 measures carry a type we do not recognise"), note);
});

it("treats inherited Object properties as unrecognised types", () => {
  // A plain-object lookup table answered "constructor" with a function and
  // "__proto__" with an object, so measureClass returned a non-MeasureClass and
  // measureNoun returned undefined — the literal word "undefined" to a reader.
  for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
    assert.equal(measureClass(key), null, `measureClass(${key})`);
    assert.equal(isBill(key), false, `isBill(${key})`);
    assert.equal(canBecomeLaw(key), false, `canBecomeLaw(${key})`);
    assert.equal(measureNoun(key), key, `measureNoun(${key})`);
  }
  // Built with JSON.parse: an object literal would assign to the prototype
  // instead of creating an own "__proto__" key.
  const counts = JSON.parse('{"hr": 10, "constructor": 3, "__proto__": 2}') as Record<
    string,
    number
  >;
  const note = measureMixNote(counts);
  assert.equal(note.includes("undefined"), false, note);
  assert.ok(note.includes("15 measures"), note);
});

it("does not contradict its own arithmetic when a type is unrecognised", () => {
  // 13 measures, 10 bills, no resolutions: the non-bill remainder is 3, not 0.
  // Calling the resolution subtotal "the remaining" made the note say both.
  const note = measureMixNote({ hr: 10, xyz: 3 });
  assert.equal(/(remaining|A further) 0\b/.test(note), false, note);
  assert.ok(note.includes("overstates the bills by 3"), note);
});

it("does not tell the reader an all-bills total overstates itself by zero", () => {
  const note = measureMixNote({ hr: 10, s: 5 });
  assert.equal(/overstates/.test(note), false, note);
  assert.ok(note.includes("15 measures") && note.includes("15 are bills proper"), note);
});

it("survives a NaN count instead of printing NaN at the reader", () => {
  const note = measureMixNote({ hr: 10, sres: Number.NaN });
  assert.equal(note.includes("NaN"), false, note);
  assert.ok(note.includes("10 measures"));
});

if (failures.length > 0) {
  console.error(`catalog/measureType — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`catalog/measureType — ${passed} passed`);
export {};
