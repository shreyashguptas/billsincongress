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
 * next steps. The account page, and a bill page the checkout started from,
 * lazy-load this file and open it once, when a successful checkout turns the
 * plan Pro (see `pro_activated`).
 */
export default function WelcomeToPro({
  open,
  onOpenChange,
  initials,
  avatarUrl,
  questionsPerDay,
  alertBills,
  followingBill = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initials: string;
  avatarUrl?: string | null;
  questionsPerDay: number;
  alertBills: number;
  /** Opened on a bill page that has just been followed for the reader. */
  followingBill?: boolean;
}) {
  const { setOpen: setAskOpen } = useAnswers();
  const doneRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {open && <Confetti />}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-md"
          bodyClassName="gap-0 p-0"
          // Focus the way out, not the first next step: a keyboard reader
          // hears the welcome, then chooses.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            // preventScroll: on a short screen the body scrolls, and focusing
            // Done must not scroll the welcome itself out of view.
            doneRef.current?.focus({ preventScroll: true });
          }}
        >
          {/* The spectrum strip opens the card, as it opens the Pro emails. */}
          <div aria-hidden="true" className="spectrum-strip h-1.5 w-full" />
          <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center [@media(max-height:600px)]:pt-5">
            <Burst initials={initials} avatarUrl={avatarUrl} />
            <ProPill className="mt-5">Pro is on</ProPill>
            <DialogTitle className="mt-3">Welcome to Pro.</DialogTitle>
            <DialogDescription className="mt-2 text-ui text-ink-2">
              Thank you for keeping the site independent.
            </DialogDescription>
          </div>
          <ul className="grid gap-3 border-t border-line bg-sunken/60 p-4">
            {followingBill ? (
              <Step icon={Bell} title="You're following this bill" sub="An email the morning it moves" onPick={() => onOpenChange(false)} />
            ) : (
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
            )}
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
          {/* Pinned to the foot of the scrolling body, so Done is on screen
              however short the screen (a phone held sideways). */}
          <div className="sticky bottom-0 border-t border-line bg-popover p-4">
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
        <span className="block text-ui font-medium text-ink">{title}</span>
        <span className="block text-meta text-ink-2 tabular">{sub}</span>
      </span>
      <ArrowRight aria-hidden="true" className="h-4 w-4 text-ink-3" />
    </>
  );
  const cls =
    'focus-ring flex w-full items-center gap-3 rounded-md border border-line bg-raised p-3 transition-[border-color,transform] hover:border-line-strong touchable:active:scale-[.98]';
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
 * move. On a short screen (600px or less: a phone held sideways, a 568px phone) it draws at
 * 112px rather than 180px, so the next steps and Done fit.
 */
function Burst({ initials, avatarUrl }: { initials: string; avatarUrl?: string | null }) {
  const rays = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2 - Math.PI / 2;
    const r1 = i % 2 ? 66 : 62;
    const r2 = i % 2 ? 74 : 80;
    return { x1: 90 + Math.cos(a) * r1, y1: 90 + Math.sin(a) * r1, x2: 90 + Math.cos(a) * r2, y2: 90 + Math.sin(a) * r2, n: (i % 6) + 1 };
  });
  return (
    <div className="relative h-[180px] w-[180px] [@media(max-height:600px)]:h-28 [@media(max-height:600px)]:w-28">
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
        <AvatarMark
          initials={initials}
          src={avatarUrl}
          pro
          size="xl"
          // `!`: must beat the size's own sm:h-28, which a sideways phone also matches.
          className="sm:h-28 sm:w-28 [@media(max-height:600px)]:h-16! [@media(max-height:600px)]:w-16!"
        />
      </div>
    </div>
  );
}
