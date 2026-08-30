'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { analytics } from '@/lib/analytics';
import { hubByPath, type HubKind } from '@/lib/hubs';

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
 * Uses next/link, so it renders a real crawlable anchor in the server HTML and
 * also gets prefetch and a soft navigation. It rendered a bare `<a>` until now,
 * despite the comment here claiming otherwise, which made every hub link a full
 * page load.
 *
 * The analytics is additive and never a precondition for the href working.
 */
export function HubLink({
  href,
  hubKind,
  children,
  className,
  placement,
}: {
  href: string;
  hubKind: HubKind;
  children: ReactNode;
  className?: string;
  placement?: 'directory' | 'filter_panel' | 'hub_siblings';
}) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      className={className}
      onClick={() =>
        analytics.hubLinkClicked({
          from_path: pathname ?? '',
          to_path: href,
          hub_kind: hubKind,
          placement,
        })
      }
    >
      {children}
    </Link>
  );
}

/**
 * Reports clicks on any hub link inside it, using one delegated listener.
 *
 * The browse directory holds 40 links. Making each one a client component would
 * mean 40 hydrated islands and 40 `usePathname()` subscriptions to measure
 * something that happens a handful of times a month. This wraps the whole
 * server-rendered block instead: the anchors stay ordinary server-rendered
 * markup and one handler reads which of them was hit.
 *
 * `children` is server-rendered JSX passed through as a prop, so nothing inside
 * becomes a client module.
 */
export function HubLinkTracker({
  children,
  placement,
  className,
}: {
  children: ReactNode;
  placement: 'directory' | 'filter_panel' | 'hub_siblings';
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <div
      className={className}
      onClick={(e) => {
        const anchor = (e.target as Element | null)?.closest?.('a');
        const href = anchor?.getAttribute('href');
        if (!href) return;
        const hub = hubByPath(href);
        if (!hub) return;
        analytics.hubLinkClicked({
          from_path: pathname ?? '',
          to_path: href,
          hub_kind: hub.kind,
          placement,
        });
      }}
    >
      {children}
    </div>
  );
}
