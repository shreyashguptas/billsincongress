'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Bookmark } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { analytics } from '@/lib/analytics';
import { useConvexEnabled } from '@/components/convex-client-provider';

interface SaveBillButtonProps {
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
 * Save/Saved bookmark toggle for the bill detail header. Self-contained so
 * bill-details.tsx stays free of Convex hooks. Renders nothing (including its
 * leading separator) when Convex isn't configured.
 */
export default function SaveBillButton(props: SaveBillButtonProps) {
  const enabled = useConvexEnabled();
  if (!enabled) return null;
  return <SaveBillButtonInner {...props} />;
}

function SaveBillButtonInner({ billId, analyticsProps }: SaveBillButtonProps) {
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
    <>
      <span className="hidden sm:inline">·</span>
      <button
        type="button"
        onClick={handleClick}
        disabled={isSaved === undefined}
        aria-pressed={isSaved === true}
        className="inline-flex items-center gap-1.5 text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground disabled:opacity-50"
      >
        <Bookmark
          className="h-3.5 w-3.5"
          fill={isSaved ? 'currentColor' : 'none'}
        />
        {isSaved ? 'Saved' : 'Save'}
      </button>
    </>
  );
}
