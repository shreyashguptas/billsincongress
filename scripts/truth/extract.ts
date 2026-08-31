/**
 * Turn an answer's PROSE into one checkable claim, for the answer-accuracy
 * regression harness.
 *
 * The harness asks production questions and compares what came back against
 * ground truth computed from the raw table dumps. Everything here is built to
 * REFUSE rather than guess: a lenient extractor scores a wrong answer as a
 * pass, which is worse than having no harness, because it converts a shipped
 * falsehood into a green check. Refusing costs one un-scored question.
 *
 * The refusals exist because of real answers that shipped to readers, e.g.
 * "104 House bills became law ... the party split is 56 Republican and 8
 * Democratic" — 56 + 8 = 64, contradicting the 104 in the same paragraph. An
 * extractor that took the first number would have scored that against 104 and
 * called it correct; an extractor that took any matching number would have
 * scored it against 64 and also called it correct. Both hide the defect, so
 * more than one surviving number is an ambiguity refusal.
 *
 * Pure module: no Convex imports, no _generated, so it is unit-testable.
 */

export type Extraction =
  | { found: true; value: string | number | boolean }
  | { found: false; reason: string };

/** Bill types the site stores, keyed by the printed form the model writes. */
const BILL_TYPES = ["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"] as const;

/**
 * Printed bill references: "H.R. 6644", "H.R.6644", "S. 629", "H.J.Res. 213".
 *
 * The lookbehind stops "U.S. 5", the possessive in "California's 54 members"
 * (which otherwise read as "S. 54"), and the "hr" inside a composite id like
 * "6644hr119". Longer prefixes are listed first so
 * "H.Con.Res." never degrades into "H." + junk. The type is recovered by
 * stripping punctuation from the matched prefix, which is why the alternation
 * can afford to be loose about dots and spaces.
 */
