/**
 * Tests for lib/ask-shortcut.ts — `/` opens Ask, and nothing else does.
 *
 * The failure that matters is stealing a key. "Type anywhere to ask" did: on
 * /bills/1276hr119, focusing the "James Comer" link and pressing "h" opened the
 * panel with "h" typed in its box (WCAG 2.1.4). The first case below is that
 * press, which must now do nothing.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import {
  focusKeepsKeys,
  isAskShortcut,
  shortcutEnabled,
  shortcutTarget,
  type ElementLike,
  type KeyLike,
} from './ask-shortcut';

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split('\n').join('\n    ') : String(err)}`,
    );
  }
}

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

/**
 * A stand-in element. `inside` lists the selectors it sits within, so
 * `closest` matches when any selector in the query is one of them.
 */
function el(tagName: string, attrs: Record<string, string> = {}, inside: string[] = []): ElementLike {
  return {
    tagName,
    getAttribute: (name) => attrs[name] ?? null,
    closest: (selector) => {
      const own = [tagName.toLowerCase(), ...inside];
      const parts = selector.split(',').map((s) => s.trim());
      return parts.some((p) => own.includes(p)) ? {} : null;
    },
  };
}

it('never takes a letter, digit or punctuation mark — only /', () => {
  for (const k of ['h', 'H', 'w', '7', '?', '"', "'", 'é', '.', ' ']) {
    assert.equal(isAskShortcut(key(k)), false, k);
  }
  assert.equal(isAskShortcut(key('/')), true);
});

it('takes / typed with Shift, as German, Nordic and French layouts do', () => {
  // Shift is not read at all: the key is "/" however it was typed.
  assert.equal(isAskShortcut(key('/')), true, 'Shift+7');
});

it('leaves every modifier chord alone: Cmd+/, Ctrl+/, Alt+/, AltGr+/', () => {
  assert.equal(isAskShortcut(key('/', { metaKey: true })), false);
  assert.equal(isAskShortcut(key('/', { ctrlKey: true })), false);
  assert.equal(isAskShortcut(key('/', { altKey: true })), false);
  assert.equal(isAskShortcut(key('/', { altGraph: true })), false, 'AltGr alone');
  assert.equal(
    isAskShortcut(key('/', { ctrlKey: true, altKey: true, altGraph: true })),
    false,
    'AltGr as Windows reports it, Ctrl+Alt',
  );
});

it('leaves a held key repeating, one another handler used, and one mid-composition', () => {
  assert.equal(isAskShortcut(key('/', { repeat: true })), false);
  assert.equal(isAskShortcut(key('/', { defaultPrevented: true })), false);
  assert.equal(isAskShortcut(key('/', { isComposing: true })), false);
});

it('leaves an autofill keydown alone, which carries no key', () => {
  assert.equal(isAskShortcut(key(undefined as unknown as string)), false);
});

it('is on until the reader turns it off', () => {
  assert.equal(shortcutEnabled(null), true, 'never set');
  assert.equal(shortcutEnabled('on'), true);
  assert.equal(shortcutEnabled('off'), false);
});

it('leaves / alone when the reader is typing in a field, where it is a slash', () => {
  assert.equal(focusKeepsKeys(el('INPUT')), true, 'an input');
  assert.equal(focusKeepsKeys(el('INPUT', { type: 'search' })), true, 'header bill search');
  assert.equal(focusKeepsKeys(el('INPUT', { type: 'email' })), true);
  assert.equal(focusKeepsKeys(el('TEXTAREA')), true, 'feedback box');
  assert.equal(focusKeepsKeys(el('DIV', {}, ['[contenteditable]:not([contenteditable="false"])'])), true);
});

it('leaves / alone on any form control: a ticked filter, a range, a radio', () => {
  for (const type of ['checkbox', 'radio', 'range', 'number', 'date']) {
    assert.equal(focusKeepsKeys(el('INPUT', { type })), true, type);
  }
  assert.equal(focusKeepsKeys(el('SELECT')), true);
});

it('leaves / alone on a widget with keys of its own: menu, listbox, combobox, slider, dialog', () => {
  assert.equal(focusKeepsKeys(el('DIV', {}, ['[role="menu"]'])), true);
  assert.equal(focusKeepsKeys(el('DIV', {}, ['[role="menuitem"]'])), true);
  assert.equal(focusKeepsKeys(el('DIV', {}, ['[role="listbox"]'])), true);
  assert.equal(focusKeepsKeys(el('BUTTON', {}, ['[role="combobox"]'])), true, 'a shadcn Select');
  assert.equal(focusKeepsKeys(el('SPAN', {}, ['[role="slider"]'])), true, 'the panel resize handle');
  assert.equal(focusKeepsKeys(el('DIV', {}, ['[role="grid"]'])), true);
  assert.equal(focusKeepsKeys(el('BUTTON', {}, ['[role="dialog"]'])), true);
});

it('opens Ask on / from a link, button, summary or the page itself', () => {
  assert.equal(focusKeepsKeys(null), false);
  assert.equal(focusKeepsKeys(el('BODY')), false);
  assert.equal(focusKeepsKeys(el('MAIN')), false);
  assert.equal(focusKeepsKeys(el('A')), false);
  assert.equal(focusKeepsKeys(el('BUTTON')), false);
  assert.equal(focusKeepsKeys(el('SUMMARY')), false);
});

it('goes to the open panel first, then the home box on screen, else opens the panel', () => {
  assert.equal(shortcutTarget(true, true), 'panel');
  assert.equal(shortcutTarget(true, false), 'panel');
  assert.equal(shortcutTarget(false, true), 'hero');
  assert.equal(shortcutTarget(false, false), 'open_panel', 'any other page, or home scrolled down');
});

console.log(`\nask-shortcut: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
