// Relative, not '@/…': convex/emailStyle.ts imports this file, and the Convex
// bundler does not know the '@/' alias.
import { measureClass } from '../../convex/catalog/measureType';

export const BillStages = {
  INTRODUCED: 20,
  IN_COMMITTEE: 40,
  PASSED_ONE_CHAMBER: 60,
  PASSED_BOTH_CHAMBERS: 80,
  VETOED: 85,
  TO_PRESIDENT: 90,
  SIGNED_BY_PRESIDENT: 95,
  BECAME_LAW: 100,
} as const;

export type BillStage = typeof BillStages[keyof typeof BillStages];

export const BillStageDescriptions: Record<BillStage, string> = {
  [BillStages.INTRODUCED]: 'Introduced',
  [BillStages.IN_COMMITTEE]: 'In Committee',
  [BillStages.PASSED_ONE_CHAMBER]: 'Passed One Chamber',
  [BillStages.PASSED_BOTH_CHAMBERS]: 'Passed Both Chambers',
  [BillStages.VETOED]: 'Vetoed',
  [BillStages.TO_PRESIDENT]: 'To President',
  [BillStages.SIGNED_BY_PRESIDENT]: 'Signed by President',
  [BillStages.BECAME_LAW]: 'Became Law',
} as const;

export function isValidStage(stage: number): stage is BillStage {
  return Object.values(BillStages).includes(stage as BillStage);
}

/**
 * Short stage labels for `CompactBillCard`, the in-answer entity card — which
 * is why D29 was visible in answers and nowhere else.
 *
 * Typed `Record<BillStage, string>` on purpose. The card used to keep its own
 * copy of this map and that copy had no entry for 85, so a vetoed bill's card
 * read "Unknown" while the prose above it and the bill page below both said
 * "Vetoed" (defect D29 from the 2026-08-30 accuracy audit). Keyed by the type,
 * a stage added to `BillStages` now fails the build here instead of silently
 * rendering as unknown.
 *
 * Shorter than `BillStageDescriptions` on purpose: these strings sit beside a
 * sponsor name in a 400px panel.
 */
export const CompactStageLabel: Record<BillStage, string> = {
  [BillStages.INTRODUCED]: 'Introduced',
  [BillStages.IN_COMMITTEE]: 'In committee',
  [BillStages.PASSED_ONE_CHAMBER]: 'Passed one chamber',
  [BillStages.PASSED_BOTH_CHAMBERS]: 'Passed both',
  [BillStages.VETOED]: 'Vetoed',
  [BillStages.TO_PRESIDENT]: 'To president',
  [BillStages.SIGNED_BY_PRESIDENT]: 'Signed',
  [BillStages.BECAME_LAW]: 'Became law',
};

/**
 * Label a stage for a compact card.
 *
 * An unrecognised code names itself rather than borrowing a neighbour's label —
 * "Stage 55" is recoverable, a confidently wrong stage is not. Only a
 * non-numeric stage falls back to "Unknown", since "Stage NaN" says nothing.
 *
 * Given a resolution's `billType`, a recognised stage takes the resolution's
 * own words (`measureStageLabel`): "Agreed to by the House", never "Passed one
 * chamber", which reads as half-way to a law it can never become.
 */
export function compactStageLabel(stage: number, billType?: string | null): string {
  if (isValidStage(stage)) {
    return stagePath(billType) === 'law' ? CompactStageLabel[stage] : measureStageLabel(stage, billType);
  }
  return Number.isFinite(stage) ? `Stage ${stage}` : 'Unknown';
}

// The 7-step main path a bill travels. Vetoed sits off this path: a vetoed
// bill made it as far as the President (step 5) but is not advancing.
const StageSteps: Record<BillStage, number> = {
  [BillStages.INTRODUCED]: 1,
  [BillStages.IN_COMMITTEE]: 2,
  [BillStages.PASSED_ONE_CHAMBER]: 3,
  [BillStages.PASSED_BOTH_CHAMBERS]: 4,
  [BillStages.VETOED]: 5,
  [BillStages.TO_PRESIDENT]: 5,
  [BillStages.SIGNED_BY_PRESIDENT]: 6,
  [BillStages.BECAME_LAW]: 7,
} as const;

