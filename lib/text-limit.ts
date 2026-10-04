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
 * The text a box keeps after an edit, and whether the edit tried to go past the
 * limit. Typing past it and pasting past it are the same case: the box keeps
 * the first `max` characters and says why.
 */
export function limitText(next: string, max: number): { value: string; overflowed: boolean } {
  if (next.length <= max) return { value: next, overflowed: false };
  return { value: next.slice(0, max), overflowed: true };
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
