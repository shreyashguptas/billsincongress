/**
 * The stall watchdog: the thing that decides a reader has waited long enough.
 *
 * Its one subtle rule is what resets the clock. Since the proxy keep-alive
 * landed, bytes arrive throughout a silence — roughly every ten seconds — so a
 * watchdog fed by bytes, or by frames, would be held open forever by comments
 * the reader never sees and would never fire at all. Only a `work` step or a
 * `delta` of text changes the screen, and only those may buy more time.
 *
 * Getting that wrong fails silently in the direction that looks fine: the timer
 * simply never fires and the spinner runs to the proxy's three-minute cap,
 * which is the behaviour this exists to end. Nothing else in the suite would
 * notice. Hence two layers here — the policy is exercised directly, and the
 * provider is read to confirm it still wires that policy up the same way.
 *
 * The provider cannot be imported: it is a client component pulling in React
 * and Convex, neither of which loads under `tsx`. So the structural half reads
 * it as text, as `answer-provider.test.ts` already does for the `done` frame.
 *
 * Run with: `pnpm test`.
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

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'answer-provider.tsx'), 'utf8');

// ---------------------------------------------------------------------------
// The policy, as the provider applies it: a virtual clock fed a frame sequence.
// ---------------------------------------------------------------------------

const STALL_MS = 45_000;

type Frame = { event: 'work' | 'delta' | 'done' | 'keepalive'; atMs: number };

/** Whether the watchdog would have fired, given frames arriving at these times. */
function stalls(frames: Frame[], endMs: number): boolean {
  let lastProgress = 0;
  for (const f of frames) {
    if (f.atMs - lastProgress >= STALL_MS) return true;
    // Only what the reader can see resets it. A keep-alive deliberately does
    // not, which is the whole point.
    if (f.event === 'work' || f.event === 'delta') lastProgress = f.atMs;
    if (f.event === 'done') return false;
  }
  return endMs - lastProgress >= STALL_MS;
}

it('gives up when nothing visible has happened for the whole window', () => {
  assert.equal(stalls([], 46_000), true);
});

it('is not held open by keep-alives, which show the reader nothing', () => {
  // The regression that matters: a comment every ten seconds for a minute.
  const frames: Frame[] = [10, 20, 30, 40, 50, 60].map((s) => ({
    event: 'keepalive' as const,
    atMs: s * 1000,
  }));
  assert.equal(stalls(frames, 60_000), true);
});

it('never cuts off an answer that keeps producing text, however long it runs', () => {
  // Five minutes of steady output. Far past the window, never stalled.
  const frames: Frame[] = [];
  for (let s = 30; s <= 300; s += 30) frames.push({ event: 'delta', atMs: s * 1000 });
  frames.push({ event: 'done', atMs: 300_500 });
  assert.equal(stalls(frames, 301_000), false);
});

it('counts work steps as progress, not just answer text', () => {
  const frames: Frame[] = [
    { event: 'work', atMs: 30_000 },
    { event: 'work', atMs: 65_000 },
    { event: 'done', atMs: 80_000 },
  ];
  assert.equal(stalls(frames, 80_000), false);
});

it('gives up on a long silence even after a good start', () => {
  // Work steps, then the final generation hangs. The reported failure shape.
  const frames: Frame[] = [
    { event: 'work', atMs: 2_000 },
    { event: 'delta', atMs: 5_000 },
    { event: 'keepalive', atMs: 15_000 },
    { event: 'keepalive', atMs: 25_000 },
    { event: 'keepalive', atMs: 35_000 },
    { event: 'keepalive', atMs: 45_000 },
  ];
  assert.equal(stalls(frames, 51_000), true);
});

it('does not fire once the answer has arrived', () => {
  assert.equal(stalls([{ event: 'done', atMs: 1_000 }], 600_000), false);
});

// ---------------------------------------------------------------------------
// The wiring, so the policy above cannot drift away from the provider.
// ---------------------------------------------------------------------------

it('arms the watchdog before the request, not after the first frame', () => {
  const armIndex = source.indexOf('armStall();');
  const fetchIndex = source.indexOf("await fetch('/api/answer'");
  assert.ok(armIndex !== -1, 'the provider no longer arms a stall timer');
  assert.ok(
    armIndex < fetchIndex,
    'the timer must be armed before the request, or a server that never answers at all is unbounded',
  );
});

it('resets only on the two frames the reader can see', () => {
  // The window from the first branch to the `done` branch covers work + delta.
  const start = source.indexOf("if (event === 'work')");
  const end = source.indexOf("} else if (event === 'done')");
  assert.ok(start !== -1 && end > start, 'the frame dispatch has been restructured');
  const visible = source.slice(start, end);
  assert.equal(
    (visible.match(/armStall\(\)/g) ?? []).length,
    2,
    'both the work and delta branches must reset the timer, and only those',
  );
});

it('stops the watchdog when the answer lands and when the turn ends', () => {
  const doneIndex = source.indexOf("} else if (event === 'done')");
  assert.ok(
    source.slice(doneIndex, doneIndex + 200).includes('clearStall()'),
    'a delivered answer must stop the timer',
  );
  assert.ok(
    /finally\s*\{[^}]*clearStall\(\)/.test(source),
    'the timer must be cleared on every exit, or it outlives the turn',
  );
});

it('reports our own abort as a stall, never as a dropped connection', () => {
  const reasonStart = source.indexOf('const reason =');
  assert.ok(reasonStart !== -1, 'the failure-reason chain has moved');
  const chain = source.slice(reasonStart, reasonStart + 400);
  assert.ok(chain.includes('stalled_no_progress'), 'the stall has no reason of its own');
  assert.ok(
    chain.indexOf('stalledOut') < chain.indexOf('stream_dropped'),
    'the stall must be checked first, or aborting inflates the dropped-connection rate',
  );
});

console.log(`\nanswer-stall: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
