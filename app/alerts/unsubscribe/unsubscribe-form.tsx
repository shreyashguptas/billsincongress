'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { analytics } from '@/lib/analytics';
import { Button } from '@/components/ui/button';

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
      <p className="text-sm text-muted-foreground">
        This link is incomplete. Open it again from the email, or manage alerts on{' '}
        <Link href="/account#alerts" className="underline underline-offset-4">
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
      <p role="status" className="rounded-md border border-border bg-secondary px-4 py-3 text-sm">
        Done. You won&apos;t get any more bill alert emails
        {state.removed > 0 ? ` (${state.removed} bill${state.removed === 1 ? '' : 's'} unfollowed)` : ''}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Button onClick={submit} disabled={state.kind === 'working'} className="w-full">
        {state.kind === 'working' ? 'Stopping…' : 'Stop all bill alert emails'}
      </Button>
      {state.kind === 'invalid' && (
        <p role="alert" className="text-sm text-destructive">
          This link is not valid. Manage alerts on{' '}
          <Link href="/account#alerts" className="underline underline-offset-4">
            your account page
          </Link>{' '}
          instead.
        </p>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