export const TOTAL_STAGE_STEPS = 7;

/**
 * The road a measure travels (documentation/brand.md, "The road a measure
 * travels"). Bills and joint resolutions can become law and take the seven-step
 * road. A simple resolution binds one chamber and is finished once that chamber
 * agrees to it; a concurrent resolution is finished once both chambers do.
 * Neither ever goes to the President, so drawing them on the road to law showed
 * an adopted resolution as half-way to the President.
 *
 * Anything unrecognised takes the law road, which is what every measure showed
 * before this existed: an unknown type is no evidence of a shorter road.
 */
export type StagePath = 'law' | 'simple_resolution' | 'concurrent_resolution';

export function stagePath(billType?: string | null): StagePath {
  const cls = billType ? measureClass(billType) : null;
  return cls === 'simple_resolution' || cls === 'concurrent_resolution' ? cls : 'law';
}

/**
 * The type part of a printed bill number: "H.Con.Res. 14" → "H.Con.Res.". The
 * in-answer cards carry only the printed number (convex/catalog/fetch.ts builds
 * it as `${billTypeLabel} ${billNumber}`), and `stagePath` reads a type label
 * as well as a type code. Anything that is not "<type> <number>" gives null,
 * which takes the road to law, as every card did before.
 */
export function billTypeOfLabel(label?: string | null): string | null {
  const match = label?.trim().match(/^(.+?)\s+\d+$/);
  return match && measureClass(match[1]) ? match[1] : null;
}

/**
 * A resolution's steps by stored stage. A stage missing here is off that road
 * (a resolution is never vetoed, sent to or signed by the President) and reads
 * as unknown rather than as a step it cannot have reached.
 */
const RESOLUTION_STEPS: Record<Exclude<StagePath, 'law'>, Partial<Record<BillStage, number>>> = {
  simple_resolution: {
    [BillStages.INTRODUCED]: 1,
    [BillStages.IN_COMMITTEE]: 2,
    [BillStages.PASSED_ONE_CHAMBER]: 3,
  },
  concurrent_resolution: {
    [BillStages.INTRODUCED]: 1,
    [BillStages.IN_COMMITTEE]: 2,
    [BillStages.PASSED_ONE_CHAMBER]: 3,
    [BillStages.PASSED_BOTH_CHAMBERS]: 4,
  },
};

export function getStageStep(
  stage: number,
  billType?: string | null,
): {
  step: number;
  total: number;
  isVetoed: boolean;
} {
  const path = stagePath(billType);
  if (path !== 'law') {
    const total = PATH_LABELS[path].length;
    const step = isValidStage(stage) ? (RESOLUTION_STEPS[path][stage] ?? 0) : 0;
    return { step, total, isVetoed: false };
  }
  // An unrecognised code proves no step at all. Step 0, not 1: every caller
  // draws the step ("Stage 1 of 7", a filled segment), and a confidently wrong
  // stage is worse than none.
  if (!isValidStage(stage)) {
    return { step: 0, total: TOTAL_STAGE_STEPS, isVetoed: false };
  }
  return {
    step: StageSteps[stage],
    total: TOTAL_STAGE_STEPS,
    isVetoed: stage === BillStages.VETOED,
  };
}

/** True when `stage` is a step on this measure's road — what may take a stage's colour. */
export function isStageOnPath(stage: number, billType?: string | null): boolean {
  return getStageStep(stage, billType).step > 0;
}

/**
 * The seven step names under a bill page's `StageTrack`
 * (components/brand/status.tsx), in step order, matching `StageSteps` above.
 *
 * Vetoed is NOT one of them — it is where a bill stops, not a step on the way to
 * law. An earlier pipeline drew "Vetoed" inline as an eighth step and marked
 * every step up to the current one complete, so every bill that became law
 * displayed a check-marked veto it had never been through. The track instead
 * fills a vetoed bill to step 5 in the vetoed colour and says "Vetoed" in words.
 */
