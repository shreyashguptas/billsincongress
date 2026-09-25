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

export const BillStageOrder: BillStage[] = [
  BillStages.INTRODUCED,
  BillStages.IN_COMMITTEE,
  BillStages.PASSED_ONE_CHAMBER,
  BillStages.PASSED_BOTH_CHAMBERS,
  BillStages.VETOED,
  BillStages.TO_PRESIDENT,
  BillStages.SIGNED_BY_PRESIDENT,
  BillStages.BECAME_LAW,
];

export function getStageDescription(stage: number): string {
  return BillStageDescriptions[stage as BillStage] || 'Unknown';
}

export function isValidStage(stage: number): stage is BillStage {
  return Object.values(BillStages).includes(stage as BillStage);
}

/**
 * Short stage labels for `CompactBillCard`. Its only caller today is the
 * in-answer entity card — `BillCard`'s `compact` variant exists but nothing
 * renders it — which is why D29 was visible in answers and nowhere else.
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
 */
export function compactStageLabel(stage: number): string {
  if (isValidStage(stage)) return CompactStageLabel[stage];
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

export function getStageStep(stage: number): {
  step: number;
  total: number;
  isVetoed: boolean;
} {
  if (!isValidStage(stage)) {
    return { step: 1, total: TOTAL_STAGE_STEPS, isVetoed: false };
  }
  return {
    step: StageSteps[stage],
    total: TOTAL_STAGE_STEPS,
    isVetoed: stage === BillStages.VETOED,
  };
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
 * it (Documentation/brand.md, "Voice"). `BillStageDescriptions` above stays as
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
