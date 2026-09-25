'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Bell, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { analytics } from '@/lib/analytics';
import { AvatarMark, ProPill } from '@/components/brand/pro-mark';
import { useAnswers } from '@/components/answers/answer-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Confetti } from './confetti';

/**
 * The moment a reader becomes Pro: confetti in the spectrum (skipped under
 * reduced motion), and a dialog with their avatar in the Pro ring and two
 * next steps. The account page lazy-loads this file and opens it once, when a
 * successful checkout turns the plan Pro (see `pro_activated`).
 */
export default function WelcomeToPro({
  open,
  onOpenChange,
  initials,
  questionsPerDay,
  alertBills,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initials: string;
  questionsPerDay: number;
  alertBills: number;
}) {
  const { setOpen: setAskOpen } = useAnswers();
  const doneRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {open && <Confetti />}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-md gap-0 overflow-hidden p-0"
          // Focus the way out, not the first next step: a keyboard reader
          // hears the welcome, then chooses.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            doneRef.current?.focus();
          }}
        >
          {/* The spectrum strip opens the card, as it opens the Pro emails. */}
          <div aria-hidden="true" className="spectrum-strip h-1.5 w-full" />
          <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
            <Burst initials={initials} />
            <ProPill className="mt-5">Pro is on</ProPill>
            <DialogTitle className="mt-3">Welcome to Pro.</DialogTitle>
            <DialogDescription className="mt-2 text-[15px] text-ink-2">
              Thank you for keeping the site independent.
            </DialogDescription>
          </div>
          <ul className="grid gap-3 border-t border-line bg-sunken/60 p-4">
            <Step
              icon={Bell}
              title="Follow a bill"
              sub={`Up to ${alertBills}, by email`}
              href="/bills"
              onPick={() => {
                analytics.proWelcomeStepClicked('follow_bill');
                onOpenChange(false);
              }}
            />
            <Step
              icon={MessageCircle}
              title="Ask away"
              sub={`${questionsPerDay} questions a day`}
              onPick={() => {
                analytics.proWelcomeStepClicked('ask');
                onOpenChange(false);
                setAskOpen(true, 'manual');
              }}
            />
          </ul>
          <div className="border-t border-line p-4">
            <Button ref={doneRef} className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One next step: an icon, two short lines, the whole tile the control. */
function Step({
  icon: Icon,
  title,
  sub,
  href,
  onPick,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  href?: string;
  onPick: () => void;
}) {
  const body = (
    <>
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[15px] font-medium text-ink">{title}</span>
        <span className="block font-mono text-xs text-ink-3 tabular">{sub}</span>
      </span>
      <ArrowRight aria-hidden="true" className="h-4 w-4 text-ink-3" />
    </>
  );
  const cls =
    'focus-ring flex w-full items-center gap-3 rounded-md border border-line bg-raised p-3 transition-colors hover:border-line-strong';
  return (
    <li>
      {href ? (
        <Link href={href} className={cls} onClick={onPick}>
          {body}
        </Link>
      ) : (
        <button type="button" className={cls} onClick={onPick}>
          {body}
        </button>
      )}
    </li>
  );
}

/**
 * The avatar in its Pro ring at the centre of a still burst of spectrum
 * rays. It is the whole celebration when motion is reduced, so it does not
 * move.
 */
function Burst({ initials }: { initials: string }) {
  const rays = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2 - Math.PI / 2;
    const r1 = i % 2 ? 66 : 62;
    const r2 = i % 2 ? 74 : 80;
    return { x1: 90 + Math.cos(a) * r1, y1: 90 + Math.sin(a) * r1, x2: 90 + Math.cos(a) * r2, y2: 90 + Math.sin(a) * r2, n: (i % 6) + 1 };
  });
  return (
    <div className="relative h-[180px] w-[180px]">
      <svg viewBox="0 0 180 180" aria-hidden="true" className="absolute inset-0 h-full w-full">
        {rays.map((r, i) => (
          <line
            key={i}
            x1={r.x1}
            y1={r.y1}
            x2={r.x2}
            y2={r.y2}
            strokeWidth={4}
            strokeLinecap="round"
            style={{ stroke: `var(--topic-${r.n})` }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <AvatarMark initials={initials} pro size="xl" className="sm:h-28 sm:w-28" />
      </div>
    </div>
  );
}
