/**
 * Tests for the same-origin bills relay and the service's use of it.
 *
 * The bug these guard: on networks that block `*.convex.cloud`, every browser
 * read failed with "TypeError: Failed to fetch", and `fetchBills` turned that
 * failure into an empty page. The list then said "No bills found" for
 * `?congress=118`, `?chamber=house` and every other filter — 105 of the 439
 * `bills_no_results` events in the week to 25 Sep 2026 came from sessions where
 * the console shows the request never left the browser.
 *
 * So two things must hold: a connection failure in the browser is retried
 * through `/api/bills/query`, and a failure of both paths is thrown, never
 * returned as zero bills.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { convexToJson } from 'convex/values';
import { BILLS_RELAY_PATH, isUnreachable, parseRelayRequest } from './bills-relay';

let passed = 0;
const failures: string[] = [];

async function it(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split('\n').join('\n    ') : String(err)}`,
    );
  }
}

const run = async () => {
  // The request check

  await it('accepts each relayed query, with or without args', () => {
    assert.deepEqual(parseRelayRequest({ name: 'list', args: { congress: 118 } }), {
      name: 'list',
      args: { congress: 118 },
    });
    assert.deepEqual(parseRelayRequest({ name: 'getSyncStatus' }), {
      name: 'getSyncStatus',
      args: {},
    });
    for (const name of ['listCount', 'listAllSponsors']) {
      assert.equal(parseRelayRequest({ name, args: {} })?.name, name);
    }
  });

  await it('refuses any query that is not on the list', () => {
    for (const name of ['getById', 'getBillChatHistory', 'toString', '__proto__', '']) {
      assert.equal(parseRelayRequest({ name, args: {} }), null, name);
    }
  });

  await it('refuses bodies that are not a name and an args object', () => {
    for (const body of [null, 'list', ['list'], { name: 1 }, { name: 'list', args: [] }, { name: 'list', args: 'x' }]) {
      assert.equal(parseRelayRequest(body), null, JSON.stringify(body));
    }
  });

  await it('treats only a connection failure as unreachable', () => {
    assert.equal(isUnreachable(new TypeError('Failed to fetch')), true);
    assert.equal(isUnreachable(new TypeError('Load failed')), true);
    assert.equal(isUnreachable(new Error('[CONVEX Q(bills:list)] Server Error')), false);
    assert.equal(isUnreachable('Failed to fetch'), false);
  });

  // The service, against a fake network

  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example-123.convex.cloud';
  const { billsService } = await import('./services/bills-service');

  type Route = 'convex' | 'relay';
  const calls: Route[] = [];
  let convexBehaviour: 'unreachable' | 'function-error' = 'unreachable';
  let relayStatus = 200;

  const ROW = {
    billId: '5193hr118',
    congress: 118,
    billType: 'hr',
    billNumber: '5193',
    title: 'Senior Citizens’ Freedom to Work Act',
    progressStage: 40,
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === BILLS_RELAY_PATH) {
      calls.push('relay');
      if (relayStatus !== 200) return new Response('{"error":"Query failed"}', { status: relayStatus });
      return Response.json({
        value: convexToJson({ data: [ROW], hasMore: true, truncated: false }),
      });
    }
    calls.push('convex');
    if (convexBehaviour === 'unreachable') throw new TypeError('Failed to fetch');
    return new Response('Server Error', { status: 500 });
  }) as typeof fetch;

  await it('on the server, a connection failure throws and is not relayed', async () => {
    calls.length = 0;
    await assert.rejects(billsService.fetchBills({ congress: '118' }), TypeError);
    assert.deepEqual(calls, ['convex']);
  });

  // Everything below runs as the browser.
  (globalThis as { window?: unknown }).window = globalThis;

  await it('a Convex error in the browser throws and is not relayed', async () => {
    calls.length = 0;
    convexBehaviour = 'function-error';
    await assert.rejects(billsService.fetchBills({ congress: '118' }));
    assert.deepEqual(calls, ['convex']);
  });

  await it('when Convex is unreachable, the bills come through the relay', async () => {
    calls.length = 0;
    convexBehaviour = 'unreachable';
    const response = await billsService.fetchBills({ congress: '118' });
    assert.deepEqual(calls, ['convex', 'relay']);
    assert.equal(response.data.length, 1);
    assert.equal(response.data[0].id, '5193hr118');
    assert.equal(response.hasMore, true);
  });

  await it('after one failure, the rest of the visit goes straight to the relay', async () => {
    calls.length = 0;
    await billsService.fetchBills({ chamber: 'house' });
    assert.deepEqual(calls, ['relay']);
  });

  await it('when the relay fails too, fetchBills throws instead of returning no bills', async () => {
    calls.length = 0;
    relayStatus = 502;
    await assert.rejects(billsService.fetchBills({ congress: '118' }), /502/);
    assert.deepEqual(calls, ['relay']);
  });

  await it('the count and the sponsor list take the same path', async () => {
    calls.length = 0;
    relayStatus = 502;
    // Count failures are non-fatal by design: an unknown total, not zero.
    assert.deepEqual(await billsService.fetchBillsCount({ congress: '118' }), {
      count: null,
      exact: false,
    });
    await assert.rejects(billsService.fetchAllSponsors());
    assert.deepEqual(calls, ['relay', 'relay']);
  });

  if (failures.length) {
    console.error(`\nbillsRelay: ${passed} passed, ${failures.length} FAILED\n`);
    console.error(failures.join('\n\n'));
    process.exit(1);
  }
  console.log(`billsRelay: all ${passed} tests passed`);
};

void run();
