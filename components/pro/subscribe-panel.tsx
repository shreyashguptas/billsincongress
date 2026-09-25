'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAction, useConvexAuth, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';

import { api } from '@/convex/_generated/api';
import { analytics } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { useConvexEnabled } from '@/components/convex-client-provider';
import { PRO_PRICE_USD, yearlySavingsMonths, type ProInterval } from '@/lib/pro';
import { cn } from '@/lib/utils';

const FAILURE_COPY: Record<string, string> = {
  ALREADY_PRO: 'You are already on Pro. If your account page does not show it yet, give it a minute.',
  SUBSCRIPTION_NEEDS_ATTENTION:
    'Your Pro subscription needs attention (a failed payment or a pause). Use "Manage billing" on your account page to fix it.',
  EMAIL_REQUIRED: 'Your account needs an email address before you can subscribe.',
  BILLING_NOT_CONFIGURED: 'Subscriptions are not open yet. Please check back soon.',
};

/**
 * The two plan cards and their subscribe buttons. Signed-out readers are sent
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
      const code = err instanceof ConvexError ? String(err.data) : 'UNKNOWN';
      analytics.proCheckoutFailed({ interval, reason: code });
      setError(FAILURE_COPY[code] ?? 'Could not open checkout. Please try again.');
      setBusy(null);
    }
  };

  if (billing?.plan === 'pro') {
    return (
      <div className="rounded-md border border-border bg-card p-6">
        <p className="font-serif text-xl font-semibold">You&apos;re on Pro.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Follow bills from any bill page with <span className="text-foreground">Email me updates</span>.
          Manage your plan and followed bills on{' '}
          <Link href="/account" className="underline underline-offset-4">
            your account page
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canceled && (
        <p className="rounded-md border border-border bg-secondary px-4 py-3 text-sm">
          Checkout was canceled. You have not been charged.
        </p>
      )}
      {fromBill && !canceled && (
        <p className="rounded-md border border-border bg-secondary px-4 py-3 text-sm">
          Bill alerts are part of Pro. Subscribe, then press{' '}
          <span className="font-medium">Email me updates</span> on{' '}
          <Link href={`/bills/${encodeURIComponent(fromBill)}`} className="underline underline-offset-4">
            that bill
          </Link>{' '}
          again.
        </p>
      )}
      <PlanCards onChoose={isLoading ? null : choose} busy={busy} />
      {!isAuthenticated && !isLoading && (
        <p className="text-xs text-muted-foreground">
          You&apos;ll sign in or create a free account first, then come back here.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function PlanCards({
  onChoose,
  busy,
}: {
  onChoose: ((interval: ProInterval) => void) | null;
  busy: ProInterval | null;
}) {
  const plans: Array<{ interval: ProInterval; price: string; per: string; note: string }> = [
    { interval: 'month', price: `$${PRO_PRICE_USD.month}`, per: 'a month', note: 'Cancel any time.' },
    {
      interval: 'year',
      price: `$${PRO_PRICE_USD.year}`,
      per: 'a year',
      note: `${yearlySavingsMonths()} months free compared with monthly.`,
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {plans.map((plan) => (
        <div
          key={plan.interval}
          className={cn(
            'flex flex-col rounded-md border bg-card p-6',
            plan.interval === 'year' ? 'border-foreground' : 'border-border',
          )}
        >
          <p className="label-eyebrow">{plan.interval === 'year' ? 'Yearly' : 'Monthly'}</p>
          <p className="mt-3 font-serif text-4xl font-semibold tabular">
            {plan.price}
            <span className="ml-1 font-sans text-base font-normal text-muted-foreground">{plan.per}</span>
          </p>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">{plan.note}</p>
          <Button
            className="mt-5 w-full"
            variant={plan.interval === 'year' ? 'default' : 'outline'}
            disabled={onChoose === null || busy !== null}
            onClick={() => onChoose?.(plan.interval)}
          >
            {busy === plan.interval ? 'Opening checkout…' : `Subscribe ${plan.interval === 'year' ? 'yearly' : 'monthly'}`}
          </Button>
        </div>
      ))}
    </div>
  );
}
