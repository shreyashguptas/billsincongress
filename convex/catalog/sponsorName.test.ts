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
import { candidateSurnames, fullNameKey, matchesFullName, resolveSurname } from "./sponsorName";

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

if (failures.length > 0) {
  console.error(`catalog/sponsorName — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`catalog/sponsorName — ${passed} passed`);
export {};
