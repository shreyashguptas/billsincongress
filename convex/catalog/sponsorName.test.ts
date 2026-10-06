/**
 * Sponsor name resolution (defect D6).
 *
 * The property under test: a member whose surname contains a space must resolve
 * to that surname, because the old last-word guess resolved them to nothing and
 * the answer engine then reported them as having introduced zero bills.
 *
 * KNOWN is taken from real stored rows. Every multi-word surname in the
 * database across the 117th–119th Congresses:
 *   Blunt Rochester, Cortez Masto, De La Cruz, Herrera Beutler, JACKSON LEE,
 *   Jackson Lee, Leger Fernandez, McClain Delaney, McDonald Rivet, San Nicolas,
 *   Van Drew, Van Duyne, Van Epps, Van Hollen, Van Orden, Wasserman Schultz,
 *   Watson Coleman
 * (`grep -o '"sponsorLastName":"[^"]*"' .truth-cache/bills.jsonl | sort -u | grep ' '`)
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import {
  billMatchesRequest,
  buildSponsorRows,
  candidateSurnames,
  fullNameKey,
  matchesFullName,
  mergeSponsorRows,
  resolveSponsorRequest,
  resolveSurname,
} from "./sponsorName";
import type { SponsorBill } from "./sponsorName";

/** Real sponsorLastName values, spelled exactly as stored. */
const KNOWN = [
  "Blunt Rochester",
  "Britt",
  "Cortez Masto",
  // "Cruz" and "Lee" are stored surnames in their own right (Ted Cruz, Barbara
  // Lee) and are the tails of "De La Cruz" and "JACKSON LEE". They are in this
  // set on purpose: without them a regression to the last-word guess returns
  // null, with them it returns a DIFFERENT member's surname, which is the worse
  // failure and the one worth pinning.
  "Cruz",
  "De La Cruz",
  "JACKSON LEE",
  "Lee",
  "Leger Fernandez",
  "Luna",
  "Ocasio-Cortez",
  "Rogers",
  "Van Drew",
  "Van Hollen",
  "Wasserman Schultz",
  "Watson Coleman",
];

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

it("offers candidates longest first and never the whole name", () => {
  assert.deepEqual(candidateSurnames("Monica De La Cruz"), ["De La Cruz", "La Cruz", "Cruz"]);
  assert.deepEqual(candidateSurnames("Jefferson Van Drew"), ["Van Drew", "Drew"]);
  for (const name of ["Monica De La Cruz", "Katie Britt", "Lisa Blunt Rochester"]) {
    assert.ok(!candidateSurnames(name).includes(name), `${name} returned itself`);
  }
});

it("returns a one-word name unchanged", () => {
  assert.deepEqual(candidateSurnames("Britt"), ["Britt"]);
});

it("resolves the multi-word surnames the last-word guess lost", () => {
  // Monica De La Cruz has a law to her name (H.R. 224) and the old lookup
  // reported 0 bills for her.
  assert.equal(resolveSurname("Monica De La Cruz", KNOWN), "De La Cruz");
  assert.equal(resolveSurname("Jeff Van Drew", KNOWN), "Van Drew");
  assert.equal(resolveSurname("Lisa Blunt Rochester", KNOWN), "Blunt Rochester");
  assert.equal(resolveSurname("Debbie Wasserman Schultz", KNOWN), "Wasserman Schultz");
  assert.equal(resolveSurname("Catherine Cortez Masto", KNOWN), "Cortez Masto");
  assert.equal(resolveSurname("Teresa Leger Fernandez", KNOWN), "Leger Fernandez");
});

it("still resolves ordinary two-word names", () => {
  assert.equal(resolveSurname("Katie Britt", KNOWN), "Britt");
  assert.equal(resolveSurname("Alexandria Ocasio-Cortez", KNOWN), "Ocasio-Cortez");
});

it("resolves a two-word GIVEN name to its one-word surname", () => {
  // Anna Paulina Luna is stored with sponsorFirstName "Anna Paulina": three
  // words, but the surname is the last one. Only the known set can tell this
  // apart from "Lisa Blunt Rochester".
  assert.equal(resolveSurname("Anna Paulina Luna", KNOWN), "Luna");
});

