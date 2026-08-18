'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { analytics } from '@/lib/analytics';
import type { HubKind } from '@/lib/hubs';

/**
 * Fires `hub_viewed` once per hub page render.
 *
 * The hub pages themselves are server components, so the event needs a client
 * island the way `bill_viewed` does. Keyed on path + page so paginating within
 * a hub counts as a new view, while a re-render does not.
 */
export function HubViewTracker({
  hubKind,
  hubPath,
  billCount,
}: {
  hubKind: HubKind;
  hubPath: string;
  billCount: number | null;
}): null {
  const searchParams = useSearchParams();
  const page = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1;
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const key = `${hubPath}#${page}`;
    if (sent.current === key) return;
    sent.current = key;
    analytics.hubViewed({
      hub_kind: hubKind,
      hub_path: hubPath,
      bill_count: billCount,
      page,
    });
  }, [hubKind, hubPath, billCount, page]);

  return null;
}

/**
 * A link into a hub that reports the navigation.
 *
 * Renders a plain anchor via next/link, so it is still a real crawlable link
 * with or without JavaScript — the analytics is additive, never a precondition
 * for the href working.
 */
export function HubLink({
  href,
  hubKind,
  children,
  className,
}: {
  href: string;
  hubKind: HubKind;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <a
      href={href}
      className={className}
      onClick={() =>
        analytics.hubLinkClicked({
          from_path: pathname ?? '',
          to_path: href,
          hub_kind: hubKind,
        })
      }
    >
      {children}
    </a>
  );
}
