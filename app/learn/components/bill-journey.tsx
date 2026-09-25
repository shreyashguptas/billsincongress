'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { ArrowLeft, ArrowRight, Lightbulb, RotateCcw } from 'lucide-react';
import { StatusPill } from '@/components/brand/status';
import { Button } from '@/components/ui/button';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { BillStages } from '@/lib/utils/bill-stages';
import {
  IntroducedIllustration,
  CommitteeIllustration,
  VoteIllustration,
  BothChambersIllustration,
  ToPresidentIllustration,
  SignedIllustration,
  LawIllustration,
} from './stage-illustrations';

// "From idea to law" — the interactive heart of the Learn page. Seven steps,
// each with its own animated illustration, walked through at the reader's pace.
// The stepper is ink: the current step is an ink fill, steps already walked are
// ink outlines. The only hue is the stage itself, in the StatusPill that shows
// how each step appears on a bill's page.

const STEPS = [
  {
    short: 'Introduced',
    title: 'Every law starts with an idea',
    body: 'Anyone can have an idea for a law — a citizen, a teacher, even a kid. But only a member of Congress can introduce it. They write the idea down, give it a number like H.R. 1, and drop it into a real wooden box called the hopper. The journey begins.',
    fact: 'The hopper is an actual mahogany box at the front of the House chamber. It has been used for over a century.',
    stage: BillStages.INTRODUCED,
    Illustration: IntroducedIllustration,
  },
  {
    short: 'Committee',
    title: 'A small group studies it closely',
    body: 'The bill is sent to a committee — members who specialize in that topic, like farming, defense, or health. They hold hearings, question experts, and rewrite whole sections. This is the toughest stop on the journey: most bills never leave this room.',
    fact: 'Roughly 9 out of 10 bills die quietly in committee — they simply never get scheduled for a vote.',
    stage: BillStages.IN_COMMITTEE,
    Illustration: CommitteeIllustration,
  },
  {
    short: 'First vote',
    title: 'One chamber debates and votes',
    body: 'If the committee approves, the bill goes to the full chamber — all 435 Representatives or all 100 Senators. They debate it, sometimes amend it, then vote. More than half must say yes: 218 votes in the House, or 51 in the Senate.',
    fact: 'In the Senate, opponents can talk for hours to delay a vote — the famous filibuster. It takes 60 votes to cut one off.',
    stage: BillStages.PASSED_ONE_CHAMBER,
    Illustration: VoteIllustration,
  },
  {
    short: 'Both chambers',
    title: 'Then it all happens again',
    body: 'A bill that passes the House must also pass the Senate (or the other way around) — committee, debate, and vote, all over again. Both chambers must approve the exact same words. If their versions differ, they negotiate one text and vote once more.',
    fact: 'The House and Senate sit in opposite wings of the Capitol — a bill literally travels across the building.',
    stage: BillStages.PASSED_BOTH_CHAMBERS,
    Illustration: BothChambersIllustration,
  },
  {
    short: 'To the President',
    title: 'Congress agrees. One desk left.',
    body: 'Once both chambers pass identical text, the bill is printed on parchment, signed by the Speaker of the House and the Vice President, and hand-delivered to the White House.',
    fact: 'The final copy is still printed on parchment-style paper — a tradition as old as Congress itself.',
    stage: BillStages.TO_PRESIDENT,
    Illustration: ToPresidentIllustration,
  },
  {
    short: 'Signed',
    title: 'The President has ten days to decide',
    body: "Sign it, and it becomes law. Veto it, and it goes back to Congress with a 'no'. But a veto isn't always the end — if two-thirds of both chambers vote yes again, the bill becomes law anyway, with no signature at all.",
    fact: 'If the President simply ignores a bill for 10 days while Congress is in session, it becomes law automatically.',
    stage: BillStages.SIGNED_BY_PRESIDENT,
    Illustration: SignedIllustration,
  },
  {
    short: 'Law',
    title: 'The idea is now the law of the land',
    body: 'The bill receives a Public Law number and joins the United States Code — the books that hold every federal law. From this day on, it applies to all 340 million Americans. From a thought in one person’s head to a rule for an entire country.',
    fact: "Laws are numbered by Congress: ‘Public Law 119–42’ means the 42nd law passed during the 119th Congress.",
    stage: BillStages.BECAME_LAW,
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
              <div className="relative mt-4 h-px flex-1 overflow-hidden bg-line-strong/40 sm:mt-[18px]" aria-hidden="true">
                <div
                  className={cn(
                    'absolute inset-0 origin-left bg-ink transition-transform duration-500 ease-out',
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
                  'focus-ring flex h-8 w-8 items-center justify-center rounded-full border font-mono text-xs tabular transition-colors duration-300 sm:h-9 sm:w-9 sm:text-sm',
                  i === step
                    ? 'border-ink bg-ink text-on-ink'
                    : i < step
                      ? 'border-ink bg-raised text-ink hover:bg-sunken'
                      : 'border-line-strong bg-raised text-ink-3 hover:border-ink hover:text-ink',
                )}
              >
                {i + 1}
              </button>
              <span
                className={cn(
                  'hidden max-w-[76px] text-center text-xs leading-tight transition-colors md:block',
                  i === step ? 'font-medium text-ink' : 'text-ink-3',
                )}
              >
                {s.short}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Stage card */}
      <div className="overflow-hidden rounded-md border border-line bg-raised">
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
            <div className="flex items-center justify-center border-b border-line bg-paper p-6 sm:p-8 md:col-span-5 md:border-b-0 md:border-r">
              <div className="w-full max-w-[300px] text-ink">
                {inView && <Illustration key={`ill-${step}`} />}
              </div>
            </div>

            {/* Narrative */}
            <div className="flex flex-col p-6 sm:p-8 md:col-span-7">
              <p className="label-eyebrow tabular">
                Step {step + 1} of {STEPS.length}
              </p>
              <h3 className="mt-2 text-display-sm text-ink">{current.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2 sm:text-base">{current.body}</p>

              {/* Did you know — a quiet sunken note */}
              <div className="mt-5 flex gap-2.5 rounded-md bg-sunken px-4 py-3 text-sm leading-relaxed text-ink">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden="true" />
                <p>{current.fact}</p>
              </div>

              {/* Tie back to the product */}
              <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-ink-2">
                On a bill&apos;s page, this step appears as
                <StatusPill stage={current.stage} />
              </p>

              {/* Controls */}
              <div className="mt-8 flex items-center justify-between gap-3 md:mt-auto md:pt-8">
                <Button type="button" variant="outline" onClick={() => go(step - 1, 'back')} disabled={step === 0}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button type="button" onClick={() => go(step + 1, 'next')}>
                    Next step
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={() => go(0, 'jump')}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Start over
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