it("returns the stored spelling, not the requested one", () => {
  // The surname index is exact-match and this member is stored both as
  // "Jackson Lee" and "JACKSON LEE"; the caller must query what we hold.
  assert.equal(resolveSurname("Sheila Jackson Lee", KNOWN), "JACKSON LEE");
  assert.equal(resolveSurname("monica de la cruz", KNOWN), "De La Cruz");
});

it("tolerates extra whitespace and trailing punctuation", () => {
  assert.equal(resolveSurname("  Monica   De La Cruz  ", KNOWN), "De La Cruz");
  assert.equal(resolveSurname("Monica De La Cruz,", KNOWN), "De La Cruz");
});

it("prefers the longer surname over its own tail", () => {
  // Both spellings are really in the database, so the shorter one is a live
  // wrong answer, not a hypothetical: last-word matching sends every De La Cruz
  // question to Ted Cruz's bills and every Jackson Lee question to Barbara Lee's.
  assert.equal(resolveSurname("Monica De La Cruz", KNOWN), "De La Cruz");
  assert.equal(resolveSurname("Sheila Jackson Lee", KNOWN), "JACKSON LEE");
  // Order of the known set must not decide it.
  assert.equal(resolveSurname("Monica De La Cruz", ["Cruz", "De La Cruz"]), "De La Cruz");
  assert.equal(resolveSurname("Sheila Jackson Lee", ["Lee", "Jackson Lee"]), "Jackson Lee");
});

it("lets the known set decide where a suffix ends", () => {
  assert.equal(resolveSurname("Harold Rogers Jr.", KNOWN), "Rogers");
  assert.equal(resolveSurname("Harold Rogers Jr.", ["Rogers Jr"]), "Rogers Jr");
  assert.equal(resolveSurname("Harold Rogers Jr.", ["Rogers Jr."]), "Rogers Jr.");
  assert.deepEqual(candidateSurnames("Harold Rogers III"), ["Rogers III", "Rogers"]);
});

it("resolves a surname carrying a suffix but no given name", () => {
  // "Rogers Jr." used to yield no candidates at all — the suffix ate the only
  // token that could be a surname — so it resolved to null even though the bare
  // "Rogers" resolved fine. That is the same zero-bills answer for a member who
  // has bills. Note "Rogers", not "Rogers Jr.": the whole of a multi-word input
  // is still never offered as a surname.
  assert.deepEqual(candidateSurnames("Rogers Jr."), ["Rogers"]);
  assert.equal(resolveSurname("Rogers Jr.", KNOWN), "Rogers");
});

it("returns null for a name we do not hold", () => {
  // Null, not a guess. A wrong surname would return another member's bills
  // under the requested member's name.
  assert.equal(resolveSurname("Jane Nosuchmember", KNOWN), null);
  assert.equal(resolveSurname("Monica De La Cruz", []), null);
});

it("returns null for empty input instead of throwing", () => {
  assert.deepEqual(candidateSurnames(""), []);
  assert.deepEqual(candidateSurnames("   "), []);
  assert.equal(resolveSurname("", KNOWN), null);
  assert.equal(resolveSurname("   ", KNOWN), null);
});

it("compares full names case- and whitespace-insensitively", () => {
  assert.equal(matchesFullName("Monica De La Cruz", "Monica", "De La Cruz"), true);
  assert.equal(matchesFullName("monica  de la cruz", "Monica", "De La Cruz"), true);
  assert.equal(matchesFullName("SHEILA JACKSON LEE", "Sheila", "Jackson Lee"), true);
  assert.equal(matchesFullName("Debbie Wasserman Schultz", "Debbie", "Wasserman Schultz"), true);
});

it("does not match a different member", () => {
  assert.equal(matchesFullName("Mike Rogers", "Harold", "Rogers"), false);
  // The stored first name is "Jefferson", so the familiar "Jeff Van Drew" is
  // NOT a full-name match — only the surname resolution above reaches him.
  assert.equal(matchesFullName("Jeff Van Drew", "Jefferson", "Van Drew"), false);
});

