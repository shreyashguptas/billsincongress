import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  SYNC_DETAIL,
  SYNC_ACTIONS,
  SYNC_SUBJECTS,
  SYNC_SUMMARIES,
  SYNC_TEXT,
  SYNC_COMPLETE,
} from "./sync";

const BASE_URL = "https://api.congress.gov/v3";
const BATCH_SIZE = 50; // 50 bills per batch keeps well within Convex's 10-min action timeout
const DELAY_BETWEEN_REQUESTS_MS = 750; // delay between each API call (not per bill)
const MAX_RETRIES = 3; // max retries per API call on rate limit
const RATE_LIMIT_BACKOFF_MS = 10000; // initial backoff on 429 (10s), doubles each retry
const CONSECUTIVE_FAIL_LIMIT = 5; // abort batch after this many consecutive failures
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
  VETOED: 85,
  TO_PRESIDENT: 90,
  SIGNED_BY_PRESIDENT: 95,
  BECAME_LAW: 100,
} as const;

const BillStageDescriptions: Record<number, string> = {
  [BillStages.INTRODUCED]: "Introduced",
  [BillStages.IN_COMMITTEE]: "In Committee",
  [BillStages.PASSED_ONE_CHAMBER]: "Passed One Chamber",
  [BillStages.PASSED_BOTH_CHAMBERS]: "Passed Both Chambers",
  [BillStages.VETOED]: "Vetoed",
  [BillStages.TO_PRESIDENT]: "To President",
  [BillStages.SIGNED_BY_PRESIDENT]: "Signed by President",
  [BillStages.BECAME_LAW]: "Became Law",
};

