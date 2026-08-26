/**
 * Which captured exceptions are somebody else's software.
 *
 * Of ~320 exceptions recorded in the ten weeks to 26 Aug 2026, around 300 did
 * not come from this codebase. They came from software running inside the
 * visitor's browser: Outlook's link scanner, browser extensions, and WebKit's
 * opaque cross-origin reporting. The effect was not a wrong number so much as
 * an unreadable one — a genuine regression would have to be spotted inside a
 * column of noise fifteen times its size.
 *
 * The rule for adding an entry here is deliberately strict: the pattern must
 * be attributable to a named third party, and no plausible bug in this
 * codebase may produce the same string. Anything merely *probably* external
 * stays, because a dropped event cannot be investigated later. In particular
 * these are NOT dropped:
 *
 *   `SecurityError: The operation is insecure.` — iOS Safari with storage
 *   blocked. This app's storage access is guarded (see lib/safe-storage.ts),
 *   so the remaining ones come from the analytics SDK's own persistence, but
 *   the same string would appear if a new unguarded access were introduced.
 *
 *   `TypeError: Failed to fetch` — usually a request cancelled by navigation,
 *   but indistinguishable from a real API failure.
 *
 *   `NotFoundError: Failed to execute 'removeChild'` — the signature of an
 *   extension mutating the DOM under React, but React can also produce it.
 */

/** The properties of a captured `$exception` event that identify it. */
export interface ExceptionShape {
  values?: unknown;
  types?: unknown;
  /** Whether the browser gave us a stack trace with a real frame in it. */
  hasStack?: boolean;
}

interface DropRule {
  /** Who this belongs to, for the reader of a dropped-events question. */
  readonly source: string;
  readonly matches: (message: string, shape: ExceptionShape) => boolean;
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
    matches: (m, shape) => m.trim() === 'Script error.' && !shape.hasStack,
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

function messagesOf(shape: ExceptionShape): string[] {
  const raw = shape.values;
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  return [];
}

/**
 * The third party this exception belongs to, or null when it is ours to look
 * at. Returning the source rather than a boolean keeps the reason available at
 * the call site instead of discarding it.
 */
export function thirdPartySource(shape: ExceptionShape): string | null {
  const messages = messagesOf(shape);
  if (messages.length === 0) return null;
  for (const rule of RULES) {
    if (messages.some((m) => rule.matches(m, shape))) return rule.source;
  }
  return null;
}

/** True when this exception should not be recorded. */
export function shouldDropException(shape: ExceptionShape): boolean {
  return thirdPartySource(shape) !== null;
}
