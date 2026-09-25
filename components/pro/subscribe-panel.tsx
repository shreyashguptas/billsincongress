'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAction, useConvexAuth, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';

import { api } from '@/convex/_generated/api';
import { analytics } from '@/lib/analytics';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useConvexEnabled } from '@/components/convex-client-provider';
import { billingErrorCode, PRO_PRICE_USD, yearlySavingsMonths, type ProInterval } from '@/lib/pro';
import { cn } from '@/lib/utils';
import { ProPill, SpectrumStrip } from '@/components/brand/pro-mark';
import { MonthDots } from '@/components/pro/pictures';

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
 * The two plan panels and their subscribe buttons. Signed-out readers are sent
 * to sign in and brought back here; Pro readers are pointed at their account.
 */
export function SubscribePanel() {
  const enabled = useConvexEnabled();
  if (!enabled) return <PlanCards onChoose={null} busy={null} />;
  return <SubscribePanelInner />;
}

function SubscribePanelInner() {
  const params = useSearchParams();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const billing = useQuery(api.billing.status, {});
  const startCheckout = useAction(api.billing.startCheckout);
  const [busy, setBusy] = useState<ProInterval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reported = useRef(false);

  const canceled = params.get('checkout') === 'canceled';
  const fromBill = params.get('bill');

  useEffect(() => {
    if (canceled && !reported.current) {
      reported.current = true;
      analytics.proCheckoutReturned('canceled');
    }
  }, [canceled]);

  const choose = async (interval: ProInterval) => {
    setError(null);
    if (!isAuthenticated) {
      const back = `/pro${fromBill ? `?bill=${encodeURIComponent(fromBill)}` : ''}`;
      window.location.href = `/sign-in?redirect=${encodeURIComponent(back)}`;
      return;
    }
    if (busy) return;
    setBusy(interval);
    analytics.proCheckoutStarted({ interval, surface: fromBill ? 'alert_prompt' : 'pro_page' });
    try {
      const { url } = await startCheckout({ interval });
      window.location.href = url;
    } catch (err) {
      const code = err instanceof ConvexError ? billingErrorCode(err.data) : 'UNKNOWN';
      analytics.proCheckoutFailed({ interval, reason: code });
      setError(FAILURE_COPY[code] ?? 'Could not open checkout. Please try again.');
      setBusy(null);
    }
  };

  if (billing?.plan === 'pro') {
    return (
      <div className="overflow-hidden rounded-lg border border-line bg-raised">
        {/* The Pro mark: the spectrum strip that opens the plan emails (brand.md, "Pro"). */}
        <SpectrumStrip />
        <div className="p-6 sm:p-8">
          <ProPill />
          <p className="mt-4 font-serif text-display-sm font-medium text-ink">You&apos;re on Pro.</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            Follow bills from any bill page with <span className="font-medium text-ink">Email me updates</span>.
            Manage your plan and followed bills on{' '}
            <Link href="/account" className="link focus-ring rounded-xs">
              your account page
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canceled && <Notice>Checkout was canceled. You have not been charged.</Notice>}
      {fromBill && !canceled && (
        <Notice>
          Bill alerts are part of Pro. Subscribe, then press{' '}
          <span className="font-medium">Email me updates</span> on{' '}
          <Link href={`/bills/${encodeURIComponent(fromBill)}`} className="link focus-ring rounded-xs">
            that bill
          </Link>{' '}
          again.
        </Notice>
      )}
      <PlanCards onChoose={isLoading ? null : choose} busy={busy} />
      {!isAuthenticated && !isLoading && (
        <p className="text-[13px] text-ink-3">
          You&apos;ll sign in or create a free account first, then come back here.
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

/** A quiet band above the plans: why the reader is here, not an error. */
function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-sunken px-4 py-3 text-[15px] leading-relaxed text-ink">{children}</p>;
}

/**
 * Monthly and yearly side by side, as pictures: the price, and the year as
 * twelve month dots (on yearly, the free months in Pro's indigo). Yearly
 * carries the page's one ink button.
 */
function PlanCards({
  onChoose,
  busy,
}: {
  onChoose: ((interval: ProInterval) => void) | null;
  busy: ProInterval | null;
}) {
  const free = yearlySavingsMonths();
  const plans: Array<{ interval: ProInterval; price: string; per: string; free: number }> = [
    { interval: 'month', price: `$${PRO_PRICE_USD.month}`, per: 'a month', free: 0 },
    { interval: 'year', price: `$${PRO_PRICE_USD.year}`, per: 'a year', free },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {plans.map((plan) => {
        const yearly = plan.interval === 'year';
        return (
          <div
            key={plan.interval}
            className={cn('flex flex-col rounded-lg border bg-raised p-6', yearly ? 'border-ink' : 'border-line')}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="label-eyebrow">{yearly ? 'Yearly' : 'Monthly'}</p>
              {yearly && <ProPill className="tabular">{plan.free} months free</ProPill>}
            </div>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="font-serif text-display-lg font-medium text-ink tabular">{plan.price}</span>
              <span className="text-[15px] text-ink-2">{plan.per}</span>
            </p>
            <MonthDots free={plan.free} className="mt-5" />
            <p className="mt-3 flex-1 text-[13px] leading-relaxed text-ink-3 tabular">
              {yearly ? `Pay for ${12 - plan.free} months, get 12.` : 'Cancel any time.'}
            </p>
            <Button
              className="mt-6 w-full"
              variant={yearly ? 'default' : 'outline'}
              disabled={onChoose === null || busy !== null}
              onClick={() => onChoose?.(plan.interval)}
            >
              {busy === plan.interval ? 'Opening checkout…' : `Subscribe ${yearly ? 'yearly' : 'monthly'}`}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/** The two plan panels' shape, while the reader's plan is read. */
export function PlanCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-lg border border-line bg-raised p-6">
          <Skeleton className="h-4 w-16 rounded-xs" />
          <Skeleton className="mt-4 h-12 w-32 rounded-xs" />
          <Skeleton className="mt-5 h-6 w-full rounded-xs" />
          <Skeleton className="mt-3 h-4 w-1/2 rounded-xs" />
          <Skeleton className="mt-9 h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
