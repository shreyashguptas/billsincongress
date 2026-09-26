/**
 * Same-origin relay for the public bills reads, for browsers whose network
 * blocks the Convex URL. See `lib/bills-relay.ts` for why this exists.
 *
 * The browser still calls Convex directly first; it only comes here after a
 * direct call fails to connect. Values cross as Convex-encoded JSON so nothing
 * is lost between the two paths.
 */
import { NextResponse } from 'next/server';
import { convexToJson, type Value } from 'convex/values';
import { api } from '@/convex/_generated/api';
import { getConvexHttpClient } from '@/lib/convex-client';
import { parseRelayRequest, type RelayedBillsQuery } from '@/lib/bills-relay';
import { captureServerException } from '@/lib/posthog-server';

const QUERIES = {
  list: api.bills.list,
  listCount: api.bills.listCount,
  listAllSponsors: api.bills.listAllSponsors,
  getSyncStatus: api.bills.getSyncStatus,
} satisfies Record<RelayedBillsQuery, unknown>;

export async function POST(request: Request) {
  const client = getConvexHttpClient();
  if (!client) {
    return NextResponse.json({ error: 'Convex is not configured' }, { status: 503 });
  }

  const parsed = parseRelayRequest(await request.json().catch(() => null));
  if (!parsed) {
    return NextResponse.json({ error: 'Unknown query' }, { status: 400 });
  }

  try {
    // Convex validates `args` against the query's own validators, so a
    // malformed request fails there rather than reaching any handler.
    const value = await client.query(
      QUERIES[parsed.name] as typeof api.bills.list,
      parsed.args as never,
    );
    return NextResponse.json(
      { value: convexToJson(value as Value) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await captureServerException(error, undefined, {
      route: 'bills/query',
      query: parsed.name,
    });
    return NextResponse.json({ error: 'Query failed' }, { status: 502 });
  }
}
