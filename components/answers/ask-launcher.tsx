'use client';

import { forwardRef } from 'react';
import { ArrowUp, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
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
 *   closed     A corner pill. Square border and a hairline rule, not a circular
 *              chat bubble — this is an editorial site, and the masthead ask box
 *              it echoes is deliberately not a chat bubble either.
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
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      aria-controls="ask-panel"
      aria-label={
        resuming
          ? `Continue your conversation about Congress, ${questions} question${questions === 1 ? '' : 's'} so far`
          : 'Ask a question about Congress'
      }
      className={cn(
        'ask-launcher inline-flex h-11 items-center gap-2 rounded-sm border border-border',
        'bg-background px-3.5 text-sm shadow-sm transition-colors',
        'hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      {resuming ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-law" aria-hidden="true" />
      ) : (
        <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">
        {resuming ? (phase === 'minimized' ? 'Back to your questions' : 'Continue asking') : 'Ask'}
      </span>
      {/* Only drawn in the bottom-bar shape, where there is room to spare and the
          bar needs a right-hand terminus to read as a control rather than a note. */}
      <ArrowUp
        className="ask-launcher-arrow h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
});
