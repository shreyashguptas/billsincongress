'use client';

import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { analytics } from '@/lib/analytics';
import {
  ASK_SHORTCUT_OFF,
  ASK_SHORTCUT_STORAGE_KEY,
  focusKeepsKeys,
  isAskShortcut,
  shortcutEnabled,
  shortcutTarget,
} from '@/lib/ask-shortcut';
import { safeLocalStorage } from '@/lib/safe-storage';
import { surfaceFor } from '@/lib/page-context';
import { Kbd } from '@/components/brand/kbd';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { useAnswers } from './answer-provider';

/** Any open modal layer: what is typed while one is up belongs to it. */
const OPEN_MODAL =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], dialog[open]';

// ── The per-reader off switch ────────────────────────────────────────────────
// One value in localStorage, shared by every hint on the page and kept in step
// across tabs by the `storage` event.

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === ASK_SHORTCUT_STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const readEnabled = () => shortcutEnabled(safeLocalStorage.getItem(ASK_SHORTCUT_STORAGE_KEY));

// Set the first time `/` opens Ask in this tab. A touch screen with a keyboard
// attached (a tablet, a phone with a Bluetooth keyboard) fails the
// `fine:` pointer query, yet the key works there, so from then on the line
// under the composer, with its off switch, is drawn there too (WCAG 2.1.4).
let keyUsed = false;
const keyListeners = new Set<() => void>();
function subscribeKeyUsed(onChange: () => void) {
  keyListeners.add(onChange);
  return () => {
    keyListeners.delete(onChange);
  };
}
function noteKeyUsed() {
  if (keyUsed) return;
  keyUsed = true;
  keyListeners.forEach((l) => l());
}

/**
 * Whether `/` opens Ask for this reader, and the switch. The server renders it
 * on: a reader who turned it off sees the hint for one frame, never a missing
 * one for a reader who did not.
 */
export function useAskShortcut() {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => true);
  const setEnabled = useCallback((next: boolean) => {
    if (next) safeLocalStorage.removeItem(ASK_SHORTCUT_STORAGE_KEY);
    else safeLocalStorage.setItem(ASK_SHORTCUT_STORAGE_KEY, ASK_SHORTCUT_OFF);
    listeners.forEach((l) => l());
  }, []);
  return { enabled, setEnabled };
}

/** How many frames to keep trying for the composer before giving up. */
const FOCUS_FRAMES = 12;

function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

/**
 * Press `/` to ask (`lib/ask-shortcut.ts` has the rules).
 *
 * The one key that moves focus to an ask box: the open panel's composer, the
 * home page's box when it is on screen, or else it opens the panel, empty,
 * with its composer focused. The `/` itself is never typed. No other key is
 * ever taken — a letter pressed on a link stays with the link.
 *
 * Renders nothing; mounted once in the root layout, inside AnswerProvider and
 * after AnswerPanel, so the focus it asks for lands after the panel's own.
 */
export function AskShortcut() {
  const { phase, setOpen, restore } = useAnswers();
  const { enabled } = useAskShortcut();
  const surface = surfaceFor(usePathname());
  // Set while the panel is opening for a `/`: the composer gets focus once it
  // can take it, even on a phone-width window where the panel would otherwise
  // focus itself (a reader who pressed a key has a keyboard).
  const pending = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const pressed = {
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        repeat: e.repeat,
        isComposing: e.isComposing,
        defaultPrevented: e.defaultPrevented,
        altGraph: e.getModifierState?.('AltGraph'),
      };
      if (!isAskShortcut(pressed)) return;
      if (focusKeepsKeys(document.activeElement)) return;
      if (document.querySelector(OPEN_MODAL)) return;

      const hero = document.getElementById('hero-ask');
      const target = shortcutTarget(
        phase === 'open',
        hero instanceof HTMLInputElement && !hero.disabled && onScreen(hero),
      );
      // Claimed from here on: Firefox would otherwise open its quick find bar.
      e.preventDefault();
      noteKeyUsed();
      analytics.askTypedAnywhere({ surface, target, panel_phase: phase, key: 'slash' });

      if (target === 'open_panel') {
        pending.current = true;
        if (phase === 'minimized') restore('typing');
        else setOpen(true, 'typing');
        return;
      }
      const field = document.getElementById(target === 'hero' ? 'hero-ask' : 'ask-composer');
      if (!(field instanceof HTMLInputElement)) return;
      field.focus({ preventScroll: true });
      // The home box sits under the chamber, below the fold on most laptops.
      const box = field.getBoundingClientRect();
      if (target === 'hero' && box.bottom > window.innerHeight * 0.6) {
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        field.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, phase, setOpen, restore, surface]);

  // AnswerPanel focuses on the next frame (its panel is hidden until then);
  // this frame request is made after it, so it runs after it.
  useEffect(() => {
    if (phase !== 'open' || !pending.current) return;
    pending.current = false;
    // Tried each frame until it takes: under reduced motion the panel's
    // visibility still runs a 1ms transition (globals.css, the blanket rule),
    // so on the first frame it is hidden and focus() silently does nothing.
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      const composer = document.getElementById('ask-composer');
      composer?.focus({ preventScroll: true });
      if (document.activeElement !== composer && ++tries < FOCUS_FRAMES) {
        frame = requestAnimationFrame(attempt);
      }
    };
    frame = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  return null;
}

