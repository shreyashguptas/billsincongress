import posthog from 'posthog-js';

import { shouldDropException } from '@/lib/error-filter';

// Client-side PostHog initialization (Next.js 15.3+ `instrumentation-client.ts`
// convention — runs once in the browser before the app hydrates).
//
// IMPORTANT: this is the only place posthog.init() may be called. Never add a
// PostHogProvider or a second init elsewhere.
//
// If the env vars are missing (fresh clone, CI without secrets), every capture
// in `lib/analytics.ts` silently no-ops — the site must work without analytics.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    // Ingestion goes through PostHog's managed reverse proxy on our own domain
    // (`t.billsincongress.com`) so ad-blockers don't drop events. Do NOT switch
    // this to a Next.js rewrite proxy: external rewrites have known bugs on
    // OpenNext/Cloudflare (see ANALYTICS.md).
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    ui_host: 'https://us.posthog.com',
    // Pin PostHog's recommended defaults snapshot (history-API pageviews,
    // pageleave capture, sane SPA behavior).
    defaults: '2026-01-30',
    // Error tracking: capture uncaught exceptions + unhandled promise rejections.
    capture_exceptions: true,
    debug: process.env.NODE_ENV === 'development',

    // Drop exceptions raised by software that is not this site — Outlook's
    // link scanner, browser extensions, and the browser's own opaque
    // cross-origin reports. They were roughly 300 of the ~320 exceptions
    // recorded in the ten weeks to 26 Aug 2026, which made the error count
    // unreadable rather than merely wrong.
    //
    // Only exceptions are filtered. Every other event passes through
    // untouched, so no product event in ANALYTICS.md is affected.
    before_send: (event) => {
      if (!event || event.event !== '$exception') return event;
      const props = event.properties ?? {};
      const list = props.$exception_list;
      const dropped = shouldDropException({
        values: props.$exception_values,
        types: props.$exception_types,
        // A real frame from a real file. `$exception_list` is absent or
        // frameless exactly when the browser refused to describe the error.
        hasStack: Array.isArray(list)
          ? list.some(
              (e: { stacktrace?: { frames?: unknown[] } }) =>
                (e?.stacktrace?.frames?.length ?? 0) > 0,
            )
          : false,
      });
      return dropped ? null : event;
    },
  });
}
