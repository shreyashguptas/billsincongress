import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const BASE_URL = "https://api.congress.gov/v3";
const BATCH_SIZE = 50; // 50 bills per batch keeps well within Convex's 10-min action timeout
const DELAY_BETWEEN_REQUESTS_MS = 750; // delay between each API call (not per bill)
const BILL_TYPES = [
  "hr",
  "s",
  "hjres",
  "sjres",
  "hconres",
  "sconres",
  "hres",
  "sres",
];

// Bill stage constants
const BillStages = {
  INTRODUCED: 20,
  IN_COMMITTEE: 40,
  PASSED_ONE_CHAMBER: 60,
  PASSED_BOTH_CHAMBERS: 80,
  TO_PRESIDENT: 90,
  SIGNED_BY_PRESIDENT: 95,
  BECAME_LAW: 100,
} as const;

const BillStageDescriptions: Record<number, string> = {
  [BillStages.INTRODUCED]: "Introduced",
  [BillStages.IN_COMMITTEE]: "In Committee",
  [BillStages.PASSED_ONE_CHAMBER]: "Passed One Chamber",
  [BillStages.PASSED_BOTH_CHAMBERS]: "Passed Both Chambers",
  [BillStages.TO_PRESIDENT]: "To President",
  [BillStages.SIGNED_BY_PRESIDENT]: "Signed by President",
  [BillStages.BECAME_LAW]: "Became Law",
};

function getBillTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    hr: "H.R.",
    s: "S.",
    hjres: "H.J.Res.",
    sjres: "S.J.Res.",
    hconres: "H.Con.Res.",
    sconres: "S.Con.Res.",
    hres: "H.Res.",
    sres: "S.Res.",
  };
  return labels[type.toLowerCase()] || type;
}

/**
 * Calculate the bill's progress stage from its actions.
 * Ported from scripts/DataUpdate/updateBillInfo.ts
 */
function calculateBillStage(actions: Array<{ text: string; type?: string; actionCode?: string }>): {
  stage: number;
  description: string;
} {
  let stage: number = BillStages.INTRODUCED;
  let description =
    BillStageDescriptions[BillStages.INTRODUCED];

  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return { stage, description };
  }

  let passedHouse = false;
  let passedSenate = false;

  for (const action of actions) {
    const actionText = (action.text || "").toLowerCase();
    const actionType = (action.type || "").toLowerCase();
    const actionCode = action.actionCode || "";

    // Check for law status first (highest priority)
    if (
      actionText.includes("became public law") ||
      actionText.includes("became private law") ||
      actionType === "becamelaw" ||
      actionCode === "36000" ||
      actionCode === "E40000"
    ) {
      return {
        stage: BillStages.BECAME_LAW,
        description: BillStageDescriptions[BillStages.BECAME_LAW],
      };
    }

    // Check for presidential signature
    if (
      actionText.includes("signed by president") ||
      actionType === "signedbypresident" ||
      actionCode === "29000" ||
      actionCode === "E30000"
    ) {
      return {
        stage: BillStages.SIGNED_BY_PRESIDENT,
        description: BillStageDescriptions[BillStages.SIGNED_BY_PRESIDENT],
      };
    }

    // Check if sent to president
    if (
      actionText.includes("to president") ||
      actionText.includes("presented to president") ||
      actionCode === "28000" ||
      actionCode === "E20000"
    ) {
      return {
        stage: BillStages.TO_PRESIDENT,
        description: BillStageDescriptions[BillStages.TO_PRESIDENT],
      };
    }

    // Track passage through each chamber
    if (
      actionText.includes("passed house") ||
      actionType === "passedhouse" ||
      actionCode === "H32500"
    ) {
      passedHouse = true;
    }
    if (
      actionText.includes("passed senate") ||
      actionType === "passedsenate" ||
      actionCode === "S32500"
    ) {
      passedSenate = true;
    }

    if (passedHouse && passedSenate) {
      return {
        stage: BillStages.PASSED_BOTH_CHAMBERS,
        description: BillStageDescriptions[BillStages.PASSED_BOTH_CHAMBERS],
      };
    }

    // Check for committee action
    if (
      actionText.includes("referred to") ||
      actionText.includes("committee") ||
      actionCode === "5000" ||
      actionCode === "14000" ||
      actionCode === "H11100" ||
      actionCode === "S11100"
    ) {
      stage = BillStages.IN_COMMITTEE;
      description = BillStageDescriptions[BillStages.IN_COMMITTEE];
    }
  }

  if (passedHouse || passedSenate) {
    return {
      stage: BillStages.PASSED_ONE_CHAMBER,
      description: BillStageDescriptions[BillStages.PASSED_ONE_CHAMBER],
    };
  }

  return { stage, description };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a batch of bills for a congress/type and schedule the next batch.
 * Uses ctx.scheduler.runAfter to chain batches (handles 10-min action timeout).
 */
