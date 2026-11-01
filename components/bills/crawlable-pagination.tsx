import { Fragment } from 'react';
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
 * Below `sm` the bar keeps the first page, the last page and the current one,
 * with Previous and Next shrunk to their arrows; the current page's neighbours
 * join them from 400px. The full window (Previous, 1, …, three pages, …, last,
 * Next) wrapped at 390px and left the last number alone on a second line, and
 * dropping the ends lost the jump to the last page. Hidden anchors stay in the
 * HTML (`hidden sm:inline-flex`), so a crawler still finds every one of them.
 * The widest phone bar at 320px is five 44px targets and two ellipses.
 */
const phoneHidden = 'hidden sm:inline-flex';
const neighbourOnly = 'hidden min-[400px]:inline-flex';
const gapClass =
  'h-9 min-w-6 items-center justify-center font-mono text-sm text-ink-3 touchable:h-11';

/** Which phone widths show a page slot. */
function phoneVisibility(slot: number, current: number, lastPage: number): string | undefined {
  if (slot === 1 || slot === lastPage || slot === current) return undefined;
  if (Math.abs(slot - current) === 1) return neighbourOnly;
  return phoneHidden;
}

/**
 * The phone bar's own ellipses, between an end and the current page. Below
 * 400px the neighbours are hidden, so a gap opens one page sooner than above it.
 */
function PhoneGap({ hiddenBelow400, hiddenFrom400 }: { hiddenBelow400: boolean; hiddenFrom400: boolean }) {
  if (!hiddenBelow400 && !hiddenFrom400) return null;
  const cls = hiddenBelow400 && hiddenFrom400
    ? 'inline-flex sm:hidden'
    : hiddenBelow400
      ? 'inline-flex min-[400px]:hidden'
      : 'hidden min-[400px]:inline-flex sm:hidden';
  return (
    <span aria-hidden="true" className={cn(gapClass, cls)}>
      …
    </span>
  );
}

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
          <span key={`gap-${i}`} aria-hidden="true" className={cn(gapClass, phoneHidden)}>
            …
          </span>
        ) : (
          <Fragment key={slot}>
          {slot === lastPage && lastPage > 1 && (
            <PhoneGap hiddenBelow400={current < lastPage - 1} hiddenFrom400={current < lastPage - 2} />
          )}
          <Link
            href={hrefForPage(slot)}
            aria-current={slot === current ? 'page' : undefined}
            className={cn(
              slotClass,
              phoneVisibility(slot, current, lastPage),
              slot === current
                ? 'bg-ink font-medium text-on-ink'
                : 'text-ink-2 hover:bg-sunken hover:text-ink'
            )}
          >
            {slot}
          </Link>
          {slot === 1 && <PhoneGap hiddenBelow400={current > 2} hiddenFrom400={current > 3} />}
          </Fragment>
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
