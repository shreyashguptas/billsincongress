'use client';

import Link from 'next/link';

import { useChunkErrorRecovery } from '@/lib/use-chunk-error-recovery';

// Route-level error boundary. Before this file existed the app had no boundary
// at all, so any client-side render failure — most visibly a stale-asset
// ChunkLoadError after a deploy — left the reader on a dead page with no way
// back. This catches those errors, auto-recovers from a chunk failure with one
// guarded reload, and always shows a retry control as the fallback.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkError = useChunkErrorRecovery(error);

  return (
    <section className="border-b border-border">
      <div className="container-editorial py-20 text-center sm:py-28">
        <p className="label-eyebrow mb-3">{chunkError ? 'Update needed' : 'Error'}</p>
        <h1 className="font-serif text-display-md font-semibold leading-[1.05] tracking-tight sm:text-display-lg">
          {chunkError ? 'A new version is available' : 'Something went wrong'}
        </h1>
        <p className="mx-auto mt-4 max-w-prose text-sm text-muted-foreground">
          {chunkError
            ? 'The site updated since you opened this page. Reload to load the latest version.'
            : 'An unexpected error interrupted this page. Try again, or head back home.'}
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => (chunkError ? window.location.reload() : reset())}
            className="inline-flex items-center rounded-sm bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            {chunkError ? 'Reload page' : 'Try again'}
          </button>
          <Link
            href="/"
            className="inline-flex items-center rounded-sm border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card"
          >
            Go home
          </Link>
        </div>
      </div>
    </section>
  );
}
