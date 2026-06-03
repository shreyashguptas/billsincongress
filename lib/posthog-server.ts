import { PostHog } from 'posthog-node';

// Server-side PostHog client for API routes (runs on Cloudflare Workers via
// OpenNext). Worker invocations are short-lived, so every event is flushed
// immediately (flushAt: 1) and the helpers below always shut the client down
// before returning — otherwise events would be lost when the invocation ends.

/** Header names the browser uses to tie server events to the same person/session. */
export const POSTHOG_DISTINCT_ID_HEADER = 'x-posthog-distinct-id';
export const POSTHOG_SESSION_ID_HEADER = 'x-posthog-session-id';

function createClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  // The client-side host could in principle be a relative proxy path; the
  // server always needs an absolute PostHog URL.
  const configured = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const host =
    configured && configured.startsWith('https://') ? configured : 'https://us.i.posthog.com';

  return new PostHog(key, {
    host,
    flushAt: 1,
    flushInterval: 0,
  });
}

/**
 * Capture a single server-side event and flush it before returning.
 * No-ops when PostHog isn't configured. Never throws — analytics must not
 * break the request path.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const client = createClient();
  if (!client) return;
  try {
    client.capture({ distinctId, event, properties });
    await client.shutdown();
  } catch (error) {
    console.warn('[posthog] server capture failed:', error);
  }
}

/**
 * Report a server-side exception to PostHog Error Tracking.
 * No-ops when PostHog isn't configured. Never throws.
 */
export async function captureServerException(
  error: unknown,
  distinctId?: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const client = createClient();
  if (!client) return;
  try {
    client.captureException(error, distinctId, properties);
    await client.shutdown();
  } catch (err) {
    console.warn('[posthog] server exception capture failed:', err);
  }
}
