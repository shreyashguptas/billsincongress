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
import { BillStages, proposesAmendment, stagePath } from './utils/bill-stages';
import { congressClock, formatDay, type JourneyEvent } from './bill-journey';
import { formatCongressOrdinal } from './congress';
import { formatCount } from './utils/format';

export type NextStep = {
  text: string;
  /** Days left in the Congress, for a measure that can still move; else null. */
  daysLeft: number | null;
};

export { proposesAmendment };

const CHAMBER = { house: 'House', senate: 'Senate' } as const;

/**
 * A vetoed bill's failed override vote, in words: "The House voted on
 * overriding the veto on Jan 8, 2026. It fell short of two in three, 248 to
 * 177." H.R. 131 (119th) read "It becomes law only if the House and the Senate
 * each vote by two-thirds", with days left on the clock, after the House had
 * already voted and failed. Null when the record shows no failed override.
 */
function failedOverride(events: JourneyEvent[] | null | undefined): string | null {
  const vote = (events ?? []).find((e) => e.kind === 'override_failed');
  if (!vote) return null;
  const chamber = vote.chamber ? `The ${CHAMBER[vote.chamber]}` : 'Congress';
  const tally =
    vote.yeas !== undefined && vote.nays !== undefined ? `, ${vote.yeas} to ${vote.nays}` : '';
  return `${chamber} voted on overriding the veto on ${formatDay(vote.date)}. It fell short of two in three${tally}.`;
}

export function billNextStep({
  stage,
  billType,
  congress,
  introducedDate,
  today,
  title,
  events,
}: {
  stage: number;
  billType: string | null | undefined;
  congress: number;
  introducedDate: string;
  today: string;
  /** The official title, to recognise a proposed constitutional amendment. */
  title?: string | null;
  /** The journey's moments, to see a failed veto override. */
  events?: JourneyEvent[] | null;
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
      return done(`Nothing more: the ${ordinal} Congress ended, and the veto stands.`);
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
  const amendment = proposesAmendment(billType, title);
  switch (stage) {
    case BillStages.VETOED:
      // No clock: a veto is not a step on the way. Stage 85 also holds pocket
      // vetoes, which no vote can override, and vetoes whose override already
      // failed (convex/billStage.ts), so the days left would read as time to act.
      // A pocket veto (the journey labels it, convex/billJourney.ts) has no
      // override at all; saying "it becomes law only if… two-thirds" there is false.
      if ((events ?? []).some((e) => e.kind === 'vetoed' && /pocket/i.test(e.label))) {
        return done('Nothing more: this was a pocket veto, made while Congress was away. No vote can override it.');
      }
      return done(
        failedOverride(events) ??
          'A veto can be overridden only if the House and the Senate each vote for it by two-thirds. A pocket veto, made while Congress is away, cannot be.',
      );
    case BillStages.INTRODUCED:
      return open('Next on the road: it is usually sent to a committee.');
    case BillStages.IN_COMMITTEE:
      // "Usually": a bill can reach the floor without its committee (a
      // suspension vote with the committee discharged, a discharge petition,
      // the Senate's Rule XIV).
      return open(
        `Next on the road: usually the committee has to approve it and send it to the full ${home}. Most bills never get this far.`,
      );
    case BillStages.OUT_OF_COMMITTEE:
      return open(`Next on the road: the full ${home} would have to vote on it.`);
    case BillStages.PASSED_ONE_CHAMBER:
      return open(`Next on the road: the other chamber would have to ${pass} the same text.`);
    case BillStages.PASSED_BOTH_CHAMBERS:
      // Each chamber has passed a version, not necessarily the same one
      // (convex/billStage.ts): a bill in conference is stage 80 too.
      if (amendment) {
        return open(
          'Next on the road: once both chambers agree on one text, each by two-thirds, it goes to the states. It joins the Constitution only if three in four states ratify it.',
        );
      }
      // A condition, not a forecast: on S. 1318 (119th) the Senate refused,
      // 47-52, to take up the House's version.
      return open('Next on the road: both chambers would have to agree on one text before it can go to the President.');
    case BillStages.TO_PRESIDENT:
      // Article I, section 7: it dies only when an adjournment keeps the
      // President from sending it back. Congress adjourns every day.
      return open(
        'The President has 10 days (not counting Sundays) from when it arrives to sign or veto it. If the President does neither, it becomes law anyway, unless Congress has adjourned in a way that stops the President from sending it back; then it dies (a pocket veto).',
      );
    default:
      // A stage the record does not name: say nothing rather than guess.
      return null;
  }
}

/** "60 days left in the 119th Congress". */
export function daysLeftPhrase(daysLeft: number, congress: number): string {
  return `${formatCount(daysLeft)} ${daysLeft === 1 ? 'day' : 'days'} left in the ${formatCongressOrdinal(congress)} Congress`;
}
