/**
 * Tests for lib/type-to-ask.ts — which keys typed with nothing focused go to
 * the ask box, and which are left alone.
 *
 * The failure that matters is stealing a key: a reader pressing Cmd+F, picking
 * from a menu by its first letter, or typing in a dialog, and having it land in
 * the chat instead. Each "leaves alone" case below is one of those.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import {
  focusKeepsKeys,
  typeTarget,
  typesCharacter,
  type ElementLike,
  type KeyLike,
} from './type-to-ask';

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

it('takes letters, digits, punctuation and capitals', () => {
  for (const k of ['w', 'W', '7', '?', '"', 'é']) assert.equal(typesCharacter(key(k)), true, k);
});

it('leaves shortcuts alone: Cmd, Ctrl and Alt combinations', () => {
  assert.equal(typesCharacter(key('f', { metaKey: true })), false);
  assert.equal(typesCharacter(key('r', { ctrlKey: true })), false);
  assert.equal(typesCharacter(key('å', { altKey: true })), false);
});

it('leaves named keys alone: Enter, Tab, arrows, Escape, accent dead keys', () => {
  for (const k of ['Enter', 'Tab', 'ArrowDown', 'Escape', 'Backspace', 'Dead', 'F5']) {
    assert.equal(typesCharacter(key(k)), false, k);
  }
});

it('takes AltGr characters, which Windows reports as Ctrl+Alt', () => {
  assert.equal(typesCharacter(key('@', { ctrlKey: true, altKey: true, altGraph: true })), true);
  assert.equal(typesCharacter(key('q', { ctrlKey: true, altKey: true })), false, 'a real Ctrl+Alt shortcut');
});

it("leaves Firefox's quick-find keys alone", () => {
  assert.equal(typesCharacter(key('/')), false);
  assert.equal(typesCharacter(key("'")), false);
});

it('leaves Space alone, so it still scrolls the page', () => {
  assert.equal(typesCharacter(key(' ')), false);
});

it('leaves a key another handler already used, and one mid-composition', () => {
  assert.equal(typesCharacter(key('a', { defaultPrevented: true })), false);
  assert.equal(typesCharacter(key('a', { isComposing: true })), false);
});

it('leaves a key alone when the reader is already typing in a field', () => {
  assert.equal(focusKeepsKeys(el('INPUT')), true, 'input with no type is text');
  assert.equal(focusKeepsKeys(el('INPUT', { type: 'search' })), true, 'header bill search');
  assert.equal(focusKeepsKeys(el('INPUT', { type: 'email' })), true);
  assert.equal(focusKeepsKeys(el('TEXTAREA')), true, 'feedback box');
  assert.equal(focusKeepsKeys(el('DIV', {}, ['[contenteditable]:not([contenteditable="false"])'])), true);
});

it('leaves a key alone inside a menu, listbox or dialog, which use type-ahead', () => {
  assert.equal(focusKeepsKeys(el('DIV', {}, ['[role="menu"]'])), true);
  assert.equal(focusKeepsKeys(el('DIV', {}, ['[role="listbox"]'])), true);
  assert.equal(focusKeepsKeys(el('BUTTON', {}, ['[role="dialog"]'])), true);
  assert.equal(focusKeepsKeys(el('SELECT')), true);
});

it('sends the key to the chat from a link, button, checkbox or the page itself', () => {
  assert.equal(focusKeepsKeys(null), false);
  assert.equal(focusKeepsKeys(el('BODY')), false);
  assert.equal(focusKeepsKeys(el('MAIN')), false);
  assert.equal(focusKeepsKeys(el('A')), false);
  assert.equal(focusKeepsKeys(el('BUTTON')), false);
  assert.equal(focusKeepsKeys(el('INPUT', { type: 'checkbox' })), false, 'a ticked filter');
});

it('types into the open panel first, then the home box on screen, else opens the panel', () => {
  assert.equal(typeTarget(true, true), 'panel');
  assert.equal(typeTarget(true, false), 'panel');
  assert.equal(typeTarget(false, true), 'hero');
  assert.equal(typeTarget(false, false), 'open_panel', 'any other page, or home scrolled down');
});

console.log(`\ntype-to-ask: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
