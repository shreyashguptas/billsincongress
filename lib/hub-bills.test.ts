/**
 * Tests for readHubBills (lib/hub-bills.ts).
 *
 * The wrong answer this guards against: with Convex down, /bills/enacted said
 * "No bills match this in the current Congress" with a 200, and the edge cache
 * would have shown that to every signed-out reader for five minutes.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import type { Bill } from './types/bill';
import { readHubBills } from './hub-bills';

const bill = { id: '4758hr119' } as Bill;
const down = () => Promise.reject(new Error('Convex unavailable'));
const quiet = console.error;

async function main() {
  console.error = () => {};
  try {
    // The sorted read works: its result, as is.
    assert.deepEqual(
      await readHubBills('/bills/enacted', {
        sorted: async () => ({ data: [bill], hasMore: true, sortedBy: 'stageDate' }),
        unsorted: down,
      }),
      { data: [bill], hasMore: true, sortedBy: 'stageDate' },
    );

    // Only the sorted read fails: the bills, with no claimed order.
    assert.deepEqual(
      await readHubBills('/bills/enacted', {
        sorted: down,
        unsorted: async () => ({ data: [bill], hasMore: false }),
      }),
      { data: [bill], hasMore: false, sortedBy: null },
    );

    // Both fail: an error, never an empty list that reads as "no bills".
    await assert.rejects(
      readHubBills('/bills/enacted', { sorted: down, unsorted: down }),
      /Convex unavailable/,
    );
  } finally {
    console.error = quiet;
  }
  console.log('hub-bills: all 3 tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
