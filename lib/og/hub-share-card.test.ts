/**
 * Tests for the status, chamber and topic page share cards.
 *
 * These cards state counts in the site's voice, so the group that matters is
 * the last one: a count that was not read in full must never reach a card
 * (AGENTS.md, "Answer accuracy"). The loader is run against a stubbed
 * bills service so the partial-read cases can be forced.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import { POLICY_AREAS } from '@/lib/constants/filters';
import { hubByPath } from '@/lib/hubs';
import { hubShareImagePath, SHARE_CARD_SIZE, SHARE_CARD_VERSION } from '@/lib/seo';
import { billsService } from '@/lib/services/bills-service';
import { shareCardFonts } from './card-parts';
import {
  HubShareCard,
  ordinal,
  statusHeadline,
  statusShareLine,
  topicRankLine,
  topicRows,
  type HubCardData,
} from './hub-share-card';
import { loadHubCardData } from './hub-share-data';

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

/** Every policy area with a count, largest first by position. */
const RANKING = POLICY_AREAS.map((name, i) => ({ name, count: 3000 - i * 50 }));

async function main() {
  // Wording

  await it('writes ordinals the way people say them', () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 33].map(ordinal), [
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '33rd',
    ]);
  });

  await it('states a share only when it is big enough to mean something', () => {
    assert.equal(statusShareLine(18255, 19067), '95.7% of the 19,067 bills and resolutions introduced');
    assert.equal(statusShareLine(113, 19067), 'Out of 19,067 bills and resolutions introduced');
  });

  await it('never calls a subset "introduced" over a line counting every bill introduced', () => {
    // "499 introduced / 2.6% of the 19,067 bills and resolutions introduced"
    // contradicts itself: all 19,067 were introduced.
    assert.equal(statusHeadline(20), 'not yet in committee');
    assert.ok(!/introduced/i.test(statusHeadline(20)));
    assert.equal(statusHeadline(100), 'became law');
    assert.equal(statusHeadline(40), 'in committee');
  });

  // Ranking topics

  await it('ranks topics by count, not by the order they arrived in', () => {
    const shuffled = [...RANKING].reverse();
    const { rank, rows } = topicRows(POLICY_AREAS[0], shuffled);
    assert.equal(rank, 1);
    assert.equal(rows[0].name, POLICY_AREAS[0]);
    assert.equal(rows.length, 6);
  });

  await it('gives a topic outside the six its own row, with its rank', () => {
    const topic = POLICY_AREAS[11];
    const { rank, rows } = topicRows(topic, RANKING);
    assert.equal(rank, 12);
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.slice(0, 5).map((r) => r.rank), [1, 2, 3, 4, 5]);
    assert.equal(rows[5].name, topic);
    assert.equal(rows[5].rank, 12);
    assert.ok(rows[5].isThis);
  });

  await it('breaks a tie by name, so the rank does not change between renders', () => {
    const tied = [{ name: 'Taxation', count: 10 }, { name: 'Health', count: 10 }];
    assert.equal(topicRows('Health', tied).rank, 1);
    assert.equal(topicRows('Health', [...tied].reverse()).rank, 1);
  });

  await it('says a topic with no bills has none, rather than ranking it', () => {
    assert.equal(topicRankLine(33, 0), 'None yet this Congress');
    assert.equal(topicRankLine(1, 2186), 'The most of any topic');
    assert.equal(topicRankLine(5, 1265), 'The 5th most of any topic');
  });

  // URLs

  await it('names a new image URL when the headline count moves', () => {
    assert.equal(hubShareImagePath('/bills/enacted', 113), `/share-image/bills/enacted?v=${SHARE_CARD_VERSION}.113`);
    assert.notEqual(hubShareImagePath('/bills/enacted', 113), hubShareImagePath('/bills/enacted', 114));
    assert.equal(hubShareImagePath('/bills/house', null), `/share-image/bills/house?v=${SHARE_CARD_VERSION}`);
  });

  // It draws

  const cases: Array<[string, HubCardData]> = [
    ['a status page', { kind: 'status', congress: 119, stage: 100, count: 113, total: 19067 }],
    ['a vetoed status page with a tiny count', { kind: 'status', congress: 119, stage: 85, count: 2, total: 19067 }],
    ['a chamber page', { kind: 'chamber', congress: 119, chamber: 'house', count: 12437, otherCount: 6630, becameLaw: 70 }],
    ['a chamber page whose law count could not be read', { kind: 'chamber', congress: 119, chamber: 'senate', count: 6630, otherCount: 12437, becameLaw: null }],
    ['a top topic', { kind: 'topic', congress: 119, topic: POLICY_AREAS[0], count: 3000, ranking: RANKING }],
    ['a long topic outside the six', { kind: 'topic', congress: 119, topic: 'Civil Rights and Liberties, Minority Issues', count: 120, ranking: RANKING }],
    ['a topic whose ranking could not be read', { kind: 'topic', congress: 119, topic: 'Health', count: 2186, ranking: null }],
  ];
  for (const [name, data] of cases) {
    await it(`renders a 1200×630 PNG for ${name}`, async () => {
      const res = new ImageResponse(createElement(HubShareCard, { data }), {
        ...SHARE_CARD_SIZE,
        fonts: shareCardFonts(),
      });
      const png = Buffer.from(await res.arrayBuffer());
      assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
      assert.equal(png.readUInt32BE(16), SHARE_CARD_SIZE.width);
      assert.equal(png.readUInt32BE(20), SHARE_CARD_SIZE.height);
      assert.ok(png.length < 300_000, `${png.length} bytes`);
    });
  }

  // The group that matters: a partial count never reaches a card

  const original = {
    fetchBillsCount: billsService.fetchBillsCount,
    getAvailableCongressNumbers: billsService.getAvailableCongressNumbers,
  };
  /** Stub the service: `inexact` names the filters whose count comes back as a floor. */
  const stub = (inexact: (filter: Record<string, unknown>) => boolean) => {
    billsService.getAvailableCongressNumbers = async () => [119, 118, 117];
    billsService.fetchBillsCount = (async (filter: Record<string, unknown>) => {
      assert.equal(filter.congress, '119', 'every count is for the current Congress');
      if (inexact(filter)) return { count: 1200, exact: false };
      if (filter.policyArea) return { count: 3000 - POLICY_AREAS.indexOf(filter.policyArea as string) * 50, exact: true };
      if (filter.status) return { count: 113, exact: true };
      if (filter.chamber) return { count: filter.chamber === 'house' ? 12437 : 6630, exact: true };
      return { count: 19067, exact: true };
    }) as typeof billsService.fetchBillsCount;
  };

  try {
    await it('draws a status card from exact counts', async () => {
      stub(() => false);
      const data = await loadHubCardData(hubByPath('/bills/enacted')!);
      assert.deepEqual(data, { kind: 'status', congress: 119, stage: 100, count: 113, total: 19067 });
    });

    await it('refuses a status card whose headline count is a floor', async () => {
      stub((f) => f.status !== undefined);
      assert.equal(await loadHubCardData(hubByPath('/bills/enacted')!), null);
    });

    await it('refuses a status card whose denominator is a floor', async () => {
      stub((f) => Object.keys(f).length === 1);
      assert.equal(await loadHubCardData(hubByPath('/bills/enacted')!), null);
    });

    await it('leaves the law count off a chamber card when its breakdown is unavailable', async () => {
      // No Convex URL in tests, so the breakdown cannot be read.
      stub(() => false);
      const data = await loadHubCardData(hubByPath('/bills/house')!);
      assert.ok(data && data.kind === 'chamber');
      assert.equal(data.becameLaw, null);
      assert.equal(data.count, 12437);
    });

    await it('drops the ranking, not the card, when one topic count is a floor', async () => {
      stub((f) => f.policyArea === POLICY_AREAS[5]);
      const data = await loadHubCardData(hubByPath('/bills/topic/health')!);
      assert.ok(data && data.kind === 'topic');
      assert.equal(data.ranking, null);
    });

    await it('refuses a topic card whose own count is a floor', async () => {
      stub((f) => f.policyArea === 'Health');
      assert.equal(await loadHubCardData(hubByPath('/bills/topic/health')!), null);
    });
  } finally {
    Object.assign(billsService, original);
  }

  if (failures.length) {
    console.error(`\nhubShareCard: ${passed} passed, ${failures.length} FAILED\n`);
    console.error(failures.join('\n\n'));
    process.exit(1);
  }
  console.log(`hubShareCard: all ${passed} tests passed`);
}

main();
