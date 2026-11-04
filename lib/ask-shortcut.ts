/**
 * Press / to ask — the decisions behind `components/answers/ask-shortcut.tsx`.
 *
 * One key, and only one, opens the ask box from anywhere on the site: `/`, the
 * same key that focuses search on GitHub, YouTube and Gmail. It replaced "type
 * anywhere to ask" (2026-10-23 to 2026-11-04), which sent EVERY printable key
 * to the ask box — so a reader who pressed "h" on a focused link, a speech-input
 * user saying a word, or a screen-reader user's quick-nav key landed in a chat
 * box with a stray letter in it (WCAG 2.1.4, Character Key Shortcuts).
 *
 * `/` is still a single-character shortcut, so 2.1.4 also asks for a way to
 * turn it off: `ASK_SHORTCUT_STORAGE_KEY`, set from the line under the panel's
 * composer or the switch in the footer (one value, both places). The key is advertised wherever the ask box is (the launcher, the
 * home page's box, the panel), so nothing happens that the reader was not told.
 *
 * Pure module (DOM types only, no DOM access) so it carries unit tests.
 */

/** The one key. */
export const ASK_SHORTCUT_KEY = '/';

/** Per-reader off switch, in localStorage. Absent means on. */
export const ASK_SHORTCUT_STORAGE_KEY = 'bic_ask_shortcut';
export const ASK_SHORTCUT_OFF = 'off';

/** The parts of a KeyboardEvent the decision reads. */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  /** AltGr held (`getModifierState('AltGraph')`): Windows reports it as Ctrl+Alt. */
  altGraph?: boolean;
}

/**
 * Whether this key press is the shortcut. Shift is allowed, because `/` is
 * Shift+7 on German and Nordic keyboards and Shift+: on French ones; it is the
 * same key however it was typed. Every other modifier — Cmd, Ctrl, Alt, and
 * AltGr, which Windows reports as Ctrl+Alt and which a screen reader's or an
 * extension's chord can look like — means a different shortcut (Cmd+/ toggles
 * a comment in an editor, Ctrl+/ lists a site's shortcuts), so it is left
 * alone. A held key repeating is not a second press.
 */
export function isAskShortcut(e: KeyLike): boolean {
  if (e.key !== ASK_SHORTCUT_KEY) return false;
  if (e.defaultPrevented || e.isComposing || e.repeat) return false;
  if (e.metaKey || e.ctrlKey || e.altKey || e.altGraph) return false;
  return true;
}

/**
 * Anything that is, or sits inside, a form control or a widget with keys of
 * its own keeps `/`: a text field (where it is a slash), a checkbox or slider a
 * reader just set, a select, a combobox or listbox's type-ahead, a menu, a
 * tree or grid, an editable region, and a dialog, because what is typed there
 * belongs to the dialog. A plain link, button or `<summary>` does not use the
 * key, so `/` still opens Ask from one of those, as it does on GitHub.
 */
const KEEPS_KEYS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), ' +
  '[role="textbox"], [role="searchbox"], [role="combobox"], [role="listbox"], [role="option"], ' +
  '[role="menu"], [role="menubar"], [role="menuitem"], [role="menuitemcheckbox"], ' +
  '[role="menuitemradio"], [role="tree"], [role="treegrid"], [role="grid"], ' +
  '[role="slider"], [role="spinbutton"], [role="dialog"], [role="alertdialog"], dialog';

/** The parts of an Element the decision reads. */
export interface ElementLike {
  tagName: string;
  getAttribute(name: string): string | null;
  closest(selector: string): unknown;
}

/** Whether the focused element would use the key itself. */
export function focusKeepsKeys(el: ElementLike | null): boolean {
  if (!el) return false;
  return el.closest(KEEPS_KEYS) !== null;
}

/** Where `/` sends the reader. */
export type ShortcutTarget = 'panel' | 'hero' | 'open_panel';

/**
 * The panel's composer when the panel is open; the home page's ask box when it
 * is on screen; otherwise open the panel. A home-page reader who has scrolled
 * down to the charts gets the panel rather than being thrown back to the top.
 */
export function shortcutTarget(panelOpen: boolean, heroOnScreen: boolean): ShortcutTarget {
  if (panelOpen) return 'panel';
  return heroOnScreen ? 'hero' : 'open_panel';
}

/** Whether a stored preference leaves the shortcut on. */
export function shortcutEnabled(stored: string | null): boolean {
  return stored !== ASK_SHORTCUT_OFF;
}

/**
 * Whether the reader is on a device with a mouse or trackpad. The home page
 * focuses its ask box on load only there: on a phone, focusing a field throws
 * the on-screen keyboard over the page the reader came to see. The `/` hints
 * (the pill's keycap, "Press /" in the home box, the composer line) are drawn
 * there (Tailwind's `fine:` variant is the same query), and the composer line
 * also on a touch screen once `/` has been pressed on it. The footer's off
 * switch is on every screen.
 */
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
