'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAction, useConvexAuth, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Check, Minus } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { AUTHED_CHAT_DAILY_LIMIT, MAX_ALERTS_PER_USER, PRO_CHAT_DAILY_LIMIT } from '@/convex/plan';
import { analytics } from '@/lib/analytics';
import { billingErrorCode, PRO_PRICE_USD, yearlySavingsMonths, type ProInterval } from '@/lib/pro';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProPill } from '@/components/brand/pro-mark';

const FAILURE_COPY: Record<string, string> = {
  ALREADY_PRO: 'You are already on Pro. If your account page does not show it yet, give it a minute.',
  PAYMENT_PENDING:
    'Your last payment is still being confirmed. If it does not go through, Stripe cancels it within a day and you can subscribe again then.',
  SUBSCRIPTION_NEEDS_ATTENTION:
    'Your Pro subscription needs attention (a failed payment or a pause). Use "Manage billing" on your account page to fix it.',
  EMAIL_REQUIRED: 'Your account needs an email address before you can subscribe.',
  BILLING_NOT_CONFIGURED: 'Subscriptions are not open yet. Please check back soon.',
  RATE_LIMITED: 'Too many tries in a short time. Please wait a few minutes and try again.',
};

/**
 * The bill a checkout in this tab started from. The bill page acts on
 * `?checkout=…` only when this matches, so a shared or hand-typed link cannot
 * follow a bill for a reader or replay the Pro welcome. Session storage
 * survives the round trip to Stripe in the same tab. It is stamped with the
 * time it was set, so a checkout abandoned in this tab does not match a
 * `?checkout=` link opened hours later.
 */
export const CHECKOUT_BILL_KEY = 'bic-checkout-bill';
const CHECKOUT_BILL_MAX_AGE_MS = 60 * 60 * 1000;

/** Reads and clears the marker; true only if it named `billId` within the last hour. */
export function takeCheckoutBill(billId: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_BILL_KEY);
    window.sessionStorage.removeItem(CHECKOUT_BILL_KEY);
    if (!raw) return false;
    const started = JSON.parse(raw) as { billId?: unknown; at?: unknown };
    return (
      started.billId === billId &&
      typeof started.at === 'number' &&
      Date.now() - started.at < CHECKOUT_BILL_MAX_AGE_MS
    );
  } catch {
    return false;
  }
}

/**
 * Everything a subscribe button needs: who the reader is, their plan, and a
 * `choose` that opens Stripe Checkout (or sends a signed-out reader to sign in
 * and back to `returnTo`). Shared by the /pro page and the bill page's dialog.
 * With a `billId`, Stripe sends the reader back to that bill afterwards.
 */
export function useProCheckout(surface: 'pro_page' | 'alert_prompt', returnTo: string, billId?: string) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const billing = useQuery(api.billing.status, {});
  const startCheckout = useAction(api.billing.startCheckout);
  const [busy, setBusy] = useState<ProInterval | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (interval: ProInterval) => {
    setError(null);
    if (!isAuthenticated) {
      window.location.href = `/sign-in?redirect=${encodeURIComponent(returnTo)}`;
      return;
    }
    if (busy) return;
    setBusy(interval);
    analytics.proCheckoutStarted({ interval, surface });
    try {
      if (billId) {
        try {
          window.sessionStorage.setItem(CHECKOUT_BILL_KEY, JSON.stringify({ billId, at: Date.now() }));
        } catch {
          // No storage: the reader still pays, and lands on the bill without the auto-follow.
        }
      }
      const { url } = await startCheckout(billId ? { interval, billId } : { interval });
      window.location.href = url;
    } catch (err) {
      try {
        window.sessionStorage.removeItem(CHECKOUT_BILL_KEY);
      } catch {
        // Nothing stored to clear.
      }
      const code = err instanceof ConvexError ? billingErrorCode(err.data) : 'UNKNOWN';
      analytics.proCheckoutFailed({ interval, reason: code });
      setError(FAILURE_COPY[code] ?? 'Could not open checkout. Please try again.');
      setBusy(null);
    }
  };

  return {
    /** null while auth or the plan is still being read. */
    plan: isLoading ? null : !isAuthenticated ? ('signed_out' as const) : (billing?.plan ?? null),
    busy,
    error,
    choose: isLoading ? null : choose,
  };
}

type Row = { label: string; included: boolean; adds?: boolean };

