/**
 * Resolving a member's full name to the surname we actually store (defect D6).
 *
 * `bills` keeps sponsorFirstName and sponsorLastName apart, and the surname
 * genuinely contains spaces: "De La Cruz", "Van Drew", "Blunt Rochester",
 * "Wasserman Schultz", "Cortez Masto", "Jackson Lee", "Leger Fernandez",
 * "Watson Coleman", "San Nicolas", "Herrera Beutler", "McDonald Rivet". The
 * sponsor lookup used to derive the surname by taking the LAST whitespace-
 * delimited word of the requested name, so every one of those members matched
 * the index on zero rows. Verified live before the fix:
 * sponsorFilter ["Monica De La Cruz"] -> 0 bills, though H.R. 224 is her law.
 * The reader was told a sitting member had introduced nothing.
 *
 * So: stop guessing where the surname starts. Offer every candidate split,
 * longest first, and let the set of surnames we hold decide.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */

/**
 * Tokens that trail a surname without being part of it. Congress.gov does not
 * currently put any of these in sponsorLastName — every stored surname in the
 * 117th–119th is suffix-free — but requested names arrive from a model, which
 * writes "Harold Rogers Jr." for a row stored as "Rogers".
 */
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/**
 * Comparison key: collapse whitespace, drop the punctuation that only ever
 * trails a name ("Cruz," / "Jr."), lowercase, and drop accents. Hyphens are
 * left alone — "Ocasio-Cortez" is one token and must stay one token.
 *
 * Accents go because Congress.gov drops them on some rows and not others: the
 * 118th holds "Nydia Velázquez" (22 bills) and "NYDIA VELAZQUEZ" (28), and the
 * same for Barragán, García and González-Colón. Compared with their accents,
 * each was two people, and "how many bills did Nydia Velázquez introduce"
 * answered 22 against a real 50.
 */
export function nameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.,;:]+$/, "").toLowerCase())
    .filter((word) => word.length > 0)
    .join(" ");
}

/** A name in one case throughout: "ADAM SCHIFF", the way some rows store it. */
function uniformCase(name: string): boolean {
  return name === name.toUpperCase() || name === name.toLowerCase();
}

/**
 * Whether a name carries accents. Congress.gov drops them on some rows
 * ("Nydia Velazquez") and not others ("Nydia Velázquez"); the accented one is
 * the member's name, so it is shown whenever it is held.
 */
function accented(name: string): boolean {
  return name.normalize("NFD") !== name;
}

export interface SponsorRow {
  sponsorName: string;
  sponsorParty?: string;
  sponsorState?: string;
  billCount: number;
  congress?: number;
  /** Congress.gov's permanent member id. Absent on rows counted before it was stored. */
  sponsorBioguideId?: string;
  /** Every "First Last" spelling this member's bills carry, the shown one included. */
  spellings?: string[];
}

/** The fields of a bill that say who sponsored it. */
export interface SponsorBill {
  billType: string;
  introducedDate?: string;
  sponsorFirstName?: string;
  sponsorLastName?: string;
  sponsorParty?: string;
  sponsorState?: string;
  sponsorBioguideId?: string;
}

const SENATE_TYPES = new Set(["s", "sjres", "sconres", "sres"]);
const chamberKey = (bill: Pick<SponsorBill, "billType">) => (SENATE_TYPES.has(bill.billType) ? "senate" : "house");

