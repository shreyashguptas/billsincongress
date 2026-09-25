'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Share } from 'lucide-react';

import { analytics, type ShareMethod, type ShareOutcome } from '@/lib/analytics';
import { billShareUrl } from '@/lib/seo';
import { Button } from '@/components/ui/button';

interface ShareBillButtonProps {
  billId: string;
  /** "H.R. 1: One Big Beautiful Bill Act" — the share sheet's title line. */
  shareTitle: string;
  className?: string;
  analyticsProps: {
    bill_type: string;
    bill_number: string;
    congress: number;
    policy_area: string;
    progress_stage: number | string;
  };
}

/** How long "Link copied" stays on the button before it reads "Share" again. */
const CONFIRM_MS = 2500;

/**
 * One tap to pass a bill on. On a phone or tablet it opens the system share
 * sheet (Messages, WhatsApp, Mail, AirDrop, Copy), which is where people
 * already share from. Everywhere else it copies the link and says so, because
 * a desktop share sheet is a surprise and a copied link pastes anywhere.
 *
 * The link is always the bill's canonical URL, never `location.href`: a reader
 * who arrived with a query string or a hash would otherwise pass it on. What the
 * link unfurls into is the bill's share card (app/bills/[id]/share-image).
 *
 * In the installed app there is no address bar to copy from, so this button is
 * the only way to get a bill's link out.
 */
export default function ShareBillButton({
  billId,
  shareTitle,
  className,
  analyticsProps,
}: ShareBillButtonProps) {
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const report = (method: ShareMethod, outcome: ShareOutcome) =>
    analytics.billShareClicked({ bill_id: billId, method, outcome, ...analyticsProps });

  const confirm = (state: 'copied' | 'failed') => {
    setCopied(state);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), CONFIRM_MS);
  };

  const handleClick = async () => {
    const url = billShareUrl(billId);
    const data = { title: shareTitle, url };

    if (prefersShareSheet() && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        report('native', 'shared');
        return;
      } catch (error) {
        // The reader closed the sheet: that is an answer, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') {
          report('native', 'cancelled');
          return;
        }
        // Anything else (a policy block, a browser bug): copy instead.
      }
    }

    const ok = await copyText(url);
    report('copy', ok ? 'copied' : 'failed');
    confirm(ok ? 'copied' : 'failed');
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={handleClick} className={className}>
        {copied === 'copied' ? (
          <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Share className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        )}
        {copied === 'copied' ? 'Link copied' : copied === 'failed' ? 'Copy failed' : 'Share'}
      </Button>
      {/* The label change is visual; say it to a screen reader too. */}
      <span className="sr-only" role="status" aria-live="polite">
        {copied === 'copied'
          ? 'Link to this bill copied to the clipboard'
          : copied === 'failed'
            ? `Could not copy the link. It is ${billShareUrl(billId)}`
            : ''}
      </span>
    </>
  );
}

/**
 * The system share sheet where it is the native gesture: a touch-first device
 * whose browser has one. Desktop Safari and Chrome also implement
 * `navigator.share`, but a desktop reader pressing Share expects a link on the
 * clipboard, not a sheet.
 */
function prefersShareSheet(): boolean {
  return (
    typeof navigator.share === 'function' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

/**
 * Clipboard API first; a hidden textarea and `execCommand('copy')` where the
 * API is missing or refuses (older WebViews, some in-app browsers). Both run
 * inside the click, which is the user gesture either one needs.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
