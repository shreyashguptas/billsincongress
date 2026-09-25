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
import { shareCardFonts, TOPIC_COLOURS } from './card-parts';
import {
  HubShareCard,
  ordinal,
  rowLabel,
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

  await it('gives tied topics the same rank instead of inventing an order', () => {
    // Two topics with equal counts are tied, not 4th and 5th by alphabet.
    const counts = [
      { name: 'Health', count: 50 },
      { name: 'Taxation', count: 40 },
      { name: 'Animals', count: 30 },
      { name: 'Education', count: 20 },
      { name: 'Energy', count: 20 },
      { name: 'Commerce', count: 10 },
    ];
    for (const topic of ['Education', 'Energy']) {
      const { rank, tied } = topicRows(topic, counts);
      assert.equal(rank, 4, topic);
      assert.ok(tied, topic);
      assert.equal(topicRankLine(rank, 20, tied), 'Tied for the 4th most of any topic');
    }
    // The next topic down is 6th, not 5th: two topics are above it at 4th.
    assert.equal(topicRows('Commerce', counts).rank, 6);
    assert.equal(topicRows('Commerce', counts).tied, false);
    // Rows show the shared rank too, and their order is stable either way round.
    const rows = topicRows('Health', [...counts].reverse()).rows;
    assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3, 4, 4, 6]);
    assert.deepEqual(rows.map((r) => r.name), ['Health', 'Taxation', 'Animals', 'Education', 'Energy', 'Commerce']);
  });

  await it('labels a row outside the six with its rank, and a tie as a tie', () => {
    const row = { name: 'Energy', count: 20, rank: 12, tied: false, colour: '#000', isThis: true };
    assert.equal(rowLabel(row), '12th · Energy');
    assert.equal(rowLabel({ ...row, tied: true }), 'Tied 12th · Energy');
    assert.equal(rowLabel({ ...row, rank: 3 }), 'Energy');
    // Two empty topics share last place; neither is given a place at all.
    assert.equal(rowLabel({ ...row, count: 0, rank: 32, tied: true }), 'Energy');
  });

  await it('draws a topic tied into the six inside them, in its colour', () => {
    // Three topics tied for 5th straddle the six-row cut. The card's own topic
    // sorts last by name, but it is in the six by rank, so it must be drawn
    // there in topic-6, not as a grey row from outside.
    const counts = [
      { name: 'Health', count: 90 },
      { name: 'Taxation', count: 80 },
      { name: 'Animals', count: 70 },
      { name: 'Commerce', count: 60 },
      { name: 'Energy', count: 50 },
      { name: 'Law', count: 50 },
      { name: 'Zoology', count: 50 },
      { name: 'Families', count: 10 },
    ];
    const { rows, rank, tied } = topicRows('Zoology', counts);
    assert.equal(rank, 5);
    assert.ok(tied);
    const mine = rows.find((r) => r.isThis);
    assert.ok(mine, 'the topic is on the card');
    assert.ok(rows.indexOf(mine!) < 6);
    assert.equal(mine!.colour, TOPIC_COLOURS[rows.indexOf(mine!)]);
    assert.equal(rowLabel(mine!), 'Zoology');
    assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3, 4, 5, 5]);
  });

  await it('says a tie for first plainly', () => {
    const { rank, tied } = topicRows('Health', [{ name: 'Health', count: 9 }, { name: 'Taxation', count: 9 }]);
    assert.equal(topicRankLine(rank, 9, tied), 'Tied for the most of any topic');
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
