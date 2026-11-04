/**
 * Tests for the bill page's "What happens next" line (lib/bill-next-step.ts)
 * and the "In short" lead's split of the CRS summary (lib/seo.ts). `today` is
 * always pinned.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { billNextStep, daysLeftPhrase, proposesAmendment } from './bill-next-step';
import { billLead } from './seo';
import { BillStages } from './utils/bill-stages';
import type { Bill } from './types/bill';

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split('\n').join('\n    ') : String(err)}`,
    );
  }
}

// The 119th Congress ends on Jan 3, 2027.
const TODAY = '2026-11-04';
const base = { congress: 119, introducedDate: '2025-03-01', today: TODAY };

it('a law has nothing next and no clock', () => {
  const next = billNextStep({ ...base, stage: BillStages.BECAME_LAW, billType: 'hr' });
  assert.equal(next?.text, 'Nothing more: it is law.');
  assert.equal(next?.daysLeft, null);
});

it('a bill in committee gets the next step on the road and the days left', () => {
  const next = billNextStep({ ...base, stage: BillStages.IN_COMMITTEE, billType: 's' });
  // A condition, not a forecast: most bills never leave committee.
  assert.equal(
    next?.text,
    'Next on the road: the committee would have to approve it and send it to the full Senate. Most bills never get this far.',
  );
  assert.equal(next?.daysLeft, 60);
  assert.equal(daysLeftPhrase(60, 119), '60 days left in the 119th Congress');
});

it('a bill that passed one chamber does not guess which chamber is next', () => {
  const next = billNextStep({ ...base, stage: BillStages.PASSED_ONE_CHAMBER, billType: 'hr' });
  assert.match(next!.text, /the other chamber would have to pass the same text/);
});

it('an agreed-to simple resolution is finished, not waiting on the Senate', () => {
  const next = billNextStep({ ...base, stage: BillStages.PASSED_ONE_CHAMBER, billType: 'hres' });
  assert.equal(next?.text, 'Nothing more: once the House agrees to it, it is finished.');
  assert.equal(next?.daysLeft, null);
});

it('a concurrent resolution agreed by one chamber says "agree to", not "pass"', () => {
  const next = billNextStep({ ...base, stage: BillStages.PASSED_ONE_CHAMBER, billType: 'hconres' });
  assert.match(next!.text, /would have to agree to the same text/);
});

it('a bill from an ended Congress expired; it is never "next on the road"', () => {
  const next = billNextStep({ ...base, congress: 118, stage: BillStages.IN_COMMITTEE, billType: 'hr' });
  assert.match(next!.text, /^Nothing more: it expired when the 118th Congress ended/);
  assert.equal(next?.daysLeft, null);
});

it('a bill left on the desk when the Congress ended is not called expired', () => {
  const next = billNextStep({ ...base, congress: 118, stage: BillStages.TO_PRESIDENT, billType: 'hr' });
  assert.match(next!.text, /on the President’s desk\. The record shows no signature or veto\./);
});

it('a veto in a live Congress names the override, with the clock', () => {
  const next = billNextStep({ ...base, stage: BillStages.VETOED, billType: 'hr' });
  assert.match(next!.text, /two-thirds to override the veto/);
  assert.equal(next?.daysLeft, 60);
});

it('out of committee, the vote is a condition, not a forecast', () => {
  const next = billNextStep({ ...base, stage: BillStages.OUT_OF_COMMITTEE, billType: 'hr' });
  assert.equal(next?.text, 'Next on the road: the full House would have to vote on it.');
});

// S.1318 (119th): the House passed a substitute and the Senate voted 47-52 not
// to take up the House message, yet the page said "both voted yes on the same
// words. Next it goes to the President." Stage 80 means each chamber passed a
// version (convex/billStage.ts), not the same one.
it('passed both chambers never claims the same words or goes straight to the President', () => {
  const next = billNextStep({ ...base, stage: BillStages.PASSED_BOTH_CHAMBERS, billType: 's' });
  assert.equal(next?.text, 'Next on the road: both chambers agree on one text, then it goes to the President.');
  assert.doesNotMatch(next!.text, /same words/);
});

it('a proposed constitutional amendment goes to the states, never the President', () => {
  const title = 'Proposing an amendment to the Constitution of the United States relative to the length of terms.';
  assert.ok(proposesAmendment('hjres', title));
  assert.ok(!proposesAmendment('hr', title));
  assert.ok(!proposesAmendment('sjres', 'Providing for congressional disapproval of a rule.'));
  const next = billNextStep({ ...base, stage: BillStages.PASSED_BOTH_CHAMBERS, billType: 'hjres', title });
  assert.match(next!.text, /goes to the states/);
  assert.doesNotMatch(next!.text, /President/);
  const ordinary = billNextStep({ ...base, stage: BillStages.PASSED_BOTH_CHAMBERS, billType: 'sjres', title: 'Providing for congressional disapproval of a rule.' });
  assert.match(ordinary!.text, /President/);
});

it('on the desk: the 10 days run from arrival, and doing nothing is not a veto', () => {
  const next = billNextStep({ ...base, stage: BillStages.TO_PRESIDENT, billType: 'hr' });
  assert.match(next!.text, /from when it arrives/);
  assert.match(next!.text, /becomes law anyway/);
  assert.match(next!.text, /pocket veto/);
});

it('an unknown stage says nothing', () => {
  assert.equal(billNextStep({ ...base, stage: 70, billType: 'hr' }), null);
});

// The lead and what follows it: no sentence printed twice.

function bill(overrides: Partial<Bill>): Bill {
  return {
    id: '119hr1',
    bill_type: 'hr',
    bill_type_label: 'H.R.',
    bill_number: '1',
    congress: 119,
    title: 'Social Security Guarantee Act of 2025',
    introduced_date: '2025-03-01',
    progress_stage: 40,
    sponsor_first_name: 'Jane',
    sponsor_last_name: 'Doe',
    sponsor_party: 'D',
    sponsor_state: 'MI',
    ...overrides,
  } as Bill;
}

it('the rest of the summary starts after the lead sentence', () => {
  const lead = billLead(
    bill({
      latest_summary:
        '<p>This bill directs the Department of the Interior to remove deed restrictions. The restrictions include easements.</p>',
    }),
  );
  assert.equal(lead.text, 'This bill directs the Department of the Interior to remove deed restrictions.');
  assert.equal(lead.split, true);
  assert.equal(lead.rest, 'The restrictions include easements.');
});

it('a one-sentence summary leaves nothing to repeat', () => {
  const lead = billLead(bill({ latest_summary: '<p>This bill renames a post office in Ohio.</p>' }));
  assert.equal(lead.rest, '');
});

it('a short-title heading on its own line is not the lead', () => {
  const lead = billLead(
    bill({
      latest_summary:
        '<p><strong>Clergy Act</strong></p><p>This bill exempts members of the clergy from a tax. It also sets a date.</p>',
    }),
  );
  assert.equal(lead.text, 'This bill exempts members of the clergy from a tax.');
  assert.equal(lead.rest, 'It also sets a date.');
});

it('a lead cut short leaves the whole summary below it', () => {
  const long = `This bill ${'requires the agency to study and report on the matter, '.repeat(8)}today.`;
  const lead = billLead(bill({ latest_summary: `<p>${long} Then more.</p>` }));
  assert.equal(lead.split, false);
  assert.ok(lead.text.endsWith('…'));
  assert.ok(lead.rest.startsWith('This bill requires'));
});

if (failures.length > 0) {
  console.error(`\nbill-next-step: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log(`bill-next-step: ${passed} passed`);