it("returns false for missing name parts instead of throwing", () => {
  assert.equal(matchesFullName("Katie Britt", undefined, undefined), false);
  assert.equal(matchesFullName("", undefined, undefined), false);
  assert.equal(matchesFullName("", "Katie", "Britt"), false);
  assert.equal(matchesFullName("Britt", undefined, "Britt"), true);
});

it("keys a stored row the same way whichever part is missing", () => {
  assert.equal(fullNameKey("Monica", "De La Cruz"), "monica de la cruz");
  assert.equal(fullNameKey(undefined, "De La Cruz"), "de la cruz");
  assert.equal(fullNameKey("Monica", undefined), "monica");
  assert.equal(fullNameKey(undefined, undefined), "");
});

it("matches a name stored without its accents, either way round", () => {
  // The 118th holds "Nydia Velázquez" and "NYDIA VELAZQUEZ" as separate rows.
  assert.equal(matchesFullName("Nydia Velázquez", "NYDIA", "VELAZQUEZ"), true);
  assert.equal(matchesFullName("Nydia Velazquez", "Nydia", "Velázquez"), true);
  assert.equal(matchesFullName("Jenniffer González-Colón", "Jenniffer", "Gonzalez-Colon"), true);
  assert.equal(fullNameKey("Jesús", "García"), "jesus garcia");
});

it("merges one member's spellings into one row with all their bills", () => {
  const merged = mergeSponsorRows([
    { sponsorName: "ADAM SCHIFF", sponsorParty: "D", sponsorState: "CA", billCount: 82, congress: 117 },
    { sponsorName: "Adam Schiff", sponsorParty: "D", sponsorState: "CA", billCount: 121, congress: 118 },
    { sponsorName: "NYDIA VELAZQUEZ", sponsorParty: "D", sponsorState: "NY", billCount: 28, congress: 118 },
    { sponsorName: "Nydia Velázquez", sponsorParty: "D", sponsorState: "NY", billCount: 22, congress: 118 },
  ]);
  assert.deepEqual(
    merged.map((m) => [m.sponsorName, m.billCount]),
    [
      ["Adam Schiff", 203],
      ["Nydia Velázquez", 50],
    ],
  );
});

it("shows a mixed-case spelling, then the spelling on more bills, and never re-cases", () => {
  const [shown] = mergeSponsorRows([
    { sponsorName: "Nanette Barragan", sponsorState: "CA", billCount: 45 },
    { sponsorName: "Nanette Barragán", sponsorState: "CA", billCount: 60 },
    { sponsorName: "NANETTE BARRAGAN", sponsorState: "CA", billCount: 99 },
  ]);
  assert.equal(shown.sponsorName, "Nanette Barragán");
  const [loud] = mergeSponsorRows([{ sponsorName: "CAROLYN MALONEY", sponsorState: "NY", billCount: 101 }]);
  assert.equal(loud.sponsorName, "CAROLYN MALONEY", "no mixed-case spelling held: shown as stored");
});

it("keeps a party switcher as one member with the latest party, and same-name members apart", () => {
  const [manchin] = mergeSponsorRows([
    { sponsorName: "Joseph Manchin", sponsorParty: "I", sponsorState: "WV", billCount: 10, congress: 118 },
    { sponsorName: "Joseph Manchin", sponsorParty: "D", sponsorState: "WV", billCount: 30, congress: 117 },
  ]);
  assert.equal(manchin.billCount, 40);
  assert.equal(manchin.sponsorParty, "I");
  const rogers = mergeSponsorRows([
    { sponsorName: "Mike Rogers", sponsorParty: "R", sponsorState: "AL", billCount: 5 },
    { sponsorName: "MIKE ROGERS", sponsorParty: "R", sponsorState: "MI", billCount: 7 },
  ]);
  assert.equal(rogers.length, 2);
});

// --- One row per member, by Congress.gov id --------------------------------

const bill = (first: string, last: string, extra: Partial<SponsorBill> = {}): SponsorBill => ({
  billType: "s",
  introducedDate: "2025-03-01",
  sponsorFirstName: first,
  sponsorLastName: last,
  sponsorParty: "D",
  sponsorState: "NV",
  ...extra,
});
const many = (n: number, b: SponsorBill) => Array.from({ length: n }, () => ({ ...b }));

