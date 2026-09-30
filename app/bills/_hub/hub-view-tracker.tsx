'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { analytics } from '@/lib/analytics';
import { hubByPath, type HubKind, type HubOrder } from '@/lib/hubs';
import { cn } from '@/lib/utils';

/**
 * Fires `hub_viewed` once per hub page render.
 *
 * The hub pages themselves are server components, so the event needs a client
 * island the way `bill_viewed` does. Keyed on path + order + page so
 * paginating or re-ordering a hub counts as a new view, while a re-render does
 * not.
 */
export function HubViewTracker({
  hubKind,
  hubPath,
  billCount,
  order,
}: {
  hubKind: HubKind;
  hubPath: string;
  billCount: number | null;
  order: HubOrder;
}): null {
  const searchParams = useSearchParams();
  const page = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1;
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const key = `${hubPath}#${order}#${page}`;
    if (sent.current === key) return;
    sent.current = key;
    analytics.hubViewed({
      hub_kind: hubKind,
      hub_path: hubPath,
      bill_count: billCount,
      page,
      order,
    });
  }, [hubKind, hubPath, billCount, page, order]);

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
  placement?: 'directory' | 'filter_panel' | 'hub_siblings' | 'footer';
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
  placement: 'directory' | 'filter_panel' | 'hub_siblings' | 'footer';
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

/**
 * "Newest first" / "Oldest first" on a hub.
 *
 * Two links styled as a segmented switch, not a `ToggleGroup`: each order is
 * its own URL (`?sort=oldest`), so it must be an anchor a crawler can follow
 * and a reader can open in a new tab — the same reason the pagination is
 * links. `aria-current` marks the order being shown. Changing order starts
 * again from page 1, and `scroll={false}` keeps the switch under the reader's
 * pointer instead of jumping to the top.
 */
export function HubOrderSwitch({
  hubKind,
  hubPath,
  current,
  page,
  options,
  label,
}: {
  hubKind: HubKind;
  hubPath: string;
  current: HubOrder;
  page: number;
  options: ReadonlyArray<{ value: HubOrder; label: string; href: string }>;
  /** Accessible name: what the order is by, e.g. "Order by the date each bill became law". */
  label: string;
}) {
  return (
    <nav aria-label={label} className="inline-flex shrink-0 items-stretch gap-0.5 rounded-md bg-sunken p-1">
      {options.map((option) => {
        const selected = option.value === current;
        return (
          <Link
            key={option.value}
            href={option.href}
            scroll={false}
            aria-current={selected ? 'true' : undefined}
            onClick={() => {
              if (selected) return;
              analytics.hubOrderChanged({
                hub_kind: hubKind,
                hub_path: hubPath,
                from_order: current,
                to_order: option.value,
                page,
              });
            }}
            className={cn(
              'inline-flex h-8 items-center rounded-[6px] px-3 text-[13px] transition-colors focus-ring touchable:h-11',
              selected
                ? 'bg-raised font-medium text-ink shadow-sm'
                : 'text-ink-2 hover:text-ink',
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
