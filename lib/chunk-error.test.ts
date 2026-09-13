/**
 * Tests for the stale-asset chunk-error recogniser.
 *
 * `isChunkLoadError` decides whether an error caught by the app's error
 * boundaries is the stale-asset failure that warrants an automatic reload, or
 * an ordinary render error that must not trigger one. The "recognises" cases
 * cover the shapes different engines produce; the "leaves alone" cases are
 * ordinary errors a reload would not fix, so a false positive there would loop
 * a reader through pointless reloads.
 *
 * The verbatim message in the first case is the one error tracking recorded on
 * the home page (report 01a09834), minus the specific chunk hash.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { isChunkLoadError, reloadForChunkError } from './chunk-error';

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

/** Build an Error with a given name and message, as an engine would raise it. */
function err(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

it('recognises the error tracking recorded on the home page', () => {
  assert.equal(
    isChunkLoadError(
      err('ChunkLoadError', 'Failed to load chunk /_next/static/chunks/165f64azk327x.js'),
    ),
    true,
  );
});

it('recognises a ChunkLoadError by name regardless of message', () => {
  assert.equal(isChunkLoadError(err('ChunkLoadError', 'anything at all')), true);
});

it('recognises the "Loading chunk N failed" phrasing', () => {
  assert.equal(isChunkLoadError(err('Error', 'Loading chunk 245 failed.')), true);
});

it('recognises a failed CSS chunk', () => {
  assert.equal(isChunkLoadError(err('Error', 'Loading CSS chunk 12 failed.')), true);
});

it('recognises the dynamic-import phrasings from other engines', () => {
  assert.equal(
    isChunkLoadError(err('TypeError', 'error loading dynamically imported module: /a.js')),
    true,
  );
  assert.equal(
    isChunkLoadError(err('TypeError', 'Importing a module script failed.')),
    true,
  );
});

it('leaves an ordinary render error alone, so it never triggers a reload', () => {
  assert.equal(
    isChunkLoadError(err('TypeError', "Cannot read properties of undefined (reading 'map')")),
    false,
  );
});

it('is not fooled by an unrelated message that merely mentions a chunk', () => {
  assert.equal(isChunkLoadError(err('Error', 'processing chunk of data succeeded')), false);
});

it('handles non-Error values without throwing', () => {
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError(undefined), false);
  assert.equal(isChunkLoadError('ChunkLoadError'), false);
  assert.equal(isChunkLoadError({ name: 'ChunkLoadError' }), true);
  assert.equal(isChunkLoadError({ message: 'Failed to load chunk x.js' }), true);
});


// The reload guard. `isChunkLoadError` above only decides whether to recover;
// these cover the recovery itself, which is the half that can misfire on a
// reader. A reload that is not bounded is worse than the dead page it replaces:
// the reader cannot even reach the retry control before the tab goes again.

/** Epoch-like, because the guard compares against a real timestamp. */
const BASE = 1_700_000_000_000;

/**
 * Install a fake window. `mode` picks the storage behaviour: 'working' is an
 * ordinary tab, 'blocked' is Safari with "Block all cookies", where touching
 * the property throws before getItem/setItem ever runs.
 */
function withWindow(mode: 'working' | 'blocked', fn: (count: () => number) => void) {
  const g = globalThis as Record<string, unknown>;
  const saved = g.window;
  let reloads = 0;
  const mem = new Map<string, string>();
  const win: Record<string, unknown> = { location: { reload: () => { reloads++; } } };
  Object.defineProperty(win, 'sessionStorage', {
    configurable: true,
    get() {
      if (mode === 'blocked') throw new Error('SecurityError: The operation is insecure.');
      return {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => { mem.set(k, v); },
        removeItem: (k: string) => { mem.delete(k); },
      };
    },
  });
  g.window = win;
  try {
    fn(() => reloads);
  } finally {
    if (saved === undefined) delete g.window;
    else g.window = saved;
  }
}

it('reloads once to pick up fresh assets', () => {
  withWindow('working', (count) => {
    reloadForChunkError(BASE);
    assert.equal(count(), 1);
  });
});

it('does not reload again inside the window, so a broken deploy cannot loop', () => {
  withWindow('working', (count) => {
    reloadForChunkError(BASE);
    reloadForChunkError(BASE + 1_000);
    reloadForChunkError(BASE + 9_999);
    assert.equal(count(), 1);
  });
});

it('reloads again once the window has passed', () => {
  withWindow('working', (count) => {
    reloadForChunkError(BASE);
    reloadForChunkError(BASE + 10_001);
    assert.equal(count(), 2);
  });
});

it('does not reload at all when storage is blocked', () => {
  // The guard lives in sessionStorage, and a blocked write is swallowed
  // silently, so the stamp would read 0 on every pass and the tab would
  // refresh forever. Falling through to the retry control is the safe
  // degradation; reloading unbounded is not.
  withWindow('blocked', (count) => {
    for (let i = 0; i < 6; i++) reloadForChunkError(BASE + i * 60_000);
    assert.equal(count(), 0);
  });
});

console.log(`\nchunk-error: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
