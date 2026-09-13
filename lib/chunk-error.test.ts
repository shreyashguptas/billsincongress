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
import { isChunkLoadError } from './chunk-error';

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

console.log(`\nchunk-error: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
