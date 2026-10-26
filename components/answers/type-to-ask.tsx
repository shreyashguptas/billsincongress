'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { analytics } from '@/lib/analytics';
import { focusKeepsKeys, typeTarget, typesCharacter } from '@/lib/type-to-ask';
import { surfaceFor } from '@/lib/page-context';
import { useAnswers } from './answer-provider';

/** Any open modal layer: what is typed while one is up belongs to it. */
const OPEN_MODAL =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], dialog[open]';

const pick = (e: KeyboardEvent) => ({
  key: e.key,
  ctrlKey: e.ctrlKey,
  metaKey: e.metaKey,
  altKey: e.altKey,
  isComposing: e.isComposing,
  defaultPrevented: e.defaultPrevented,
});

function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

/**
 * Type into a React-controlled field as the reader would: through the native
 * value setter, then an `input` event, so its onChange (and length limit) run.
 * Setting `.value` directly would be overwritten on the next render.
 */
function typeInto(field: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setValue?.call(field, field.value + text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Type anywhere to ask (`lib/type-to-ask.ts` has the rules).
 *
 * A reader who starts typing with nothing focused — after clicking a chart,
 * reading an answer, or landing on a bill — has the key sent to the ask box
 * instead of losing it. Renders nothing; mounted once in the root layout,
 * inside AnswerProvider and after AnswerPanel.
 *
 * Where the box is already on screen (the open panel's composer, the home
 * page's ask box) the key is not touched: focus moves in the keydown, and the
 * browser then types the character into the newly focused field itself, so
 * accents and the length limit behave exactly as if the reader had clicked
 * first. When the panel has to open, it is `inert` until React commits the open
 * phase, so nothing in it can take focus yet; the key is held and typed into
 * the composer by the effect below once it can.
 */
export function TypeToAsk() {
  const { phase, setOpen, restore } = useAnswers();
  const surface = surfaceFor(usePathname());
  // Keys typed while the panel was opening for them.
  const held = useRef('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!typesCharacter({ ...pick(e), altGraph: e.getModifierState?.('AltGraph') })) return;
      if (focusKeepsKeys(document.activeElement)) return;
      if (document.querySelector(OPEN_MODAL)) return;

      const hero = document.getElementById('hero-ask');
      const target = typeTarget(
        phase === 'open',
        hero instanceof HTMLInputElement && !hero.disabled && onScreen(hero),
      );
      if (target !== 'open_panel') {
        // No composer while the panel shows the conversation list: leave the
        // key alone rather than claim it.
        const field = document.getElementById(target === 'hero' ? 'hero-ask' : 'ask-composer');
        if (!field) return;
        field.focus();
        if (document.activeElement === field) {
          analytics.askTypedAnywhere({ surface, target, panel_phase: phase });
        }
        return;
      }
      if (!held.current) analytics.askTypedAnywhere({ surface, target, panel_phase: phase });
      e.preventDefault();
      held.current += e.key;
      if (phase === 'minimized') restore('typing');
      else setOpen(true, 'typing');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, setOpen, restore, surface]);

  // Runs after AnswerPanel's own focus effect for the same commit (it is
  // mounted first), so on a phone, where that effect focuses the panel rather
  // than the composer, the reader who was typing still lands in the composer.
  useEffect(() => {
    if (phase !== 'open' || !held.current) return;
    const composer = document.getElementById('ask-composer');
    const text = held.current;
    held.current = '';
    if (!(composer instanceof HTMLInputElement)) return;
    composer.focus({ preventScroll: true });
    typeInto(composer, text);
  }, [phase]);

  return null;
}
