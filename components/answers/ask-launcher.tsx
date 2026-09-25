'use client';

import { forwardRef } from 'react';
import { ArrowUp, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AskPhase } from '@/lib/ask-panel-state';

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
 *              control that sits over the page rather than in it.
 *   minimized  On a phone, a full-width bar along the bottom. That phase is only
 *              ever reached by tapping a bill inside an answer, so the panel has
 *              just moved out of the reader's way and the return target should be
 *              impossible to miss rather than tasteful. Above the sheet
 *              breakpoint it stays a pill and simply pulses back in.
 *
 * Both shapes are the same element; the switch is in app/globals.css so nothing
 * here has to know the viewport.
 */
export const AskLauncher = forwardRef<
  HTMLButtonElement,
  { phase: AskPhase; turnCount: number; onOpen: () => void }
>(function AskLauncher({ phase, turnCount, onOpen }, ref) {
  const resuming = turnCount > 0;
  const questions = Math.ceil(turnCount / 2);

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
      aria-label={
        resuming
          ? `Continue your conversation about Congress, ${questions} question${questions === 1 ? '' : 's'} so far`
          : 'Ask a question about Congress'
      }
      className="ask-launcher h-12 justify-start rounded-full px-5 text-[15px] shadow-float touchable:h-12"
    >
      {/* The same glyph either way: a hue here would be colour without data
          (brand.md, "Color belongs to the data"); the words say "continue". */}
      <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="truncate">
        {resuming ? (phase === 'minimized' ? 'Back to your questions' : 'Continue asking') : 'Ask'}
      </span>
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
