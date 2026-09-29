'use client';

import Link from 'next/link';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PlanCompare, useProCheckout } from '@/components/pro/plan-compare';

/**
 * The Pro plans in a dialog, opened from a bill page when a reader not on Pro
 * presses "Email me updates". The whole decision fits on one screen: Free and
 * Pro side by side and the two subscribe buttons, so the reader never leaves
 * the bill to read a pricing page.
 */
export default function ProDialog({
  open,
  onOpenChange,
  billId,
  notice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  /** One line above the plans, e.g. after a canceled checkout. */
  notice?: string | null;
}) {
  // A signed-out reader signs in first and comes back to this bill with the
  // dialog open again; after Stripe, they come back to this bill either way.
  const checkout = useProCheckout('alert_prompt', `/bills/${encodeURIComponent(billId)}?upgrade=1`, billId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-3xl gap-0 overflow-y-auto rounded-lg p-5 sm:p-7">
        <DialogTitle className="pr-8">Get an email when this bill moves</DialogTitle>
        <DialogDescription className="mt-1.5 text-[15px] text-ink-2">
          Bill alerts are part of Pro. Everything else on the site stays free.
        </DialogDescription>
        {notice && <p className="mt-4 rounded-md bg-sunken px-4 py-3 text-[15px] text-ink">{notice}</p>}
        <PlanCompare {...checkout} onChoose={checkout.choose} className="mt-5" />
        <p className="mt-4 text-[13px] text-ink-3">
          <Link href="/pro" className="link focus-ring rounded-xs">
            How Pro works
          </Link>{' '}
          · When alerts arrive, cancelling, and who handles your card.
        </p>
      </DialogContent>
    </Dialog>
  );
}