// The same four rows on both cards, in the same order, so they line up and a
// reader can read across: what Free has, what it doesn't, what Pro adds.
const FREE_ROWS: Row[] = [
  { label: 'Every bill, chart and summary', included: true },
  { label: 'Save bills to your account', included: true },
  { label: `${AUTHED_CHAT_DAILY_LIMIT} questions a day`, included: true },
  { label: 'Email when a bill moves', included: false },
];
const PRO_ROWS: Row[] = [
  { label: 'Every bill, chart and summary', included: true },
  { label: 'Save bills to your account', included: true },
  { label: `${PRO_CHAT_DAILY_LIMIT} questions a day`, included: true, adds: true },
  { label: `Email when a bill moves, up to ${MAX_ALERTS_PER_USER} bills`, included: true, adds: true },
];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <ul className="mt-5 flex-1 border-t border-line text-[15px] leading-snug">
      {rows.map((row) => (
        // A label may wrap at phone width, so the row is top-aligned and the
        // icon sits in a box one line of the label tall (brand.md, "Icons
        // beside text"): centred on the first line, never nudged.
        <li key={row.label} className="flex min-h-11 items-start gap-2.5 border-b border-line py-2.5">
          <span aria-hidden="true" className="flex h-[1lh] shrink-0 items-center">
            {row.included ? (
              <Check
                strokeWidth={2.25}
                // Pro's indigo marks what Pro adds; the words carry it too.
                className={cn('h-4 w-4', row.adds ? 'text-topic-3' : 'text-ink')}
              />
            ) : (
              <Minus strokeWidth={2} className="h-4 w-4 text-ink-3" />
            )}
          </span>
          <span className={cn('tabular', row.included ? 'text-ink' : 'text-ink-3')}>
            {row.included ? row.label : <><span className="sr-only">Not included: </span>{row.label}</>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The plans as a pricing page draws them: Free and Pro side by side, the same
 * rows in each, and the two ways to pay for Pro as the two buttons on its card.
 * On a phone Pro comes first, so the buttons are on screen without scrolling.
 */
export function PlanCompare({
  plan,
  busy,
  error,
  onChoose,
  className,
}: {
  plan: 'signed_out' | 'free' | 'pro' | null;
  busy: ProInterval | null;
  error: string | null;
  onChoose: ((interval: ProInterval) => void) | null;
  className?: string;
}) {
  const free = yearlySavingsMonths();
  const disabled = onChoose === null || busy !== null || plan === 'pro';
  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-line bg-raised p-5 sm:p-6">
          {/* h-6 matches the Pro card's pill, so the rows line up across the cards. */}
          <p className="label-eyebrow flex h-6 items-center">Free</p>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="font-serif text-display-md font-medium leading-none text-ink tabular">$0</span>
            <span className="text-[15px] text-ink-2">with a free account</span>
          </p>
          <p className="mt-2 text-[13px] text-ink-3">Reading the site is free, always.</p>
          <Rows rows={FREE_ROWS} />
          <div className="mt-5">
            {plan === 'free' ? (
              <Button variant="outline" className="w-full" disabled>
                Your current plan
              </Button>
            ) : plan === 'signed_out' ? (
              <Button asChild variant="outline" className="w-full">
                <Link href="/sign-up">Create a free account</Link>
              </Button>
            ) : (
              // Pro, or still loading: keep the card's height without a button to press.
              <div aria-hidden="true" className="h-10 touchable:h-11" />
            )}
          </div>
        </div>

        <div className="order-first flex flex-col rounded-lg border border-ink bg-raised p-5 ring-1 ring-ink sm:order-none sm:p-6">
          <div className="flex h-6 items-center justify-between gap-3">
            <ProPill />
            <span className="text-[13px] text-ink-3 tabular">Cancel any time</span>
          </div>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="font-serif text-display-md font-medium leading-none text-ink tabular">
              ${PRO_PRICE_USD.month}
            </span>
            <span className="text-[15px] text-ink-2">a month</span>
          </p>
          <p className="mt-2 text-[13px] text-ink-3 tabular">
            or ${PRO_PRICE_USD.year} a year, {free} months free
          </p>
          <Rows rows={PRO_ROWS} />
          {plan === 'pro' ? (
            <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
              You&apos;re on Pro. Manage it on{' '}
              <Link href="/account" className="link focus-ring rounded-xs">
                your account page
              </Link>
              .
            </p>
          ) : (
            <div className="mt-5 grid gap-2">
              <Button className="w-full" disabled={disabled} onClick={() => onChoose?.('year')}>
                {busy === 'year' ? 'Opening checkout…' : `Subscribe yearly · $${PRO_PRICE_USD.year}`}
              </Button>
              <Button variant="outline" className="w-full" disabled={disabled} onClick={() => onChoose?.('month')}>
                {busy === 'month' ? 'Opening checkout…' : `Subscribe monthly · $${PRO_PRICE_USD.month}`}
              </Button>
            </div>
          )}
        </div>
      </div>

      {plan === 'signed_out' && (
        <p className="text-[13px] text-ink-3">
          Subscribing asks you to sign in or create a free account first. Stripe handles your card.
        </p>
      )}
      {error && (
        <Alert variant="destructive" className="rounded-md border-error/30 px-4 py-3 text-sm dark:border-error/30">
          {error}
        </Alert>
      )}
    </div>
  );
}

/** The two cards' shape, while the reader's plan is read. */
export function PlanCompareSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-lg border border-line bg-raised p-5 sm:p-6">
          <Skeleton className="h-4 w-16 rounded-xs" />
          <Skeleton className="mt-3 h-9 w-28 rounded-xs" />
          <Skeleton className="mt-2 h-4 w-1/2 rounded-xs" />
          <Skeleton className="mt-5 h-[176px] w-full rounded-xs" />
          <Skeleton className="mt-5 h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
