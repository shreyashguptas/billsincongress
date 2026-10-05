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

/**
 * A sentence that NAMES legislation is talking about Congress, not about itself.
 *
 * Six bill titles in the corpus open with a phrase the narration matchers hit —
 * "Let Me Travel America Act", "Let's Get to Work Act of 2022" — so an answer
 * whose paragraph began with one was classed as working-out and dropped whole.
 * Deleting a real answer is the same defect as publishing narration, pointed the
 * other way. Capitalised on purpose: "the act of introducing" is not a title.
 */
const NAMES_LEGISLATION = /\b(?:Act|Resolution|Amendment)\b/;

function isDeliberation(paragraph: string): boolean {
  const text = normalize(paragraph);
  if (text === "") return false;
  if (NAMES_LEGISLATION.test(paragraph)) return false;

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

/**
 * Narration that OPENS a sentence and asserts nothing about Congress.
 *
 * Measured against production after the breakdown fix shipped: three answers in
 * four opened with one of these — "I have a complete breakdown of all 104 laws",
 * "I have everything I need.", "I have the complete breakdown." The paragraph
 * detector cannot catch them, because it inspects only the FIRST sentence of a
 * paragraph, and in one case the narration and the answer shared one:
 * "I have everything I need. The 119th Congress has 104 laws passed so far."
 * Dropping that paragraph would have taken the answer with it.
 *
 * Anchored at the sentence start, and deliberately NOT matching a bare "I have":
 * "I have no record of that" is an honest answer and must survive, as must
 * "I haven't got that".
 */
const SENTENCE_NARRATION: RegExp[] = [
  /^i have (?:the|a|all|everything|what)\b/,
  /^(?:now )?let(?:'s| me| us)\b/,
  /^actually,\s*let\b/,
  // Same rule as WAIT_NARRATION: only when a break follows, because 14 bill
  // titles and 87 summaries in the corpus are about wait times.
  /^wait\s*[,.:;!?…—–-]/,
  /^i(?:'ll| will| need to| should| can now)\b/,
  /^(?:ok|okay|right|good)[,.]\s/,
  /^(?:first|next|now)[,]\s+i\b/,
  /^the (?:result|results|dataset|data|row|rows|fetch|lookup) (?:says|show|shows|returned|gave)\b/,
  /^based on (?:the|my) (?:search|lookup|results|data)\b/,
  /^looking at the (?:data|results|rows)\b/,
];

/**
 * Split a paragraph into sentences, keeping each one's trailing whitespace.
 *
 * Colons and semicolons count as breaks, because the model joins its narration
 * to the answer with one: "I need to check this and I should confirm: 104 laws
 * passed this session." Splitting only on . ! ? made that one indivisible unit,
 * so trimming the narration took the fact with it. A trailing space is required,
 * so "51:50" and "3:30" stay whole.
 */
function splitSentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?…:;])(\s+)/).reduce<string[]>((out, part, i) => {
    if (i % 2 === 0) out.push(part);
    else out[out.length - 1] += part;
    return out;
  }, []);
}

/**
 * Drop the leading run of narration sentences from a paragraph.
 *
 * Sentence-level, not paragraph-level, precisely because the model mixes the two
 * in one breath. Only ever trims from the FRONT: once a sentence says something
 * about Congress, everything after it is the answer and is left alone.
 */
export function trimLeadingNarration(paragraph: string): string {
  const sentences = splitSentences(paragraph);
  let i = 0;
  while (i < sentences.length) {
    const normalised = normalize(sentences[i]).trim();
    if (normalised === "") {
      i++;
      continue;
    }
    if (NAMES_LEGISLATION.test(sentences[i])) break;
    if (!SENTENCE_NARRATION.some((re) => re.test(normalised))) break;
    i++;
  }
  return sentences.slice(i).join("").replace(/^\s+/, "");
}

/**
 * Working-out that can sit ANYWHERE in an answer, not only at its start.
 *
 * Production on 2026-10-05, asked "how many bills about wildfire were
 * introduced": the reply opened with a fact, then thought out loud for two
 * paragraphs ("Let me also consider whether the reader means bills specifically
 * about wildfire… Actually, the title search is a reasonable proxy here. The
 * question asks… That's a good answer. Let me state it."), then wrote the answer
 * again. Every rule above looks only at the front of the reply, so all of it was
 * published.
 *
 * Deliberately NOT SENTENCE_NARRATION: those only ever trim the front of the
 * first paragraph, and several match whole sentences that carry facts ("I should
 * note that the Senate has not voted on it", "The results show that…", "Based
 * on the data, …"). Deleting those mid-answer would remove true statements. This
 * list is only sentences that say what the model is DOING, never what is true.
 */