it("counts a member once whatever spelling their bills carry", () => {
  // The 119th: "Jacky Rosen" on 73 bills, "Jacklyn Rosen" on 7. The site said 73.
  const rows = buildSponsorRows([
    ...many(73, bill("Jacky", "Rosen", { sponsorBioguideId: "R000608" })),
    ...many(7, bill("Jacklyn", "Rosen", { sponsorBioguideId: "R000608", introducedDate: "2025-01-10" })),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sponsorName, "Jacky Rosen");
  assert.equal(rows[0].billCount, 80);
  assert.deepEqual(rows[0].spellings, ["Jacklyn Rosen", "Jacky Rosen"]);
  assert.equal(rows[0].sponsorBioguideId, "R000608");
});

it("keeps two members who share a name apart, and says which chamber each sits in", () => {
  // The 118th: the Senator and his son the Representative were one "Robert Menendez", 89 bills.
  const rows = buildSponsorRows([
    ...many(75, bill("Robert", "Menendez", { sponsorBioguideId: "M000639", sponsorState: "NJ" })),
    ...many(14, bill("Robert", "Menendez", { sponsorBioguideId: "M001226", sponsorState: "NJ", billType: "hr" })),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.sponsorName, r.billCount]),
    [["Robert Menendez (Senate)", 75], ["Robert Menendez (House)", 14]],
  );
});

it("puts a bill stored before ids were under the member its name and state belong to", () => {
  const rows = buildSponsorRows([
    ...many(5, bill("Jacky", "Rosen", { sponsorBioguideId: "R000608" })),
    ...many(2, bill("Jacky", "Rosen")),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].billCount, 7);
});

it("does not guess which member an id-less bill is when two share its name", () => {
  const rows = buildSponsorRows([
    bill("Robert", "Menendez", { sponsorBioguideId: "M000639", sponsorState: "NJ" }),
    bill("Robert", "Menendez", { sponsorBioguideId: "M001226", sponsorState: "NJ", billType: "hr" }),
    bill("Robert", "Menendez", { sponsorState: "NJ" }),
  ]);
  assert.equal(rows.reduce((n, r) => n + r.billCount, 0), 3);
  assert.equal(rows.filter((r) => !r.sponsorBioguideId).length, 1);
});

it("shows a mixed-case spelling, then the commoner one, then the newer one", () => {
  const [franklin] = buildSponsorRows([
    ...many(11, bill("C.", "Franklin", { sponsorBioguideId: "F000472", introducedDate: "2023-03-01" })),
    ...many(11, bill("Scott", "Franklin", { sponsorBioguideId: "F000472", introducedDate: "2024-06-01" })),
  ]);
  assert.equal(franklin.sponsorName, "Scott Franklin");
  const [delauro] = buildSponsorRows([
    ...many(30, bill("ROSA", "DELAURO", { sponsorBioguideId: "D000216" })),
    ...many(2, bill("Rosa", "DeLauro", { sponsorBioguideId: "D000216" })),
  ]);
  assert.equal(delauro.sponsorName, "Rosa DeLauro");
});

it("shows the accented spelling when Congress.gov dropped the accents on more bills", () => {
  const [nydia] = buildSponsorRows([
    ...many(28, bill("Nydia", "Velazquez", { sponsorBioguideId: "V000081", sponsorState: "NY" })),
    ...many(22, bill("Nydia", "Velázquez", { sponsorBioguideId: "V000081", sponsorState: "NY" })),
  ]);
  assert.equal(nydia.sponsorName, "Nydia Velázquez");
  const [merged] = mergeSponsorRows([
    { sponsorName: "Nydia Velazquez", sponsorState: "NY", billCount: 28 },
    { sponsorName: "Nydia Velázquez", sponsorState: "NY", billCount: 22 },
  ]);
  assert.equal(merged.sponsorName, "Nydia Velázquez");
});

it("takes party and state from the member's latest bill", () => {
  const [kiley] = buildSponsorRows([
    bill("Kevin", "Kiley", { sponsorBioguideId: "K000401", sponsorParty: "R", sponsorState: "CA", introducedDate: "2025-02-01" }),
    bill("Kevin", "Kiley", { sponsorBioguideId: "K000401", sponsorParty: "I", sponsorState: "CA", introducedDate: "2026-07-01" }),
  ]);
  assert.equal(kiley.sponsorParty, "I");
});

