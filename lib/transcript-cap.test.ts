/**
 * Anonymous transcript capping (spec §4.7).
 *
 * The browser supplies the transcript, so an uncapped one is a cost attack.
 * The server caps it too (convex/answer.ts capHistory) — this is the client
 * half, so we do not send what will only be discarded.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { capTranscript } from './transcript-cap';

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

const turn = (role: 'user' | 'assistant', content: string) => ({ role, content });

it('leaves a short transcript untouched', () => {
  const t = [turn('user', 'hi'), turn('assistant', 'hello')];
  assert.deepEqual(capTranscript(t, 10, 8000), t);
});

it('keeps only the most recent turns past the turn limit', () => {
  const t = Array.from({ length: 20 }, (_, i) => turn('user', `q${i}`));
  const out = capTranscript(t, 10, 8000);
  assert.equal(out.length, 10);
  assert.equal(out[out.length - 1].content, 'q19');
  assert.equal(out[0].content, 'q10');
});

it('drops oldest-first when over the character limit', () => {
  const t = [turn('user', 'a'.repeat(60)), turn('assistant', 'b'.repeat(60)), turn('user', 'c')];
  const out = capTranscript(t, 10, 100);
  assert.equal(out[out.length - 1].content, 'c');
  assert.ok(out.length < 3, 'should have dropped at least the oldest turn');
});

it("never splits a turn's role from its content", () => {
  const t = [turn('user', 'x'.repeat(200)), turn('assistant', 'y')];
  for (const m of capTranscript(t, 10, 50)) {
    assert.ok(m.role === 'user' || m.role === 'assistant');
    assert.equal(typeof m.content, 'string');
  }
});

it('returns empty rather than a partial turn when even one turn is too big', () => {
  assert.deepEqual(capTranscript([turn('user', 'z'.repeat(9000))], 10, 8000), []);
});

it('handles an empty transcript', () => {
  assert.deepEqual(capTranscript([], 10, 8000), []);
});

console.log(`\ntranscript-cap: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
