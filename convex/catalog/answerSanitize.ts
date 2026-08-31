/**
 * Strip the model's working-out out of the answer (defect D21).
 *
 * `convex/answer.ts` sends `reasoning: { enabled: false }`, so the model has no
 * scratchpad and its deliberation has nowhere to land but the answer body. The
 * system prompt in `tools.ts` already says "Never narrate your own process" and
 * it does not hold. Three paragraphs that reached readers:
 *
 *   "The dataset returned all 29 California members (total_matching: 29,
 *    truncated: false). The member with the fewest bills is Tom McClintock with
 *    25 bills."  — internal field names quoted to the reader as reassurance, for
 *    an answer that was wrong twice over (54 California members sponsored bills
 *    in the 119th; the fewest was James Gallagher with 5).
 *   "our member-by-member count dataset only captured Kevin Cramer's total" and
 *    "our per-member records appear incomplete for Georgia" — a FALSE accusation
 *    against the site's own data, published in the site's voice. The data is
 *    complete; a read cap was hiding rows.
 *   "Let me confirm this is the most recent by checking the top of the list —
 *    yes, it's the first row."
 *
 * A prompt line is a request. This file is the enforcement.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */

export interface SanitizeResult {
  text: string;
  /** What was removed, for logging and tests. Empty when nothing was. */
  removed: string[];
}

/** The internal field names and tool words that must never reach a reader. */
export const INTERNAL_VOCABULARY: string[] = [
  "total_matching",
  "total_is_at_least",
  "total_is_exact",
  "count_unavailable",
  "countIsLowerBound",
  "truncated",
  "fetch_dataset",
  "describe_dataset",
  "search_web",
  "progressStage",
  "policyAreaName",
  "_cite",
  "tool call",
  "dataset",
  "the datasets",
  "rows returned",
  "limit 50",
  "scan window",
  // Vocabulary of the completeness contract (convex/catalog/completeness.ts).
  // Only the unambiguous forms are listed: "complete", "order", "total" and
  // "set" are ordinary English and banning them outright would mangle honest
  // prose like "the complete list" or "a set of bills". The prompt asks the
  // model not to use them as field names; these are the ones that could only
  // ever be a leak.
  "order_meaning",
  "rows_are_a_sample_of_a_known_total",
  "stageCounts_unavailable",
  "complete: true",
  "complete: false",
  "ask_reader",
  "reachedStage",
  "sponsorFilter",
  "titleFilter",
  "policyArea filter",
];

/**
 * Word-ish boundaries, plus an optional plural. The boundaries stop "truncated"
 * from firing inside "untruncated"; the plural catches "tool calls" and "our
 * datasets", which the bare singular would miss. Nothing in the corpus collides:
 * zero of the 55,619 bill titles contain "dataset".
 */