const THINKING_SENTENCES: RegExp[] = [
  // "Let me also check…", "Let's look at…", "Let me state it." A process verb is
  // required: "Let me note that five became law" carries a fact and stays.
  /^(?:now )?let(?:'s| me| us) (?:also |now |first |quickly )?(?:check|look|see|consider|fetch|find|verify|confirm|state|write|give|answer|re-?check|think|start|try|search|count|pull|get|break|double-check)\b/,
  /^actually,\s*let\b/,
  /^i(?:'ll| will) (?:check|look|fetch|verify|confirm|state|write|give|answer|search)\b/,
  // "That's a good answer." "That is the right figure."
  /^(?:that's|that is) (?:a |the |our )?(?:good|right|correct|reasonable|complete|full|final) (?:answer|proxy|approach|figure|number|count)\b/,
  // The model talking about the question, or about the reader, in the third person.
  // Not a bare "The question is…": "The question is whether the Senate will act
  // before January" is an answer.
  /^the question (?:asks|is asking|wants)\b/,
  // Only with a verb about intent: "The user fees fund inspections" is an answer.
  /\bthe (?:reader|user) (?:means|meant|wants|wanted|is asking|asks|asked|might mean|probably means|is looking for)\b/,
  // "The total is exact:" — describing the lookup instead of stating the fact.
  /^(?:the )?(?:total|count|result|results|number) (?:is|are) (?:exact|complete|final|correct)\b/,
];

/** A closing offer, not working-out: removed as filler, but never a restart point. */
const CLOSING_OFFER = /^let me know\b/;

/**
 * A figure, in digits or words. A sentence that carries one is stating a fact,
 * however it opens: "Let's start with the House, where 40 were introduced."
 */
const CARRIES_A_FIGURE =
  /\d|\b(?:none|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|dozen)\b/;

function isThinkingSentence(sentence: string): boolean {
  const text = normalize(sentence).trim();
  if (text === "") return false;
  if (NAMES_LEGISLATION.test(sentence)) return false;
  if (CARRIES_A_FIGURE.test(text)) return false;
  // "Actually," on its own is not thinking: "Actually, the Senate has not voted
  // on it, so it is not law" is how a correction to the reader's premise reads.
  return THINKING_SENTENCES.some((re) => re.test(text));
}

/** A line that is only card directives ("[[bills:1234hr119]]"): never prose, never thinking. */
function isDirectiveBlock(text: string): boolean {
  const t = text.trim();
  return t !== "" && /^(?:\[\[[^\]]+\]\]\s*)+$/.test(t);
}

/** The block with every thinking sentence (and closing offer) taken out. */
function withoutThinking(text: string): string {
  return splitSentences(text)
    .filter((sentence) => {
      const normalised = normalize(sentence).trim();
      if (CLOSING_OFFER.test(normalised)) return false;
      return !isThinkingSentence(sentence);
    })
    .join("")
    .trim();
}

/**
 * Whether a block shows the model thinking. A closing offer ("Let me know if…")
 * alone does not count: it is filler at the end of an answer, not a sign that
 * the answer starts again below it.
 */
function showsThinking(text: string): boolean {
  if (isDirectiveBlock(text)) return false;
  return splitSentences(text).some((sentence) => {
    if (CLOSING_OFFER.test(normalize(sentence).trim())) return false;
    return isThinkingSentence(sentence);
  });
}

/** Enough left to be an answer: real words, not a fragment or a lone directive. */
function isSubstantive(text: string): boolean {
  const t = text.trim();
  return t.length >= 15 && /[a-z]/i.test(t) && !isDirectiveBlock(t);
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
 * True when the whole text is the model's working-out and nothing else.
 *
 * `sanitizeAnswer` deliberately returns such a text unchanged rather than
 * emptying it, because mangling an answer is worse than a leaky one. But that
 * makes a deliberation-only reply indistinguishable from a clean one, and a
 * reader was shown "Let me fetch the remaining policy areas I haven't gotten
 * yet." as an answer. The caller uses this to fall back to an honest message
 * instead of publishing the model thinking out loud.
 */
export function isAllDeliberation(text: string): boolean {
  const blocks = splitBlocks(text).filter((b) => b.text.trim() !== "");
  if (blocks.length === 0) return false;
  // Process narration ONLY. A leaked field name is not grounds to throw the
  // answer away: production returned "The House-only row shows 64 measures that
  // became law, and partyLawCounts sums to 64" — ugly, leaky, and RIGHT. Binning
  // that would have cost the reader a correct answer to protect them from a
  // word. Vocabulary leaks are handled by dropping the paragraph when others
  // survive; when none do, a leaky true answer beats no answer.
  return blocks.every((b) => isDeliberation(b.text) || isAllThinking(b.text));
}

/**
 * Every sentence of the block is thinking (THINKING_SENTENCES): "The question
 * asks about wildfire. That's a good answer." isDeliberation predates those
 * shapes, so without this a reply made only of them was published as an answer.
 */
function isAllThinking(text: string): boolean {
  const sentences = splitSentences(text).filter((x) => x.trim() !== "");
  return sentences.length > 0 && sentences.every((x) => isThinkingSentence(x) || CLOSING_OFFER.test(normalize(x).trim()));
}

/**
 * A lookup written out as prose instead of made.
 *
 * Traced answers on 2026-10-01 showed readers a literal
 * `fetch_dataset(dataset="bills", filters={"congress": 119}, limit=0)` followed
 * by "the total is 1,557" — a number the model never fetched (the real count was
 * 19,441). Others were nothing but `search_web`'s arguments as `query:` and
 * `reason:` lines, or a run of `describe_dataset` JSON. The model meant to call a
 * tool, wrote the call as text, and then either stopped or invented the result.
 *
 * The paragraph rules above cannot remove these: the call sits on its own LINE
 * inside the same paragraph as the prose around it, and dropping the whole
 * paragraph empties the answer, which `sanitizeAnswer` refuses to do. Stripping
 * the line would not help either — the prose next to it is unverified, which is
 * how 1,557 reached a reader. So the caller treats such a reply as no answer at
 * all and asks again, exactly as for narration.
 *
 * Each shape is specific to a call. Ordinary prose never opens a line with
 * `{"name":` or writes a tool name followed by a bracket; a `query:` line alone
 * could be a heading, so it only counts with the `reason:` line search_web takes
 * alongside it. Lowercase on purpose: "Reason:" in a sentence is English.
 */
const TEXT_TOOL_CALL: RegExp[] = [
  /\b(?:fetch_dataset|describe_dataset|search_web|ask_reader)\s*\(/,
  /^\s*\{\s*"name"\s*:.*"(?:filters|short_description)"\s*:/m,
];
const ARGUMENT_LINE = (key: string) => new RegExp(`^\\s*["']?${key}["']?\\s*:`, "m");
const QUERY_LINE = ARGUMENT_LINE("query");
const REASON_LINE = ARGUMENT_LINE("reason");

export function containsTextToolCall(text: string): boolean {
  if (TEXT_TOOL_CALL.some((re) => re.test(text))) return true;
  return QUERY_LINE.test(text) && REASON_LINE.test(text);
}

/** Lowercase, straight quotes, single spaces, no closing punctuation. */
function normalizeEcho(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/[\s?.!…]+$/, "")
    .trim()
    .toLowerCase();
}

/** Fewer words than this is too little to call an echo: "the 119th" is not one. */
const MIN_ECHO_WORDS = 3;

/**
 * Drop a first line that is only the tail end of the reader's own question.
 *
 * A traced answer on 2026-10-01 opened with the last few words of what the
 * reader had typed, on a line of its own, before the answer proper. Only the
 * FIRST line, only when it is a whole-word suffix of the question that does not
 * end a sentence of its own, and only when something follows it: an answer that is nothing but the echo is left for the
 * caller's empty-answer handling rather than blanked here.
 */
export function dropQuestionEcho(text: string, question: string): SanitizeResult {
  const newline = text.indexOf("\n");
  if (newline === -1) return { text, removed: [] };
  const firstLine = text.slice(0, newline);
  const rest = text.slice(newline + 1);
  if (rest.trim() === "") return { text, removed: [] };

  // A line that ends a sentence is a statement, not a fragment of a question:
  // asked "Can you confirm S. 629 became law?", the answer "S. 629 became law."
  // ends the question too, and is the answer.
  if (/[.!]\s*$/.test(firstLine)) return { text, removed: [] };
  const line = normalizeEcho(firstLine);
  const asked = normalizeEcho(question);
  if (line === "" || line.split(" ").length < MIN_ECHO_WORDS) return { text, removed: [] };
  if (!asked.endsWith(line)) return { text, removed: [] };
  // Whole words only: "law" must not match the end of "outlaw".
  const before = asked.charAt(asked.length - line.length - 1);
  if (before !== "" && /\w/.test(before)) return { text, removed: [] };

  return { text: rest.replace(/^\s+/, ""), removed: [firstLine.trim()] };
}

/**
 * Pass 3 of sanitizeAnswer: the model thinking out loud after the answer began.
 *
 * Two shapes, handled differently because one is far riskier to cut than the
 * other:
 *
 * - A RESTART: a draft, then thinking, then the answer written again (the
 *   wildfire reply). When a paragraph with at least two thinking sentences
 *   comes before a substantive block, everything up to and including the last
 *   thinking block goes; the answer is what the model wrote after it finished deliberating.
 *   Card directives in the cut part are kept, moved to the end, unless the
 *   final answer has its own.
 * - Stray sentences: thinking or a closing offer with no answer after it. Only
 *   those SENTENCES go, never the facts sharing their paragraph.
 *
 * Never empties the answer: if nothing substantive would survive, nothing is
 * removed, and the caller's isAllDeliberation check decides.
 */
function dropMidAnswerThinking(blocks: Block[]): { blocks: Block[]; removed: string[] } {
  const removed: string[] = [];
  let kept = blocks;

  let last = -1;
  kept.forEach((b, i) => {
    if (showsThinking(b.text)) last = i;
  });
  // A restart needs a PARAGRAPH of deliberation before the cut: one block with
  // at least two thinking sentences. Transition lines ("Let's look at what they
  // have in common.", "Let's look at who sponsored them.") each sit alone in
  // their own block between paragraphs of answer; however many there are, they
  // are not a draft being thrown away, and cutting at them would delete the
  // headline fact above them.
  const deliberates = kept
    .slice(0, last + 1)
    .some((b) => splitSentences(b.text).filter((x) => isThinkingSentence(x)).length >= 2);
  if (
    last >= 0 &&
    deliberates &&
    kept.slice(last + 1).some((b) => isSubstantive(withoutThinking(b.text)))
  ) {
    const cut = kept.slice(0, last + 1);
    const rest = kept.slice(last + 1);
    const cards = cut.filter((b) => isDirectiveBlock(b.text));
    const restHasCards = rest.some((b) => isDirectiveBlock(b.text));
    for (const b of cut) {
      if (b.text.trim() !== "" && !(isDirectiveBlock(b.text) && !restHasCards)) removed.push(b.text);
    }
    if (restHasCards || cards.length === 0) {
      kept = rest;
    } else {
      // Cards follow the answer, a blank line below it.
      const body = rest.map((b, i) => (i === rest.length - 1 ? { ...b, separator: "\n\n" } : b));
      kept = [...body, ...cards.map((b) => ({ text: b.text, separator: "\n\n" }))];
    }
    // The new first block must not inherit leading blank lines.
    while (kept.length > 0 && kept[0].text.trim() === "") kept = kept.slice(1);
  }

  const cleaned: Block[] = [];
  for (const b of kept) {
    if (b.text.trim() === "" || isDirectiveBlock(b.text)) {
      cleaned.push(b);
      continue;
    }
    const sentences = splitSentences(b.text);
    const goes = sentences.filter((sentence) => {
      const normalised = normalize(sentence).trim();
      return CLOSING_OFFER.test(normalised) || isThinkingSentence(sentence);
    });
    if (goes.length === 0) {
      cleaned.push(b);
      continue;
    }
    const left = withoutThinking(b.text);
    removed.push(...goes.map((g) => g.trim()));
    if (left !== "") cleaned.push({ ...b, text: left });
  }

  if (!cleaned.some((b) => isSubstantive(b.text))) return { blocks, removed: [] };
  // The last block carries no separator, so the rejoin ends cleanly.
  if (cleaned.length > 0) cleaned[cleaned.length - 1] = { ...cleaned[cleaned.length - 1], separator: "" };
  return { blocks: cleaned, removed };
}

/**
 * Strip leading deliberation, any paragraph that leaks internal vocabulary, and
 * thinking that appears after the answer began (dropMidAnswerThinking).
 * Never removes the whole answer: if every paragraph would be dropped, the input
 * is returned unchanged with removed: [] — a mangled answer is worse than a
 * leaky one. When `question` is given, a first line that only repeats its end
 * goes first (see dropQuestionEcho).
 */
export function sanitizeAnswer(text: string, question?: string): SanitizeResult {
  if (question !== undefined) {
    const echo = dropQuestionEcho(text, question);
    if (echo.removed.length > 0) {
      const rest = sanitizeAnswer(echo.text);
      return {
        text: rest.text,
        removed: [...echo.removed, ...rest.removed],
      };
    }
  }
  const blocks = splitBlocks(text);
  const dropped = new Set<number>();
  /** Blocks whose opening narration was trimmed but whose answer survives. */
  const trimmedLeading = new Map<number, string>();
  /**
   * The narration trimmed off each such block, by index.
   *
   * Keyed rather than listed because pass 2 may go on to drop the whole block
   * anyway — a paragraph that leaks a field name goes entirely, trimmed or not.
   * Reporting both the trimmed sentence AND the whole paragraph would double-
   * count one removal in the log.
   */
  const leadingNarration = new Map<number, string>();

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
    // SENTENCE-AWARE FIRST. The paragraph-level check below matches on how a
    // paragraph OPENS, so running it first threw away everything after the
    // opener: "Let me check that. The 119th Congress passed 104 laws so far."
    // lost the fact along with the narration — the exact defect this trim
    // exists to prevent, triggered by its own headline example.
    const trimmed = trimLeadingNarration(body);
    if (trimmed.trim() === "") {
      // Every sentence was narration; the paragraph goes.
      for (const blank of pendingBlanks) dropped.add(blank);
      pendingBlanks.length = 0;
      dropped.add(i);
      continue;
    }
    if (trimmed !== body) {
      for (const blank of pendingBlanks) dropped.add(blank);
      pendingBlanks.length = 0;
      trimmedLeading.set(i, trimmed);
      leadingNarration.set(i, body.slice(0, body.length - trimmed.length).trim());
      break;
    }
    // Nothing trimmed from the front. The paragraph can still be working-out
    // spread across sentences that individually look fine — two or more process
    // markers anywhere. That is what isDeliberation catches and the sentence
    // matchers cannot.
    if (isDeliberation(body)) {
      for (const blank of pendingBlanks) dropped.add(blank);
      pendingBlanks.length = 0;
      dropped.add(i);
      continue;
    }
    break;
  }

  // Pass 2: internal vocabulary, wherever it appears.
  for (let i = 0; i < blocks.length; i++) {
    if (dropped.has(i)) continue;
    if (blocks[i].text.trim() === "") continue;
    if (leaksVocabulary(blocks[i].text)) dropped.add(i);
  }

  const removed = [
    // Only for blocks that survived pass 2; a dropped block reports its whole text.
    ...[...leadingNarration].filter(([i]) => !dropped.has(i)).map(([, body]) => body),
    ...[...dropped]
      .sort((a, b) => a - b)
      .map((i) => blocks[i].text)
      .filter((body) => body.trim() !== ""),
  ];

  for (const [i, trimmed] of trimmedLeading) blocks[i] = { ...blocks[i], text: trimmed };

  // Pass 3: working-out AFTER the answer has started (see THINKING_SENTENCES).
  let survivors = blocks.filter((_, i) => !dropped.has(i));
  const thinking = dropMidAnswerThinking(survivors);
  if (thinking.removed.length > 0) {
    survivors = thinking.blocks;
    removed.push(...thinking.removed);
  }

  if (removed.length === 0) return { text, removed: [] };

  if (survivors.every((b) => b.text.trim() === "")) {
    // Everything was deliberation. Returning the text unchanged keeps this
    // function from mangling an answer, but the CALLER must not publish it —
    // see isAllDeliberation. Production shipped "Let me fetch the remaining
    // policy areas I haven't gotten yet." to a reader as the answer.
    return { text, removed: [] };
  }

  const out = survivors
    .map((b, i) => (i < survivors.length - 1 ? b.text + b.separator : b.text))
    .join("");
  return { text: out, removed };
}
