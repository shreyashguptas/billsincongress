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
  // A condition, not a forecast: most bills never leave committee. And
  // "usually": a bill can reach the floor without its committee's approval
  // (suspension with the committee discharged, a discharge petition, Rule XIV).
  // It read "the committee would have to approve it", a rule with exceptions.
  assert.equal(
    next?.text,
    'Next on the road: usually the committee has to approve it and send it to the full Senate. Most bills never get this far.',
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

it('a veto in a live Congress names the override rule, and no clock', () => {
  // Stage 85 also holds pocket vetoes, which no vote overrides, and vetoes
  // whose override already failed: "60 days left" read as time to act.
  const next = billNextStep({ ...base, stage: BillStages.VETOED, billType: 'hr' });
  assert.equal(
    next?.text,
    'A veto can be overridden only if the House and the Senate each vote for it by two-thirds. A pocket veto, made while Congress is away, cannot be.',
  );
  assert.equal(next?.daysLeft, null);
});

// A pocket-vetoed bill read "It becomes law only if the House and the Senate
// each vote by two-thirds to override the veto": no vote can override one.
it('a pocket veto says no vote can override it', () => {
  const next = billNextStep({
    ...base,
    stage: BillStages.VETOED,
    billType: 'hr',
    events: [{ date: '2026-10-30', kind: 'vetoed', label: 'Pocket vetoed by the President' }],
  });
  assert.equal(next?.text, 'Nothing more: this was a pocket veto, made while Congress was away. No vote can override it.');
  assert.doesNotMatch(next!.text, /two-thirds/);
});

// "Ended without overriding the veto" implied an override was possible for a
// pocket veto too.
it('a veto from an ended Congress says the veto stands', () => {
  const next = billNextStep({ ...base, congress: 118, stage: BillStages.VETOED, billType: 'hr' });
  assert.equal(next?.text, 'Nothing more: the 118th Congress ended, and the veto stands.');
});

// /bills/131hr119: "It becomes law only if the House and the Senate each vote
// by two-thirds to override the veto", "60 days left in the 119th Congress",
// after the House had voted on Jan 8, 2026 and fallen short, 248-177.
it('a veto whose override failed says the vote happened, not that it still can', () => {
  const next = billNextStep({
    ...base,
    stage: BillStages.VETOED,
    billType: 'hr',
    events: [
      { date: '2025-12-29', kind: 'vetoed', label: 'Vetoed by the President' },
      {
        date: '2026-01-08',
        kind: 'override_failed',
        chamber: 'house',
        label: 'The House voted on overriding the veto; it fell short of two-thirds',
        yeas: 248,
        nays: 177,
      },
    ],
  });
  assert.equal(
    next?.text,
    'The House voted on overriding the veto on Jan 8, 2026. It fell short of two in three, 248 to 177.',
  );
  assert.doesNotMatch(next!.text, /becomes law only if/);
  assert.equal(next?.daysLeft, null);
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
  // It read "both chambers agree on one text, then it goes to the President",
  // a forecast, on S. 1318, where the Senate had refused to take up the House's.
  assert.equal(
    next?.text,
    'Next on the road: both chambers would have to agree on one text before it can go to the President.',
  );
  assert.doesNotMatch(next!.text, /same words/);
});

it('a proposed constitutional amendment goes to the states, never the President', () => {
  const title = 'Proposing an amendment to the Constitution of the United States relative to the length of terms.';
  assert.ok(proposesAmendment('hjres', title));
  assert.ok(!proposesAmendment('hr', title));
  assert.ok(!proposesAmendment('sjres', 'Providing for congressional disapproval of a rule.'));
  const next = billNextStep({ ...base, stage: BillStages.PASSED_BOTH_CHAMBERS, billType: 'hjres', title });
  assert.match(next!.text, /goes to the states/);
  assert.match(next!.text, /two-thirds/);
  assert.doesNotMatch(next!.text, /President/);
  const ordinary = billNextStep({ ...base, stage: BillStages.PASSED_BOTH_CHAMBERS, billType: 'sjres', title: 'Providing for congressional disapproval of a rule.' });
  assert.match(ordinary!.text, /President/);
});

it('on the desk: the 10 days run from arrival, and doing nothing is not a veto', () => {
  const next = billNextStep({ ...base, stage: BillStages.TO_PRESIDENT, billType: 'hr' });
  assert.match(next!.text, /from when it arrives/);
  assert.match(next!.text, /becomes law anyway/);
  assert.match(next!.text, /pocket veto/);
  // It read "unless Congress has adjourned; then it dies". Congress adjourns
  // every day; a bill dies only when an adjournment stops its return (Art. I, §7).
  assert.doesNotMatch(next!.text, /unless Congress has adjourned;/);
  assert.match(next!.text, /adjourned in a way that stops the President from sending it back/);
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

// /bills/4199s118: "Judicial Understaffing Delays Getting Emergencies Solved
// Act of 2024 or the JUDGES Act of 2024 This bill creates…": a short-title
// heading too long for the old cap, run into the sentence with no stop.
it('a long short-title heading is not part of the lead', () => {
  const lead = billLead(
    bill({
      title: 'JUDGES Act of 2024',
      latest_summary:
        '<p><strong>Judicial Understaffing Delays Getting Emergencies Solved Act of 2024 or the JUDGES Act of 2024</strong></p><p>This bill creates 63 new permanent U.S. district court judgeships over a 10-year period and 3 temporary U.S. district court judgeships in 2025. &nbsp;The President must appoint additional judges.</p>',
    }),
  );
  assert.equal(
    lead.text,
    'This bill creates 63 new permanent U.S. district court judgeships over a 10-year period and 3 temporary U.S. district court judgeships in 2025.',
  );
  assert.equal(lead.split, true);
});

it('a short title run into the first sentence without a heading is dropped too', () => {
  const lead = billLead(
    bill({ latest_summary: 'Lower Costs Act of 2025 This bill caps a fee. It also sets a date.' }),
  );
  assert.equal(lead.text, 'This bill caps a fee.');
  assert.equal(lead.rest, 'It also sets a date.');
});

// /bills/1hr118: "DIVISION A--INCREASING AMERICAN ENERGY PRODUCTION… (Sec.
// 10001) In carrying out…", a part's heading printed as "In short".
it('a summary that opens with a division heading gets no lead, and all of it below', () => {
  const summary =
    '<p><b>Lower Energy Costs Act</b></p> <p>DIVISION A--INCREASING AMERICAN ENERGY PRODUCTION, EXPORTS, INFRASTRUCTURE, AND CRITICAL MINERALS PROCESSING</p> <p>(Sec. 10001) In carrying out the Department of Energy Organization Act, the Department of Energy (DOE) must assess the supply of critical energy resources.</p>';
  const lead = billLead(bill({ title: 'Lower Energy Costs Act', latest_summary: summary }));
  assert.equal(lead.text, '');
  assert.equal(lead.from, 'summary');
  assert.equal(lead.split, false);
  assert.ok(lead.rest.startsWith('DIVISION A--INCREASING'));
});

it('a first sentence with no stop is not printed as a sentence', () => {
  const lead = billLead(bill({ latest_summary: '<p>Provides for a study of rail safety</p>' }));
  assert.equal(lead.text, '');
  assert.equal(lead.rest, 'Provides for a study of rail safety');
});

if (failures.length > 0) {
  console.error(`\nbill-next-step: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log(`bill-next-step: ${passed} passed`);