export const syncBillBatch = internalAction({
  args: {
    congress: v.number(),
    billType: v.string(),
    offset: v.number(),
    snapshotId: v.optional(v.id("syncSnapshots")),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.CONGRESS_API_KEY;
    if (!apiKey) throw new Error("CONGRESS_API_KEY not configured");

    const listUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}?offset=${args.offset}&limit=${BATCH_SIZE}&api_key=${apiKey}&format=json`;

    console.log(
      `Fetching ${args.billType} bills for Congress ${args.congress} at offset ${args.offset}`
    );

    let listResponse;
    try {
      listResponse = await fetch(listUrl);
      if (!listResponse.ok) {
        throw new Error(`API error ${listResponse.status}: ${listResponse.statusText}`);
      }
    } catch (error: any) {
      console.error(`Failed to fetch bill list: ${error.message}`);
      return { processed: 0, hasMore: false, error: error.message };
    }

    const listData = await listResponse.json();
    const bills = listData.bills || [];

    if (bills.length === 0) {
      console.log(
        `No more ${args.billType} bills for Congress ${args.congress} at offset ${args.offset}`
      );
      return { processed: 0, hasMore: false };
    }

    console.log(`Processing ${bills.length} bills...`);
    let successCount = 0;
    let failCount = 0;

    for (const bill of bills) {
      const billId = `${bill.number}${args.billType}${args.congress}`;

      try {
        // 1. Fetch detailed bill info
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        const detailUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}/${bill.number}?api_key=${apiKey}&format=json`;
        const detailResponse = await fetch(detailUrl);

        if (!detailResponse.ok) {
          console.error(`Failed to fetch detail for ${billId}: ${detailResponse.statusText}`);
          failCount++;
          continue;
        }

        const detailData = await detailResponse.json();
        const billDetail = detailData.bill;

        // 2. Fetch actions to calculate progress stage
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        let actions: any[] = [];
        try {
          const actionsUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}/${bill.number}/actions?api_key=${apiKey}&format=json&limit=250`;
          const actionsResponse = await fetch(actionsUrl);
          if (actionsResponse.ok) {
            const actionsData = await actionsResponse.json();
            actions = actionsData.actions || [];
          }
        } catch {
          // Actions fetch failure is non-critical
        }

        const { stage, description } = calculateBillStage(actions);

        // Remove number prefix from title
        const titleWithoutNumber =
          billDetail.title?.replace(
            /^(H\.R\.|S\.|H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.|H\.Res\.|S\.Res\.)\s*\d+\s*[-–]\s*/,
            ""
          ) || "";

        // Upsert the bill
        await ctx.runMutation(internal.mutations.upsertBill, {
          billId,
          congress: args.congress,
          billType: args.billType,
          billNumber: bill.number.toString(),
          billTypeLabel: getBillTypeLabel(args.billType),
          title: billDetail.title || "",
          titleWithoutNumber,
          introducedDate: billDetail.introducedDate || "",
          sponsorFirstName: billDetail.sponsors?.[0]?.firstName,
          sponsorLastName: billDetail.sponsors?.[0]?.lastName,
          sponsorParty: billDetail.sponsors?.[0]?.party,
          sponsorState: billDetail.sponsors?.[0]?.state,
          progressStage: stage,
          progressDescription: description,
        });

        // Store actions
        if (actions.length > 0) {
          await ctx.runMutation(internal.mutations.upsertBillActions, {
            billId,
            actions: actions.map((a: any) => ({
              actionCode: a.actionCode || undefined,
              actionDate: a.actionDate || "",
              sourceSystemCode: a.sourceSystem?.code,
              sourceSystemName: a.sourceSystem?.name,
              text: a.text || "",
              type: a.type || undefined,
            })),
          });
        }

        // 3. Fetch and store subjects
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        try {
          const subjectsUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}/${bill.number}/subjects?api_key=${apiKey}&format=json`;
          const subjectsResponse = await fetch(subjectsUrl);
          if (subjectsResponse.ok) {
            const subjectsData = await subjectsResponse.json();
            const policyArea = subjectsData.subjects?.policyArea;
            if (policyArea) {
              await ctx.runMutation(internal.mutations.upsertBillSubject, {
                billId,
                policyAreaName: policyArea.name,
                policyAreaUpdateDate: policyArea.updateDate,
              });
            }
          }
        } catch {
          // Non-critical
        }

        // 4. Fetch and store summaries
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        try {
          const summariesUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}/${bill.number}/summaries?api_key=${apiKey}&format=json`;
          const summariesResponse = await fetch(summariesUrl);
          if (summariesResponse.ok) {
            const summariesData = await summariesResponse.json();
            const summaries = summariesData.summaries || [];
            for (const summary of summaries) {
              await ctx.runMutation(internal.mutations.upsertBillSummary, {
                billId,
                actionDate: summary.actionDate,
                actionDesc: summary.actionDesc,
                text: summary.text || "",
                updateDate: summary.updateDate || new Date().toISOString(),
                versionCode: summary.versionCode,
              });
            }
          }
        } catch {
          // Non-critical
        }

        // 5. Fetch and store text/PDF info
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        try {
          const textUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}/${bill.number}/text?api_key=${apiKey}&format=json`;
          const textResponse = await fetch(textUrl);
          if (textResponse.ok) {
            const textData = await textResponse.json();
            const textVersions = textData.textVersions || [];
            if (textVersions.length > 0) {
              const latest = textVersions[textVersions.length - 1];
              const pdfFormat = latest.formats?.find(
                (f: any) => f.type === "PDF"
              );
              const txtFormat = latest.formats?.find(
                (f: any) => f.type === "Formatted Text"
              );
              await ctx.runMutation(internal.mutations.upsertBillText, {
                billId,
                date: latest.date,
                formatsUrlPdf: pdfFormat?.url,
                formatsUrlTxt: txtFormat?.url,
                type: latest.type,
              });
            }
          }
        } catch {
          // Non-critical
        }

        successCount++;
      } catch (error: any) {
        console.error(`Error processing bill ${billId}: ${error.message}`);
        failCount++;
      }
    }

    console.log(
      `Batch complete: ${successCount} success, ${failCount} failed out of ${bills.length}`
    );

    // Update sync snapshot with batch progress
    if (args.snapshotId) {
      await ctx.runMutation(internal.mutations.updateSyncSnapshot, {
        snapshotId: args.snapshotId,
        totalProcessed: args.offset + bills.length,
        totalSuccess: (args.offset || 0) + successCount,
        totalFailed: failCount,
      });
    }

    // Schedule next batch if there are more bills
    const hasMore = bills.length >= BATCH_SIZE;
    if (hasMore) {
      await ctx.scheduler.runAfter(
        5000, // 5 second gap between batches
        internal.congressApi.syncBillBatch,
        {
          congress: args.congress,
          billType: args.billType,
          offset: args.offset + BATCH_SIZE,
          snapshotId: args.snapshotId,
        }
      );
    } else if (args.snapshotId) {
      // This bill type is done — mark snapshot completed
      await ctx.runMutation(internal.mutations.updateSyncSnapshot, {
        snapshotId: args.snapshotId,
        status: "completed",
        completedAt: new Date().toISOString(),
        totalProcessed: args.offset + bills.length,
        totalSuccess: (args.offset || 0) + successCount,
        totalFailed: failCount,
      });
    }

    return { processed: bills.length, hasMore, successCount, failCount };
  },
});

