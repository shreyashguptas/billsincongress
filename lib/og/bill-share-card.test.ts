/**
 * Tests for the share card: the picture a bill's link unfurls into, and the
 * URLs that point at it.
 *
 * The card states a bill's status in the site's voice, on someone else's
 * screen, so the status has to be the bill's own and the URL has to change
 * when it does. The last group renders real PNGs, which is also what proves
 * the embedded fonts decode.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import type { Bill } from '@/lib/types/bill';
import { billShareImagePath, billShareUrl, SHARE_CARD_SIZE, SITE_URL } from '@/lib/seo';
import {
  BillShareCard,
  shareCardFonts,
  shareCardStageNote,
  shareCardTitle,
} from './bill-share-card';

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

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: '1hr119',
    congress: 119,
    bill_type: 'hr',
    bill_number: '1',
    bill_type_label: 'H.R.',
    introduced_date: '2025-05-20',
    title: 'One Big Beautiful Bill Act',
    sponsor_first_name: 'Jodey',
    sponsor_last_name: 'Arrington',
    sponsor_party: 'R',
    sponsor_state: 'TX',
    progress_stage: 100,
    progress_description: 'Became Law',
    bill_subjects: { policy_area_name: 'Economics and Public Finance' },
    ...overrides,
  };
}

async function main() {
  // The link

  await it('shares the canonical URL, whatever the reader arrived with', () => {
    assert.equal(billShareUrl('1hr119'), `${SITE_URL}/bills/1hr119`);
  });

  await it('names a new image URL when the bill moves, so caches cannot keep the old stage', () => {
    const inCommittee = billShareImagePath(bill({ progress_stage: 40 }));
    const law = billShareImagePath(bill({ progress_stage: 100 }));
    assert.match(inCommittee, /^\/bills\/1hr119\/share-image\?v=\d+\.40$/);
    assert.notEqual(inCommittee, law);
  });

  // What the card says

  await it('says where a vetoed bill stopped rather than calling it stage 5', () => {
    assert.equal(shareCardStageNote(85), 'Stopped at the President');
    assert.equal(shareCardStageNote(100), 'Stage 7 of 7');
    assert.equal(shareCardStageNote(20), 'Stage 1 of 7');
  });

  await it('never claims a stage for a code it does not know', () => {
    assert.equal(shareCardStageNote(55), 'Stage unknown');
  });

  await it('sets short titles large and cuts long ones at a word', () => {
    assert.equal(shareCardTitle('JUDGES Act of 2024').fontSize, 76);
    const long = shareCardTitle(`To amend title 38, United States Code, ${'to improve benefits '.repeat(20)}`);
    assert.equal(long.fontSize, 44);
    assert.ok(long.text.length <= 151, `cut to ${long.text.length} chars`);
    assert.ok(long.text.endsWith('…'));
    assert.ok(!/\s…$/.test(long.text), 'no space before the ellipsis');
  });

  // It draws

  const cases: Array<[string, Partial<Bill>]> = [
    ['became law', {}],
    ['vetoed', { progress_stage: 85 }],
    ['on the President’s desk', { progress_stage: 90 }],
    ['an unknown stage', { progress_stage: 55 }],
    ['no sponsor, no date, no policy area', {
      sponsor_first_name: '',
      sponsor_last_name: '',
      introduced_date: '',
      bill_subjects: undefined,
    }],
    ['a 280-character title with non-Latin-1 characters', {
      title: `Providing for congressional disapproval — “Ω” ${'of the rule submitted '.repeat(12)}`,
    }],
  ];
  for (const [name, overrides] of cases) {
    await it(`renders a 1200×630 PNG for ${name}`, async () => {
      const res = new ImageResponse(createElement(BillShareCard, { bill: bill(overrides) }), {
        ...SHARE_CARD_SIZE,
        fonts: shareCardFonts(),
      });
      const png = Buffer.from(await res.arrayBuffer());
      assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
      assert.equal(png.readUInt32BE(16), SHARE_CARD_SIZE.width);
      assert.equal(png.readUInt32BE(20), SHARE_CARD_SIZE.height);
      // WhatsApp drops previews over ~300 KB; the card is ~60–90 KB.
      assert.ok(png.length < 300_000, `${png.length} bytes`);
    });
  }

  if (failures.length) {
    console.error(`\nbillShareCard: ${passed} passed, ${failures.length} FAILED\n`);
    console.error(failures.join('\n\n'));
    process.exit(1);
  }
  console.log(`billShareCard: all ${passed} tests passed`);
}

main();
