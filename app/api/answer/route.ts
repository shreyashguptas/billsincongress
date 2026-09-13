/**
 * Authenticated proxy in front of the Convex SSE endpoint.
 *
 * The loop itself lives in Convex so its tool calls stay in-process — the
 * alternative is a network round trip per fetch_dataset, and there are several
 * per question. This route exists to hold the two things Convex cannot see:
 * the auth cookie and the anonymous session cookie (both httpOnly).
 *
 * Node runtime, not edge. Streaming works fine on Node under OpenNext, and
 * `runtime = 'edge'` would break the cookie helpers this depends on.
 */
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import {
  getOrCreateAnonymousChatSessionId,
  MAX_QUESTION_LENGTH,
} from '../bill-chat/_shared';

/**
 * How often to send a keep-alive comment while the upstream stream is silent.
 * Well under the ~15s idle window after which a mobile carrier or edge proxy
 * was severing the connection mid-answer.
 */
const HEARTBEAT_MS = 10_000;

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return new Response('AI chat is not configured.', { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const question = typeof body.question === 'string' ? body.question : '';
  if (question.trim().length === 0 || question.length > MAX_QUESTION_LENGTH) {
    return new Response('Question must be between 1 and 2000 characters.', { status: 400 });
  }

  const [token, anonymousSessionId] = await Promise.all([
    convexAuthNextjsToken(),
    getOrCreateAnonymousChatSessionId(),
  ]);

  // Convex HTTP actions live on .convex.site, not .convex.cloud.
  const siteUrl =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? convexUrl.replace('.convex.cloud', '.convex.site');

  const upstream = await fetch(`${siteUrl}/answer/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      question,
      focusBillId: body.focusBillId,
      // Ids and enums only, and re-validated in Convex — the httpAction it
      // reaches is publicly addressable, so this route is defence in depth.
      context: body.context,
      scope: body.scope,
      history: body.history,
      chatId: body.chatId,
      anonymousSessionId,
    }),
  });

  // An upstream failure does not produce SSE frames — it produces a plain
  // body like Convex's "No matching routes found" when the deployment has not
  // been pushed yet. Piping that through as text/event-stream leaves the
  // client parsing for events that never arrive, so the answer hangs as a
  // spinner forever instead of reporting a failure. Convert it into one
  // well-formed error frame the client already knows how to handle.
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error(
      `answer upstream ${upstream.status} ${upstream.statusText}: ${detail.slice(0, 300)}`,
    );
    const message =
      upstream.status === 404
        ? 'The answer service is not deployed yet. Run `npx convex deploy`.'
        : 'Failed to get a response.';
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message })}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
        },
      },
    );
  }

  // The answer loop runs for many seconds with long silent gaps — the model
  // call that writes the final answer emits no SSE frame until it is done. A
  // mobile carrier or edge proxy reaps a response socket left idle that long,
  // and the client reports the severed stream as a failure a median of ~15s
  // after the question, right when the answer would have arrived. Broad home
  // questions run longest and fail most.
  //
  // Re-emit the upstream stream through a wrapper that injects an SSE comment
  // during silence, so bytes keep flowing and the connection is not reaped
  // mid-generation. The comment has no `event:`/`data:` line, so the client
  // parser skips it (see components/answers/answer-provider.tsx).
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stopHeartbeat = () => {
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          stopHeartbeat();
        }
      }, HEARTBEAT_MS);

      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          stopHeartbeat();
          controller.close();
        } catch (error) {
          stopHeartbeat();
          controller.error(error);
        }
      })();
    },
    cancel(reason) {
      stopHeartbeat();
      void reader.cancel(reason);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
