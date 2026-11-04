'use client';

import { forwardRef, useEffect, useState, type ForwardedRef } from 'react';
import { ArrowUp, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/brand/kbd';
import type { AskPhase } from '@/lib/ask-panel-state';
import { INITIAL_TUCK, nextTuck } from '@/lib/ask-launcher-tuck';
import { useAskShortcut } from './ask-shortcut';

/**
 * The way in, and the way back.
 *
 * It is on every page, in every phase except `open`, and — unlike the pill it
 * replaces — it does NOT wait for a conversation to exist first. A reader on a
 * topic hub or the Learn guide previously had no way to ask anything at all;
 * those pages carry no ask affordance of their own.
 *
 * Two shapes, one button, so the same click always means the same thing:
 *
 *   closed     A corner pill (brand.md): 48px, rounded-full, raised, a
 *              line-strong edge and the float shadow, because it is the one
 *              control that sits over the page rather than in it. Only on a
 *              computer (1024px wide and 500px tall and up); below that Ask is
 *              in the header (header-ask.tsx). It tucks below the screen's edge
 *              while the reader scrolls down and returns on a scroll up, near
 *              the top or the end, or on keyboard focus
 *              (lib/ask-launcher-tuck.ts). Under reduced motion it stays.
 *   minimized  On a phone, a full-width bar along the bottom. That phase is only
 *              ever reached by tapping a bill inside an answer, so the panel has
 *              just moved out of the reader's way and the return target should be
 *              impossible to miss rather than tasteful. Above the sheet
 *              breakpoint it stays a pill and simply pulses back in. It never
 *              tucks: it is the way back.
 *
 * Both shapes are the same element; the switch is in app/globals.css so nothing
 * here has to know the viewport.
 *
 * On a computer the pill carries a `/` keycap: the key that opens it from
 * anywhere (`lib/ask-shortcut.ts`). It is the one place the shortcut is always
 * on screen, so it is where a keyboard reader learns it exists.
 */
export const AskLauncher = forwardRef<
  HTMLButtonElement,
  { phase: AskPhase; turnCount: number; onOpen: () => void }
>(function AskLauncher({ phase, turnCount, onOpen }, ref) {
  const resuming = turnCount > 0;
  const questions = Math.ceil(turnCount / 2);
  const { tucked, covering } = useTuckOnScroll(phase === 'closed', ref);
  const shortcut = useAskShortcut();

  return (
    <Button
      ref={ref}
      type="button"
      // Outline is already the pill's raised fill, line-strong edge and sunken
      // hover; the size, radius and float shadow are the launcher's own.
      variant="outline"
      onClick={onOpen}
      aria-expanded={false}
      aria-controls="ask-panel"
      aria-keyshortcuts={shortcut.enabled ? '/' : undefined}
      aria-label={
        resuming
          ? `Continue your conversation about Congress, ${questions} question${questions === 1 ? '' : 's'} so far`
          : 'Ask a question about Congress'
      }
      // Read by app/globals.css, on a computer only. Still focusable while
      // tucked: a keyboard user who tabs to it brings it back (`:focus-visible`
      // wins over the tuck).
      data-tucked={tucked ? 'true' : undefined}
      // Over a block marked data-ask-clear: it fades out in place, at any
      // motion setting (app/globals.css).
      data-covering={covering ? 'true' : undefined}
      className="ask-launcher h-12 justify-start rounded-full px-5 text-ui shadow-float touchable:h-12"
    >
      {/* The same glyph either way: a hue here would be colour without data
          (brand.md, "Color belongs to the data"); the words say "continue". */}
      <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="truncate">
        {resuming ? (phase === 'minimized' ? 'Back to your questions' : 'Continue asking') : 'Ask'}
      </span>
      {shortcut.enabled && <Kbd className="-mr-1 hidden fine:inline-flex">/</Kbd>}
      {/* Only drawn in the bottom-bar shape, where there is room to spare and the
          bar needs a right-hand terminus to read as a control rather than a note. */}
      <ArrowUp
        className="ask-launcher-arrow ml-auto h-4 w-4 shrink-0 text-ink-2"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </Button>
  );
});

/** Where the corner pill is drawn (app/globals.css, "Where Ask lives"). */
const PILL_QUERY = '(min-width: 1024px) and (min-height: 500px)';

/** Room kept around the pill when checking what it would cover, in px. */
const CLEAR_GAP_PX = 8;

/**
 * Whether the pill, in its resting place in the corner, would sit on a block
 * marked `data-ask-clear` (the bill page's status card, tall enough on a laptop
 * to reach the corner before any scroll). Measured from the corner, not from
 * the button, which may be tucked below the edge.
 */
function coversClearBlock(button: HTMLElement | null): boolean {
  if (!button) return false;
  const blocks = document.querySelectorAll<HTMLElement>('[data-ask-clear]');
  if (blocks.length === 0) return false;
  const style = getComputedStyle(button);
  const right = window.innerWidth - (parseFloat(style.right) || 0) + CLEAR_GAP_PX;
  const bottom = window.innerHeight - (parseFloat(style.bottom) || 0) + CLEAR_GAP_PX;
  const left = right - button.offsetWidth - 2 * CLEAR_GAP_PX;
  const top = bottom - button.offsetHeight - 2 * CLEAR_GAP_PX;
  for (const block of blocks) {
    const r = block.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) return true;
  }
  return false;
}

/**
 * Whether the pill should be tucked away right now. Listens only while
 * `active` (the closed phase); otherwise always false. The scroll rule never
 * tucks under `prefers-reduced-motion`, nor where the pill is not drawn: it
 * stays put and the page's reserved room (`--ask-reserve`) keeps the last row
 * clear of it. Separately, `covering`: wherever the pill is drawn, it fades out
 * in place (any motion setting) while it would sit on a `data-ask-clear`
 * block.
 */
function useTuckOnScroll(
  active: boolean,
  buttonRef: ForwardedRef<HTMLButtonElement>,
): { tucked: boolean; covering: boolean } {
  const [tucked, setTucked] = useState(false);
  const [covering, setCovering] = useState(false);

  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pill = window.matchMedia(PILL_QUERY);
    let state = { ...INITIAL_TUCK, anchor: window.scrollY };
    let frame = 0;
    const button = () =>
      buttonRef && typeof buttonRef === 'object' ? buttonRef.current : null;

    const read = () => {
      frame = 0;
      if (reduce.matches || !pill.matches) {
        state = { tucked: false, anchor: window.scrollY };
      } else {
        const maxY = document.documentElement.scrollHeight - window.innerHeight;
        state = nextTuck(state, window.scrollY, maxY);
      }
      setTucked(state.tucked);
      setCovering(pill.matches && coversClearBlock(button()));
    };
    // One read per frame, however many scroll events the frame delivers.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    reduce.addEventListener('change', read);
    pill.addEventListener('change', read);
    // The first read: a page can open with a block under the corner.
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      reduce.removeEventListener('change', read);
      pill.removeEventListener('change', read);
      if (frame) cancelAnimationFrame(frame);
      // Opening the panel, or setting a conversation aside, starts the next
      // closed phase from "shown": it must never come back already tucked.
      setTucked(false);
      setCovering(false);
    };
  }, [active, buttonRef]);

  return { tucked: active && tucked, covering: active && covering };
}
