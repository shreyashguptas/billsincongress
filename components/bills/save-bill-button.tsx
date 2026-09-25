'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Bookmark } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { analytics } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { useConvexEnabled } from '@/components/convex-client-provider';

interface SaveBillButtonProps {
  billId: string;
  /** Sizing from the header row it sits in (the button is an outline Button). */
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
 * Save/Saved bookmark toggle for the bill detail header, drawn as an outline
 * button beside "Read full text". Self-contained so bill-details.tsx stays
 * free of Convex hooks. Renders nothing when Convex isn't configured.
 */
export default function SaveBillButton(props: SaveBillButtonProps) {
  const enabled = useConvexEnabled();
  if (!enabled) return null;
  return <SaveBillButtonInner {...props} />;
}

function SaveBillButtonInner({ billId, analyticsProps, className }: SaveBillButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const [pending, setPending] = useState(false);

  const isSaved = useQuery(api.savedBills.isSaved, { billId });
  const toggleSave = useMutation(api.savedBills.toggleSave).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.savedBills.isSaved, { billId: args.billId });
      if (current !== undefined) {
        store.setQuery(api.savedBills.isSaved, { billId: args.billId }, !current);
      }
    },
  );

  const redirectToSignIn = () => {
    router.push(`/sign-in?redirect=${encodeURIComponent(pathname ?? '/bills')}`);
  };

  const handleClick = async () => {
    if (!isAuthenticated) {
      analytics.billSaveSigninRedirected(billId);
      redirectToSignIn();
      return;
    }
    // One toggle (and one analytics event) at a time — rapid clicks would
    // otherwise double-count bill_save_toggled.
    if (pending) return;
    setPending(true);
    try {
      const { saved } = await toggleSave({ billId });
      analytics.billSaveToggled({
        bill_id: billId,
        action: saved ? 'saved' : 'unsaved',
        ...analyticsProps,
      });
    } catch (error) {
      // Signed out mid-session — the token expired between render and click.
      if (error instanceof ConvexError && error.data === 'UNAUTHENTICATED') {
        redirectToSignIn();
        return;
      }
      console.warn('Failed to toggle saved bill:', error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={isSaved === undefined}
      aria-pressed={isSaved === true}
      className={className}
    >
      <Bookmark
        className="h-4 w-4"
        strokeWidth={1.75}
        fill={isSaved ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
      {isSaved ? 'Saved' : 'Save'}
    </Button>
  );
}
