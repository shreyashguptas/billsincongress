'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { analytics } from '@/lib/analytics';
import { useConvexEnabled } from '@/components/convex-client-provider';
import { PlanCompare, useProCheckout } from '@/components/pro/plan-compare';

/**
 * The /pro page's plans: Free and Pro side by side with the subscribe buttons.
 * Signed-out readers are sent to sign in and brought back here.
 */
export function SubscribePanel() {
  const enabled = useConvexEnabled();
  if (!enabled) return <PlanCompare plan={null} busy={null} error={null} onChoose={null} />;
  return <SubscribePanelInner />;
}

function SubscribePanelInner() {
  const params = useSearchParams();
  const reported = useRef(false);

  const canceled = params.get('checkout') === 'canceled';
  // Older links (and the bill page before 2026-09-29) sent readers here with
  // the bill in the address; Stripe still returns them to that bill.
  const fromBill = params.get('bill');
  const back = `/pro${fromBill ? `?bill=${encodeURIComponent(fromBill)}` : ''}`;
  const checkout = useProCheckout(fromBill ? 'alert_prompt' : 'pro_page', back, fromBill ?? undefined);

  useEffect(() => {
    if (canceled && !reported.current) {
      reported.current = true;
      analytics.proCheckoutReturned('canceled');
    }
  }, [canceled]);

  return (
    <div className="space-y-4">
      {canceled && <Notice>Checkout was canceled. You have not been charged.</Notice>}
      {fromBill && !canceled && checkout.plan !== 'pro' && (
        <Notice>
          Bill alerts are part of Pro. Subscribe and you&apos;ll go straight back to{' '}
          <Link href={`/bills/${encodeURIComponent(fromBill)}`} className="link focus-ring rounded-xs">
            that bill
          </Link>
          , already following it.
        </Notice>
      )}
      <PlanCompare {...checkout} onChoose={checkout.choose} />
    </div>
  );
}

/** A quiet band above the plans: why the reader is here, not an error. */
function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-sunken px-4 py-3 text-[15px] leading-relaxed text-ink">{children}</p>;
}
