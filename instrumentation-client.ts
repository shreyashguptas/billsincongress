import posthog from 'posthog-js';

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
  });
}
