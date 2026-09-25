'use client';

import Link from 'next/link';

import { ChamberMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
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
    <section className="container-editorial flex flex-col items-center py-20 text-center sm:py-28">
      <ChamberMark className="h-12 w-12 text-ink-3" />
      <p className="mt-6 font-mono text-xs leading-4 text-ink-3 tabular">
        {chunkError ? 'Update needed' : 'Error'}
      </p>
      <h1 className="mt-3 text-display-md text-ink">
        {chunkError ? 'A new version is available' : 'Something went wrong'}
      </h1>
      <p className="mt-4 max-w-[48ch] text-[17px] leading-relaxed text-ink-2">
        {chunkError
          ? 'The site updated since you opened this page. Reload to load the latest version.'
          : 'An unexpected error interrupted this page. Try again, or head back home.'}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={() => (chunkError ? window.location.reload() : reset())}>
          {chunkError ? 'Reload page' : 'Try again'}
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </section>
  );
}