const VOCABULARY_PATTERNS: RegExp[] = INTERNAL_VOCABULARY.map(
  (term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i"),
);

/**
 * Narration that only counts when it OPENS the paragraph. "Wait" in the middle
 * of a sentence is ordinary English — "applicants must wait 30 days" — so
 * matching it anywhere would delete real answers.
 */
const OPENING_MARKERS = ["let me", "let's", "actually, let me", "now let me", "first, i"];

/**
 * "Wait" opens narration only when a break follows it: "Wait, that's the 118th",
 * "Wait — the question says the 119th". Bare "Wait" also opens real answers in
 * this corpus — 14 bill titles and 87 summaries are about wait times ("Stop the
 * Wait Act", "Military Housing Wait Times Accountability Act") — so an opener
 * test on the word alone deleted "Wait times at the VA averaged 120 days",
 * which is an answer, not working-out. Deliberation that runs on past the word
 * ("Wait let me recheck") is still caught by the process markers below.
 */
const WAIT_NARRATION = /^wait\s*[,.:;!?…—–-]/;

/**
 * Narration specific enough to recognise wherever it sits in the paragraph.
 * Deliberately none of these is a bare "I": "I could not find that" is an honest
 * answer and has to survive.
 */
const PROCESS_MARKERS = [
  "let me",
  "let's",
  "i'll check",
  "i need to",
  "i should",
  "looking at the data",
  "the result says",
  "the dataset returned",
  "based on the search results",
  "i have the data",
];

/**
 * Same word-ish boundaries as the vocabulary, and for the same reason. Matching
 * these as bare substrings deleted ordinary opening sentences: "would let
 * members of the public comment" contains "let me", "Hawaii should receive the
 * funds" contains "i should" (as do Missouri and Mississippi — 1,776 bills in
 * the corpus are sponsored from those three states), and "the outlet's coverage"
 * contains "let's". Deleting the answer is the same defect as publishing the
 * narration, pointed the other way.
 */
const PROCESS_PATTERNS: RegExp[] = PROCESS_MARKERS.map(
  (m) => new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
);

/** Lowercase, straighten smart quotes, drop leading markdown decoration. */
function normalize(paragraph: string): string {
  return paragraph
    .replace(/[‘’]/g, "'")
    .replace(/^[\s>#*_~`\-•]+/, "")
    .toLowerCase();
}

function opensWith(text: string, marker: string): boolean {
  if (!text.startsWith(marker)) return false;
  const next = text.charAt(marker.length);
  return next === "" || !/\w/.test(next);
}

function isDeliberation(paragraph: string): boolean {
  const text = normalize(paragraph);
  if (text === "") return false;

  if (OPENING_MARKERS.some((m) => opensWith(text, m))) return true;
  if (WAIT_NARRATION.test(text)) return true;

  // The tell is almost always in the opening sentence ("The dataset returned
  // all 29 California members. The member with the fewest is..."), so the rest
  // of the paragraph does not get to vote on a marker it merely quotes.
  const firstSentence = text.split(/(?<=[.!?…])\s+/)[0];
  if (PROCESS_PATTERNS.some((re) => re.test(firstSentence))) return true;

  // "Dominated by" process markers: two or more anywhere is working-out, not prose.
  return PROCESS_PATTERNS.filter((re) => re.test(text)).length >= 2;
}

function leaksVocabulary(paragraph: string): boolean {
  return VOCABULARY_PATTERNS.some((re) => re.test(paragraph));
}

/** A paragraph plus the exact separator that followed it, so a rejoin is lossless. */
interface Block {
  text: string;
  separator: string;
}

/**
 * Paragraphs are separated by a blank line. A run of blank lines belongs to the
 * separator, but the next paragraph's own indentation does not — a dropped
 * paragraph takes its separator with it, and stealing the indentation of the
 * paragraph after it would re-flow surviving markdown.
 */
function splitBlocks(input: string): Block[] {
  const blocks: Block[] = [];
  const separator = /\n(?:[^\S\n]*\n)+/g;
  let cursor = 0;
  for (const match of input.matchAll(separator)) {
    const at = match.index ?? cursor;
    blocks.push({ text: input.slice(cursor, at), separator: match[0] });
    cursor = at + match[0].length;
  }
  blocks.push({ text: input.slice(cursor), separator: "" });
  return blocks;
}

/**
 * Strip leading deliberation and any paragraph that leaks internal vocabulary.
 * Never removes the whole answer: if every paragraph would be dropped, the input
 * is returned unchanged with removed: [] — a mangled answer is worse than a
 * leaky one.
 */
export function sanitizeAnswer(text: string): SanitizeResult {
  const blocks = splitBlocks(text);
  const dropped = new Set<number>();

  // Pass 1: the leading run of deliberation. Blank blocks in front of it go too,
  // but only once a real deliberation paragraph is found behind them — otherwise
  // a clean answer would lose its leading whitespace.
  const pendingBlanks: number[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const body = blocks[i].text;
    if (body.trim() === "") {
      pendingBlanks.push(i);
      continue;
    }
    if (!isDeliberation(body)) break;
    for (const blank of pendingBlanks) dropped.add(blank);
    pendingBlanks.length = 0;
    dropped.add(i);
  }

  // Pass 2: internal vocabulary, wherever it appears.
  for (let i = 0; i < blocks.length; i++) {
    if (dropped.has(i)) continue;
    if (blocks[i].text.trim() === "") continue;
    if (leaksVocabulary(blocks[i].text)) dropped.add(i);
  }

  const removed = [...dropped]
    .sort((a, b) => a - b)
    .map((i) => blocks[i].text)
    .filter((body) => body.trim() !== "");
  if (removed.length === 0) return { text, removed: [] };

  const survivors = blocks.filter((_, i) => !dropped.has(i));
  if (survivors.every((b) => b.text.trim() === "")) {
    // Everything was deliberation. Publishing nothing is the worse failure.
    return { text, removed: [] };
  }

  const out = survivors
    .map((b, i) => (i < survivors.length - 1 ? b.text + b.separator : b.text))
    .join("");
  return { text: out, removed };
}
