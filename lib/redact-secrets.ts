/**
 * Strips secrets that ride in page URLs out of every PostHog event, before it
 * leaves the browser (called from `before_send` in instrumentation-client.ts).
 *
 * Today there is one: the bill-alert unsubscribe link,
 * `/alerts/unsubscribe?token=<userId>.<signature>`. The token needs no sign-in
 * and switches off every alert for that reader, so it must not sit in
 * analytics where anyone with PostHog access could read it. It would otherwise
 * appear in `$current_url` on that page, in `$referrer` on the next one, in the
 * person's `$initial_*` properties, and in the URL a session replay records.
 *
 * We do not use PostHog's own `mask_personal_data_properties`: turning it on
 * also strips gclid/fbclid and the other ad-click ids, which attribution reads.
 */

const UNSUBSCRIBE_TOKEN = /(\/alerts\/unsubscribe[^\s"'#]*?[?&]token=)[^&#\s"']+/g;

export const REDACTED = "[redacted]";

/** The URL with the unsubscribe token replaced; any other URL is unchanged. */
export function redactUrl(value: string): string {
  return value.includes("/alerts/unsubscribe") ? value.replace(UNSUBSCRIBE_TOKEN, `$1${REDACTED}`) : value;
}

type Bag = Record<string, unknown>;

function redactStrings(bag: unknown): void {
  if (!bag || typeof bag !== "object") return;
  for (const [key, value] of Object.entries(bag as Bag)) {
    if (typeof value === "string") (bag as Bag)[key] = redactUrl(value);
  }
}

/**
 * Rewrites the event in place and returns it. Walks the property bags PostHog
 * fills with URLs (event properties and the `$set` / `$set_once` person
 * updates, at either level) and, for session replay, the `href` of each
 * recording's meta event. Nothing is dropped; only the token's value changes.
 */
export function redactEvent<T>(event: T): T {
  if (!event || typeof event !== "object") return event;
  const e = event as Bag;
  const props = e.properties as Bag | undefined;
  for (const bag of [props, props?.$set, props?.$set_once, e.$set, e.$set_once]) redactStrings(bag);

  const snapshots = props?.$snapshot_data;
  if (Array.isArray(snapshots)) {
    for (const snap of snapshots) {
      const data = (snap as { data?: Bag } | null)?.data;
      if (data && typeof data.href === "string") data.href = redactUrl(data.href);
    }
  }
  return event;
}
