/**
 * Type anywhere to ask — the decisions behind `components/answers/type-to-ask.tsx`.
 *
 * A reader who starts typing with no field focused means to ask something, so
 * the first key goes to the ask box rather than nowhere. That rule is only safe
 * if it never steals a key from something that wanted it: a shortcut, a menu's
 * type-ahead, a dialog, or a field the reader is already typing in. Each of
 * those is a case below.
 *
 * Pure module (DOM types only, no DOM access) so it carries unit tests.
 */

/** The parts of a KeyboardEvent the decision reads. */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  /** AltGr held (`getModifierState('AltGraph')`): Windows reports it as Ctrl+Alt. */
  altGraph?: boolean;
}

/**
 * Firefox's quick find opens on these with nothing focused, and a question
 * does not start with either.
 */
const QUICK_FIND_KEYS = new Set(['/', "'"]);

/**
 * Whether this key would type a character. Space is excluded: with nothing
 * focused it scrolls the page, and a question never starts with one. Any
 * modifier but Shift means a shortcut (Cmd+F, Ctrl+R), not text — except
 * AltGr, which is how "@" or "€" is typed on many European layouts.
 */
export function typesCharacter(e: KeyLike): boolean {
  // Autofill sends a keydown with no key.
  if (typeof e.key !== 'string') return false;
  if (e.defaultPrevented || e.isComposing) return false;
  if (e.metaKey) return false;
  if ((e.ctrlKey || e.altKey) && !e.altGraph) return false;
  if (QUICK_FIND_KEYS.has(e.key)) return false;
  // Named keys ("Enter", "ArrowDown", "Dead") are longer than one code point.
  return [...e.key].length === 1 && e.key.trim() !== '';
}

/**
 * Input types that take typed text. A checkbox, radio or button does not, so a
 * reader who has just ticked a filter can still type straight into the chat.
 */
const TEXT_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'password', 'number', 'tel', 'url',
  'date', 'datetime-local', 'month', 'time', 'week',
]);

/**
 * Anything inside one of these already uses printable keys: menus, listboxes
 * and trees for type-ahead, dialogs because what is typed there belongs to the
 * dialog.
 */
const KEEPS_KEYS =
  'textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], ' +
  '[role="combobox"], [role="listbox"], [role="menu"], [role="menubar"], [role="tree"], ' +
  '[role="dialog"], [role="alertdialog"], dialog';

/** The parts of an Element the decision reads. */
export interface ElementLike {
  tagName: string;
  getAttribute(name: string): string | null;
  closest(selector: string): unknown;
}

/** Whether the focused element would use the key itself. */
export function focusKeepsKeys(el: ElementLike | null): boolean {
  if (!el) return false;
  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (TEXT_INPUT_TYPES.has(type)) return true;
  }
  return el.closest(KEEPS_KEYS) !== null;
}

/** Where the typed key goes. */
export type TypeTarget = 'panel' | 'hero' | 'open_panel';

/**
 * The panel when it is open; the home page's ask box when it is on screen;
 * otherwise open the panel. A home-page reader who has scrolled down to the
 * charts gets the panel rather than being thrown back to the top.
 */
export function typeTarget(panelOpen: boolean, heroOnScreen: boolean): TypeTarget {
  if (panelOpen) return 'panel';
  return heroOnScreen ? 'hero' : 'open_panel';
}

/**
 * Whether the reader is on a device with a mouse or trackpad. The home page
 * focuses its ask box on load only there: on a phone, focusing a field throws
 * the on-screen keyboard over the page the reader came to see.
 */
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
