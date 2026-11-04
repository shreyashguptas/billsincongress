/**
 * The ask panel's phase machine — counterpart to `lib/ask-panel.ts`, which
 * holds the geometry.
 *
 * Three phases, and the interesting one is `minimized`. When a reader taps a
 * bill card inside an answer on a phone, the page underneath navigates
 * correctly but the sheet covers it, so the tap reads as doing nothing. The
 * fix is a state, not a scroll: the panel steps aside for the page it just
 * opened, and comes back with the conversation intact.
 *
 * `minimized` is only reachable in the modes where the panel actually covers
 * the page. Docked, the bill opens beside the conversation and nothing should
 * move at all.
 *
 * NOTHING here touches the conversation. Turns, chat id, rate-limit state and
 * the sign-in hand-off all live in AnswerProvider and survive every transition
 * below — a property asserted directly in the test rather than left to review.
 *
 * Pure module so it carries unit tests.
 */
import type { PanelMode } from './ask-panel';
import { coversContent } from './ask-panel';
import { BILL_ID_PATTERN } from './page-context';

export type AskPhase = 'closed' | 'open' | 'minimized';

/** Where an open came from. Reported on `answer_panel_opened`. */
export type OpenTrigger =
  /** The corner pill (or a phone's "Back to your questions" bar). */
  | 'launcher'
  /** Ask in the header: phones, tablets, short windows and bill pages (components/answers/header-ask.tsx). */
  | 'header'
  | 'bill_page'
  | 'hero'
  | 'starter'
  | 'ask'
  | 'manual'
  /**
   * The keyboard way in (`lib/ask-shortcut.ts`). From 2026-10-23 any printable
   * key typed with nothing focused; from 2026-11-04 only `/`. The value keeps
   * its name so saved insights keep counting.
   */
  | 'typing';

/**
 * Why the panel stopped being open. Reported on `answer_panel_closed`.
 *
 * `entity_navigation` and `navigation` are deliberately distinct: the first is
 * the reader following a bill out of an answer, which is the flow the minimise
 * exists for and the number that says whether it works; the second is any other
 * navigation that happened to occur underneath, and counting the two together
 * would bury the signal in the noise.
 */
export type CloseReason =
  | 'manual'
  | 'escape'
  | 'swipe'
  | 'entity_navigation'
  | 'navigation';

export interface AskState {
  phase: AskPhase;
}

export type AskAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'restore' }
  /** A navigation happened while the panel was open. */
  | { type: 'minimize'; mode: PanelMode };

export const INITIAL_ASK_STATE: AskState = { phase: 'closed' };

export function nextAskState(state: AskState, action: AskAction): AskState {
  switch (action.type) {
    case 'open':
    case 'restore':
      return state.phase === 'open' ? state : { phase: 'open' };

    case 'close':
      return state.phase === 'closed' ? state : { phase: 'closed' };

    case 'minimize':
      // Docked, the page is beside the panel rather than under it, so a
      // navigation is already visible and moving the panel would be noise.
      // Minimising from `closed` or `minimized` would flap across a multi-hop
      // navigation, so only `open` transitions.
      if (state.phase !== 'open' || !coversContent(action.mode)) return state;
      return { phase: 'minimized' };
  }
}

/**
 * Whether this page keeps Ask in the header at every width, with no corner
 * pill while the panel is closed. A bill page: its status card fills the
 * bottom-right corner of a laptop screen before any scroll, so the pill either
 * sat on the card or, stepped aside, left a laptop reader's first screen with
 * no way to ask at all. Decided from the path so the server render already has
 * the header button: nothing in the header moves after the page loads.
 */
export function askInHeaderOnly(pathname: string | null | undefined): boolean {
  const m = /^\/bills\/([^/?#]+)\/?$/.exec(pathname ?? '');
  if (!m) return false;
  let id = m[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    return false;
  }
  return BILL_ID_PATTERN.test(id.toLowerCase());
}

/**
 * Whether the launcher (pill or bottom bar) should be on screen. On a page
 * whose Ask lives in the header (askInHeaderOnly) only the minimized phase
 * draws it: there it is the way back to a conversation set aside, and the
 * reader has just arrived on a bill page by tapping one inside an answer.
 */
export function launcherVisible(phase: AskPhase, headerOnly = false): boolean {
  if (phase === 'open') return false;
  return phase === 'minimized' || !headerOnly;
}

/**
 * Whether the panel should be hidden from assistive technology and removed
 * from the tab order. True for every phase in which it is off screen —
 * including `minimized`, where the launcher, not the panel, is the way back.
 */
export function panelInert(phase: AskPhase): boolean {
  return phase !== 'open';
}