// Incremental sync constants
const INCREMENTAL_LOOKBACK_HOURS = 26; // covers 24-hour cron + 2-hour buffer
const FULL_SYNC_LOOKBACK_DAYS = 7; // weekly safety net catches anything missed
const INCREMENTAL_STAGGER_MS = 120000; // 2 minutes between bill types (fewer bills)
const FULL_SYNC_STAGGER_MS = 600000; // 10 minutes between bill types

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
  let vetoed = false;
  let toPresident = false;

  // First pass: scan all actions to build a complete picture
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

    // Check for veto (must be checked before "to president" to avoid early return)
    if (
      actionText.includes("vetoed") ||
      actionText.includes("veto message") ||
      actionType === "vetoed" ||
      actionCode === "31000" ||
      actionCode === "E50000"
    ) {
      vetoed = true;
    }

    // Check if sent to president
    if (
      actionText.includes("to president") ||
      actionText.includes("presented to president") ||
      actionCode === "28000" ||
      actionCode === "E20000"
    ) {
      toPresident = true;
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

  // Determine final stage from flags (order matters: most advanced first)
  if (vetoed) {
    return {
      stage: BillStages.VETOED,
      description: BillStageDescriptions[BillStages.VETOED],
    };
  }

  if (toPresident) {
    return {
      stage: BillStages.TO_PRESIDENT,
      description: BillStageDescriptions[BillStages.TO_PRESIDENT],
    };
  }

  if (passedHouse && passedSenate) {
    return {
      stage: BillStages.PASSED_BOTH_CHAMBERS,
      description: BillStageDescriptions[BillStages.PASSED_BOTH_CHAMBERS],
    };
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
 * Fetch a URL with retry on rate limit (429).
 * Returns the Response on success, or null if all retries exhausted.
 */
async function fetchWithRetry(
  url: string,
  label: string
): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url);
    if (response.status === 429) {
      if (attempt === MAX_RETRIES) {
        console.error(
          `Rate limited on ${label} after ${MAX_RETRIES + 1} attempts, giving up`
        );
        return null;
      }
      const backoff = RATE_LIMIT_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(
        `Rate limited on ${label}, retrying in ${backoff / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`
      );
      await delay(backoff);
      continue;
    }
    return response;
  }
  return null;
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
    fromDateTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.CONGRESS_API_KEY;
    if (!apiKey) throw new Error("CONGRESS_API_KEY not configured");

    let listUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}?offset=${args.offset}&limit=${BATCH_SIZE}&api_key=${apiKey}&format=json`;
    if (args.fromDateTime) {
      listUrl += `&fromDateTime=${encodeURIComponent(args.fromDateTime)}&sort=updateDate+desc`;
    }

    console.log(
      `Fetching ${args.billType} bills for Congress ${args.congress} at offset ${args.offset}`
    );

    let listResponse;
    try {
      listResponse = await fetchWithRetry(
        listUrl,
        `${args.billType} list offset=${args.offset}`
      );
      if (!listResponse) {
        console.error(
          `Failed to fetch bill list for ${args.billType} at offset ${args.offset}: rate limit exhausted`
        );
        if (args.snapshotId) {
          await ctx.runMutation(internal.mutations.updateSyncSnapshot, {
            snapshotId: args.snapshotId,
            status: "failed",
            errorDetails: "Rate limit exhausted on bill list fetch",
          });
        }
        return { processed: 0, hasMore: false, error: "Rate limit exhausted" };
      }
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
    let consecutiveFailures = 0;
    let rateLimitAborted = false;

    for (const bill of bills) {
      const billId = `${bill.number}${args.billType}${args.congress}`;

      // Circuit breaker: abort batch if too many consecutive failures
      if (consecutiveFailures >= CONSECUTIVE_FAIL_LIMIT) {
        console.error(
          `Circuit breaker tripped: ${consecutiveFailures} consecutive failures. Aborting batch for ${args.billType} at offset ${args.offset}.`
        );
        rateLimitAborted = true;
        break;
      }

      try {
        let endpointBits = 0;

        // 1. Fetch detailed bill info
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        const detailUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}/${bill.number}?api_key=${apiKey}&format=json`;
        const detailResponse = await fetchWithRetry(detailUrl, `detail ${billId}`);

        if (!detailResponse || !detailResponse.ok) {
          console.error(
            `Failed to fetch detail for ${billId}: ${detailResponse ? detailResponse.statusText : "rate limit exhausted"}`
          );
          failCount++;
          consecutiveFailures++;
          continue;
        }

        // Reset consecutive failures on successful detail fetch
        consecutiveFailures = 0;
        endpointBits |= SYNC_DETAIL;

        const detailData = await detailResponse.json();
        const billDetail = detailData.bill;

        // 2. Fetch actions to calculate progress stage
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        let actions: any[] = [];
        try {
          const actionsUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}/${bill.number}/actions?api_key=${apiKey}&format=json&limit=250`;
          const actionsResponse = await fetchWithRetry(actionsUrl, `actions ${billId}`);
          if (actionsResponse && actionsResponse.ok) {
            const actionsData = await actionsResponse.json();
            actions = actionsData.actions || [];
            endpointBits |= SYNC_ACTIONS;
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
          const subjectsResponse = await fetchWithRetry(subjectsUrl, `subjects ${billId}`);
          if (subjectsResponse && subjectsResponse.ok) {
            endpointBits |= SYNC_SUBJECTS;
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
          const summariesResponse = await fetchWithRetry(summariesUrl, `summaries ${billId}`);
          if (summariesResponse && summariesResponse.ok) {
            endpointBits |= SYNC_SUMMARIES;
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
          const textResponse = await fetchWithRetry(textUrl, `text ${billId}`);
          if (textResponse && textResponse.ok) {
            endpointBits |= SYNC_TEXT;
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

        // Track which endpoints succeeded for this bill
        await ctx.runMutation(internal.mutations.updateBillSyncStatus, {
          billId,
          endpointBits,
          lastSyncAttempt: new Date().toISOString(),
        });

        successCount++;
      } catch (error: any) {
        console.error(`Error processing bill ${billId}: ${error.message}`);
        failCount++;
        consecutiveFailures++;
      }
    }

    console.log(
      `Batch complete: ${successCount} success, ${failCount} failed out of ${bills.length}${rateLimitAborted ? " (aborted by circuit breaker)" : ""}`
    );

    // If circuit breaker tripped, mark snapshot as failed and stop
    if (rateLimitAborted) {
      if (args.snapshotId) {
        await ctx.runMutation(internal.mutations.updateSyncSnapshot, {
          snapshotId: args.snapshotId,
          status: "failed",
          errorDetails: `Rate limit circuit breaker tripped at offset ${args.offset} for ${args.billType}`,
          totalProcessed: args.offset + successCount,
          totalSuccess: (args.offset || 0) + successCount,
          totalFailed: failCount,
        });
      }
      return { processed: successCount, hasMore: false, successCount, failCount, rateLimitAborted: true };
    }

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
          fromDateTime: args.fromDateTime,
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

      // Refresh precomputed homepage stats for this congress
      await ctx.runMutation(internal.mutations.recomputeCongressStats, {
        congress: args.congress,
      });
      await ctx.runMutation(internal.mutations.recomputeCongressPolicyAreas, {
        congress: args.congress,
      });
      await ctx.runMutation(internal.mutations.recomputeCongressSponsors, {
        congress: args.congress,
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
    fromDateTime: v.optional(v.string()),
    staggerMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const syncType = args.syncType || "daily";
    const staggerMs = args.staggerMs || FULL_SYNC_STAGGER_MS;

    // Create a sync snapshot
    const snapshotId = await ctx.runMutation(
      internal.mutations.createSyncSnapshot,
      {
        syncType,
        congress: args.congress,
      }
    );

    console.log(
      `Starting ${syncType} sync for Congress ${args.congress} (snapshot: ${snapshotId})${args.fromDateTime ? ` from ${args.fromDateTime}` : ""}`
    );

    // Schedule sync for each bill type with configurable stagger
    for (let i = 0; i < BILL_TYPES.length; i++) {
      await ctx.scheduler.runAfter(
        i * staggerMs,
        internal.congressApi.syncBillBatch,
        {
          congress: args.congress,
          billType: BILL_TYPES[i],
          offset: 0,
          snapshotId,
          fromDateTime: args.fromDateTime,
        }
      );
    }
  },
});

/**
 * Incremental sync - fetches only bills updated in the last INCREMENTAL_LOOKBACK_HOURS.
 * Uses shorter stagger since fewer bills are expected.
 */
export const incrementalSync = internalAction({
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();
    const currentCongress = Math.floor((currentYear - 1789) / 2) + 1;

    const fromDate = new Date();
    fromDate.setHours(fromDate.getHours() - INCREMENTAL_LOOKBACK_HOURS);
    const fromDateTime = fromDate.toISOString().replace(/\.\d{3}Z$/, "Z");

    console.log(
      `Incremental sync starting for Congress ${currentCongress} from ${fromDateTime}`
    );

    await ctx.scheduler.runAfter(0, internal.congressApi.syncCongress, {
      congress: currentCongress,
      syncType: "incremental",
      fromDateTime,
      staggerMs: INCREMENTAL_STAGGER_MS,
    });
  },
});

/**
 * Full sync - fetches bills updated in the last FULL_SYNC_LOOKBACK_DAYS.
 * Weekly safety net to catch anything the incremental sync may have missed.
 */
export const fullSync = internalAction({
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();
    const currentCongress = Math.floor((currentYear - 1789) / 2) + 1;

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - FULL_SYNC_LOOKBACK_DAYS);
    const fromDateTime = fromDate.toISOString().replace(/\.\d{3}Z$/, "Z");

    console.log(
      `Full sync starting for Congress ${currentCongress} from ${fromDateTime}`
    );

    await ctx.scheduler.runAfter(0, internal.congressApi.syncCongress, {
      congress: currentCongress,
      syncType: "full",
      fromDateTime,
      staggerMs: FULL_SYNC_STAGGER_MS,
    });
  },
});

/**
 * Daily sync - backward compatible entry point, now delegates to incrementalSync.
 * Called by the cron job.
 */
export const dailySync = internalAction({
  handler: async (ctx) => {
    console.log("Daily sync delegating to incrementalSync");
    await ctx.scheduler.runAfter(0, internal.congressApi.incrementalSync);
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

const REPAIR_BATCH_SIZE = 20; // fewer bills per batch since we're targeted

/**
 * Repair incomplete bills by fetching only their missing endpoints.
 * Self-schedules next batch if more incomplete bills remain.
 */
export const repairIncompleteBills = internalAction({
  args: {
    congress: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ repaired: number; remaining: boolean }> => {
    const apiKey = process.env.CONGRESS_API_KEY;
    if (!apiKey) throw new Error("CONGRESS_API_KEY not configured");

    // Get incomplete bills
    const incompleteBills = await ctx.runQuery(internal.sync.getIncompleteBills, {
      congress: args.congress,
      limit: REPAIR_BATCH_SIZE,
    });

    if (incompleteBills.length === 0) {
      console.log("No incomplete bills to repair");
      return { repaired: 0, remaining: false };
    }

    console.log(`Repairing ${incompleteBills.length} incomplete bills...`);
    let repairedCount = 0;
    let consecutiveFailures = 0;

    for (const bill of incompleteBills) {
      if (consecutiveFailures >= CONSECUTIVE_FAIL_LIMIT) {
        console.error("Circuit breaker tripped during repair, stopping batch");
        break;
      }

      // For legacy bills, first compute the bitmask from existing data
      let currentMask = bill.syncedEndpoints || 0;
      if (bill.isLegacy) {
        const completeness = await ctx.runQuery(internal.sync.checkBillCompleteness, {
          billId: bill.billId,
        });
        currentMask = completeness.syncedEndpoints;
        // Save the computed bitmask even if we can't repair further
        await ctx.runMutation(internal.mutations.updateBillSyncStatus, {
          billId: bill.billId,
          endpointBits: currentMask,
          lastSyncAttempt: new Date().toISOString(),
        });
        if (currentMask === SYNC_COMPLETE) {
          repairedCount++;
          consecutiveFailures = 0;
          continue;
        }
      }

      let newBits = 0;

      // Fetch only missing endpoints
      if ((currentMask & SYNC_DETAIL) === 0) {
        // Detail is missing — we need it to know bill number/type for other calls
        // but we already have billType and billNumber from the query
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        const detailUrl = `${BASE_URL}/bill/${bill.congress}/${bill.billType}/${bill.billNumber}?api_key=${apiKey}&format=json`;
        const resp = await fetchWithRetry(detailUrl, `repair detail ${bill.billId}`);
        if (resp && resp.ok) {
          const data = await resp.json();
          const billDetail = data.bill;
          const titleWithoutNumber =
            billDetail.title?.replace(
              /^(H\.R\.|S\.|H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.|H\.Res\.|S\.Res\.)\s*\d+\s*[-–]\s*/,
              ""
            ) || "";
          await ctx.runMutation(internal.mutations.upsertBill, {
            billId: bill.billId,
            congress: bill.congress,
            billType: bill.billType,
            billNumber: bill.billNumber,
            billTypeLabel: getBillTypeLabel(bill.billType),
            title: billDetail.title || "",
            titleWithoutNumber,
            introducedDate: billDetail.introducedDate || "",
            sponsorFirstName: billDetail.sponsors?.[0]?.firstName,
            sponsorLastName: billDetail.sponsors?.[0]?.lastName,
            sponsorParty: billDetail.sponsors?.[0]?.party,
            sponsorState: billDetail.sponsors?.[0]?.state,
          });
          newBits |= SYNC_DETAIL;
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
          continue; // Can't repair sub-endpoints without detail working
        }
      }

      if ((currentMask & SYNC_ACTIONS) === 0) {
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        try {
          const url = `${BASE_URL}/bill/${bill.congress}/${bill.billType}/${bill.billNumber}/actions?api_key=${apiKey}&format=json&limit=250`;
          const resp = await fetchWithRetry(url, `repair actions ${bill.billId}`);
          if (resp && resp.ok) {
            newBits |= SYNC_ACTIONS;
            const data = await resp.json();
            const actions = data.actions || [];
            if (actions.length > 0) {
              await ctx.runMutation(internal.mutations.upsertBillActions, {
                billId: bill.billId,
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
            consecutiveFailures = 0;
          } else {
            consecutiveFailures++;
          }
        } catch {
          consecutiveFailures++;
        }
      }

      if ((currentMask & SYNC_SUBJECTS) === 0) {
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        try {
          const url = `${BASE_URL}/bill/${bill.congress}/${bill.billType}/${bill.billNumber}/subjects?api_key=${apiKey}&format=json`;
          const resp = await fetchWithRetry(url, `repair subjects ${bill.billId}`);
          if (resp && resp.ok) {
            newBits |= SYNC_SUBJECTS;
            const data = await resp.json();
            const policyArea = data.subjects?.policyArea;
            if (policyArea) {
              await ctx.runMutation(internal.mutations.upsertBillSubject, {
                billId: bill.billId,
                policyAreaName: policyArea.name,
                policyAreaUpdateDate: policyArea.updateDate,
              });
            }
            consecutiveFailures = 0;
          } else {
            consecutiveFailures++;
          }
        } catch {
          consecutiveFailures++;
        }
      }

      if ((currentMask & SYNC_SUMMARIES) === 0) {
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        try {
          const url = `${BASE_URL}/bill/${bill.congress}/${bill.billType}/${bill.billNumber}/summaries?api_key=${apiKey}&format=json`;
          const resp = await fetchWithRetry(url, `repair summaries ${bill.billId}`);
          if (resp && resp.ok) {
            newBits |= SYNC_SUMMARIES;
            const data = await resp.json();
            const summaries = data.summaries || [];
            for (const summary of summaries) {
              await ctx.runMutation(internal.mutations.upsertBillSummary, {
                billId: bill.billId,
                actionDate: summary.actionDate,
                actionDesc: summary.actionDesc,
                text: summary.text || "",
                updateDate: summary.updateDate || new Date().toISOString(),
                versionCode: summary.versionCode,
              });
            }
            consecutiveFailures = 0;
          } else {
            consecutiveFailures++;
          }
        } catch {
          consecutiveFailures++;
        }
      }

      if ((currentMask & SYNC_TEXT) === 0) {
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        try {
          const url = `${BASE_URL}/bill/${bill.congress}/${bill.billType}/${bill.billNumber}/text?api_key=${apiKey}&format=json`;
          const resp = await fetchWithRetry(url, `repair text ${bill.billId}`);
          if (resp && resp.ok) {
            newBits |= SYNC_TEXT;
            const data = await resp.json();
            const textVersions = data.textVersions || [];
            if (textVersions.length > 0) {
              const latest = textVersions[textVersions.length - 1];
              const pdfFormat = latest.formats?.find(
                (f: any) => f.type === "PDF"
              );
              const txtFormat = latest.formats?.find(
                (f: any) => f.type === "Formatted Text"
              );
              await ctx.runMutation(internal.mutations.upsertBillText, {
                billId: bill.billId,
                date: latest.date,
                formatsUrlPdf: pdfFormat?.url,
                formatsUrlTxt: txtFormat?.url,
                type: latest.type,
              });
            }
            consecutiveFailures = 0;
          } else {
            consecutiveFailures++;
          }
        } catch {
          consecutiveFailures++;
        }
      }

      // Update bitmask with newly fetched endpoints
      if (newBits > 0) {
        await ctx.runMutation(internal.mutations.updateBillSyncStatus, {
          billId: bill.billId,
          endpointBits: currentMask | newBits,
          lastSyncAttempt: new Date().toISOString(),
        });
      }

      repairedCount++;
    }

    console.log(`Repair batch complete: ${repairedCount} bills processed`);

    // Self-schedule if more incomplete bills likely remain
    if (incompleteBills.length >= REPAIR_BATCH_SIZE && consecutiveFailures < CONSECUTIVE_FAIL_LIMIT) {
      await ctx.scheduler.runAfter(10000, internal.congressApi.repairIncompleteBills, {
        congress: args.congress,
      });
      console.log("Scheduled next repair batch");
    }

    return { repaired: repairedCount, remaining: incompleteBills.length >= REPAIR_BATCH_SIZE };
  },
});

const BACKFILL_BATCH_SIZE = 200;

/**
 * One-time backfill: compute syncedEndpoints for existing bills by inspecting sub-tables.
 * No API calls — purely DB reads. Self-schedules in batches.
 */
export const backfillSyncStatus = internalAction({
  args: {
    congress: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ processed: number; remaining: boolean }> => {
    // Get legacy bills (syncedEndpoints undefined)
    const toBackfill = await ctx.runQuery(internal.sync.getIncompleteBills, {
      congress: args.congress,
      limit: BACKFILL_BATCH_SIZE,
      legacyOnly: true,
    });

    if (toBackfill.length === 0) {
      console.log("No legacy bills to backfill");
      return { processed: 0, remaining: false };
    }

    console.log(`Backfilling sync status for ${toBackfill.length} legacy bills...`);

    for (const bill of toBackfill) {
      const completeness = await ctx.runQuery(internal.sync.checkBillCompleteness, {
        billId: bill.billId,
      });

      await ctx.runMutation(internal.mutations.updateBillSyncStatus, {
        billId: bill.billId,
        endpointBits: completeness.syncedEndpoints,
        lastSyncAttempt: new Date().toISOString(),
      });
    }

    console.log(`Backfilled ${toBackfill.length} bills`);

    // Self-schedule if more remain
    if (toBackfill.length >= BACKFILL_BATCH_SIZE) {
      await ctx.scheduler.runAfter(2000, internal.congressApi.backfillSyncStatus, {
        congress: args.congress,
      });
      console.log("Scheduled next backfill batch");
    }

    return { processed: toBackfill.length, remaining: toBackfill.length >= BACKFILL_BATCH_SIZE };
  },
});

/**
 * Recompute congressStats for all congresses that have bills.
 * Reads the bills table per-congress and writes precomputed counts.
 * Called after syncs and by the daily stats cron.
 */
export const recomputeAllStats = internalAction({
  args: {},
  handler: async (ctx): Promise<{ congresses: number[] }> => {
    // Find which congresses exist by probing the index
    const congressesToUpdate: number[] = [];
    for (let c = 93; c <= 120; c++) {
      const bills = await ctx.runQuery(internal.bills.hasBillsForCongress, { congress: c });
      if (bills) congressesToUpdate.push(c);
    }

    // Recompute stats for each congress
    for (const congress of congressesToUpdate) {
      await ctx.runMutation(internal.mutations.recomputeCongressStats, { congress });
    }

    console.log(`Recomputed stats for congresses: ${congressesToUpdate.join(", ")}`);
    return { congresses: congressesToUpdate };
  },
});
