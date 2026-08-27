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
      scope: body.scope,
      history: body.history,
      chatId: body.chatId,
      anonymousSessionId,
    }),
  });

  if (!upstream.body) {
    return new Response('Failed to get a response.', { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
