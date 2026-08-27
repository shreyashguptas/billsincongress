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

export function getProgressDots(currentStage: number): { stage: string; isComplete: boolean; isVetoed?: boolean }[] {
  const shortLabels = ['Introduced', 'Committee', 'One Chamber', 'Both Chambers', 'Vetoed', 'To President', 'Signed', 'Law'];

  if (!isValidStage(currentStage)) {
    return shortLabels.map(stage => ({
      stage,
      isComplete: false
    }));
  }

  const currentIndex = BillStageOrder.indexOf(currentStage);
  const isVetoedBill = currentStage === BillStages.VETOED;

  return shortLabels.map((label, index) => ({
    stage: label,
    isComplete: index <= currentIndex,
    ...(label === 'Vetoed' && isVetoedBill ? { isVetoed: true } : {}),
  }));
} 