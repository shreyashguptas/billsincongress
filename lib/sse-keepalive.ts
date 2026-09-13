/**
 * Keeping a Server-Sent Events response alive through long silences.
 *
 * The answer loop runs for many seconds with long silent gaps — the model call
 * that writes the final answer emits no SSE frame until it is done. A mobile
 * carrier or edge proxy reaps a response socket left idle that long, and the
 * reader sees the severed stream as a failure a median of ~15s after asking,
 * right when the answer would have arrived. Broad home questions run longest
 * and fail most.
 *
 * The fix is to keep bytes flowing: write an SSE comment during silence. A
 * comment carries no `event:`/`data:` line, so the client parser skips the
 * frame (see `components/answers/answer-provider.tsx`).
 *
 * Two things this has to get right, and both are the reason it lives in its own
 * module with tests rather than inline in the route:
 *
 * 1. **Only write between frames.** A `reader.read()` chunk is a slice of
 *    bytes, not a frame — the upstream may split one frame across two chunks.
 *    A comment injected into that gap splits the frame, and the client finds
 *    `data: ` on a truncated line and throws in `JSON.parse`, which surfaces as
 *    exactly the dropped answer this is meant to prevent.
 * 2. **Measure silence, not wall-clock.** Silence is what gets a socket reaped,
 *    so the timer is re-armed on every upstream chunk. A stream still emitting
 *    deltas needs no help and should not have comments interleaved into it.
 */

/**
 * How long the upstream may be silent before a keep-alive is written. Well
 * under the ~15s idle window after which a mobile carrier or edge proxy was
 * severing the connection mid-answer.
 */
export const SSE_KEEPALIVE_MS = 10_000;

/**
 * The longest a single answer may hold the connection before the wrapper stops
 * it and says so.
 *
 * This exists because the keep-alive removes something. Before it, a genuinely
 * hung upstream — not merely a slow one — was reaped by the same idle timeout
 * this fix defeats, and the reader got a failure and an `answer_failed` event
 * after ~15s. Keeping the socket warm indefinitely would turn that into a
 * spinner that never resolves and never reports, which is harder to notice
 * than the bug being fixed.
 *
 * Deliberately far above any real answer rather than tuned close to one:
 * answers complete in tens of seconds, and the agent's own tool-round ceiling
 * bounds the normal case (it reports `partial`). Cutting a legitimate long
 * answer would recreate the exact harm this module exists to prevent, so the
 * bound is set where only a hang can reach it.
 */
export const SSE_MAX_STREAM_MS = 180_000;

/** Shown to the reader and recorded as the `answer_failed` reason on a cap. */
const TIMEOUT_MESSAGE = 'The answer took too long and was stopped. Please try again.';

/** Line feed. An SSE frame ends with two of them. */
const LF = 0x0a;

/**
 * Re-emit `body`, writing `: keep-alive` after every `intervalMs` of upstream
 * silence. Cancelling the returned stream cancels the upstream.
 */
export function withKeepAlive(
  body: ReadableStream<Uint8Array>,
  intervalMs: number = SSE_KEEPALIVE_MS,
  maxMs: number = SSE_MAX_STREAM_MS,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const reader = body.getReader();

  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  // The last two bytes forwarded, so we can tell whether the stream currently
  // sits on a frame boundary. Starts as one: nothing has been written, so a
  // keep-alive before the first byte cannot split anything.
  let prevByte = LF;
  let lastByte = LF;
  const atFrameBoundary = () => prevByte === LF && lastByte === LF;

  const startedAt = Date.now();
  let finished = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const arm = () => {
        stop();
        timer = setTimeout(() => {
          if (Date.now() - startedAt >= maxMs) {
            // Report the cap the way a server error is reported, so the client
            // shows it and records a distinct reason, rather than erroring the
            // stream and landing in `stream_dropped` — the metric this fix is
            // measured by. Only safe between frames; mid-frame, erroring is the
            // honest option left.
            stop();
            finished = true;
            if (atFrameBoundary()) {
              try {
                controller.enqueue(
                  encoder.encode(`event: error\ndata: ${JSON.stringify({ message: TIMEOUT_MESSAGE })}\n\n`),
                );
                controller.close();
              } catch {
                /* consumer already gone */
              }
            } else {
              try {
                controller.error(new Error('answer timed out'));
              } catch {
                /* consumer already gone */
              }
            }
            void reader.cancel('answer timed out');
            return;
          }
          if (atFrameBoundary()) {
            try {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
            } catch {
              // The consumer is gone; nothing left to keep alive.
              stop();
              return;
            }
          }
          arm();
        }, intervalMs);
      };
      arm();

      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.length === 1) {
              prevByte = lastByte;
              lastByte = value[0];
            } else if (value.length >= 2) {
              prevByte = value[value.length - 2];
              lastByte = value[value.length - 1];
            }
            controller.enqueue(value);
            arm();
          }
          stop();
          if (!finished) controller.close();
        } catch (error) {
          stop();
          if (!finished) controller.error(error);
        }
      })();
    },
    cancel(reason) {
      stop();
      void reader.cancel(reason);
    },
  });
}
