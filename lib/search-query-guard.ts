/**
 * Guard on what we send to the search engine (spec §4.6).
 *
 * The model must reformulate the reader's question into a neutral factual
 * search string. This is the control that actually protects readers: the
 * identifying framing ("I live in Maryland", "my disability benefits") never
 * leaves our servers, so there is no retention promise to depend on.
 *
 * Volume-based anonymity is NOT a control we rely on — query content is itself
 * identifying (spec §3.3). This is.
 *
 * Pure module so it carries unit tests.
 */

/** Word-boundary matched, so "Imports" and "Miami" are unaffected. */
const FIRST_PERSON = /\b(i|me|my|mine|myself|we|us|our|ours)\b/i;

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkSearchQuery(
  query: string,
  question: string,
): { ok: true } | { ok: false; error: string } {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: 'query must not be empty. Give a neutral factual search phrase.' };
  }

  if (FIRST_PERSON.test(trimmed)) {
    return {
      ok: false,
      error:
        'query must not contain first-person words (I, my, we, our). Rephrase it as a ' +
        'neutral factual search phrase describing the FACT you need, not the reader\'s ' +
        'situation. Example: "Maryland congressional delegation veteran housing legislation 2026".',
    };
  }

  const nq = normalise(query);
  const nquestion = normalise(question);
  if (
    nq === nquestion ||
    (nquestion.length > 20 && nquestion.includes(nq) && nq.length > nquestion.length * 0.8)
  ) {
    return {
      ok: false,
      error:
        "Do not forward the reader's question verbatim. Rephrase it as a neutral search " +
        'phrase describing only the fact you need.',
    };
  }

  return { ok: true };
}