/**
 * One `congressSponsors` row per MEMBER of one Congress, counted from its bills.
 *
 * A member is their bioguide id. Counting by spelling split one member in two
 * whenever Congress.gov spelled them two ways ("Jacky Rosen" 73 and "Jacklyn
 * Rosen" 7 in the 119th; "Bernie" and "Bernard" Sanders), and joined two members
 * who share a name: in the 118th, Senator Robert Menendez and his son,
 * Representative Rob Menendez, were one "Robert Menendez" with 89 bills.
 *
 * A bill without an id (stored before ids were) joins the member its name and
 * state belong to when exactly one member with an id has them, or, when two do
 * (the Menendezes, both of New Jersey), the one of them who sponsors from the
 * bill's chamber; otherwise it is counted under the name and state alone, as
 * before. So a recount part-way through the id backfill never splits a member.
 *
 * The name shown is a mixed-case spelling when there is one, then the spelling on
 * the most bills, then the newer spelling; an accented spelling beats the same
 * name without. Two members who would show the same name get the chamber they
 * sponsored from, "Robert Menendez (Senate)" and "Robert Menendez (House)". The
 * party and state are those on the member's latest bill.
 */
export type BuiltSponsorRow = Pick<SponsorRow, "sponsorParty" | "sponsorState" | "sponsorBioguideId"> & {
  sponsorName: string;
  billCount: number;
  spellings: string[];
};

export function buildSponsorRows(bills: Iterable<SponsorBill>): BuiltSponsorRow[] {
  const named: Array<{ bill: SponsorBill; spelling: string; fallback: string }> = [];
  const idsByFallback = new Map<string, Set<string>>();
  for (const bill of bills) {
    const spelling = `${bill.sponsorFirstName ?? ""} ${bill.sponsorLastName ?? ""}`.trim();
    if (!spelling) continue;
    const fallback = `${nameKey(spelling)}|${bill.sponsorState ?? ""}`;
    named.push({ bill, spelling, fallback });
    if (bill.sponsorBioguideId) {
      for (const key of [fallback, `${fallback}|${chamberKey(bill)}`]) {
        const ids = idsByFallback.get(key) ?? new Set<string>();
        ids.add(bill.sponsorBioguideId);
        idsByFallback.set(key, ids);
      }
    }
  }
  const onlyId = (key: string) => {
    const ids = idsByFallback.get(key);
    return ids && ids.size === 1 ? [...ids][0] : undefined;
  };

  interface Member {
    id?: string;
    count: number;
    spellings: Map<string, number>;
    /** The newest introduction date each spelling appears on. */
    spellingDates: Map<string, string>;
    latest: string;
    party?: string;
    state?: string;
    senate: number;
  }
  const members = new Map<string, Member>();
  for (const { bill, spelling, fallback } of named) {
    const id = bill.sponsorBioguideId ?? onlyId(fallback) ?? onlyId(`${fallback}|${chamberKey(bill)}`);
    const key = id ? `id:${id}` : `name:${fallback}`;
    const m: Member = members.get(key) ?? {
      id,
      count: 0,
      spellings: new Map(),
      spellingDates: new Map(),
      latest: "",
      senate: 0,
    };
    m.count += 1;
    m.spellings.set(spelling, (m.spellings.get(spelling) ?? 0) + 1);
    if ((bill.introducedDate ?? "") >= (m.spellingDates.get(spelling) ?? "")) {
      m.spellingDates.set(spelling, bill.introducedDate ?? "");
    }
    if (SENATE_TYPES.has(bill.billType)) m.senate += 1;
    const date = bill.introducedDate ?? "";
    if (date >= m.latest) {
      m.latest = date;
      if (bill.sponsorParty) m.party = bill.sponsorParty;
      if (bill.sponsorState) m.state = bill.sponsorState;
    }
    members.set(key, m);
  }

  const rows = [...members.values()].map((m) => {
    // Mixed case first, then accented, then the spelling on more bills, then the
    // newer one ("Scott Franklin" over "C. Franklin", 11 bills each in the 118th).
    const newest = (n: string) => m.spellingDates.get(n) ?? "";
    const shown = [...m.spellings.entries()].sort(
      ([a, an], [b, bn]) =>
        Number(uniformCase(a)) - Number(uniformCase(b)) ||
        Number(accented(b)) - Number(accented(a)) ||
        bn - an ||
        newest(b).localeCompare(newest(a)) ||
        a.localeCompare(b),
    )[0][0];
    return {
      sponsorName: shown,
      sponsorParty: m.party,
      sponsorState: m.state,
      billCount: m.count,
      ...(m.id ? { sponsorBioguideId: m.id } : {}),
      spellings: [...m.spellings.keys()].sort(),
      chamber: m.senate * 2 >= m.count ? "Senate" : "House",
    };
  });

  // Two members who would show one name are told apart by chamber.
  const byShown = new Map<string, typeof rows>();
  for (const r of rows) byShown.set(nameKey(r.sponsorName), [...(byShown.get(nameKey(r.sponsorName)) ?? []), r]);
  for (const same of byShown.values()) {
    if (same.length < 2 || new Set(same.map((r) => r.chamber)).size < same.length) continue;
    for (const r of same) r.sponsorName = `${r.sponsorName} (${r.chamber})`;
  }
  return rows
    .map(({ chamber: _c, ...r }) => r)
    .sort((a, b) => b.billCount - a.billCount || a.sponsorName.localeCompare(b.sponsorName));
}

