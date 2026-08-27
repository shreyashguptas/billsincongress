import posthog from 'posthog-js';

import { shouldDropException } from '@/lib/error-filter';

// IMPORTANT: this is the only place posthog.init() may be called. Never add a
// PostHogProvider or a second init elsewhere.
//
// With the env vars missing (fresh clone, CI without secrets) every capture in
// `lib/analytics.ts` silently no-ops — the site must work without analytics.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    // Ingestion goes through PostHog's managed reverse proxy on our own domain
    // (`t.billsincongress.com`) so ad-blockers don't drop events. Do NOT switch
    // this to a Next.js rewrite proxy: external rewrites have known bugs on
    // OpenNext/Cloudflare (see ANALYTICS.md).
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    capture_exceptions: true,
    debug: process.env.NODE_ENV === 'development',

    // Drop exceptions raised by software that is not this site — Outlook's link
    // scanner, browser extensions, opaque cross-origin reports. Only exceptions
    // are filtered; no product event in ANALYTICS.md is affected.
    //
    // The whole payload goes to the filter rather than fields picked out here,
    // so reading the event is part of what `lib/error-filter.test.ts` exercises.
    // Picking fields at the call site is how the first version came to read
    // `$exception_values`, which a browser-side event does not carry.
    before_send: (event) => {
      if (!event || event.event !== '$exception') return event;
      return shouldDropException(event.properties) ? null : event;
    },
  });
}
