'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import { FEEDBACK_MAX_LENGTH, FOUND_IT_SURVEY } from '@/lib/feedback/surveys';
import {
  countPage,
  feedbackOpenedThisVisit,
  isQuietPage,
  notePromptSeen,
  PROMPT_ON_PAGE,
  promptSeenBefore,
} from '@/lib/feedback/visit';
import { useAnswers } from '@/components/answers/answer-provider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LengthLimitNote, useLengthLimit } from '@/components/brand/length-limit';
import { cn } from '@/lib/utils';

const SURVEY = { id: FOUND_IT_SURVEY.id, name: FOUND_IT_SURVEY.name, once: true };
const Q = FOUND_IT_SURVEY.questions;

/** A beat after the page lands, so the card never arrives mid-navigation. */
const SHOW_AFTER_MS = 1500;
const THANKS_MS = 2000;

type Step = 'ask' | 'missing' | 'thanks';

/**
 * "Did you find what you were looking for?" — one question, in the corner,
 * on a reader's third page of a visit, once per person ever.
 *
 * It stays away when it would interrupt: on sign-in, account and billing
 * pages, while the ask panel is open, and for anyone who opened the Feedback
 * box this visit. It never comes back on a browser that has shown it, and it
 * shows only while PostHog has the survey open, which is how the 1,000-answer
 * cap holds.
 */
export function FoundItPrompt() {
  const pathname = usePathname();
  const { phase } = useAnswers();
  const [eligible, setEligible] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const [step, setStep] = React.useState<Step>('ask');
  const [missing, setMissing] = React.useState('');
  const limitId = React.useId();
  const { limit, hit, nudging, onNudgeEnd } = useLengthLimit(FEEDBACK_MAX_LENGTH, 'found_it');
  const finished = React.useRef(false);

  // Count every page; decide once, on the page that crosses the threshold.
  React.useEffect(() => {
    const pages = countPage(pathname);
    if (eligible || finished.current) return;
    if (pages < PROMPT_ON_PAGE || isQuietPage(pathname) || feedbackOpenedThisVisit() || promptSeenBefore()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      analytics.whenSurveyActive(SURVEY.id, (active) => {
        if (!cancelled && active) setEligible(true);
      });
    }, SHOW_AFTER_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, eligible]);

  // Shown the first moment it is eligible, on a page it may appear on, with the ask panel shut.
  React.useEffect(() => {
    if (!eligible || visible || finished.current) return;
    if (phase !== 'closed' || isQuietPage(pathname)) return;
    setVisible(true);
    notePromptSeen();
    analytics.surveyShown(SURVEY, { surface: 'prompt' });
  }, [eligible, visible, phase, pathname]);

  React.useEffect(() => {
    if (step !== 'thanks') return;
    const t = window.setTimeout(() => setVisible(false), THANKS_MS);
    return () => window.clearTimeout(t);
  }, [step]);

  function finish(found: 'Yes' | 'No', text?: string) {
    finished.current = true;
    analytics.surveySent(SURVEY, [
      { ...Q.found, response: found },
      { ...Q.missing, response: text?.trim() || undefined },
    ]);
    setStep('thanks');
  }

  function close() {
    finished.current = true;
    // Having said "No", closing still counts that answer.
    if (step === 'missing') finish('No', missing);
    else if (step === 'ask') analytics.surveyDismissed(SURVEY);
    setVisible(false);
  }

  // Escape closes it, like every other floating surface on the site — unless
  // another layer (the Feedback box, the menu, a picker) already took that
  // Escape: Radix marks the one it uses, and closing the prompt too would
  // dismiss it, or at "What was missing?" send a No the reader never meant.
  React.useEffect(() => {
    if (!visible || step === 'thanks') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // A navigation mid-question leaves it open; the ask panel opening does not.
  if (!visible || (phase !== 'closed' && step !== 'thanks')) return null;

  return (
    <section
      aria-label="Quick question"
      className="found-it-prompt rounded-md border border-line-strong bg-raised p-4 shadow-float animate-popover-in"
    >
      {step === 'thanks' ? (
        <p role="status" className="text-[15px] text-ink">
          Thanks. That helps.
        </p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="pt-1 text-[15px] font-medium leading-snug text-ink">
              {step === 'ask' ? Q.found.question : Q.missing.question}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-1 h-8 w-8 shrink-0 touchable:h-10 touchable:w-10"
              onClick={close}
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </div>

          {step === 'ask' ? (
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" className="touchable:h-11" onClick={() => finish('Yes')}>
                <ThumbsUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Yes
              </Button>
              <Button variant="outline" size="sm" className="touchable:h-11" onClick={() => setStep('missing')}>
                <ThumbsDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                No
              </Button>
            </div>
          ) : (
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                finish('No', missing);
              }}
            >
              <label htmlFor="found-it-missing" className="sr-only">
                {Q.missing.question}
              </label>
              <Textarea
                id="found-it-missing"
                autoFocus
                rows={3}
                value={missing}
                onChange={(e) => setMissing(limit(e.target.value))}
                placeholder="Optional"
                onAnimationEnd={onNudgeEnd}
                className={cn('resize-none', nudging && 'animate-nudge')}
                aria-describedby={limitId}
              />
              <LengthLimitNote id={limitId} length={missing.length} max={FEEDBACK_MAX_LENGTH} hit={hit} />
              <div className="mt-3 flex justify-end">
                <Button type="submit" size="sm" className="touchable:h-11">
                  Send
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
