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
 * trails a name ("Cruz," / "Jr."), lowercase. Hyphens are left alone —
 * "Ocasio-Cortez" is one token and must stay one token.
 */
function nameKey(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.,;:]+$/, "").toLowerCase())
    .filter((word) => word.length > 0)
    .join(" ");
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
