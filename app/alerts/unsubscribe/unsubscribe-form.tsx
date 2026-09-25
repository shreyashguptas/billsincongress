'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { analytics } from '@/lib/analytics';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** The site's inline error box (as on /bills): a tinted hairline, error words. */
const ALERT_CLASS = 'rounded-md border-error/30 px-4 py-3 text-sm dark:border-error/30';

type State =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; removed: number }
  | { kind: 'invalid' }
  | { kind: 'error' };

/**
 * A button, not an automatic unsubscribe on page load: mail scanners open
 * every link in an email, and a page that acted on load would switch readers'
 * alerts off without them ever seeing it.
 */
export function UnsubscribeForm() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>({ kind: 'idle' });

  if (!token) {
    return (
      <p className="text-[15px] leading-relaxed text-ink-2">
        This link is incomplete. Open it again from the email, or manage alerts on{' '}
        <Link href="/account#alerts" className="link focus-ring rounded-xs">
          your account page
        </Link>
        .
      </p>
    );
  }

  const submit = async () => {
    setState({ kind: 'working' });
    try {
      const res = await fetch('/api/alerts/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; removed?: number };
      if (res.ok && body.ok) {
        const removed = body.removed ?? 0;
        analytics.billAlertsUnsubscribed({ removed });
        setState({ kind: 'done', removed });
      } else {
        setState({ kind: res.status === 400 ? 'invalid' : 'error' });
      }
    } catch {
      setState({ kind: 'error' });
    }
  };

  if (state.kind === 'done') {
    return (
      <p role="status" className="rounded-md bg-sunken px-4 py-3 text-[15px] leading-relaxed text-ink">
        Done. You won&apos;t get any more bill alert emails
        {state.removed > 0 ? ` (${state.removed} bill${state.removed === 1 ? '' : 's'} unfollowed)` : ''}.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Button onClick={submit} disabled={state.kind === 'working'} className="w-full sm:w-auto">
        {state.kind === 'working' ? 'Stopping…' : 'Stop all bill alert emails'}
      </Button>
      {state.kind === 'invalid' && (
        <Alert variant="destructive" className={ALERT_CLASS}>
          This link is not valid. Manage alerts on{' '}
          <Link
            href="/account#alerts"
            className="focus-ring rounded-xs underline decoration-error/50 underline-offset-[3px] hover:decoration-error"
          >
            your account page
          </Link>{' '}
          instead.
        </Alert>
      )}
      {state.kind === 'error' && (
        <Alert variant="destructive" className={ALERT_CLASS}>
          Something went wrong. Please try again.
        </Alert>
      )}
    </div>
  );
}
