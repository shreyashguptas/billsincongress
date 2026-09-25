import type { Metadata } from 'next';
import Link from 'next/link';

import { ChamberMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Page not found',
};

// Intentionally a fully static server component — no data fetching, no cookies(),
// no dynamic APIs. This keeps the not-found render cheap (it is the path bots hit
// thousands of times) so it can never regress into expensive work, and gives a
// branded 404 inside the normal nav/footer shell from the root layout.
export default function NotFound() {
  return (
    <section className="container-editorial flex flex-col items-center py-20 text-center sm:py-28">
      <ChamberMark className="h-12 w-12 text-ink-3" />
      <p className="mt-6 font-mono text-xs leading-4 text-ink-3 tabular">404 · Not found</p>
      <h1 className="mt-3 text-display-md text-ink">Page not found</h1>
      <p className="mt-4 max-w-[48ch] text-[17px] leading-relaxed text-ink-2">
        We couldn&rsquo;t find the page you&rsquo;re looking for. It may have
        moved, or the link may be broken.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">Go home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/bills">Browse bills</Link>
        </Button>
      </div>
    </section>
  );
}
