/**
 * Keeps a reader's email address and name out of PostHog session replays
 * (wired into `session_recording` in instrumentation-client.ts).
 *
 * Replay records the page's text as it is on screen. Typed input is masked by
 * PostHog's defaults, but text the page itself prints is not, and the site
 * prints the reader's own address and name: the account menu, the account
 * page, and the "we sent a code to …" lines in sign-up and password reset.
 *
 * The avatar (photo and initials) is not recorded at all: see PRIVATE_BLOCK_CLASS.
 *
 * Two rules, applied to every text node replay records:
 * - anything shaped like an email address is starred out, wherever it appears,
 *   so a new screen that shows the address is covered without remembering to;
 * - text inside an element marked `PRIVATE_TEXT_CLASS` is starred out whole.
 *   Names have no shape to match, so the elements that print one carry it.
 *
 * Only replay is affected. What the reader sees, and events, are unchanged.
 */

/** PostHog's own class for "mask this element's text in replay". */
export const PRIVATE_TEXT_CLASS = "ph-mask";

/**
 * Elements replay must not record at all: it stores an empty box the same
 * size instead. For the reader's avatar, whose photo (often their Google
 * picture) and initials text masking cannot hide, and the photo crop dialog.
 * Wired as `session_recording.blockSelector` rather than PostHog's
 * `ph-no-capture` class, which would also stop autocapture of clicks on them.
 */
export const PRIVATE_BLOCK_CLASS = "replay-private";

// Deliberately loose: a false match only stars out some text in a recording.
// It ends on a letter or digit, so a full stop after the address stays put.
const EMAIL = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[^\s@<>()[\]"',;:]*[A-Za-z0-9]/g;

function star(text: string): string {
  return text.replace(/\S/g, "*");
}

/**
 * PostHog's `maskTextFn`. With `maskTextSelector: "*"` it sees every text node
 * along with the element that holds it, and returns what replay should store.
 */
export function maskReplayText(text: string, element?: HTMLElement): string {
  if (element?.closest?.(`.${PRIVATE_TEXT_CLASS}`)) return star(text);
  return text.includes("@") ? text.replace(EMAIL, star) : text;
}
