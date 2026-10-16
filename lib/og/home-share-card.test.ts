/**
 * Tests for the home page's share card and the site's generic card.
 *
 * The home card states the Congress's total and a breakdown by stage, so the
 * group that matters is the first: a breakdown that does not add up to the
 * total is not drawn (AGENTS.md, "Answer accuracy").
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import { homeShareImagePath, SHARE_CARD_SIZE, SHARE_CARD_VERSION } from '@/lib/seo';
import { shareCardFonts } from './card-parts';
import { GenericShareCard } from './generic-share-card';
import { homeCongress } from '@/lib/congress';
import { HomeShareCard, homeCardFromDashboard, type DashboardStats } from './home-share-card';
import { loadHomeCardData } from './home-share-data';

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

/** The 119th Congress as the dashboard held it on 2026-09-25. */
const DASHBOARD: DashboardStats = {
  congress: 119,
  totalBills: 19067,
  statusBreakdown: {
    introduced: 499,
    inCommittee: 18100,
    outOfCommittee: 155,
    passedOneChamber: 192,
    passedBothChambers: 0,
    vetoed: 2,
    toPresident: 6,
    signed: 0,
    becameLaw: 113,
  },
};

async function main() {
  // The group that matters

  await it('draws the stages when they account for every bill', () => {
    const data = homeCardFromDashboard(DASHBOARD);
    assert.equal(data.total, 19067);
    assert.ok(data.stages);
    assert.equal(data.stages!.reduce((n, s) => n + s.count, 0), 19067);
  });

  await it('refuses a breakdown that does not add up to the total', () => {
    const short = { ...DASHBOARD, statusBreakdown: { ...DASHBOARD.statusBreakdown, inCommittee: 18000 } };
    assert.equal(homeCardFromDashboard(short).stages, null);
    assert.equal(homeCardFromDashboard(short).total, 19067, 'the total alone still stands');
  });

  // The card describes the Congress the page shows

  await it('reads the newest Congress we hold, from the stats rows', async () => {
    // It was the constant 119, which from 3 January 2027 would have kept
    // describing the 119th as the current Congress.
    const asked: number[] = [];
    const data = await loadHomeCardData(
      async (congress) => {
        asked.push(congress);
        return { ...DASHBOARD, congress };
      },
      async () => [
        { congress: 118, totalCount: 19315 },
        { congress: 119, totalCount: 19633 },
        { congress: 120, totalCount: 212 },
      ],
    );
    assert.deepEqual(asked, [120]);
    assert.equal(data?.congress, 120);
  });

  await it('skips a Congress with no measures, and falls back to the calendar', () => {
    assert.equal(homeCongress([{ congress: 119, totalCount: 5 }, { congress: 120, totalCount: 0 }]), 119);
    assert.equal(homeCongress(null, '2027-01-04'), 120);
    assert.equal(homeCongress([], '2026-10-14'), 119);
  });

  await it('app/page.tsx defaults through the same function', () => {
    // The card and the page must agree on which Congress the home page shows.
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const page = readFileSync(join(root, 'app', 'page.tsx'), 'utf8');
    assert.match(page, /Number\(params\.congress\) \|\| homeCongress\(/);
    assert.doesNotMatch(page, /\|\|\s*\d{3}\b/, 'no literal Congress number as the default');
  });

  // What the rows say

  await it('orders stages along the path, Vetoed after the President, and drops empty ones', () => {
    const { stages } = homeCardFromDashboard(DASHBOARD);
    assert.deepEqual(stages!.map((s) => s.stage), [20, 40, 50, 60, 90, 85, 100]);
    assert.ok(!stages!.some((s) => s.count === 0));
  });

  // URL

  await it('versions the home card by UTC day', () => {
    const path = homeShareImagePath(new Date('2026-09-25T23:59:00Z'));
    assert.equal(path, `/share-image/home?v=${SHARE_CARD_VERSION}.2026-09-25`);
    assert.notEqual(path, homeShareImagePath(new Date('2026-09-26T00:01:00Z')));
  });

  // It draws

  const cards: Array<[string, () => ReturnType<typeof createElement>]> = [
    ['the home card', () => createElement(HomeShareCard, { data: homeCardFromDashboard(DASHBOARD) })],
    ['the home card without a breakdown', () =>
      createElement(HomeShareCard, { data: { congress: 119, total: 19067, stages: null } })],
    ['the generic card', () => createElement(GenericShareCard)],
  ];
  for (const [name, el] of cards) {
    await it(`renders a 1200×630 PNG for ${name}`, async () => {
      const res = new ImageResponse(el(), { ...SHARE_CARD_SIZE, fonts: shareCardFonts() });
      const png = Buffer.from(await res.arrayBuffer());
      assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
      assert.equal(png.readUInt32BE(16), SHARE_CARD_SIZE.width);
      assert.equal(png.readUInt32BE(20), SHARE_CARD_SIZE.height);
      assert.ok(png.length < 300_000, `${png.length} bytes`);
    });
  }

  if (failures.length) {
    console.error(`\nhomeShareCard: ${passed} passed, ${failures.length} FAILED\n`);
    console.error(failures.join('\n\n'));
    process.exit(1);
  }
  console.log(`homeShareCard: all ${passed} tests passed`);
}

main();
