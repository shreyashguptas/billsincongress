/**
 * Which captured exceptions are somebody else's software.
 *
 * Most recorded exceptions do not come from this codebase — they come from
 * software running inside the visitor's browser: Outlook's link scanner,
 * browser extensions, and WebKit's opaque cross-origin reporting. The problem
 * is legibility: a genuine regression has to be spotted inside a column of
 * noise many times its size.
 *
 * Reading the event
 *
 * A browser-side `$exception` event carries `$exception_list` and
 * `$exception_level`, and nothing else describing the error. It does NOT carry
 * `$exception_values` or `$exception_types`, even though both are queryable in
 * HogQL: posthog-js derives those locally inside its suppression-rule matcher,
 * and PostHog derives them again during ingestion. Reading them in
 * `before_send` yields `undefined` and silently disables the filter.
 *
 * `$exception_list` is an array of `{ type, value, mechanism, stacktrace }`,
 * one entry per exception in a chain.
 *
 * The rule for adding an entry
 *
 * Deliberately strict: the pattern must be attributable to a named third party,
 * and no plausible bug in this codebase may produce the same string. Anything
 * merely *probably* external stays, because a dropped event cannot be
 * investigated later. `SecurityError: The operation is insecure.` is the
 * instructive case — it is iOS Safari with storage blocked, and this app's
 * storage access is guarded (see lib/safe-storage.ts), but the same string
 * would appear if a new unguarded access were introduced. So it stays.
 */
/** One entry of `$exception_list`, as posthog-js builds it. */
export interface CapturedException {
  type?: unknown;
  value?: unknown;
  stacktrace?: { frames?: unknown[] } | null;
}

interface DropRule {
  /** Who this belongs to, for the reader of a dropped-events question. */
  readonly source: string;
  readonly matches: (message: string, hasStack: boolean) => boolean;
}

const RULES: readonly DropRule[] = [
  {
    // Outlook and the Office web viewer inject a script that rejects a promise
    // with this object when it scans a link. `Id:` counts up per scanned link,
    // which is why it appears as a family of near-identical messages.
    source: 'Microsoft Outlook / Office link scanner',
    matches: (m) =>
      m.includes('Object Not Found Matching Id:') && m.includes('MethodName:update'),
  },
  {
    // The browser refuses to describe an error raised inside a script it
    // considers cross-origin, and reports exactly this with no stack. There is
    // nothing behind it to fix; 104 of the 133 seen came from Firefox on iOS.
    // The no-stack condition matters: an error genuinely raised by this app
    // would carry frames.
    source: 'browser cross-origin reporting (opaque)',
    matches: (m, hasStack) => m.trim() === 'Script error.' && !hasStack,
  },
  {
    // Extension messaging, raised when an extension's background page has gone
    // away. Only extensions have a `runtime` object.
    source: 'browser extension messaging',
    matches: (m) =>
      m.includes('runtime.sendMessage') ||
      m.includes('Extension context invalidated') ||
      m.includes('feature named `pageContext` was not found'),
  },
];

/** The `$exception_list` array, or [] when the payload is not one. */
export function exceptionList(properties: unknown): CapturedException[] {
  if (!properties || typeof properties !== 'object') return [];
  const list = (properties as Record<string, unknown>).$exception_list;
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is CapturedException => !!e && typeof e === 'object');
}

/** Whether the browser gave us a real frame, rather than refusing to say. */
function hasRealStack(list: CapturedException[]): boolean {
  return list.some((e) => (e.stacktrace?.frames?.length ?? 0) > 0);
}

/**
 * The third party this exception belongs to, or null when it is ours to look
 * at. Takes the event's properties, so the extraction is part of what the
 * tests exercise rather than something the call site does unobserved.
 */
export function thirdPartySource(properties: unknown): string | null {
  const list = exceptionList(properties);
  const messages = list
    .map((e) => e.value)
    .filter((v): v is string => typeof v === 'string');
  if (messages.length === 0) return null;

  const stack = hasRealStack(list);
  for (const rule of RULES) {
    if (messages.some((m) => rule.matches(m, stack))) return rule.source;
  }
  return null;
}

/** True when this exception should not be recorded. */
export function shouldDropException(properties: unknown): boolean {
  return thirdPartySource(properties) !== null;
}
