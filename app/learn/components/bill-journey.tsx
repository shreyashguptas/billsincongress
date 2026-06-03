'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { ArrowLeft, ArrowRight, Lightbulb, RotateCcw } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import {
  IntroducedIllustration,
  CommitteeIllustration,
  VoteIllustration,
  BothChambersIllustration,
  ToPresidentIllustration,
  SignedIllustration,
  LawIllustration,
} from './stage-illustrations';

// ─────────────────────────────────────────────────────────────────────────────
// "From idea to law" — the interactive heart of the Learn page. Seven steps,
// each with its own animated illustration, walked through at the reader's pace.
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    short: 'Introduced',
    title: 'Every law starts with an idea',
    body: 'Anyone can have an idea for a law — a citizen, a teacher, even a kid. But only a member of Congress can introduce it. They write the idea down, give it a number like H.R. 1, and drop it into a real wooden box called the hopper. The journey begins.',
    fact: 'The hopper is an actual mahogany box at the front of the House chamber. It has been used for over a century.',
    siteLabel: 'Introduced',
    Illustration: IntroducedIllustration,
  },
  {
    short: 'Committee',
    title: 'A small group studies it closely',
    body: 'The bill is sent to a committee — members who specialize in that topic, like farming, defense, or health. They hold hearings, question experts, and rewrite whole sections. This is the toughest stop on the journey: most bills never leave this room.',
    fact: 'Roughly 9 out of 10 bills die quietly in committee — they simply never get scheduled for a vote.',
    siteLabel: 'In Committee',
    Illustration: CommitteeIllustration,
  },
  {
    short: 'First vote',
    title: 'One chamber debates and votes',
    body: 'If the committee approves, the bill goes to the full chamber — all 435 Representatives or all 100 Senators. They debate it, sometimes amend it, then vote. More than half must say yes: 218 votes in the House, or 51 in the Senate.',
    fact: 'In the Senate, opponents can talk for hours to delay a vote — the famous filibuster. It takes 60 votes to cut one off.',
    siteLabel: 'Passed One Chamber',
    Illustration: VoteIllustration,
  },
  {
    short: 'Both chambers',
    title: 'Then it all happens again',
    body: 'A bill that passes the House must also pass the Senate (or the other way around) — committee, debate, and vote, all over again. Both chambers must approve the exact same words. If their versions differ, they negotiate one text and vote once more.',
    fact: 'The House and Senate sit in opposite wings of the Capitol — a bill literally travels across the building.',
    siteLabel: 'Passed Both Chambers',
    Illustration: BothChambersIllustration,
  },
  {
    short: 'To the President',
    title: 'Congress agrees. One desk left.',
    body: 'Once both chambers pass identical text, the bill is printed on parchment, signed by the Speaker of the House and the Vice President, and hand-delivered to the White House.',
    fact: 'The final copy is still printed on parchment-style paper — a tradition as old as Congress itself.',
    siteLabel: 'To President',
    Illustration: ToPresidentIllustration,
  },
  {
    short: 'Signed',
    title: 'The President has ten days to decide',
    body: "Sign it, and it becomes law. Veto it, and it goes back to Congress with a 'no'. But a veto isn't always the end — if two-thirds of both chambers vote yes again, the bill becomes law anyway, with no signature at all.",
    fact: 'If the President simply ignores a bill for 10 days while Congress is in session, it becomes law automatically.',
    siteLabel: 'Signed by President',
    Illustration: SignedIllustration,
  },
  {
    short: 'Law',
    title: 'The idea is now the law of the land',
    body: 'The bill receives a Public Law number and joins the United States Code — the books that hold every federal law. From this day on, it applies to all 340 million Americans. From a thought in one person’s head to a rule for an entire country.',
    fact: "Laws are numbered by Congress: ‘Public Law 119–42’ means the 42nd law passed during the 119th Congress.",
    siteLabel: 'Became Law',
    Illustration: LawIllustration,
  },
];

export function BillJourney() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  // Hold the illustrations until the section is actually on screen, so their
  // animations don't play unseen.
  const inView = useInView(containerRef, { once: true, margin: '-120px' });

  const go = (next: number, method: 'next' | 'back' | 'jump') => {
    if (next < 0 || next >= STEPS.length || next === step) return;
    setDirection(next > step ? 1 : -1);
    setStep(next);
    analytics.learnJourneyStepViewed(next + 1, STEPS[next].short, method);
  };

  const current = STEPS[step];
  const { Illustration } = current;

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Step track */}
      <div role="tablist" aria-label="Steps of a bill's journey" className="flex items-start">
        {STEPS.map((s, i) => (
          <div key={s.short} className={cn('flex items-start', i > 0 && 'flex-1')}>
            {/* Connecting line */}
            {i > 0 && (
              <div className="flex-1 h-px mt-4 sm:mt-[18px] bg-border relative overflow-hidden" aria-hidden="true">
                <div
                  className={cn(
                    'absolute inset-0 bg-accent origin-left transition-transform duration-500 ease-out',
                    i <= step ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </div>
            )}
            {/* Node */}
            <div className="flex flex-col items-center gap-1.5 px-0.5 sm:px-1">
              <button
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-label={`Step ${i + 1}: ${s.short}`}
                onClick={() => go(i, 'jump')}
                className={cn(
                  'flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border font-mono text-xs sm:text-sm tabular transition-all duration-300',
                  i === step
                    ? 'border-accent bg-accent text-accent-foreground scale-110'
                    : i < step
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border bg-background text-muted-foreground hover:border-foreground/50 hover:text-foreground',
                )}
              >
                {i + 1}
              </button>
              <span
                className={cn(
                  'hidden md:block text-[11px] leading-tight text-center max-w-[72px] transition-colors',
                  i === step ? 'text-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                {s.short}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Stage card */}
      <div className="border border-border bg-card overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -36 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="grid md:grid-cols-12"
          >
            {/* Illustration */}
            <div className="md:col-span-5 border-b md:border-b-0 md:border-r border-border bg-background p-6 sm:p-8 flex items-center justify-center">
              <div className="w-full max-w-[300px] text-foreground">
                {inView && <Illustration key={`ill-${step}`} />}
              </div>
            </div>

            {/* Narrative */}
            <div className="md:col-span-7 p-6 sm:p-8 flex flex-col">
              <p className="label-eyebrow mb-2">
                Step {step + 1} of {STEPS.length}
              </p>
              <h3 className="font-serif text-xl sm:text-2xl font-semibold tracking-tight mb-3">
                {current.title}
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-5">
                {current.body}
              </p>

              {/* Fun fact */}
              <div className="border-l-2 border-accent bg-secondary/60 px-4 py-3 mb-6">
                <p className="flex gap-2 text-sm leading-relaxed">
                  <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-accent" aria-hidden="true" />
                  <span>{current.fact}</span>
                </p>
              </div>

              {/* Tie back to the product */}
              <p className="text-xs text-muted-foreground mb-6">
                On a bill's page, this step appears as{' '}
                <span className="font-mono text-[11px] uppercase tracking-wide text-foreground">
                  {current.siteLabel}
                </span>
                .
              </p>

              {/* Controls */}
              <div className="mt-auto flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => go(step - 1, 'back')}
                  disabled={step === 0}
                  className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </button>
                {step < STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => go(step + 1, 'next')}
                    className="inline-flex items-center gap-2 rounded-sm bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-foreground/85 transition-colors"
                  >
                    Next step
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => go(0, 'jump')}
                    className="inline-flex items-center gap-2 rounded-sm border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Start over
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
