import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GAP, paginationWindow } from '@/lib/pagination';
import { cn } from '@/lib/utils';

interface CrawlablePaginationProps {
  /** 1-based current page. */
  page: number;
  /** Total pages available, already clamped to what the backend can serve. */
  lastPage: number;
  /**
   * More pages may exist past `lastPage` — the count was a floor or unknown
   * (see `pagesForCount`). The bar then ends in an ellipsis instead of a
   * number that would claim to be the last page.
   */
  openEnded?: boolean;
  /** URL for a given page. The caller owns query-string composition. */
  hrefForPage: (page: number) => string;
  className?: string;
}

// 36px targets under a mouse, 44px under a finger.
const slotClass =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 font-mono text-sm tabular transition-colors focus-ring touchable:h-11 touchable:min-w-11';

/**
 * Below `sm`, only the current page and its neighbours show, and Previous and
 * Next shrink to their arrows: the full window (Previous, 1, …, three pages,
 * …, last, Next) wrapped at 390px and left the last number alone on a second
 * line. The hidden anchors stay in the HTML (`hidden sm:inline-flex`), so a
 * crawler still finds every one of them. The narrowest bar, at 320px, is five
 * 44px targets and an ellipsis.
 */
const phoneHidden = 'hidden sm:inline-flex';

/**
 * Page links as real anchors, server-rendered.
 *
 * A server component on purpose: the point is that a crawler with no
 * JavaScript can walk the list. A "Load more" button is invisible to one, and
 * that is why 55,000 bill pages went undiscovered — the sitemap was the only
 * route to them.
 *
 * `rel="prev"`/`rel="next"` mark the sequence so the chain stays walkable even
 * where the numbered middle is collapsed.
 */
export function CrawlablePagination({
  page,
  lastPage,
  openEnded = false,
  hrefForPage,
  className,
}: CrawlablePaginationProps) {
  if (lastPage <= 1) return null;

  const current = Math.min(Math.max(page, 1), lastPage);
  const slots = paginationWindow(current, lastPage);

  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center gap-1', className)}>
      {current > 1 && (
        <Link
          href={hrefForPage(current - 1)}
          rel="prev"
          className={cn(slotClass, 'gap-1 font-sans font-medium text-ink hover:bg-sunken sm:pl-1.5 sm:pr-3')}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Previous</span>
        </Link>
      )}

      {slots.map((slot, i) =>
        slot === GAP ? (
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className={cn(
              'h-9 min-w-6 items-center justify-center font-mono text-sm text-ink-3 touchable:h-11',
              phoneHidden
            )}
          >
            …
          </span>
        ) : (
          <Link
            key={slot}
            href={hrefForPage(slot)}
            aria-current={slot === current ? 'page' : undefined}
            className={cn(
              slotClass,
              Math.abs(slot - current) > 1 && phoneHidden,
              slot === current
                ? 'bg-ink font-medium text-on-ink'
                : 'text-ink-2 hover:bg-sunken hover:text-ink'
            )}
          >
            {slot}
          </Link>
        ),
      )}

      {openEnded && (
        <span className="inline-flex h-9 min-w-6 items-center justify-center font-mono text-sm text-ink-3 touchable:h-11">
          <span aria-hidden="true">…</span>
          <span className="sr-only">and possibly more pages</span>
        </span>
      )}

      {current < lastPage && (
        <Link
          href={hrefForPage(current + 1)}
          rel="next"
          className={cn(slotClass, 'gap-1 font-sans font-medium text-ink hover:bg-sunken sm:pl-3 sm:pr-1.5')}
        >
          <span className="sr-only sm:not-sr-only">Next</span>
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      )}
    </nav>
  );
}
