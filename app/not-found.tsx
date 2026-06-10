import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page not found',
};

// Intentionally a fully static server component — no data fetching, no cookies(),
// no dynamic APIs. This keeps the not-found render cheap (it is the path bots hit
// thousands of times) so it can never regress into expensive work, and gives a
// branded 404 inside the normal nav/footer shell from the root layout.
export default function NotFound() {
  return (
    <section className="border-b border-border">
      <div className="container-editorial py-20 text-center sm:py-28">
        <p className="label-eyebrow mb-3">Error 404</p>
        <h1 className="font-serif text-display-md font-semibold leading-[1.05] tracking-tight sm:text-display-lg">
          Page not found
        </h1>
        <p className="mx-auto mt-4 max-w-prose text-sm text-muted-foreground">
          We couldn&rsquo;t find the page you&rsquo;re looking for. It may have
          moved, or the link may be broken.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-sm bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Go home
          </Link>
          <Link
            href="/bills"
            className="inline-flex items-center rounded-sm border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card"
          >
            Browse bills
          </Link>
        </div>
      </div>
    </section>
  );
}
