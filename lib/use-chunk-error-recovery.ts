'use client';

import { useEffect } from 'react';

import { analytics } from '@/lib/analytics';
import { isChunkLoadError, reloadForChunkError } from '@/lib/chunk-error';

/**
 * The shared behaviour of the app's error boundaries (`app/error.tsx`,
 * `app/global-error.tsx`): report the caught error to PostHog and, when it is a
 * stale-asset chunk failure, do one guarded reload to recover. Returns whether
 * the error was a chunk failure so the boundary can word its fallback UI.
 *
 * Kept out of `lib/chunk-error.ts` so that module stays free of the `posthog-js`
 * import, which cannot load under `tsx` where its tests run.
 */
export function useChunkErrorRecovery(error: unknown): boolean {
  useEffect(() => {
    analytics.captureException(error);
    if (isChunkLoadError(error)) reloadForChunkError();
  }, [error]);
  return isChunkLoadError(error);
}
