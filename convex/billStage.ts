/**
 * Single source of truth for bill progress stages and the logic that derives a
 * stage from a bill's legislative actions.
 *
 * This module is intentionally PURE (no Convex imports) so it can be unit
 * tested in isolation and imported anywhere on the backend. The sync pipeline,
 * the repair/backfill jobs, and the precomputed-stats aggregates all derive
 * their notion of "stage" from here — keep it the only definition.
 */

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

export const BillStageDescriptions: Record<number, string> = {
  [BillStages.INTRODUCED]: "Introduced",
  [BillStages.IN_COMMITTEE]: "In Committee",
  [BillStages.PASSED_ONE_CHAMBER]: "Passed One Chamber",
  [BillStages.PASSED_BOTH_CHAMBERS]: "Passed Both Chambers",
  [BillStages.VETOED]: "Vetoed",
  [BillStages.TO_PRESIDENT]: "To President",
  [BillStages.SIGNED_BY_PRESIDENT]: "Signed by President",
  [BillStages.BECAME_LAW]: "Became Law",
};

/**
 * Stages that appear on the homepage status chart, in display order. The chart
 * segments are sorted by this array's order. Used by the precomputed-stats
 * aggregates (`convex/aggregates.ts`).
 */
export const BILL_STAGES: ReadonlyArray<{ stage: number; description: string }> =
  [
    BillStages.INTRODUCED,
    BillStages.IN_COMMITTEE,
    BillStages.PASSED_ONE_CHAMBER,
    BillStages.PASSED_BOTH_CHAMBERS,
    BillStages.VETOED,
    BillStages.TO_PRESIDENT,
    BillStages.SIGNED_BY_PRESIDENT,
    BillStages.BECAME_LAW,
  ].map((stage) => ({ stage, description: BillStageDescriptions[stage] }));

/**
 * Pure predicate: does this action record a chamber *passing* the bill?
 * Returns "house" / "senate" / null. Shared by {@link calculateBillStage} and
 * the committee base-rate job so both agree on what "passed a chamber" means.
 */
export function passedChamber(action: {
  text?: string;
  type?: string;
  actionCode?: string;
}): "house" | "senate" | null {
  const text = (action.text || "").toLowerCase();
  const type = (action.type || "").toLowerCase();
  const code = action.actionCode || "";
  if (
    text.includes("passed house") ||
    type === "passedhouse" ||
    code === "H32500"
  ) {
    return "house";
  }
  if (
    text.includes("passed senate") ||
    type === "passedsenate" ||
    code === "S32500"
  ) {
    return "senate";
  }
  return null;
}

/**
 * Derive a bill's progress stage from its actions.
 *
 * Flag-based with post-loop precedence — there are NO early returns inside the
 * scan. This is deliberate and fixes a real production bug: the Library of
 * Congress API attaches the SAME action code (`E30000`) to both "Signed by
 * President" and "Vetoed by President". The previous implementation early-
 * returned "Signed" the moment it saw `E30000`, so genuine vetoes (e.g. the
 * 118th Congress JUDGES Act and the CRA disapproval resolutions) were
 * mislabeled as signed-into-law. Here we scan every action, set independent
 * booleans, then pick the most advanced stage — and `E30000` is no longer used
 * to detect a signing at all (a signing is recognised only by its unambiguous
 * "Signed by President" text).
 *
 * Precedence (most advanced first): became law > vetoed > signed > to
 * president > passed both > passed one > in committee > introduced. Vetoed
 * outranks signed defensively so a veto can never be reported as a signing.
 */
export function calculateBillStage(
  actions: Array<{ text: string; type?: string; actionCode?: string }>,
): { stage: number; description: string } {
  const stageResult = (stage: number) => ({
    stage,
    description: BillStageDescriptions[stage],
  });

  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return stageResult(BillStages.INTRODUCED);
  }

  let becameLaw = false;
  let vetoed = false;
  let signed = false;
  let toPresident = false;
  let passedHouse = false;
  let passedSenate = false;
  let inCommittee = false;

  for (const action of actions) {
    const text = (action.text || "").toLowerCase();
    const type = (action.type || "").toLowerCase();
    const code = action.actionCode || "";

    if (
      text.includes("became public law") ||
      text.includes("became private law") ||
      type === "becamelaw" ||
      code === "36000" ||
      code === "E40000"
    ) {
      becameLaw = true;
    }

    // Veto detection. `E30000` is deliberately NOT used here or for "signed";
    // it is ambiguous between the two. A veto is recognised by its text
    // ("Vetoed by President.", "Pocket Vetoed by President.", "Veto Message
    // received"), its action type, or the unambiguous veto code 31000.
    if (
      text.includes("vetoed") ||
      text.includes("veto message") ||
      text.includes("pocket veto") ||
      type === "vetoed" ||
      type === "veto" ||
      code === "31000"
    ) {
      vetoed = true;
    }

    // Signing is recognised ONLY by its unambiguous text (never by E30000).
    if (text.includes("signed by president")) {
      signed = true;
    }

    if (
      text.includes("presented to president") ||
      text.includes("to president") ||
      code === "28000" ||
      code === "E20000"
    ) {
      toPresident = true;
    }

    const chamber = passedChamber(action);
    if (chamber === "house") passedHouse = true;
    if (chamber === "senate") passedSenate = true;

    if (
      text.includes("referred to") ||
      text.includes("committee") ||
      code === "5000" ||
      code === "14000" ||
      code === "H11100" ||
      code === "S11100"
    ) {
      inCommittee = true;
    }
  }

  if (becameLaw) return stageResult(BillStages.BECAME_LAW);
  if (vetoed) return stageResult(BillStages.VETOED);
  if (signed) return stageResult(BillStages.SIGNED_BY_PRESIDENT);
  if (toPresident) return stageResult(BillStages.TO_PRESIDENT);
  if (passedHouse && passedSenate)
    return stageResult(BillStages.PASSED_BOTH_CHAMBERS);
  if (passedHouse || passedSenate)
    return stageResult(BillStages.PASSED_ONE_CHAMBER);
  if (inCommittee) return stageResult(BillStages.IN_COMMITTEE);
  return stageResult(BillStages.INTRODUCED);
}
