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
 * Under the sheet the header stays live, so the button is also the way to put
 * the panel away: pressed (sunken) while it is open, and a second tap closes it.
 */
export function HeaderAsk({ className }: { className?: string }) {
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
      // The name stays put; aria-expanded says whether a press opens or closes.
      aria-label={
        questions > 0
          ? `Continue your conversation about Congress, ${questions} question${questions === 1 ? '' : 's'} so far`
          : 'Ask a question about Congress'
      }
      className={cn(
        // Shown by globals.css where the corner pill is not.
        'ask-header-button gap-1.5 px-2.5 text-sm [@container_site-header_(min-width:48em)_and_(max-width:52.49em)]:w-10 [@container_site-header_(min-width:48em)_and_(max-width:52.49em)]:touchable:w-11 [@container_site-header_(min-width:48em)_and_(max-width:52.49em)]:px-0',
        open && 'bg-sunken',
        className,
      )}
    >
      <MessageSquare className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      {/* From 768px the four sections take the header's centre, and until 840px
          the word no longer fits beside "Sign in" and "Sign up" without pushing
          the row past the screen: the glyph alone there, named by aria-label. */}
      <span className="[@container_site-header_(min-width:48em)_and_(max-width:52.49em)]:sr-only">Ask</span>
    </Button>
  );
}
