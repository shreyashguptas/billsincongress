/**
 * How a text box with a length limit behaves, everywhere on the site.
 *
 * A box used to stop taking characters at its limit with no word of why
 * (`maxLength`), or, for the bill searches, take any length and cut it to 120
 * before searching. Either way the reader's text changed and nothing said so.
 * Now the box says it: a quiet count appears near the limit, and at the limit
 * the box nudges once and a line in the error colour gives the limit in words.
 * The pieces that draw it are in `components/brand/length-limit.tsx`.
 *
 * Pure module (no imports) so it carries unit tests.
 */

/**
 * Longest question the assistant takes: the ask boxes stop here, and
 * `app/api/answer/route.ts` and `convex/answer.ts` (its own copy, since Convex
 * code does not import from lib/) refuse anything longer.
 */
export const MAX_QUESTION_LENGTH = 2000;

/** The count appears once the text is this share of the way to its limit. */
export const COUNT_FROM = 0.9;

/**
 * The text a box keeps after an edit from `prev` to `next`, whether the edit
 * tried to go past the limit, and where the caret belongs.
 *
 * Only the part the edit ADDED is cut, never text the reader already had: a
 * letter typed into the middle of a full box is refused, and a paste keeps as
 * much of itself as fits. Cutting the tail instead (`next.slice(0, max)`)
 * deleted the reader's last characters whenever they edited anywhere but the
 * end. `caret` is where the caret goes after a cut edit: just after what was
 * kept of the insertion.
 */
export function limitText(
  prev: string,
  next: string,
  max: number,
): { value: string; overflowed: boolean; caret: number } {
  if (next.length <= max) return { value: next, overflowed: false, caret: next.length };
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let tail = 0;
  while (
    tail < prev.length - start &&
    tail < next.length - start &&
    prev[prev.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail++;
  }
  const inserted = next.slice(start, next.length - tail);
  const kept = inserted.slice(0, Math.max(0, max - start - tail));
  const value = (next.slice(0, start) + kept + next.slice(next.length - tail)).slice(0, max);
  return { value, overflowed: true, caret: Math.min(start + kept.length, value.length) };
}

/** "quiet" shows nothing; "near" shows the count; "full" shows the limit in words. */
export type LimitState = 'quiet' | 'near' | 'full';

export function limitState(length: number, max: number): LimitState {
  if (length >= max) return 'full';
  if (length >= Math.ceil(max * COUNT_FROM)) return 'near';
  return 'quiet';
}

const count = (n: number) => n.toLocaleString('en-US');

/** "1,850 / 2,000" */
export function limitCount(length: number, max: number): string {
  return `${count(length)} / ${count(max)}`;
}

/** "Keep it to 2,000 characters." */
export function limitMessage(max: number): string {
  return `Keep it to ${count(max)} characters.`;
}
