/**
 * Which captured exceptions are somebody else's software.
 *
 * Most recorded exceptions do not come from this codebase — they come from
 * software running inside the visitor's browser: Outlook's link scanner,
 * browser extensions, wallet scripts a browser injects, in-app browsers,
 * WebKit's opaque cross-origin reporting, and benign
 * notices the browser engine raises about its own scheduling. The problem is
 * legibility: a genuine regression has to be spotted inside a column of noise
 * many times its size.
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
 * or raised by the browser engine itself as a benign, spec-defined notice that
 * reports no failure — and no plausible bug in this codebase may produce the
 * same string. Anything merely *probably* external stays, because a dropped
 * event cannot be investigated later. `SecurityError: The operation is insecure.` is the
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
  {
    // The browser engine raises this itself when ResizeObserver callbacks do
    // not settle within one animation frame. The spec says it simply carries on
    // with the next frame, so nothing behind it is broken. It arrives synthetic
    // with no stack, and this codebase has no ResizeObserver of its own, so the
    // observer belongs to a UI dependency. The no-stack condition guards the
    // same way it does for `Script error.`: a real error would carry frames.
    //
    // Trimmed before matching, for the same reason the `Script error.` rule
    // trims: the message is whatever the engine handed to the error event, and
    // a rule that silently stops matching on a leading space fails open —
    // the noise comes back with nothing to say why.
    source: 'browser ResizeObserver notice (benign)',
    matches: (m, hasStack) => m.trim().startsWith('ResizeObserver loop') && !hasStack,
  },
  {
    // A crypto-wallet provider script the browser injects into every page.
    // Seen: 9 events, 1 visitor, one session on 2026-09-30, all Brave on iOS
    // (user agent ends in "Brave"), one on every page they opened. WebKit
    // reports the injected script as the page itself ("global code", line 1),
    // so it arrives WITH a frame and there is no stack condition here.
    //
    // Safe because the message quotes the expression that failed, and this
    // codebase never touches `window.ethereum`: no source file, no client
    // dependency (posthog-js, convex, next, react-dom) and no built chunk
    // mentions `ethereum`. If a wallet feature is ever added, delete this rule
    // in the same change.
    source: 'browser crypto-wallet provider (window.ethereum; seen from Brave on iOS)',
    matches: (m) => m.includes('window.ethereum'),
  },
  {
    // Facebook's Android in-app browser injects a performance logger that
    // talks to the app through a Java bridge; when the app tears the WebView
    // down first, the bridge call throws this. Seen: 1 event, 2026-09-26, user
    // agent `[FB_IAB/FB4A;…]`, every frame in
    // `iabjs://navigation_performance_logger_android`. "Java object is gone" is
    // Android WebView's own wording for a dead `addJavascriptInterface` object,
    // which this site never creates — it ships no Android app or bridge.
    source: 'Facebook Android in-app browser (Java bridge)',
    matches: (m) => m.includes('Java object is gone'),
  },
];

// Deliberately NOT dropped — look like someone else's software, but fail the
// rule above. Recorded here so the next reader does not re-add them.
//
// `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be
// removed is not a child of this node.` — 9 events, 3 visitors, 28–30 Sep 2026.
// The textbook cause is Google Translate or a page-rewriting extension moving
// text nodes under React, and one visitor was on Edge with a zh-CN browser
// language (Edge auto-translates). The other two were en-US on ChromeOS, which
// translation does not explain. Nothing on the event tells the cases apart:
// every frame is React DOM's own commit code inside our bundle, the same frames
// a real bug in this codebase would produce, and PostHog does not record whether
// the page was translated. Worse, all 9 were `handled: true` — reported by
// `app/error.tsx` / `app/global-error.tsx` — so each one is a reader who was
// shown the error screen. Dropping them would hide a visible failure.
//
// `Can't find variable: _G` — 1 event, Microsoft's Bing app on iOS
// (`BingSapphire` in the user agent). Probably Bing's injected script, but a
// ReferenceError on a short global name is not a signature only a third party
// can produce. Kept until it recurs with more evidence.

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
