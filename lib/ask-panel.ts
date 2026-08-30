/**
 * The ask panel's geometry: which shape it takes at a given viewport, and how
 * wide the reader is allowed to drag it.
 *
 * The panel has three shapes, and the boundaries between them are arithmetic
 * rather than taste:
 *
 *   sheet  (< 1024px)   A bottom sheet under the live header. There is no room
 *                       for a side-by-side reading column on a phone.
 *   rail   (1024–1343)  A right-hand rail that FLOATS over the page. The page
 *                       keeps its full width because squeezing it here would
 *                       starve it — see the next paragraph.
 *   dock   (>= 1344px)  A right-hand rail that PUSHES the page, resizable.
 *
 * The load-bearing constant is MIN_CONTENT_PX. The site's `lg:` layouts are
 * designed against `container-editorial` at a 1024px viewport, which gives them
 * 960px of inner width once the container's own `lg:px-8` is subtracted. So the
 * pushed shell must never fall below 1024px, or every `lg:` grid on the site is
 * asked to render in less room than it has ever been designed for — and it
 * cannot adapt, because Tailwind's media queries see the VIEWPORT, not the
 * shrinking content box.
 *
 * DOCK_MIN_VIEWPORT_PX therefore falls out of the other two constants rather
 * than being chosen: you cannot dock until there is room for the narrowest
 * useful panel AND a content column the site already knows how to draw.
 *
 * Pure module (no React, no `window` at module scope) so it carries unit tests.
 */
import { safeLocalStorage } from './safe-storage';

export type PanelMode = 'sheet' | 'rail' | 'dock';

/** Narrower than this and the thread stops being readable. */
export const MIN_PANEL_PX = 320;
/** Wider than this and chat prose out-measures the article beside it. */
export const MAX_PANEL_PX = 640;
export const DEFAULT_PANEL_PX = 420;

/** `container-editorial` at a 1024px viewport: 1024 − 2×32px of `lg:px-8`. */
export const MIN_CONTENT_PX = 1024;
/** Fixed width of the floating rail, which never pushes and so never clamps. */
export const RAIL_PANEL_PX = 400;

/** Below this the panel is a bottom sheet. Tailwind `lg`. */
export const RAIL_MIN_VIEWPORT_PX = 1024;
/** Below this the rail floats instead of pushing. Derived, not chosen. */
export const DOCK_MIN_VIEWPORT_PX = MIN_CONTENT_PX + MIN_PANEL_PX;

/**
 * The real rendered height of the sticky header, per breakpoint — main row plus
 * the `md:`-only eyebrow strip, each including its 1px bottom border. The sheet
 * sits directly beneath it, so a wrong number here is a visible seam or an
 * overlapped nav. Mirrored in `app/globals.css` as `--header-h`; the two are
 * kept honest by `lib/ask-css-contract.test.ts`.
 */
export const HEADER_H_PX: ReadonlyArray<{ minWidth: number; height: number }> = [
  { minWidth: 0, height: 57 },
  { minWidth: 640, height: 65 },
  { minWidth: 768, height: 94 },
];

/**
 * The width the CSS media queries are actually resolving against.
 *
 * NOT `window.innerWidth`, which includes the classic scrollbar while a `width`
 * media feature does not. On a desktop with overlay scrollbars off, the two
 * disagree by ~15px — enough that a window sized within a scrollbar's width of
 * the dock threshold would have JavaScript believing the panel was docked while
 * CSS was still drawing it over the page. The visible symptom is the bug this
 * whole change exists to fix: a bill tapped in an answer opens underneath a
 * panel that never steps aside.
 */
export function viewportWidth(): number {
  if (typeof document === 'undefined') return 0;
  return document.documentElement.clientWidth;
}

/**
 * Which shape the panel takes. Read this ONLY inside event handlers, never
 * during render: a render-time viewport read is the classic hydration
 * mismatch, and the CSS already knows the mode from its own media queries.
 */
export function layoutModeFor(viewportWidth: number): PanelMode {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 'sheet';
  if (viewportWidth >= DOCK_MIN_VIEWPORT_PX) return 'dock';
  if (viewportWidth >= RAIL_MIN_VIEWPORT_PX) return 'rail';
  return 'sheet';
}

/** Modes in which the panel covers the page, so a navigation must reveal it. */
export function coversContent(mode: PanelMode): boolean {
  return mode !== 'dock';
}

/**
 * The widest the panel may be at this viewport without pushing the content
 * column below MIN_CONTENT_PX. Equals MIN_PANEL_PX exactly at the dock
 * threshold, which is the honest answer: at 1344px there is no room to drag.
 */
export function maxPanelWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth)) return MIN_PANEL_PX;
  const room = Math.floor(viewportWidth) - MIN_CONTENT_PX;
  return Math.min(MAX_PANEL_PX, Math.max(MIN_PANEL_PX, room));
}

/** True when dragging could actually change anything at this viewport. */
export function isResizable(viewportWidth: number): boolean {
  return (
    layoutModeFor(viewportWidth) === 'dock' && maxPanelWidth(viewportWidth) > MIN_PANEL_PX
  );
}

/**
 * Clamp a requested width into what this viewport can afford. Applied on mount
 * and on window resize as well as during a drag — a width stored on a 2560px
 * display must not follow the reader onto a laptop and starve the page there.
 */
export function clampPanelWidth(requestedPx: number, viewportWidth: number): number {
  const max = maxPanelWidth(viewportWidth);
  if (!Number.isFinite(requestedPx)) return Math.min(DEFAULT_PANEL_PX, max);
  const px = Math.round(requestedPx);
  if (px < MIN_PANEL_PX) return MIN_PANEL_PX;
  if (px > max) return max;
  return px;
}

export interface PanelPrefs {
  widthPx: number;
}

const KEY = 'bic_ask_panel';

/**
 * Anything that is not a plausible stored width becomes the default. Bounds are
 * the absolute ones, not the viewport-dependent ones — the viewport is unknown
 * at read time, and `clampPanelWidth` narrows it again the moment it is used.
 */
export function normalizePanelPrefs(raw: unknown): PanelPrefs {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { widthPx: DEFAULT_PANEL_PX };
  }
  const width = (raw as Record<string, unknown>).widthPx;
  if (typeof width !== 'number' || !Number.isFinite(width)) {
    return { widthPx: DEFAULT_PANEL_PX };
  }
  const px = Math.round(width);
  if (px < MIN_PANEL_PX || px > MAX_PANEL_PX) return { widthPx: DEFAULT_PANEL_PX };
  return { widthPx: px };
}

/** Local, not session: a reader's preferred width should survive a tab close. */
export function loadPanelPrefs(): PanelPrefs {
  const raw = safeLocalStorage.getItem(KEY);
  if (!raw) return { widthPx: DEFAULT_PANEL_PX };
  try {
    return normalizePanelPrefs(JSON.parse(raw));
  } catch {
    safeLocalStorage.removeItem(KEY);
    return { widthPx: DEFAULT_PANEL_PX };
  }
}

export function savePanelPrefs(prefs: PanelPrefs): void {
  safeLocalStorage.setItem(KEY, JSON.stringify(normalizePanelPrefs(prefs)));
}
