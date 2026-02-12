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

// Map of stage numbers to their visual percentage on the progress bar
const StagePercentages: Record<BillStage, number> = {
  [BillStages.INTRODUCED]: 0,              // Start at 0%
  [BillStages.IN_COMMITTEE]: 14.29,        // 1/7
  [BillStages.PASSED_ONE_CHAMBER]: 28.57,  // 2/7
  [BillStages.PASSED_BOTH_CHAMBERS]: 42.86, // 3/7
  [BillStages.VETOED]: 57.14,              // 4/7
  [BillStages.TO_PRESIDENT]: 57.14,        // 4/7 (same as vetoed — parallel paths)
  [BillStages.SIGNED_BY_PRESIDENT]: 71.43, // 5/7
  [BillStages.BECAME_LAW]: 100,            // 7/7
} as const;

/**
 * Gets the description for a given bill stage
 * @param stage - The bill stage number
 * @returns The description of the stage
 */
export function getStageDescription(stage: number): string {
  return BillStageDescriptions[stage as BillStage] || 'Unknown';
}

/**
 * Gets the stage number for a given description
 * @param description - The stage description
 * @returns The stage number or undefined if not found
 */
export function getStageFromDescription(description: string): BillStage | undefined {
  const entry = Object.entries(BillStageDescriptions).find(([_, desc]) => desc === description);
  return entry ? parseInt(entry[0], 10) as BillStage : undefined;
}

/**
 * Gets the visual percentage for the progress bar based on the current stage
 * @param stage - The bill stage number
 * @returns The percentage to show on the progress bar
 */
export function getStagePercentage(stage: number): number {
  if (!isValidStage(stage)) {
    return 0;
  }
  return StagePercentages[stage];
}

/**
 * Checks if a given number is a valid bill stage
 * @param stage - The number to check
 * @returns True if the number is a valid bill stage
 */
export function isValidStage(stage: number): stage is BillStage {
  return Object.values(BillStages).includes(stage as BillStage);
}

/**
 * Gets the progress dots configuration for a given stage
 * @param currentStage - The current bill stage
 * @returns Array of progress dots with their completion status
 */
export function getProgressDots(currentStage: number): { stage: string; isComplete: boolean; isVetoed?: boolean }[] {
  const shortLabels = ['Introduced', 'Committee', 'One Chamber', 'Both Chambers', 'Vetoed', 'To President', 'Signed', 'Law'];

  // If not a valid stage, show all dots as incomplete
  if (!isValidStage(currentStage)) {
    return shortLabels.map(stage => ({
      stage,
      isComplete: false
    }));
  }

  // Get the index of the current stage in the order array
  const currentIndex = BillStageOrder.indexOf(currentStage);
  const isVetoedBill = currentStage === BillStages.VETOED;

  // Map each label to its completion status based on index comparison
  return shortLabels.map((label, index) => ({
    stage: label,
    isComplete: index <= currentIndex,
    ...(label === 'Vetoed' && isVetoedBill ? { isVetoed: true } : {}),
  }));
} 