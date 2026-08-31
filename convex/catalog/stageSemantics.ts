/**
 * Terminal stage vs. milestone (defect D13 from the 2026-08-30 accuracy audit).
 *
 * `calculateBillStage` in convex/billStage.ts returns EXACTLY ONE stage per
 * bill, chosen by precedence: the furthest point the bill reached. So the
 * stored `progressStage` is a mutually exclusive bucket, not a milestone flag,
 * and the stage-60 bucket contains only bills that stopped after one chamber —
 * every bill that later became law or was vetoed has left it.
 *
 * The incident: asked how many bills the Senate passed in the 119th Congress,
 * the assistant answered 194. 194 is the whole-Congress stage-60 bucket. It
 * includes 45 House-origin bills, most of which the Senate never voted on (the
 * stage code alone never says which chamber acted), and it omits the 104
 * bills that became law and the 2 that were vetoed — all of which necessarily
 * passed the Senate. The true figure is about 255.
 *
 * The catalog presents the codes as a ladder, which invites exactly that
 * misreading, so this module gives the milestone question its own vocabulary:
 * `milestoneStages` expands a milestone into every terminal stage that implies
 * it, and `stageSemanticsNote` tells the model to stop counting buckets.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */
import { BillStages } from "../billStage";

/**
 * The terminal stage codes, in ladder order. Mirrors VALID_STAGES in
 * filters.ts; stageSemantics.test.ts asserts the two stay identical, because a
 * code added on one side only would be silently unreachable on the other.
 */
export const STAGE_CODES: number[] = [
  BillStages.INTRODUCED,
  BillStages.IN_COMMITTEE,
  BillStages.PASSED_ONE_CHAMBER,
  BillStages.PASSED_BOTH_CHAMBERS,
  BillStages.VETOED,
  BillStages.TO_PRESIDENT,
  BillStages.SIGNED_BY_PRESIDENT,
  BillStages.BECAME_LAW,
];

/**
 * Every terminal stage that implies the bill reached AT LEAST the given
 * milestone.
 * milestoneStages(60) -> [60, 80, 85, 90, 95, 100]
 * milestoneStages(90) -> [90, 95, 100]           (85 excluded: vetoed never advanced)
 * milestoneStages(80) -> [80, 85, 90, 95, 100]   (85 included: it did pass both chambers)
 *
 * 85 is the only code that is not a rung on the ladder. A vetoed bill passed
 * both chambers and reached the President, then stopped: it never advanced to
 * 90/95/100. Numeric comparison alone gets this wrong in both directions —
 * `>= 90` would wrongly count vetoes as having gone further than they did, and
 * asking for milestone 85 must mean "was vetoed", not "got at least this far".
 *
 * Milestone 90 is where that rule is deliberately conservative and callers must
 * not take it literally as "reached the President". Every stage-85 bill in the
 * stored data (all 15, across the 118th and 119th) carries a "Presented to
 * President" action — a bill cannot be vetoed without being presented — so a
 * president's-desk count is milestoneStages(90) PLUS the stage-85 bills.
 * Excluding 85 here keeps 90 meaning "presented and still on the ladder"; only
 * 95 and 100 exclude a veto on the facts as well as by code. stageSemanticsNote
 * tells the model to add the vetoed bills back for desk questions, and
 * stageSemantics.test.ts pins that against real actions.
 *
 * Milestone 95 is an approximation in the other direction: it treats 100 as
 * implying a signature, and two 119th-Congress laws became law unsigned ("Sent
 * to Archivist of the United States unsigned", the ten-day rule). Dropping 100
 * from milestone 95 would be far worse — no bill in the stored data sits in the
 * 95 bucket, so "how many did the President sign" would answer zero — but a
 * signature count off this milestone is high by the unsigned enactments.
 *
 * An unrecognised `minimum` returns whatever the comparison yields (often an
 * empty list) rather than throwing — this runs behind model-supplied input, and
 * a thrown error mid-answer is worse than a filter that matches nothing.
 */
export function milestoneStages(minimum: number): number[] {
  if (minimum === BillStages.VETOED) return [BillStages.VETOED];
  return STAGE_CODES.filter((stage) =>
    stage === BillStages.VETOED
      ? minimum <= BillStages.PASSED_BOTH_CHAMBERS
      : stage >= minimum,
  );
}

/** True when `terminal` implies the bill reached `milestone`. */
export function reached(terminal: number, milestone: number): boolean {
  return milestoneStages(milestone).includes(terminal);
}

/**
 * Lower case and mid-sentence, deliberately: this text is dropped into prose
 * the model writes ("the bill is in committee"). BillStageDescriptions in
 * billStage.ts is Title Case because it labels UI chips — do not reuse it here.
 */
const DESCRIPTIONS: Record<number, string> = {
  [BillStages.INTRODUCED]: "introduced",
  [BillStages.IN_COMMITTEE]: "in committee",
  [BillStages.PASSED_ONE_CHAMBER]: "passed one chamber",
  [BillStages.PASSED_BOTH_CHAMBERS]: "passed both chambers",
  [BillStages.VETOED]: "vetoed",
  [BillStages.TO_PRESIDENT]: "sent to the president",
  [BillStages.SIGNED_BY_PRESIDENT]: "signed by the president",
  [BillStages.BECAME_LAW]: "became law",
};

/** Reader-facing description of a terminal stage, e.g. 40 -> "in committee". */
export function stageDescription(stage: number): string {
  // Unknown codes name themselves rather than throwing or guessing a
  // neighbour: an honest "unknown stage code 55" is recoverable, a wrong
  // description is not.
  return DESCRIPTIONS[stage] ?? `unknown stage code ${stage}`;
}

/**
 * The catalog gotcha explaining bucket-vs-milestone. Written for the model, so
 * it states the rule, the wrong answer it prevents, and what to do instead.
 *
 * No counts appear in this text on purpose. It ships inside a prompt, the data
 * behind it resyncs, and a stale number here would be read out as fact.
 */
export function stageSemanticsNote(): string {
  return (
    "progressStage is a bill's CURRENT state — the single furthest point it " +
    "reached. The codes are mutually exclusive buckets, NOT cumulative " +
    "milestones: every bill carries exactly one, and a bill that went further " +
    "has left the earlier bucket entirely. So counting the stage-60 bucket to " +
    "answer 'how many bills passed a chamber' undercounts by everything that " +
    "went further — the bills that passed both chambers, reached the " +
    "President, were vetoed, or became law all passed a chamber and none of " +
    "them are in that bucket. To answer a milestone question ('passed the " +
    "Senate', 'cleared both chambers', 'reached the President'), filter on " +
    "reachedStage, which matches every terminal stage at or beyond the " +
    "milestone. progressStage answers only 'where did it stop'. " +
    "Exception — 85 (vetoed) sits off the ladder: a vetoed bill did pass both " +
    "chambers, so reachedStage 80 includes it, but it never advanced past the " +
    "veto, so reachedStage 90, 95 and 100 all exclude it. A veto happens AFTER " +
    "the bill is presented, so a count of bills that reached the President's " +
    "desk is reachedStage 90 PLUS the bills at stage 85 — say so rather than " +
    "reporting reachedStage 90 alone. And no stage code " +
    "says WHICH chamber acted: stage 60 means one chamber passed it, not that " +
    "the Senate did."
  );
}
