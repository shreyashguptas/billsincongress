'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Bell, BellRing } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { analytics } from '@/lib/analytics';
import { useConvexEnabled } from '@/components/convex-client-provider';
import { Button } from '@/components/ui/button';
import { initialsFor } from '@/components/brand/pro-mark';

// Loaded on first press: most readers never open it.
const ProDialog = dynamic(() => import('@/components/pro/pro-dialog'));
// Loaded only when a checkout from this bill has just turned the plan Pro.
const WelcomeToPro = dynamic(() => import('@/components/pro/welcome-to-pro'), { ssr: false });

interface BillAlertButtonProps {
  billId: string;
  /** Sizing from the header row it sits in (the button is an outline Button, like Save). */
  className?: string;
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
 * toggle an alert; everyone else gets the Pro dialog (Free and Pro side by
 * side, with the subscribe buttons) over the bill. Renders nothing when Convex isn't configured.
 *
 * Checkout from that dialog comes back here, not to the account page:
 * `?checkout=success` waits for the Stripe webhook to make the plan Pro, then
 * follows this bill (what the reader pressed the button for) and shows the
 * Welcome to Pro celebration; `?checkout=canceled` reopens the dialog; and
 * `?upgrade=1` (back from signing in) reopens it for a reader not yet on Pro.
 * The address is read from `window.location`, not `useSearchParams`, so the
 * bill page stays statically rendered.
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

function BillAlertButtonInner({ billId, analyticsProps, className }: BillAlertButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `upsellMounted` keeps the dialog mounted after the first open, so closing animates.
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [upsellMounted, setUpsellMounted] = useState(false);
  const showUpsell = () => {
    setUpsellMounted(true);
    setUpsellOpen(true);
  };

  const [upsellNotice, setUpsellNotice] = useState<string | null>(null);

  const status = useQuery(api.alerts.statusForBill, { billId });

  // Back from Stripe or from signing in. Read once, then dropped from the
  // address so a reload cannot replay it.
  const [returned, setReturned] = useState<'success' | 'upgrade' | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const checkout = url.searchParams.get('checkout');
    const upgrade = url.searchParams.get('upgrade');
    if (checkout === null && upgrade === null) return;
    url.searchParams.delete('checkout');
    url.searchParams.delete('upgrade');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (checkout === 'success') {
      analytics.proCheckoutReturned('success');
      setReturned('success');
    } else if (checkout === 'canceled') {
      analytics.proCheckoutReturned('canceled');
      setUpsellNotice('Checkout was canceled. You have not been charged.');
      showUpsell();
    } else if (upgrade === '1') {
      setReturned('upgrade');
    }
  }, []);

  // Back from signing in: reopen the plans, unless the account is already Pro.
  useEffect(() => {
    if (returned !== 'upgrade' || !status) return;
    setReturned(null);
    if (!status.pro) showUpsell();
  }, [returned, status]);

  const billing = useQuery(api.billing.status, returned === 'success' ? {} : 'skip');
  const me = useQuery(api.users.currentUser, returned === 'success' ? {} : 'skip');
  const [waitedLong, setWaitedLong] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const activated = useRef(false);
  useEffect(() => {
    if (returned !== 'success') return;
    const timer = setTimeout(() => setWaitedLong(true), 60_000);
    return () => clearTimeout(timer);
  }, [returned]);
  const toggle = useMutation(api.alerts.toggle).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.alerts.statusForBill, { billId: args.billId });
    if (current && current.pro) {
      store.setQuery(api.alerts.statusForBill, { billId: args.billId }, {
        ...current,
        following: !current.following,
      });
    }
  });

  // The webhook has made the plan Pro: follow this bill, then celebrate.
  useEffect(() => {
    if (returned !== 'success' || activated.current || !status?.pro || billing?.plan !== 'pro') return;
    activated.current = true;
    analytics.proActivated(billing.interval ?? 'unknown');
    void (async () => {
      if (!status.following) {
        try {
          const { following } = await toggle({ billId });
          if (following) {
            analytics.billAlertToggled({ bill_id: billId, action: 'followed', surface: 'bill_page', ...analyticsProps });
          }
        } catch (err) {
          const code = err instanceof ConvexError ? String(err.data) : '';
          setError(ERROR_COPY[code] ?? 'You are on Pro, but this bill could not be followed. Press Email me updates.');
        }
      }
      setReturned(null);
      setCelebrating(true);
    })();
  }, [returned, status, billing, billId, toggle, analyticsProps]);

  const handleClick = async () => {
    if (!status) return;
    setError(null);
    // Unfollowing always works, even after Pro lapses; following needs Pro.
    if (!status.pro && !status.following) {
      analytics.billAlertUpsellShown({ bill_id: billId, signed_in: status.signedIn });
      showUpsell();
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
        showUpsell();
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
      <Button
        type="button"
        variant="outline"
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
        className={className}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {paused ? 'Updates paused' : following ? 'Emailing you updates' : 'Email me updates'}
      </Button>
      {error && (
        <span role="alert" className="basis-full text-xs text-error sm:text-right">
          {error}
        </span>
      )}
      {returned === 'success' && (
        <span role="status" className="basis-full text-xs text-ink-2 sm:text-right">
          {waitedLong
            ? "This is taking longer than usual. If you were charged and this still hasn't changed in a few minutes, email hi@billsincongress.com."
            : 'Payment received. Confirming with Stripe, then following this bill…'}
        </span>
      )}
      {upsellMounted && (
        <ProDialog open={upsellOpen} onOpenChange={setUpsellOpen} billId={billId} notice={upsellNotice} />
      )}
      {celebrating && billing && (
        <WelcomeToPro
          open={celebrating}
          onOpenChange={setCelebrating}
          initials={initialsFor(me?.name ?? me?.email)}
          questionsPerDay={billing.limits.questionsPerDay}
          alertBills={billing.limits.alertBills}
          followingBill={status?.following === true}
        />
      )}
    </>
  );
}
