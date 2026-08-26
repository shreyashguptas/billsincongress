import Link from 'next/link';
import { GAP, paginationWindow } from '@/lib/pagination';

interface CrawlablePaginationProps {
  /** 1-based current page. */
  page: number;
  /** Total pages available, already clamped to what the backend can serve. */
  lastPage: number;
  /** URL for a given page. The caller owns query-string composition. */
  hrefForPage: (page: number) => string;
  className?: string;
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
  hrefForPage,
  className,
}: CrawlablePaginationProps) {
  if (lastPage <= 1) return null;

  const current = Math.min(Math.max(page, 1), lastPage);
  const slots = paginationWindow(current, lastPage);

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}
    >
      {current > 1 && (
        <Link
          href={hrefForPage(current - 1)}
          rel="prev"
          className="px-3 py-2 text-sm border rounded-md hover:bg-muted"
        >
          Previous
        </Link>
      )}

      {slots.map((slot, i) =>
        slot === GAP ? (
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="px-2 py-2 text-sm text-muted-foreground"
          >
            …
          </span>
        ) : (
          <Link
            key={slot}
            href={hrefForPage(slot)}
            aria-current={slot === current ? 'page' : undefined}
            className={`px-3 py-2 text-sm border rounded-md hover:bg-muted ${
              slot === current ? 'bg-muted font-medium' : ''
            }`}
          >
            {slot}
          </Link>
        ),
      )}

      {current < lastPage && (
        <Link
          href={hrefForPage(current + 1)}
          rel="next"
          className="px-3 py-2 text-sm border rounded-md hover:bg-muted"
        >
          Next
        </Link>
      )}
    </nav>
  );
}
