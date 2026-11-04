/**
 * "What happens next", for the bill page's "Where it stands" card
 * (documentation/brand.md, "Status panel").
 *
 * Every sentence is a rule of the process, the next step on the measure's own
 * road, never a forecast about this one: "next on the road" says where the road
 * goes, not that this bill will travel it. Where the road has a common
 * exception (a measure can be taken up without one), the sentence says
 * "usually". Nothing here counts or predicts; the days left is the calendar.
 *
 * Pure and date-explicit (`today` is passed in), so the server render and the
 * browser agree and the tests can pin a day.
 */
import { BillStages, stagePath } from './utils/bill-stages';
import { congressClock } from './bill-journey';
import { formatCongressOrdinal } from './congress';
import { formatCount } from './utils/format';

export type NextStep = {
  text: string;
  /** Days left in the Congress, for a measure that can still move; else null. */
  daysLeft: number | null;
};

export function billNextStep({
  stage,
  billType,
  congress,
  introducedDate,
  today,
}: {
  stage: number;
  billType: string | null | undefined;
  congress: number;
  introducedDate: string;
  today: string;
}): NextStep | null {
  const type = (billType ?? '').trim().toLowerCase();
  const path = stagePath(billType);
  const home = type.startsWith('s') ? 'Senate' : 'House';
  const clock = congressClock(congress, today, introducedDate || today);
  const ordinal = formatCongressOrdinal(congress);
  const done = (text: string): NextStep => ({ text, daysLeft: null });
  const open = (text: string): NextStep => ({
    text,
    daysLeft: clock.ended ? null : clock.daysLeft,
  });

  // Finished: nothing further happens to it.
  if (stage === BillStages.BECAME_LAW) return done('Nothing more: it is law.');
  if (stage === BillStages.SIGNED_BY_PRESIDENT) {
    return done('Nothing more: a bill the President signs is law.');
  }
  if (path === 'simple_resolution' && stage >= BillStages.PASSED_ONE_CHAMBER) {
    return done(`Nothing more: once the ${home} agrees to it, it is finished.`);
  }
  if (path === 'concurrent_resolution' && stage >= BillStages.PASSED_BOTH_CHAMBERS) {
    return done('Nothing more: once both chambers agree to it, it is finished.');
  }

  // The Congress it was introduced in is over.
  if (clock.ended) {
    if (stage === BillStages.VETOED) {
      return done(`Nothing more: the ${ordinal} Congress ended without overriding the veto.`);
    }
    if (stage === BillStages.TO_PRESIDENT) {
      return done(
        `Nothing more: the ${ordinal} Congress ended with it on the President’s desk. The record shows no signature or veto.`,
      );
    }
    return done(
      `Nothing more: it expired when the ${ordinal} Congress ended. To move again it would have to be introduced again.`,
    );
  }

  const pass = path === 'law' ? 'pass' : 'agree to';
  switch (stage) {
    case BillStages.VETOED:
      return open(
        'It becomes law only if the House and the Senate each vote by two-thirds to override the veto.',
      );
    case BillStages.INTRODUCED:
      return open('Next on the road: it is usually sent to a committee.');
    case BillStages.IN_COMMITTEE:
      return open(`Next on the road: the committee sends it on to the full ${home}.`);
    case BillStages.OUT_OF_COMMITTEE:
      return open(`Next on the road: the full ${home} votes on it.`);
    case BillStages.PASSED_ONE_CHAMBER:
      return open(`Next on the road: the other chamber would have to ${pass} the same text.`);
    case BillStages.PASSED_BOTH_CHAMBERS:
      return open('Next on the road: it goes to the President to sign or veto.');
    case BillStages.TO_PRESIDENT:
      return open('The President has 10 days, not counting Sundays, to sign or veto it.');
    default:
      // A stage the record does not name: say nothing rather than guess.
      return null;
  }
}

/** "60 days left in the 119th Congress". */
export function daysLeftPhrase(daysLeft: number, congress: number): string {
  return `${formatCount(daysLeft)} ${daysLeft === 1 ? 'day' : 'days'} left in the ${formatCongressOrdinal(congress)} Congress`;
}