/**
 * Start syncing all bill types for a given congress.
 * Schedules a batch sync for each bill type with staggered starts.
 */
export const syncCongress = internalAction({
  args: {
    congress: v.number(),
    syncType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const syncType = args.syncType || "daily";

    // Create a sync snapshot
    const snapshotId = await ctx.runMutation(
      internal.mutations.createSyncSnapshot,
      {
        syncType,
        congress: args.congress,
      }
    );

    console.log(
      `Starting ${syncType} sync for Congress ${args.congress} (snapshot: ${snapshotId})`
    );

    // Schedule sync for each bill type with 10 minute stagger
    // so only one bill type hits the API at a time
    for (let i = 0; i < BILL_TYPES.length; i++) {
      await ctx.scheduler.runAfter(
        i * 600000, // stagger by 10 minutes
        internal.congressApi.syncBillBatch,
        {
          congress: args.congress,
          billType: BILL_TYPES[i],
          offset: 0,
          snapshotId,
        }
      );
    }
  },
});

/**
 * Daily sync - syncs only the current congress (119th).
 * Called by the cron job.
 */
export const dailySync = internalAction({
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();
    const currentCongress = Math.floor((currentYear - 1789) / 2) + 1;

    console.log(`Daily sync starting for Congress ${currentCongress}`);

    await ctx.scheduler.runAfter(0, internal.congressApi.syncCongress, {
      congress: currentCongress,
      syncType: "daily",
    });
  },
});

/**
 * One-time historical pull for the last 3 congresses.
 * Trigger this manually from the Convex dashboard after initial setup.
 */
export const initialHistoricalPull = internalAction({
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();
    const currentCongress = Math.floor((currentYear - 1789) / 2) + 1;

    const congressesToSync = [
      currentCongress,
      currentCongress - 1,
      currentCongress - 2,
    ];

    console.log(
      `Starting historical pull for congresses: ${congressesToSync.join(", ")}`
    );

    // Stagger each congress by 2 hours — each congress has 8 bill types
    // staggered by 10 min internally, so ~80 min per congress
    for (let i = 0; i < congressesToSync.length; i++) {
      await ctx.scheduler.runAfter(
        i * 7200000, // 2 hour gap between congresses
        internal.congressApi.syncCongress,
        {
          congress: congressesToSync[i],
          syncType: "historical",
        }
      );
    }
  },
});
