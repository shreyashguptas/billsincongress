/**
 * What "Was this answer right?" sends (lib/answer-rating.ts).
 *
 * The two things worth guarding: a "no" must carry enough to reproduce the
 * wrong answer — the right question, not merely the latest one — and a "yes"
 * must carry no reader text at all, because the Privacy Policy says only a "no"
 * sends the question and answer.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { answerRatedProps, canRate, RATED_ANSWER_MAX, type RatableTurn } from './answer-rating';

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

const q = (id: string, content: string): RatableTurn => ({ id, role: 'user', content });
const a = (id: string, content: string, extra: Partial<RatableTurn> = {}): RatableTurn => ({
  id,
  role: 'assistant',
  content,
  done: true,
  ...extra,
});

const thread: RatableTurn[] = [
  q('u1', 'How many House bills became law?'),
  a('a1', '64 House bills became law [1].', {
    sources: ['bill:119-hr-1', 'web:0'],
    webSources: [{}],
  }),
  q('u2', 'And in the Senate?'),
  a('a2', '49 Senate bills became law [1].', { sources: ['bill:119-s-5'] }),
];
const ctx = { surface: 'home' };

it('a "no" carries the question and the answer the reader saw', () => {
  const p = answerRatedProps(thread, 'a1', 'wrong', ctx);
  assert.ok(p);
  assert.equal(p.verdict, 'wrong');
  assert.equal(p.question, 'How many House bills became law?');
  assert.equal(p.answer, '64 House bills became law [1].');
  assert.deepEqual(p.sources, ['bill:119-hr-1', 'web:0']);
  assert.equal(p.answer_clipped, false);
});

it('rating an earlier answer names ITS question, not the latest one', () => {
  const p = answerRatedProps(thread, 'a1', 'wrong', ctx);
  assert.equal(p?.question, 'How many House bills became law?');
  assert.equal(p?.question_number, 1);
  assert.equal(p?.previous_question, undefined);
});

it('a follow-up carries the question before it, so "And in the Senate?" can be reproduced', () => {
  const p = answerRatedProps(thread, 'a2', 'wrong', ctx);
  assert.equal(p?.question, 'And in the Senate?');
  assert.equal(p?.previous_question, 'How many House bills became law?');
  assert.equal(p?.question_number, 2);
});

it('a "yes" sends no reader text and no answer text', () => {
  const p = answerRatedProps(thread, 'a2', 'right', ctx);
  assert.ok(p);
  for (const key of ['question', 'previous_question', 'answer', 'sources', 'answer_clipped']) {
    assert.ok(!(key in p), `a "yes" must not carry ${key}`);
  }
  assert.equal(p.answer_length, '49 Senate bills became law [1].'.length);
});

it('counts database and web sources the way answer_received does', () => {
  const p = answerRatedProps(thread, 'a1', 'right', ctx);
  assert.equal(p?.db_source_count, 1);
  assert.equal(p?.web_source_count, 1);
});

it('clips a runaway answer and says so', () => {
  const long = 'x'.repeat(RATED_ANSWER_MAX + 50);
  const p = answerRatedProps([q('u', 'q'), a('a', long)], 'a', 'wrong', ctx);
  assert.equal(p?.answer?.length, RATED_ANSWER_MAX);
  assert.equal(p?.answer_clipped, true);
  assert.equal(p?.answer_length, long.length);
});

it('passes the saved-thread id only when there is one', () => {
  assert.equal(answerRatedProps(thread, 'a1', 'right', ctx)?.chat_id, undefined);
  assert.equal(
    answerRatedProps(thread, 'a1', 'right', { surface: 'bill', chatId: 'k123' })?.chat_id,
    'k123',
  );
  assert.ok(!('chat_id' in (answerRatedProps(thread, 'a1', 'right', { ...ctx, chatId: null }) ?? {})));
});

it("carries the answer's trace id, so the verdict joins the recorded trace", () => {
  const traced = [q('u', 'q'), a('a', 'answer', { traceId: 'trace-123' })];
  assert.equal(answerRatedProps(traced, 'a', 'right', ctx)?.$ai_trace_id, 'trace-123');
  assert.equal(answerRatedProps(traced, 'a', 'wrong', ctx)?.$ai_trace_id, 'trace-123');
  // An answer restored after a refresh has no trace id; the property is absent, not empty.
  assert.ok(!('$ai_trace_id' in (answerRatedProps(thread, 'a1', 'right', ctx) ?? {})));
});

it('will not rate a clarifying question, an unfinished answer, or the reader', () => {
  assert.equal(canRate(a('x', 'Did you mean passed, or became law?', { askedReader: true })), false);
  assert.equal(canRate(a('x', 'half an answ', { done: false })), false);
  assert.equal(canRate(a('x', '   ')), false);
  assert.equal(canRate(q('x', 'a question')), false);
  assert.equal(answerRatedProps(thread, 'u1', 'wrong', ctx), null);
  assert.equal(answerRatedProps(thread, 'missing', 'wrong', ctx), null);
});

console.log(`\nanswer-rating: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
