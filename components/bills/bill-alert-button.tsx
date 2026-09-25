'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Bell, BellRing } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { analytics } from '@/lib/analytics';
import { useConvexEnabled } from '@/components/convex-client-provider';

interface BillAlertButtonProps {
  billId: string;
  analyticsProps: {
    bill_type: string;
    bill_number: string;
    congress: number;
    policy_area: string;
    progress_stage: number | string;
  };
}

/**
 * "Email me updates" for the bill detail header, beside Save. Pro readers
 * toggle an alert; everyone else is taken to /pro, which explains the plan and
 * handles sign-in. Renders nothing when Convex isn't configured.
 */
export default function BillAlertButton(props: BillAlertButtonProps) {
  const enabled = useConvexEnabled();
  if (!enabled) return null;
  return <BillAlertButtonInner {...props} />;
}

const ERROR_COPY: Record<string, string> = {
  ALERT_LIMIT: 'You follow the most bills Pro allows. Unfollow one on your account page first.',
  EMAIL_REQUIRED: 'Your account has no email address to send alerts to.',
};

function BillAlertButtonInner({ billId, analyticsProps }: BillAlertButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery(api.alerts.statusForBill, { billId });
  const toggle = useMutation(api.alerts.toggle).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.alerts.statusForBill, { billId: args.billId });
    if (current && current.pro) {
      store.setQuery(api.alerts.statusForBill, { billId: args.billId }, {
        ...current,
        following: !current.following,
      });
    }
  });

  const handleClick = async () => {
    if (!status) return;
    setError(null);
    // Unfollowing always works, even after Pro lapses; following needs Pro.
    if (!status.pro && !status.following) {
      analytics.billAlertUpsellShown({ bill_id: billId, signed_in: status.signedIn });
      router.push(`/pro?bill=${encodeURIComponent(billId)}`);
      return;
    }
    if (pending) return;
    setPending(true);
    try {
      const { following } = await toggle({ billId });
      analytics.billAlertToggled({
        bill_id: billId,
        action: following ? 'followed' : 'unfollowed',
        surface: 'bill_page',
        ...analyticsProps,
      });
    } catch (err) {
      const code = err instanceof ConvexError ? String(err.data) : '';
      if (code === 'UNAUTHENTICATED') {
        router.push(`/sign-in?redirect=${encodeURIComponent(`/bills/${billId}`)}`);
        return;
      }
      if (code === 'PRO_REQUIRED') {
        router.push(`/pro?bill=${encodeURIComponent(billId)}`);
        return;
      }
      setError(ERROR_COPY[code] ?? 'Could not update this alert. Try again.');
    } finally {
      setPending(false);
    }
  };

  const following = status?.following === true;
  // Still on the list after Pro ended: nothing is being sent, so say so. A
  // click unfollows (always allowed); resubscribing resumes it.
  const paused = following && status?.pro === false;
  const Icon = following && !paused ? BellRing : Bell;

  return (
    <>
      <span className="hidden sm:inline">·</span>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === undefined || pending}
        aria-pressed={following}
        title={
          paused
            ? 'Your Pro plan has ended, so emails for this bill are paused. Click to stop following it.'
            : following
              ? 'You get an email on any day this bill moves'
              : 'Get an email on any day this bill moves (Pro)'
        }
        className="inline-flex items-center gap-1.5 text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground disabled:opacity-50"
      >
        <Icon className="h-3.5 w-3.5" />
        {paused ? 'Updates paused' : following ? 'Emailing you updates' : 'Email me updates'}
      </button>
      {error && (
        <span role="alert" className="basis-full text-xs text-destructive">
          {error}
        </span>
      )}
    </>
  );
}