/**
 * `congressSponsors` rows merged into one per member. A row is one SPELLING:
 * Congress.gov records 45 members under two ("ADAM SCHIFF" and "Adam Schiff",
 * "NYDIA VELAZQUEZ" and "Nydia Velázquez"), and in the 118th, 44 of them are
 * split inside the one Congress. Every reader of the table goes through this, so
 * the picker, the counts, the home page and the answer engine agree on who is
 * one person.
 *
 * Same member = same bioguide id, on rows that carry one (buildSponsorRows).
 * Rows counted before ids were stored fall back to the rule below.
 *
 * Same member = same `nameKey` and same state. Not party: the only same-name,
 * different-party pairs in the data are party switches (Joe Manchin D→I in the
 * 118th), the same person. Not name alone: two members who share a name always
 * sit for different states.
 *
 * The name shown is a mixed-case spelling when there is one, then the spelling
 * on more bills. It is never re-cased: title-casing "MCCARTHY" misspells it, and
 * a wrong name is worse than a loud one. The party is the latest Congress's.
 * The rows are left as stored, because the case-sensitive surname index needs
 * each spelling exactly.
 */
export function mergeSponsorRows(rows: Iterable<SponsorRow>): Omit<SponsorRow, "congress">[] {
  const byMember = new Map<string, SponsorRow & { shownCount: number; partyCongress: number }>();
  for (const row of rows) {
    // The member id when the row has one; rows counted before ids were stored
    // fall back to name and state.
    const key = row.sponsorBioguideId ?? `${nameKey(row.sponsorName)}|${row.sponsorState ?? ""}`;
    const held = byMember.get(key);
    if (!held) {
      byMember.set(key, {
        sponsorName: row.sponsorName,
        sponsorParty: row.sponsorParty,
        sponsorState: row.sponsorState,
        billCount: row.billCount,
        ...(row.sponsorBioguideId ? { sponsorBioguideId: row.sponsorBioguideId } : {}),
        spellings: [...(row.spellings ?? [row.sponsorName])],
        shownCount: row.billCount,
        partyCongress: row.congress ?? 0,
      });
      continue;
    }
    held.billCount += row.billCount;
    held.spellings = [...new Set([...(held.spellings ?? []), ...(row.spellings ?? [row.sponsorName])])];
    const better =
      uniformCase(held.sponsorName) !== uniformCase(row.sponsorName)
        ? uniformCase(held.sponsorName)
        : accented(held.sponsorName) !== accented(row.sponsorName)
          ? accented(row.sponsorName)
          : row.billCount > held.shownCount;
    if (better) {
      held.sponsorName = row.sponsorName;
      held.shownCount = row.billCount;
    }
    if (row.sponsorParty && (!held.sponsorParty || (row.congress ?? 0) > held.partyCongress)) {
      held.sponsorParty = row.sponsorParty;
      held.partyCongress = row.congress ?? 0;
    }
  }
  return [...byMember.values()].map(({ shownCount: _s, partyCongress: _p, ...row }) => row);
}