const BILL_REFERENCE =
  /(?<![A-Za-z0-9.'’-])(H\.?\s?J\.?\s?Res\.?|S\.?\s?J\.?\s?Res\.?|H\.?\s?Con\.?\s?Res\.?|S\.?\s?Con\.?\s?Res\.?|H\.?\s?Res\.?|S\.?\s?Res\.?|H\.?\s?R\.?|S\.?)\s?(\d{1,5})\b/gi;

/** Composite ids as the site prints them in links, e.g. "6644hr119". */
const COMPOSITE_ID = new RegExp(`\\b\\d{1,5}(?:${BILL_TYPES.join("|")})\\d{3}\\b`, "gi");

/**
 * Numbers small enough that the model writes them as words. Zero is included:
 * "zero bills" is exactly the kind of claim this harness exists to catch — every
 * member with a two-word surname was reported as having introduced zero bills.
 */
const UNIT_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

/**
 * Tens, so a compound reads as one number. Without them "sixty-four" scored as
 * the 4 alone and "twenty-five" as an ambiguous 20-and-5 — both wrong, and the
 * first is a silent false pass: the real fewest-bills count in California is 5
 * (James Gallagher), so an answer that wrongly said "twenty-five" (Tom
 * McClintock's count) would have been read as 5 and scored correct.
 */
const TENS_NUMBERS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const WORD_NUMBERS: Record<string, number> = { ...UNIT_NUMBERS, ...TENS_NUMBERS };

/**
 * Magnitudes we deliberately do not parse. "One hundred bills" used to yield 1
 * and "thirty-seven thousand" 7, each returned as a confident value; the audit's
 * own phrasing ("37,000 bills still in committee") is exactly this shape. A
 * wrong number with found:true is the failure mode this module exists to avoid,
 * so the whole extraction refuses instead.
 */
const MAGNITUDES = "hundred|thousand|million|billion";

/**
 * Groups: 1-2 compound tens ("sixty-four"), 3 bare tens, 4 unit, 5 the trailing
 * word that decides whether this is a count at all.
 */
const WORD_NUMBER = new RegExp(
  `\\b(?:(${Object.keys(TENS_NUMBERS).join("|")})[-\\s](${Object.keys(UNIT_NUMBERS).join("|")})` +
    `|(${Object.keys(TENS_NUMBERS).join("|")})` +
    `|(${Object.keys(UNIT_NUMBERS).join("|")}))\\b(?:\\s+(of|${MAGNITUDES})\\b)?`,
  "gi",
);

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";

/**
 * Remove the digits that are never the claim, so the ambiguity check only sees
 * candidate answers. Each removal leaves a space behind so neighbouring digits
 * cannot fuse into a new number.
 */
function stripNonClaims(text: string): string {
  return (
    text
      // Link targets carry the bill id and the congress; neither is an assertion.
      .replace(/https?:\/\/\S+/g, " ")
      // Citation markers in every shape the answer engine emits.
      .replace(/\[\[[^\]]*\]\]/g, " ")
      .replace(/\[\^\d+\]/g, " ")
      .replace(/\[\s*\d+(?:\s*[,;]\s*\d+)*\s*\]/g, " ")
      .replace(COMPOSITE_ID, " ")
      .replace(BILL_REFERENCE, " ")
      // Dates. "2025-04-24" would otherwise contribute 4 and 24, and a stray
      // date is the most common cause of a false ambiguity refusal.
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
      .replace(new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{4})?`, "gi"), " ")
      // Ordinals are Congress numbers here ("119th Congress", "the 118th"),
      // never counts.
      .replace(/\b\d+(?:st|nd|rd|th)\b/gi, " ")
      // Bare years. Digit-adjacency only: a thousands-separated number never
      // contains four consecutive digits, so "18,476" is safe, while "in 2021,"
      // and "in 2021." must still lose their year.
      .replace(/(?<!\d)(?:1[7-9]\d{2}|20\d{2})(?!\d)/g, " ")
  );
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}

/**
 * The single number an answer asserts, or a refusal.
 *
 * More than one surviving number is a refusal, not a best guess: the production
 * "104 ... 56 ... 8" answer contradicted itself inside one paragraph, and any
 * pick-one rule would have scored it as a pass.
 */
export function extractNumber(text: string): Extraction {
  const cleaned = stripNonClaims(text);
  const values: number[] = [];

  for (const m of cleaned.matchAll(/\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?/g)) {
    values.push(Number(m[0].replace(/,/g, "")));
  }
  for (const m of cleaned.matchAll(WORD_NUMBER)) {
    const trailer = (m[5] ?? "").toLowerCase();
    if (trailer && trailer !== "of") {
      return {
        found: false,
        reason: `unparsed spelled-out number "${m[0].trim()}" in: "${snippet(text)}"`,
      };
    }
    if (m[1]) {
      values.push(TENS_NUMBERS[m[1].toLowerCase()] + UNIT_NUMBERS[m[2].toLowerCase()]);
      continue;
    }
    if (m[3]) {
      values.push(TENS_NUMBERS[m[3].toLowerCase()]);
      continue;
    }
    const word = m[4].toLowerCase();
    // "one of the bills" is a pronoun, not a count.
    if (word === "one" && trailer === "of") continue;
    values.push(UNIT_NUMBERS[word]);
  }

  const distinct = [...new Set(values)];
  if (distinct.length === 0) {
    return { found: false, reason: `no number in the answer: "${snippet(text)}"` };
  }
  if (distinct.length > 1) {
    return {
      found: false,
      reason:
        `ambiguous: ${distinct.length} distinct numbers survive (${distinct.join(", ")}), ` +
        `so the answer does not assert one value`,
    };
  }
  return { found: true, value: distinct[0] };
}

/**
 * The site's composite id for the first bill the answer names, e.g. "629s119".
 *
 * First, not best: an answer names the bill it is answering about and then
 * lists neighbours "for context", so a later reference is not the claim.
 * Only printed forms count — a bare link target is not the model asserting
 * anything.
 */
export function extractBillId(text: string, congress = 119): Extraction {
  BILL_REFERENCE.lastIndex = 0;
  const match = BILL_REFERENCE.exec(text);
  BILL_REFERENCE.lastIndex = 0;

  if (!match) {
    return { found: false, reason: `no bill named in the answer: "${snippet(text)}"` };
  }

  const type = match[1].replace(/[^A-Za-z]/g, "").toLowerCase();
  if (!(BILL_TYPES as readonly string[]).includes(type)) {
    return { found: false, reason: `unknown bill type '${match[1]}' in "${snippet(text)}"` };
  }
  // Leading zeros would miss the stored id: bills are keyed by "629", not "0629".
  return { found: true, value: `${String(Number(match[2]))}${type}${congress}` };
}

/**
 * Compare a member's name against the answer's prose.
 *
 * Names arrive wrapped in whatever markdown and punctuation the model chose —
 * "**James Gallagher**," — so both sides are flattened to lowercase words
 * before the match. Punctuation becomes a space rather than nothing, which
 * keeps the comparison on word boundaries: "Hill" must not match "Hillary".
 *
 * Accents are folded away first. Our own sponsor table stores the same member
 * under both spellings — "Nydia Velázquez" and "NYDIA VELAZQUEZ", "Jenniffer
 * González-Colón" and "Jenniffer Gonzalez-Colon" — so without folding the
 * harness could never confirm a correct answer about the eight members of the
 * 119th whose names carry a diacritic, and every one of them would read as the
 * missing-member defect the audit was built to find. No two distinct members
 * collapse together under folding, so it cannot manufacture a match.
 */
export function containsName(text: string, name: string): boolean {
  const flatten = (s: string) =>
    ` ${s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()} `;

  const needle = flatten(name);
  if (needle.trim().length === 0) return false;
  return flatten(text).includes(needle);
}

/** Phrases that assert something exists. */
const AFFIRMATIVE: Array<[string, RegExp]> = [
  ["yes", /\byes\b/i],
  ["there are", /\bthere\s+(?:are|is|were|was|have been)\b(?!\s+(?:no|none)\b)/i],
  ["we have", /\bwe\s+(?:do\s+)?(?:have|hold|track|store)\b(?!\s+(?:no|none)\b)/i],
];

/** Phrases that deny it. */
const NEGATIVE: Array<[string, RegExp]> = [
  // Sentence-initial "No" only; a bare "no" mid-sentence is usually "no later than".
  ["no", /(?:^|[.!?;:]\s+|\n\s*)no\b/i],
  ["there are no", /\bthere\s+(?:are|is|were|was|have been)\s+(?:no|none)\b/i],
  ["none", /\bnone\b/i],
  ["no <noun>", /\bno\s+(?:bills?|records?|data|such|matching|results?)\b/i],
  ["we do not", /\bwe\s+(?:do\s+not|don't|cannot|can't|do\s+not\s+currently)\s+(?:have|hold|track|store|cover)\b/i],
  ["zero", /\bzero\b/i],
  ["has not", /\b(?:has|have|did|do|does)\s+not\b|\b(?:hasn't|haven't|didn't|don't|doesn't)\b/i],
];

/** "eleven have", "11 have become law" — a positive count is an affirmative. */
const COUNT_AFFIRMATIVE = new RegExp(
  `\\b(\\d[\\d,]*|${Object.keys(WORD_NUMBERS).join("|")})\\s+(?:of\\s+(?:them|these)\\s+)?(?:have|has|were|are|did)\\b`,
  "i",
);

/**
 * Whether the answer says yes or no.
 *
 * Refuses when both directions appear. That case is not pedantry: production
 * shipped "we don't have data on Texas bills that became law" when eleven had,
 * and a hedged answer that both denies and counts is not a checkable claim.
 */
export function extractBoolean(text: string): Extraction {
  // Markdown emphasis hides sentence-initial "**No**," from the anchors below.
  // The typographic apostrophe has to become a straight one or "we don’t have
  // data on Texas bills that became law" — the production denial this harness
  // exists to catch, and the form a model actually writes — matches no denial
  // at all and goes unscored.
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/\[\s*\d+(?:\s*[,;]\s*\d+)*\s*\]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[*_`#~]/g, "");

  const yes = AFFIRMATIVE.filter(([, re]) => re.test(cleaned)).map(([label]) => label);
  const no = NEGATIVE.filter(([, re]) => re.test(cleaned)).map(([label]) => label);

  const count = COUNT_AFFIRMATIVE.exec(cleaned);
  if (count) {
    const raw = count[1].toLowerCase();
    const value = /^\d/.test(raw) ? Number(raw.replace(/,/g, "")) : WORD_NUMBERS[raw];
    // "zero have become law" is the denial, not the affirmative.
    if (value > 0) yes.push(`${count[1]} have`);
  }

  if (yes.length > 0 && no.length > 0) {
    return {
      found: false,
      reason:
        `contradictory: the answer both affirms (${yes.join(", ")}) and denies ` +
        `(${no.join(", ")})`,
    };
  }
  if (yes.length > 0) return { found: true, value: true };
  if (no.length > 0) return { found: true, value: false };
  return { found: false, reason: `no yes/no in the answer: "${snippet(text)}"` };
}
