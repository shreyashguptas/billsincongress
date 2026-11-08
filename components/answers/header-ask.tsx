'use client';

import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAnswers } from './answer-provider';
import { useAskShortcut } from './ask-shortcut';

/**
 * Ask, in the header.
 *
 * Wherever the ask panel is a sheet (below 1024px) or the window is too short
 * for anything to float (under 500px tall), the way into Ask is this button in
 * the header row, beside the search, rather than a pill pinned over the page.
 * A pinned pill never moved out of the way: on a phone it sat on the
 * Republicans' counts in the home hero, the end of a bill's journey and the
 * last words of every bill title. The header is already sticky, so this is
 * just as reachable and covers nothing.
 *
 * Which of the two shows is decided in app/globals.css by media query, never
 * here, so the server and client renders are the same at every width. Both
 * call the same provider actions; only the analytics trigger differs.
 *
 * `everywhere`: a page whose status card fills the pill's corner on a laptop
 * (a bill page, lib/ask-panel-state.ts askInHeaderOnly) shows this button at
 * every width instead, and draws no closed pill. Decided from the path, so the
 * server render has it and nothing in the header moves after load.
 *
 * Under the sheet the header stays live, so the button is also the way to put
 * the panel away: pressed (sunken) while it is open, and a second tap closes it.
 */
export function HeaderAsk({ className, everywhere = false }: { className?: string; everywhere?: boolean }) {
  const { phase, turns, setOpen, restore } = useAnswers();
  const open = phase === 'open';
  const questions = Math.ceil(turns.length / 2);
  const shortcut = useAskShortcut();

  return (
    <Button
      id="ask-header-button"
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        if (open) setOpen(false, 'manual');
        else if (phase === 'minimized') restore('header');
        else setOpen(true, 'header');
      }}
      aria-expanded={open}
      aria-controls="ask-panel"
      aria-keyshortcuts={shortcut.enabled ? '/' : undefined}
      // Read by app/globals.css: shown at every width, not only where the
      // corner pill is not drawn.
      data-everywhere={everywhere ? 'true' : undefined}
      // The name stays put; aria-expanded says whether a press opens or closes.
      aria-label={
        questions > 0
          ? `Continue your conversation about Congress, ${questions} question${questions === 1 ? '' : 's'} so far`
          : 'Ask a question about Congress'
      }
      className={cn(
        // Shown by globals.css where the corner pill is not.
        'ask-header-button gap-1.5 px-2.5 text-sm header-ask-glyph:w-10 header-ask-glyph:px-0 header-ask-glyph:touchable:w-11',
        open && 'bg-sunken',
        className,
      )}
    >
      <MessageSquare className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      {/* The glyph alone, named by aria-label, where the word would push the row
          past the screen or under the logo: from 768px, where the four sections
          take the header's centre, until 840px; and in a header under 312px (a
          320px phone at a 20px browser font). app/globals.css, header-ask-glyph. */}
      <span className="header-ask-glyph:sr-only">Ask</span>
    </Button>
  );
}
