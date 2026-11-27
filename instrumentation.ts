import type { Instrumentation } from 'next';

/**
 * Server-side render failures in PostHog Error Tracking.
 *
 * When a page throws on the server (a bill page whose Convex read failed twice,
 * see app/bills/[id]/get-bill.ts), the browser only reports React's minified
 * error #441 with a digest. This records the server-side error itself, with the
 * same digest, so the cause can be read next to the browser's report.
 *
 * Next.js leaves notFound() and redirect() out: they are not errors. OpenNext
 * links this file into the Worker bundle at build time (its
 * patchInstrumentation plugin), so it runs on Cloudflare too.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { captureServerException } = await import('./lib/posthog-server');
  const digest =
    typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined;
  await captureServerException(err, readerDistinctId(request.headers.cookie), {
    route: context.routePath,
    route_type: context.routeType,
    render_source: context.renderSource,
    // The path without its query, which can hold a reader's search text.
    path: request.path.split('?')[0],
    digest,
  });
};

/** The distinct id posthog-js keeps in its cookie, so the server error joins the reader's events. */
function readerDistinctId(cookieHeader: string | string[] | undefined): string | undefined {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const header = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  if (!key || !header) return undefined;
  const name = `ph_${key}_posthog=`;
  const cookie = header.split(/;\s*/).find((part) => part.startsWith(name));
  if (!cookie) return undefined;
  try {
    const id = JSON.parse(decodeURIComponent(cookie.slice(name.length))).distinct_id;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}