function tokenise(value: string): string[] {
  return value.trim().split(/\s+/).filter((word) => word.length > 0);
}

/** True when every token is a suffix, i.e. the candidate is "Jr." and nothing else. */
function allSuffix(tokens: string[]): boolean {
  return tokens.every((word) => SUFFIXES.has(word.replace(/[.,;:]+$/, "").toLowerCase()));
}

/**
 * Every candidate surname for a full name, longest first, so a lookup can try
 * "De La Cruz" before "Cruz". For "Monica De La Cruz" this is
 * ["De La Cruz", "La Cruz", "Cruz"].
 */
export function candidateSurnames(fullName: string): string[] {
  const tokens = tokenise(fullName ?? "");
  if (tokens.length === 0) return [];
  // A single word is all we were given; it is the only thing it can be.
  if (tokens.length === 1) return [tokens[0]];

  // Two token runs to slice: the name as written, and the name with trailing
  // suffixes removed. "Harold Rogers Jr." must be able to reach "Rogers", which
  // is not a suffix of the name as written.
  const runs: string[][] = [tokens];
  const trimmed = [...tokens];
  while (trimmed.length > 1 && allSuffix([trimmed[trimmed.length - 1]])) trimmed.pop();
  if (trimmed.length < tokens.length) runs.push(trimmed);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const run of runs) {
    // Start at 1: at least the first token is a given name, so a multi-word
    // input never yields the whole name back as a surname.
    //
    // The one exception is a run that suffix trimming has reduced to a single
    // token, i.e. the input was "Rogers Jr." with no given name at all. Start
    // that one at 0. Requiring a given name here used to yield NO candidates,
    // so "Rogers Jr." resolved to null while the bare "Rogers" resolved fine —
    // the same "member has introduced nothing" answer this module exists to
    // stop. "Rogers" is not the whole name, so the rule above still holds.
    for (let start = run.length === 1 ? 0 : 1; start < run.length; start++) {
      const slice = run.slice(start);
      if (allSuffix(slice)) continue;
      const candidate = slice.join(" ");
      const key = nameKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(candidate);
    }
  }

  // Longest first so "De La Cruz" is offered before "La Cruz" before "Cruz".
  return out.sort((a, b) => tokenise(b).length - tokenise(a).length);
}

/**
 * Resolve a full name against the surnames we actually hold. Returns the matching
 * surname, or null when none matches. Matching is case-insensitive and
 * whitespace-normalised.
 *
 * The value returned is the KNOWN set's spelling, not the caller's: the index on
 * sponsorLastName is an exact-match index, and the same member appears as both
 * "Jackson Lee" and "JACKSON LEE" in stored rows, so the caller must query with
 * the string we hold rather than the one the model typed.
 *
 * fullName must be a FULL name, never a bare surname. Since a multi-word input
 * never offers itself back, passing the surname "Van Drew" alone offers only
 * "Drew" — null today, but another member's bills the day a Drew is elected.
 */
export function resolveSurname(fullName: string, knownSurnames: Iterable<string>): string | null {
  const known = new Map<string, string>();
  for (const surname of knownSurnames) {
    if (typeof surname !== "string") continue;
    const key = nameKey(surname);
    if (key.length === 0 || known.has(key)) continue;
    known.set(key, surname);
  }
  if (known.size === 0) return null;

  for (const candidate of candidateSurnames(fullName)) {
    const hit = known.get(nameKey(candidate));
    if (hit !== undefined) return hit;
  }
  return null;
}

/** Normalised "First Last" key for comparing a stored row against a requested name. */
export function fullNameKey(firstName: string | undefined, lastName: string | undefined): string {
  return nameKey(`${firstName ?? ""} ${lastName ?? ""}`);
}