it("a filter by any spelling reaches every bill of that member, and only theirs", () => {
  const bills = [
    ...many(73, bill("Jacky", "Rosen", { sponsorBioguideId: "R000608" })),
    ...many(7, bill("Jacklyn", "Rosen", { sponsorBioguideId: "R000608" })),
    ...many(4, bill("Jacky", "Rosen", { sponsorBioguideId: "X000001", sponsorState: "TX" })),
  ];
  const rows = buildSponsorRows(bills);
  for (const name of ["Jacky Rosen", "jacklyn rosen"]) {
    const req = resolveSponsorRequest(rows, [name]);
    // Two members named Jacky Rosen, NV and TX: the name names both.
    assert.equal(bills.filter((b) => billMatchesRequest(b, req)).length, name === "Jacky Rosen" ? 84 : 80, name);
  }
});

it("an id tells a filter's members apart; a bill without one falls back to its name", () => {
  const rows = buildSponsorRows([
    ...many(3, bill("Robert", "Menendez", { sponsorBioguideId: "M000639", sponsorState: "NJ" })),
    ...many(2, bill("Robert", "Menendez", { sponsorBioguideId: "M001226", sponsorState: "NJ", billType: "hr" })),
  ]);
  const senate = resolveSponsorRequest(rows, ["Robert Menendez (Senate)"]);
  assert.equal(billMatchesRequest(bill("Robert", "Menendez", { sponsorBioguideId: "M000639" }), senate), true);
  assert.equal(billMatchesRequest(bill("Robert", "Menendez", { sponsorBioguideId: "M001226" }), senate), false);
  assert.equal(billMatchesRequest(bill("Robert", "Menendez"), senate), true, "no id: matched by name");
});

it("rows without ids resolve exactly as names did before", () => {
  const req = resolveSponsorRequest([{ sponsorName: "Adam Schiff" }, { sponsorName: "ADAM SCHIFF" }], ["Adam Schiff"]);
  assert.equal(req.bioguides.size, 0);
  assert.equal(billMatchesRequest(bill("ADAM", "SCHIFF"), req), true);
  assert.equal(billMatchesRequest(bill("Adam", "Smith"), req), false);
});

it("a name only another Congress uses reaches the member here through their id", () => {
  // Review on #173: the picker lists Jacky Rosen once, as "Jacky Rosen", but
  // every one of her 117th-Congress bills says "Jacklyn". Filtering the 117th by
  // the picker's name returned an exact zero.
  const here = [{ sponsorName: "Jacklyn Rosen", sponsorBioguideId: "R000608", spellings: ["Jacklyn Rosen"], billCount: 74 }];
  const elsewhere = [{ sponsorName: "Jacky Rosen", sponsorBioguideId: "R000608", spellings: ["Jacklyn Rosen", "Jacky Rosen"] }];
  const alone = resolveSponsorRequest(here, ["Jacky Rosen"]);
  assert.equal(alone.rows.length, 0, "this Congress alone does not know the name");
  const req = resolveSponsorRequest(here, ["Jacky Rosen"], elsewhere);
  assert.equal(req.rows.length, 1);
  assert.equal(billMatchesRequest(bill("Jacklyn", "Rosen", { sponsorBioguideId: "R000608" }), req), true);
  assert.equal(billMatchesRequest(bill("Jacklyn", "Rosen"), req), true, "no id: matched by the spelling found");
});

it("merges rows across Congresses by id even when they are spelled differently", () => {
  const merged = mergeSponsorRows([
    { sponsorName: "Jacklyn Rosen", sponsorState: "NV", billCount: 74, sponsorBioguideId: "R000608", congress: 117 },
    { sponsorName: "Jacky Rosen", sponsorState: "NV", billCount: 80, sponsorBioguideId: "R000608", congress: 119 },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].billCount, 154);
  assert.equal(merged[0].sponsorName, "Jacky Rosen");
});

if (failures.length > 0) {
  console.error(`catalog/sponsorName — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`catalog/sponsorName — ${passed} passed`);
export {};
