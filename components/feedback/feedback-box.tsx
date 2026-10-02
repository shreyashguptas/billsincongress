'use client';

import * as React from 'react';
import { analytics } from '@/lib/analytics';
import { noteFeedbackOpened } from '@/lib/feedback/visit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FeedbackPanel, FEEDBACK_SURVEY_REF } from './feedback-panel';

type Surface = 'header' | 'menu' | 'footer';

export interface FeedbackBox {
  open: boolean;
  setOpen: (open: boolean) => void;
  panel: React.ReactNode;
}

/**
 * Open/close bookkeeping shared by both containers: `survey shown` on open,
 * `survey dismissed` on a close that sent nothing. Kept outside React's state
 * updaters, which development mode runs twice.
 */
export function useFeedbackBox(surface: Surface): FeedbackBox {
  const [open, setOpenState] = React.useState(false);
  // The panel remounts on each open, so each opening starts at Issue / Idea.
  const [session, setSession] = React.useState(0);
  const openRef = React.useRef(false);
  const sentRef = React.useRef(false);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (next === openRef.current) return;
      openRef.current = next;
      if (next) {
        sentRef.current = false;
        setSession((s) => s + 1);
        noteFeedbackOpened();
        analytics.surveyShown(FEEDBACK_SURVEY_REF, { surface });
      } else if (!sentRef.current) {
        analytics.surveyDismissed(FEEDBACK_SURVEY_REF);
      }
      setOpenState(next);
    },
    [surface],
  );

  const panel = (
    <FeedbackPanel
      key={session}
      onSent={() => {
        sentRef.current = true;
      }}
      onDone={() => setOpen(false)}
    />
  );

  return { open, setOpen, panel };
}

/**
 * The header's Feedback button, lg and up: a popover under the button, like
 * the one readers know from developer tools. Narrower headers have no room for
 * it: phones reach the box from the menu sheet, and every width below lg from
 * the footer (`FooterFeedback`), both as `FeedbackDialog`.
 */
export function HeaderFeedback({ className }: { className?: string }) {
  const { open, setOpen, panel } = useFeedbackBox('header');
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={className}>
          Feedback
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Feedback" className="w-[360px] p-0">
        {panel}
      </PopoverContent>
    </Popover>
  );
}

/** The same box as a dialog, below lg. Whoever opens it owns the `box`. */
export function FeedbackDialog({ box }: { box: FeedbackBox }) {
  return (
    <Dialog open={box.open} onOpenChange={box.setOpen}>
      <DialogContent
        // Clear of the screen edges on a phone, and of the on-screen keyboard:
        // the box sits high rather than dead centre. Keeps the corner close,
        // since a phone has no Escape key and the scrim is easy to miss.
        className="top-[max(4.5rem,12%)] w-[calc(100%-2rem)] max-w-md translate-y-0 gap-0 rounded-lg p-0 data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%]"
      >
        <DialogTitle className="sr-only">Feedback</DialogTitle>
        {box.panel}
      </DialogContent>
    </Dialog>
  );
}

/** "Feedback" in the footer's link row, for widths where the header has no button. */
export function FooterFeedback({ className }: { className?: string }) {
  const box = useFeedbackBox('footer');
  return (
    <>
      <button type="button" className={className} onClick={() => box.setOpen(true)}>
        Feedback
      </button>
      <FeedbackDialog box={box} />
    </>
  );
}
