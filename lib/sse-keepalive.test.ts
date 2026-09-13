/**
 * Tests for the SSE keep-alive wrapper.
 *
 * The wrapper exists to stop a long answer being reaped mid-generation. The
 * risk it carries is the mirror image: a comment written in the wrong place
 * corrupts the very stream it is protecting. A `reader.read()` chunk is a slice
 * of bytes, not an SSE frame, so the upstream can split one frame across two
 * chunks — and a comment landing in that gap leaves the client parser with
 * `data: ` on a truncated line, which throws in `JSON.parse` and is reported as
 * a dropped answer. That case is the reason for `parse()` below: it replicates
 * the client's framing from `components/answers/answer-provider.tsx` rather
 * than asserting on bytes, so a regression shows up the way a reader would see
 * it.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { withKeepAlive } from './sse-keepalive';

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
    })
    .catch((err: unknown) => {
      failures.push(
        `  ✗ ${name}\n    ${err instanceof Error ? err.message.split('\n').join('\n    ') : String(err)}`,
      );
    });
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An upstream that emits each chunk, pausing `gapMs` between them. */
function upstreamOf(chunks: string[], gapMs: number): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const c of chunks) {
        await sleep(gapMs);
        controller.enqueue(enc.encode(c));
      }
      controller.close();
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

/** The client's framing, from components/answers/answer-provider.tsx. */
function parse(wire: string): string[] {
  const events: string[] = [];
  let buffer = wire;
  const frames = buffer.split('\n\n');
  buffer = frames.pop() ?? '';
  for (const frame of frames) {
    const lines = frame.split('\n');
    const evLine = lines.find((l) => l.startsWith('event: '));
    const dataLine = lines.find((l) => l.startsWith('data: '));
    if (!evLine || !dataLine) continue;
    const data = JSON.parse(dataLine.slice(6));
    events.push(`${evLine.slice(7)}:${JSON.stringify(data)}`);
  }
  return events;
}

const run = async () => {
  await it('writes a keep-alive when the upstream goes silent', async () => {
    const wire = await drain(withKeepAlive(upstreamOf(['event: done\ndata: {"ok":true}\n\n'], 120), 30));
    assert.ok(wire.includes(': keep-alive'), 'expected a keep-alive during the silence');
  });

  await it('writes nothing extra when the upstream is never silent', async () => {
    // Chunks arrive faster than the idle window, so the timer never expires.
    const wire = await drain(
      withKeepAlive(upstreamOf(['event: delta\ndata: {"text":"a"}\n\n', 'event: delta\ndata: {"text":"b"}\n\n'], 10), 200),
    );
    assert.equal(wire.includes(': keep-alive'), false, 'a busy stream should not be padded');
  });

  await it('never splits a frame the upstream sent in two chunks', async () => {
    // The regression case. The frame is cut mid-JSON and the second half only
    // arrives after several idle windows, so a wall-clock timer would fire
    // straight into the gap.
    const wire = await drain(
      withKeepAlive(upstreamOf(['event: delta\ndata: {"text":"hel', 'lo"}\n\n'], 90), 30),
    );
    assert.deepEqual(parse(wire), ['delta:{"text":"hello"}']);
  });

  await it('passes every frame through unchanged and in order', async () => {
    const wire = await drain(
      withKeepAlive(
        upstreamOf(['event: work\ndata: {"step":1}\n\n', 'event: delta\ndata: {"text":"x"}\n\n', 'event: done\ndata: {"ok":true}\n\n'], 60),
        25,
      ),
    );
    assert.deepEqual(parse(wire), ['work:{"step":1}', 'delta:{"text":"x"}', 'done:{"ok":true}']);
  });

  await it('surfaces an upstream failure instead of hanging', async () => {
    const boom = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('event: work\ndata: {"step":1}\n\n'));
        controller.error(new Error('upstream died'));
      },
    });
    await assert.rejects(() => drain(withKeepAlive(boom, 30)), /upstream died/);
  });

  await it('cancelling the wrapper cancels the upstream', async () => {
    let cancelled = false;
    const src = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('event: work\ndata: {"step":1}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const wrapped = withKeepAlive(src, 30);
    const reader = wrapped.getReader();
    await reader.read();
    await reader.cancel('reader went away');
    assert.equal(cancelled, true, 'upstream should be cancelled so it stops producing');
  });

  await it('stops a hung upstream and reports it as a server error', async () => {
    // An upstream that opens and then never says anything again. Before the
    // keep-alive, the network reaped this; the cap is what replaces that.
    const hung = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('event: work\ndata: {"step":1}\n\n'));
      },
    });
    const wire = await drain(withKeepAlive(hung, 10, 60));
    const events = parse(wire);
    assert.equal(events[0], 'work:{"step":1}');
    assert.ok(
      events[1]?.startsWith('error:') && events[1].includes('took too long'),
      `expected a terminal error frame, got ${JSON.stringify(events[1])}`,
    );
  });

  await it('does not cut an answer that finishes inside the cap', async () => {
    const wire = await drain(
      withKeepAlive(upstreamOf(['event: delta\ndata: {"text":"x"}\n\n', 'event: done\ndata: {"ok":true}\n\n'], 40), 15, 5_000),
    );
    assert.deepEqual(parse(wire), ['delta:{"text":"x"}', 'done:{"ok":true}']);
  });

  console.log(`\nsse-keepalive: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
};

void run();
