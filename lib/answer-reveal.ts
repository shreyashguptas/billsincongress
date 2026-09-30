/**
 * The paced reveal of a finished answer in the ask panel.
 *
 * The server sends an answer only once its citations are resolved (see
 * "Prose is emitted only after citations are resolved" in
 * Documentation/overview.md), so it arrives all at once. Printing a wall of
 * prose in a single frame reads as abrupt; this module paces it back out word
 * by word on the page. Nothing here changes WHAT is shown — only how quickly
 * the already-checked text appears — so the citation guarantee is untouched:
 * no word reaches the screen that was not in the final answer.
 *
 * Pure module so it carries unit tests (answer-reveal.test.ts).
 */

/** The pace of a short answer: quick enough to feel live, slow enough to follow. */
export const REVEAL_WORDS_PER_SECOND = 40;

/** A long answer speeds up so the reader never waits more than this for the end. */
export const REVEAL_MAX_MS = 5_000;

/**
 * Ranges a reveal must never stop inside, because the half-typed form renders
 * as something else: an entity or citation directive (`[[bills:…]]`, which
 * would show as raw brackets and then snap into a card), a markdown link
 * (`[text](url)`), and inline code.
 */
const ATOMIC = [/\[\[[^\]]*\]\]/g, /\[[^\]\n]*\]\([^)\n]*\)/g, /`[^`\n]*`/g];

/**
 * A token that is only a block marker — a list bullet, a numbered-list number,
 * a heading's hashes, a quote's `>` — is joined to the word after it. Stopping
 * right after a bare `-` on a new line would render, for one frame, as a
 * setext underline that turns the previous paragraph into a heading.
 */
const BLOCK_MARKER = /^(?:[-*+>#=_]+|\d+[.)])$/;

/**
 * The offsets in `text` a reveal may stop at, in order: the end of every word,
 * except where stopping would leave broken markdown on screen. The last stop
 * is always the end of the text's final word.
 */
export function revealStops(text: string): number[] {
  const atomic: Array<[number, number]> = [];
  for (const pattern of ATOMIC) {
    for (const m of text.matchAll(pattern)) atomic.push([m.index!, m.index! + m[0].length]);
  }
  const insideAtomic = (at: number) => atomic.some(([s, e]) => at > s && at < e);
  const atLineStart = (at: number) => {
    let i = at - 1;
    while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
    return i < 0 || text[i] === '\n';
  };

  const stops: number[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (BLOCK_MARKER.test(m[0]) && atLineStart(start)) continue;
    if (insideAtomic(end)) continue;
    stops.push(end);
  }
  return stops;
}

/** How many stops are revealed `elapsedMs` after the reveal began. */
export function revealCount(totalStops: number, elapsedMs: number): number {
  const perSecond = Math.max(REVEAL_WORDS_PER_SECOND, (totalStops * 1000) / REVEAL_MAX_MS);
  return Math.min(totalStops, Math.max(0, Math.floor((elapsedMs / 1000) * perSecond)));
}

/**
 * Close emphasis the cut left open, so a half-revealed `**bold phrase` renders
 * bold rather than as literal asterisks until its closing pair arrives.
 */
export function healPartialMarkdown(partial: string): string {
  let healed = partial;
  const bold = partial.match(/\*\*/g)?.length ?? 0;
  if (bold % 2 === 1) healed += '**';
  // Single-asterisk italics, ignoring bold pairs and list bullets.
  const singles =
    partial
      .replace(/\*\*/g, '')
      .replace(/^[ \t]*\*[ \t]/gm, '')
      .match(/\*/g)?.length ?? 0;
  if (singles % 2 === 1) healed = bold % 2 === 1 ? `${partial}***` : `${healed}*`;
  return healed;
}

/** The text to render when `count` of `stops` are revealed. */
export function revealedText(text: string, stops: number[], count: number): string {
  if (count >= stops.length) return text;
  if (count <= 0) return '';
  return healPartialMarkdown(text.slice(0, stops[count - 1]));
}

// ── Word spans ──────────────────────────────────────────────────────────────
// Minimal structural types for the hast tree react-markdown hands a rehype
// plugin; `hast` itself is only a transitive dependency.

interface HastText {
  type: 'text';
  value: string;
  position?: { start: { offset?: number } };
}
interface HastElement {
  type: 'element';
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
}
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };

/** Class that fades a single word in (app/globals.css). */
export const WORD_CLASS = 'animate-word-in';

/**
 * A rehype plugin that wraps every word of prose in its own span, so each one
 * fades in as the reveal reaches it. React keys a span by its position among
 * its siblings, and the reveal only ever appends, so a word already on screen
 * keeps its DOM node and does not fade a second time.
 *
 * `settledBefore` is a source offset in the markdown: words that start before
 * it get a plain span with no fade. That is for a turn that remounts part-way
 * through its reveal, whose words already on screen are new DOM nodes and
 * would otherwise all fade in again at once.
 */
export function rehypeWordSpans(options: { settledBefore?: number } = {}) {
  const settledBefore = options.settledBefore ?? 0;
  const split = (node: HastNode) => {
    if (!('children' in node) || !node.children) return;
    if (node.type === 'element' && ['code', 'pre'].includes((node as HastElement).tagName)) return;
    const next: HastNode[] = [];
    for (const child of node.children) {
      if (child.type !== 'text') {
        split(child);
        next.push(child);
        continue;
      }
      const origin = (child as HastText).position?.start.offset;
      let at = 0;
      for (const part of (child as HastText).value.split(/(\s+)/)) {
        const offset = origin === undefined ? Infinity : origin + at;
        at += part.length;
        if (part === '') continue;
        next.push(
          /^\s+$/.test(part)
            ? { type: 'text', value: part }
            : {
                type: 'element',
                tagName: 'span',
                properties: offset < settledBefore ? {} : { className: [WORD_CLASS] },
                children: [{ type: 'text', value: part }],
              },
        );
      }
    }
    node.children = next;
  };
  return (tree: HastNode) => split(tree);
}