/** Case- and whitespace-insensitive comparison of a requested name to a stored row. */
export function matchesFullName(
  requested: string,
  firstName: string | undefined,
  lastName: string | undefined,
): boolean {
  const stored = fullNameKey(firstName, lastName);
  // An empty row matches nothing. Without this, a bill with no sponsor recorded
  // would match a request that normalised to the empty string.
  if (stored.length === 0) return false;
  return nameKey(requested ?? "") === stored;
}

/**
 * Who a sponsor filter means, resolved against the member rows of one Congress.
 *
 * A requested name matches a member when it is the member's shown name or any
 * spelling their bills carry, so "Jacky Rosen" reaches the 7 bills spelled
 * "Jacklyn Rosen" too: she has 80 in the 119th, and the filter returned 73.
 *
 * `bioguides` holds the matched members' ids. A bill that carries an id is
 * matched by it, which is the only way to tell "Robert Menendez (Senate)" from
 * "Robert Menendez (House)"; a bill stored before ids were matches by `nameKeys`.
 */
export interface SponsorRequest<R = unknown> {
  nameKeys: Set<string>;
  bioguides: Set<string>;
  /** Every spelling of the matched members, for reading the surname index. */
  spellings: string[];
  /** This Congress's member rows the request matched. */
  rows: R[];
}

type ResolvableRow = Pick<SponsorRow, "sponsorName" | "sponsorBioguideId" | "spellings">;

/**
 * `otherCongresses` covers a name this Congress never uses. The /bills picker
 * lists each member once across every Congress, under one name: Jacky Rosen is
 * "Jacky Rosen" there, but her 117th-Congress bills all say "Jacklyn". A name
 * that matches no row here is looked up by member id in the other Congresses
 * and then found here by that id, rather than answered with an exact zero.
 */
export function resolveSponsorRequest<R extends ResolvableRow>(
  rows: Iterable<R>,
  names: string[],
  otherCongresses: Iterable<ResolvableRow> = [],
): SponsorRequest<R> {
  const here = [...rows];
  const namesOf = (row: ResolvableRow) => [row.sponsorName, ...(row.spellings ?? [])];
  const wanted = new Set(names.map(nameKey));
  const matchedHere = new Set(
    here.filter((row) => namesOf(row).some((n) => wanted.has(nameKey(n)))),
  );
  const unmatched = [...wanted].filter(
    (key) => ![...matchedHere].some((row) => namesOf(row).some((n) => nameKey(n) === key)),
  );
  if (unmatched.length > 0) {
    const ids = new Set<string>();
    for (const row of otherCongresses) {
      if (row.sponsorBioguideId && namesOf(row).some((n) => unmatched.includes(nameKey(n)))) {
        ids.add(row.sponsorBioguideId);
      }
    }
    for (const row of here) {
      if (row.sponsorBioguideId && ids.has(row.sponsorBioguideId)) matchedHere.add(row);
    }
  }

  const nameKeys = new Set(wanted);
  const bioguides = new Set<string>();
  const spellings = new Set<string>();
  for (const row of matchedHere) {
    for (const n of namesOf(row)) {
      nameKeys.add(nameKey(n));
      spellings.add(n);
    }
    if (row.sponsorBioguideId) bioguides.add(row.sponsorBioguideId);
  }
  return { nameKeys, bioguides, spellings: [...spellings], rows: [...matchedHere] };
}

/** Whether a bill belongs to the members a resolved filter names. */
export function billMatchesRequest(
  bill: Pick<SponsorBill, "sponsorFirstName" | "sponsorLastName" | "sponsorBioguideId">,
  request: SponsorRequest,
): boolean {
  if (bill.sponsorBioguideId && request.bioguides.size > 0) {
    return request.bioguides.has(bill.sponsorBioguideId);
  }
  const key = fullNameKey(bill.sponsorFirstName, bill.sponsorLastName);
  return key.length > 0 && request.nameKeys.has(key);
}