export const MAIN_PATH_LABELS = [
  'Introduced',
  'Committee',
  'One chamber',
  'Both chambers',
  'To President',
  'Signed',
  'Law',
] as const;

/**
 * A stage as the interface writes it: sentence case, the way a reader would say
 * it (documentation/brand.md, "Voice"). `BillStageDescriptions` above stays as
 * the stored vocabulary — it mirrors convex/billStage.ts, and the account page
 * maps saved descriptions back to stage codes through it.
 */
export const StageLabel: Record<BillStage, string> = {
  [BillStages.INTRODUCED]: 'Introduced',
  [BillStages.IN_COMMITTEE]: 'In committee',
  [BillStages.PASSED_ONE_CHAMBER]: 'Passed one chamber',
  [BillStages.PASSED_BOTH_CHAMBERS]: 'Passed both chambers',
  [BillStages.VETOED]: 'Vetoed',
  [BillStages.TO_PRESIDENT]: 'On the President’s desk',
  [BillStages.SIGNED_BY_PRESIDENT]: 'Signed by the President',
  [BillStages.BECAME_LAW]: 'Became law',
};

export function stageLabel(stage: number): string {
  return isValidStage(stage) ? StageLabel[stage] : 'Unknown';
}

/** The step names under the track for each road, in step order. */
export const PATH_LABELS: Record<StagePath, readonly string[]> = {
  law: MAIN_PATH_LABELS,
  simple_resolution: ['Introduced', 'Committee', 'Agreed to'],
  concurrent_resolution: ['Introduced', 'Committee', 'One chamber', 'Agreed to'],
};

/** "House" / "Senate": every Senate type starts with "s" (s, sres, S.Con.Res.). */
function chamberOf(billType: string): 'House' | 'Senate' {
  return billType.trim().toLowerCase().startsWith('s') ? 'Senate' : 'House';
}

/**
 * The stage as the interface writes it, on the measure's own road. A resolution
 * is "agreed to", the record's word for it, never "passed": "passed one chamber"
 * invites "…and then the other one?", and for a simple resolution there is none.
 * A stage off the road is "Unknown", as an unrecognised code is.
 */
export function measureStageLabel(stage: number, billType?: string | null): string {
  const path = stagePath(billType);
  if (path === 'law') return stageLabel(stage);
  if (!isStageOnPath(stage, billType)) return 'Unknown';
  if (stage === BillStages.PASSED_ONE_CHAMBER) {
    return path === 'simple_resolution'
      ? `Agreed to by the ${chamberOf(billType!)}`
      : 'Agreed to by one chamber';
  }
  if (stage === BillStages.PASSED_BOTH_CHAMBERS) return 'Agreed to by both chambers';
  return stageLabel(stage);
}

/**
 * The line under the stage name: "Stage 3 of 7", "Stopped at the President",
 * "Stage unknown". The bill page and its share card both print it.
 */
export function stageNote(stage: number, billType?: string | null): string {
  const { step, total, isVetoed } = getStageStep(stage, billType);
  if (isVetoed) return 'Stopped at the President';
  return step > 0 ? `Stage ${step} of ${total}` : 'Stage unknown';
}

/**
 * One sentence on why a resolution's track is short, for under the track on its
 * bill page. Null for the law road, which needs no explaining.
 */
export function stagePathNote(billType?: string | null): string | null {
  const path = stagePath(billType);
  if (path === 'concurrent_resolution') {
    return (
      'A concurrent resolution is finished once the House and the Senate both agree to it. ' +
      'It never goes to the President, and it is not a law.'
    );
  }
  if (path === 'simple_resolution') {
    const chamber = chamberOf(billType!);
    const other = chamber === 'House' ? 'Senate' : 'House';
    return (
      `A simple resolution is the ${chamber}’s business alone. It is finished once the ` +
      `${chamber} agrees to it: it never goes to the ${other} or the President, and it is not a law.`
    );
  }
  return null;
}
