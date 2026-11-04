/**
 * When the corner Ask pill steps out of the reader's way.
 *
 * The pill is only drawn on a computer (1024px wide and 500px tall and up;
 * below that Ask is in the header, app/globals.css "Where Ask lives"). It is
 * fixed to the bottom-right corner, and anything fixed over a page sits on
 * top of something: the right-hand counters of a list, the end of a row. The
 * page reserves room for it at the very end (`--ask-reserve`), but mid-page
 * it still covered whatever scrolled under it. So while the reader is
 * reading — scrolling DOWN — it tucks away below the edge of the screen, and
 * it comes back the moment they might want it:
 *
 *   - near the top of the page, where they have not started reading yet;
 *   - on any deliberate scroll up, the universal "show me the controls" gesture;
 *   - near the end of the page, where the footer leaves room for it;
 *   - when it takes keyboard focus (CSS: `:focus-visible` beats the tuck).
 *
 * The thresholds are asymmetric on purpose. Tucking needs a small, real move
 * down; returning needs a slightly larger move up, so the bounce at the end of a
 * flick, or a hand resting on a trackpad, does not make it flicker.
 *
 * Distances are measured from an ANCHOR, not frame to frame: a slow scroll moves
 * a few pixels per frame and would never cross a per-frame threshold. The anchor
 * follows the reader in the direction they are already going, so a reversal is
 * always measured from the furthest point they reached.
 *
 * Reduced motion never tucks (the caller checks, and the CSS only moves it
 * under `prefers-reduced-motion: no-preference`): the pill simply stays, and the
 * page reserves room for it through `scroll-padding-bottom` and the footer.
 *
 * Pure module (no React, no `window`) so it carries unit tests.
 */

/** Within this many px of the top the launcher is always shown. */
export const TUCK_TOP_PX = 96;
/** Within this many px of the end the launcher is always shown. */
export const TUCK_END_PX = 160;
/** A move down of at least this much, from the anchor, tucks it. */
export const TUCK_DOWN_PX = 12;
/** A move up of at least this much, from the anchor, brings it back. */
export const TUCK_UP_PX = 28;

export type TuckState = { tucked: boolean; anchor: number };

export const INITIAL_TUCK: TuckState = { tucked: false, anchor: 0 };

/**
 * @param y    the current scroll offset (`window.scrollY`; may be negative
 *             during iOS rubber-banding)
 * @param maxY the largest offset the page can reach
 *             (`scrollHeight - innerHeight`)
 */
export function nextTuck(prev: TuckState, y: number, maxY: number): TuckState {
  if (y <= TUCK_TOP_PX || maxY - y <= TUCK_END_PX) return { tucked: false, anchor: y };

  if (prev.tucked) {
    // Still going down: the reversal is measured from the lowest point reached.
    if (y >= prev.anchor) return { tucked: true, anchor: y };
    return prev.anchor - y >= TUCK_UP_PX ? { tucked: false, anchor: y } : prev;
  }

  // Still going up (or holding): the next tuck is measured from here.
  if (y <= prev.anchor) return { tucked: false, anchor: y };
  return y - prev.anchor >= TUCK_DOWN_PX ? { tucked: true, anchor: y } : prev;
}