/**
 * The line under the panel's composer: what `/` does, and the switch that
 * turns it off (WCAG 2.1.4 asks for one). Drawn with a mouse or trackpad, and
 * on a touch screen once `/` has been pressed there (a keyboard is attached);
 * a touch-only phone has no key to press. The footer has the same switch
 * (`AskShortcutSwitch`) on every screen, for a reader who never opens Ask.
 */
export function AskShortcutHint({ className }: { className?: string }) {
  const { enabled, setEnabled } = useAskShortcut();
  const used = useSyncExternalStore(subscribeKeyUsed, () => keyUsed, () => false);
  const surface = surfaceFor(usePathname());
  const toggle = () => {
    setEnabled(!enabled);
    analytics.askShortcutToggled({ surface, enabled: !enabled, placement: 'composer' });
  };
  return (
    // Polite: a screen reader hears the new state after pressing the button.
    <p
      aria-live="polite"
      className={cn(
        'items-center gap-1.5 px-1 text-caption leading-5 text-ink-2',
        used ? 'flex' : 'hidden fine:flex',
        className,
      )}
    >
      {enabled ? (
        <>
          <span className="sr-only">Press slash</span>
          <Kbd>/</Kbd>
          <span>opens Ask from any page</span>
        </>
      ) : (
        <span>The / shortcut is off</span>
      )}
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={toggle}
        className="touch-hit focus-ring rounded-sm text-ink-2 underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink"
      >
        {enabled ? 'Turn off' : 'Turn on'}
        <span className="sr-only"> the slash shortcut</span>
      </button>
    </p>
  );
}

/**
 * The footer's switch, beside the theme control and in the same sunken track:
 * "/ to ask", then On and Off. It reaches a reader who never opens Ask, on
 * every page. Same stored value as the line under the composer. Drawn on every
 * screen, touch ones included: the key works wherever a keyboard is attached
 * (a tablet, a phone with a Bluetooth keyboard), and a pointer query cannot
 * tell whether one is, so the way to turn it off is never hidden (WCAG 2.1.4).
 * Nothing is marked until mount, as with the theme control, since the server
 * cannot read the stored choice.
 */
export function AskShortcutSwitch() {
  const { enabled, setEnabled } = useAskShortcut();
  const surface = surfaceFor(usePathname());
  const labelId = useId();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="flex items-center gap-1.5 text-caption text-ink-2">
        <Kbd>/</Kbd>
        <span>
          <span className="sr-only">The slash key </span>to ask
        </span>
      </span>
      <ToggleGroup
        type="single"
        aria-labelledby={labelId}
        value={mounted ? (enabled ? 'on' : 'off') : ''}
        // Radix reports '' when the active item is pressed again; the setting
        // is always one or the other, so ignore it.
        onValueChange={(value) => {
          if (!value || (value === 'on') === enabled) return;
          setEnabled(value === 'on');
          analytics.askShortcutToggled({ surface, enabled: value === 'on', placement: 'footer' });
        }}
        className="inline-flex gap-0.5 rounded-md bg-sunken p-[3px]"
      >
        {(['on', 'off'] as const).map((value) => (
          <ToggleGroupItem
            key={value}
            value={value}
            className="h-8 min-w-10 rounded-[6px] px-2.5 text-caption font-medium text-ink-2 touchable:h-11 touchable:min-w-11 hover:bg-transparent hover:text-ink data-[state=on]:bg-raised data-[state=on]:text-ink data-[state=on]:shadow-xs"
          >
            {value === 'on' ? 'On' : 'Off'}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

const noopSubscribe = () => () => {};
