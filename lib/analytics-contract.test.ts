/**
 * Every event we send is named in two places: `lib/analytics.ts`, which sends
 * it, and `documentation/analytics.md`, which AGENTS.md makes the registry of
 * record. This asserts the two lists are the same list.
 *
 * `lib/analytics-registry.test.ts` already guards that file's TABLE STRUCTURE —
 * a blank line mid-table silently turns the rows below it into a paragraph of
 * pipes. It does not check any NAME. So a helper could be added with no row, or
 * a row could describe an event nothing sends, and both halves would pass while
 * the registry quietly stopped being true. Given the contract says an
 * un-registered feature change is an incomplete change, that gap is worth
 * twenty lines.
 *
 * Both files are read as TEXT and never imported: `lib/analytics.ts` pulls in
 * `posthog-js`, which expects a browser and would not load under `tsx`.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split('\n').join('\n    ') : String(err)}`,
    );
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const registry = readFileSync(join(root, 'documentation/analytics.md'), 'utf8');
const code = readFileSync(join(root, 'lib/analytics.ts'), 'utf8');

/**
 * Registered events with no `capture('name')` literal in `lib/analytics.ts` to
 * match against.
 *
 * `$exception` is exempt, and the reason matters to anyone changing this
 * list: it IS sent from the client, both by PostHog's own
 * `capture_exceptions` autocapture and, since 13 Sep 2026, explicitly by
 * `analytics.captureException()` in the error boundaries. It is listed here
 * because that helper calls `posthog.captureException(error)`, which carries no
 * event-name literal for `capturedEvents()` to find — not because nothing
 * client-side sends it.
 */
const SERVER_SIDE = new Set([
  '$exception',
  // AI Observability events, sent from Convex by convex/aiTrace.ts.
  '$ai_generation',
  '$ai_span',
  '$ai_trace',
]);

/** PostHog's own autocapture events, documented but never sent by us. */
const AUTOCAPTURED = new Set(['$pageview', '$pageleave', '$autocapture', '$rageclick']);

/**
 * Only the event registry itself. The file also carries tables of person
 * properties and environment variables, whose first column is backticked in the
 * same way and would otherwise read as event names.
 */
function eventRegistrySection(markdown: string): string {
  const start = markdown.indexOf('## Custom event registry');
  assert.ok(start !== -1, 'analytics.md no longer has a "## Custom event registry" heading');
  const end = markdown.indexOf('\n## Person identification', start);
  assert.ok(end !== -1, 'analytics.md no longer has a "## Person identification" heading');
  // PostHog Logs sit inside the registry section but are log lines, not events:
  // their first column is a log body ("answer served"), never a capture name.
  const logs = markdown.indexOf('\n### PostHog Logs', start);
  return markdown.slice(start, logs !== -1 && logs < end ? logs : end);
}

/** Retired rows live below this section entirely, so they are already excluded. */
const live = eventRegistrySection(registry);

/** Event names in backticks in the first column of a live registry row. */
function registeredEvents(markdown: string): Set<string> {
  const names = new Set<string>();
  for (const line of markdown.split('\n')) {
    // A space is allowed: PostHog's own survey events are named `survey shown` etc.
    const m = /^\|\s*`([a-z$][a-z0-9_$ ]*)`/i.exec(line.trim());
    if (m) names.add(m[1]);
  }
  return names;
}

/** Every literal passed to `capture('…')`. */
function capturedEvents(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/\bcapture\(\s*'([a-z0-9_$ ]+)'/gi)) names.add(m[1]);
  return names;
}

const registered = registeredEvents(live);
const captured = capturedEvents(code);

it('finds both lists, so a silent zero cannot pass as agreement', () => {
  // Two empty sets are equal. That must not read as success.
  assert.ok(registered.size >= 40, `only ${registered.size} registered events found`);
  assert.ok(captured.size >= 40, `only ${captured.size} captured events found`);
});

it('registers every event the code actually sends', () => {
  const missing = [...captured].filter((name) => !registered.has(name)).sort();
  assert.deepEqual(
    missing,
    [],
    'These events are sent by lib/analytics.ts but have no row in the live tables of ' +
      'documentation/analytics.md. Add a row, or move the helper to the retired section.',
  );
});

it('sends every event the registry claims we send', () => {
  const orphaned = [...registered]
    .filter((name) => !captured.has(name))
    .filter((name) => !SERVER_SIDE.has(name) && !AUTOCAPTURED.has(name))
    .sort();
  assert.deepEqual(
    orphaned,
    [],
    'These events have a row in documentation/analytics.md but nothing in lib/analytics.ts ' +
      'sends them. Move them to the "Retired events" section, or add the helper.',
  );
});

it('keeps a retired section for the rows that leave', () => {
  assert.ok(
    registry.includes('## Retired events'),
    'The retired-events section is how a removed event stops breaking saved insights ' +
      'without being silently deleted from the record.',
  );
});

console.log(`\nanalytics-contract: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
