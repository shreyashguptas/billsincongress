import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  SYNC_DETAIL,
  SYNC_ACTIONS,
  SYNC_SUBJECTS,
  SYNC_SUMMARIES,
  SYNC_TEXT,
  SYNC_COMPLETE,
  EXTRA_LEGISLATIVE_SUBJECTS,
  EXTRA_TEXT_VERSIONS,
  EXTRA_COMPLETE,
} from "./sync";
import { calculateBillStage } from "./billStage";
import { Id } from "./_generated/dataModel";

// Shape returned by internal.mutations.getBillBackfillPage. Declared explicitly
// to break a TypeScript inference cycle through the `internal` API graph when
// the backfill actions call the paginator.
type BillBackfillPage = {
  bills: Array<{
    _id: Id<"bills">;
    billId: string;
    congress: number;
    billType: string;
    billNumber: string;
    progressStage?: number;
    progressDescription?: string;
    extraSyncedBits: number;
  }>;
  isDone: boolean;
  continueCursor: string;
};

const BASE_URL = "https://api.congress.gov/v3";
const BATCH_SIZE = 50; // 50 bills per batch keeps well within Convex's 10-min action timeout
const DELAY_BETWEEN_REQUESTS_MS = 750; // delay between each API call (not per bill)
const MAX_RETRIES = 3; // max retries per API call on rate limit
const RATE_LIMIT_BACKOFF_MS = 10000; // initial backoff on 429 (10s), doubles each retry
const CONSECUTIVE_FAIL_LIMIT = 5; // abort batch after this many consecutive failures
const RATE_LIMIT_RESUME_DELAY_MS = 300000; // 5 min backoff before resuming after circuit breaker
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

// Lookup for resolving chamber from billType when scheduling per-chamber
// breakdown recomputes after each bill type finishes syncing.
const HOUSE_TYPES_SET = new Set(["hr", "hjres", "hconres", "hres"]);

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Most recent value of the Congress.gov `x-ratelimit-remaining` response
 * header, updated on every successful (non-429) fetch. The enrichment backfill
 * reads this to throttle adaptively — pausing before it ever exhausts the
 * 20,000-requests/hour budget rather than relying solely on 429 backoff.
 * `null` until the first response carrying the header is seen.
 */
let lastRateLimitRemaining: number | null = null;

export function getLastRateLimitRemaining(): number | null {
  return lastRateLimitRemaining;
}

/**
 * Fetch a Congress.gov URL with retry on rate limit (429). Authenticates
 * via the `X-Api-Key` header rather than a `?api_key=…` query string so the
 * key never lands in URLs that might be captured by Convex platform logs,
 * downstream tracing breadcrumbs, or upstream caches.
 *
 * Returns the Response on success, or null if all retries exhausted.
 */
async function fetchWithRetry(
  url: string,
  label: string
): Promise<Response | null> {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    throw new Error("CONGRESS_API_KEY not configured");
  }
  const init = { headers: { "X-Api-Key": apiKey } };
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err: any) {
      // Transient network failure (e.g. "TypeError: fetch failed" — a dropped
      // connection). Treat like a retryable error so a single blip never kills
      // a long-running backfill mid-flight.
      if (attempt === MAX_RETRIES) {
        console.error(
          `Network error on ${label} after ${MAX_RETRIES + 1} attempts (${err?.message ?? err}), giving up`
        );
        return null;
      }
      const backoff = RATE_LIMIT_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(
        `Network error on ${label} (${err?.message ?? err}), retrying in ${backoff / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`
      );
      await delay(backoff);
      continue;
    }
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
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining !== null && remaining !== "") {
      const parsed = Number(remaining);
      if (!Number.isNaN(parsed)) lastRateLimitRemaining = parsed;
    }
    return response;
  }
  return null;
}

type BillSubjectsResult = {
  policyArea?: { name?: string; updateDate?: string };
  legislativeSubjects: Array<{ name: string; updateDate?: string }>;
};

/**
 * Fetch a bill's subjects, paginating the `legislativeSubjects` list (its
 * `count` can exceed the 250-per-page limit; the original sync read only the
 * first page's policy area and discarded the rest). Returns null only if the
 * FIRST page fails; a later-page failure returns what was collected so far.
 *
 * The caller is expected to have just delayed before the first call, so page 0
 * does not delay; subsequent pages delay between requests to respect the rate
 * limit.
 */
async function fetchBillSubjects(
  congress: number,
  billType: string,
  billNumber: number | string,
  label: string,
): Promise<BillSubjectsResult | null> {
  const PAGE = 250;
  const MAX_PAGES = 20; // 5,000 subjects — far beyond any real bill
  let offset = 0;
  let policyArea: { name?: string; updateDate?: string } | undefined;
  const legislativeSubjects: Array<{ name: string; updateDate?: string }> = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await delay(DELAY_BETWEEN_REQUESTS_MS);
    const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}/subjects?format=json&limit=${PAGE}&offset=${offset}`;
    const resp = await fetchWithRetry(url, `${label} offset=${offset}`);
    if (!resp || !resp.ok) {
      if (page === 0) return null;
      break;
    }
    const data = await resp.json();
    if (policyArea === undefined && data.subjects?.policyArea) {
      policyArea = data.subjects.policyArea;
    }
    const batch: Array<{ name?: string; updateDate?: string }> =
      data.subjects?.legislativeSubjects ?? [];
    for (const s of batch) {
      if (s?.name) {
        legislativeSubjects.push({ name: s.name, updateDate: s.updateDate });
      }
    }
    if (batch.length < PAGE) break; // last page
    offset += PAGE;
  }
  return { policyArea, legislativeSubjects };
}

/**
 * Map the Library of Congress `textVersions` array to billText rows, pulling
 * the PDF and Formatted Text URLs out of each version's `formats`.
 */
function textVersionsToRows(
  textVersions: any[],
): Array<{
  date?: string;
  formatsUrlPdf?: string;
  formatsUrlTxt?: string;
  type?: string;
}> {
  return (textVersions || []).map((v: any) => {
    const pdf = v.formats?.find((f: any) => f.type === "PDF");
    const txt = v.formats?.find((f: any) => f.type === "Formatted Text");
    return {
      date: v.date ?? undefined,
      formatsUrlPdf: pdf?.url,
      formatsUrlTxt: txt?.url,
      type: v.type ?? undefined,
    };
  });
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

    let listUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}?offset=${args.offset}&limit=${BATCH_SIZE}&format=json`;
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
        let extraBits = 0;

        // 1. Fetch detailed bill info
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        const detailUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}/${bill.number}?format=json`;
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
          const actionsUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}/${bill.number}/actions?format=json&limit=250`;
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

        // 3. Fetch and store subjects (policy area + ALL legislative subjects)
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        try {
          const subjects = await fetchBillSubjects(
            args.congress,
            args.billType,
            bill.number,
            `subjects ${billId}`,
          );
          if (subjects) {
            endpointBits |= SYNC_SUBJECTS;
            if (subjects.policyArea) {
              await ctx.runMutation(internal.mutations.upsertBillSubject, {
                billId,
                policyAreaName: subjects.policyArea.name,
                policyAreaUpdateDate: subjects.policyArea.updateDate,
              });
            }
            // Replace-all, even when empty (a legitimately-empty list is a
            // valid "fully synced" state for minor bills).
            await ctx.runMutation(
              internal.mutations.replaceBillLegislativeSubjects,
              { billId, subjects: subjects.legislativeSubjects },
            );
            extraBits |= EXTRA_LEGISLATIVE_SUBJECTS;
          }
        } catch {
          // Non-critical
        }

        // 4. Fetch and store summaries
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        try {
          const summariesUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}/${bill.number}/summaries?format=json`;
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

        // 5. Fetch and store text/PDF info (ALL versions, replace-all)
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        try {
          const textUrl = `${BASE_URL}/bill/${args.congress}/${args.billType}/${bill.number}/text?format=json`;
          const textResponse = await fetchWithRetry(textUrl, `text ${billId}`);
          if (textResponse && textResponse.ok) {
            endpointBits |= SYNC_TEXT;
            const textData = await textResponse.json();
            await ctx.runMutation(internal.mutations.replaceBillTextVersions, {
              billId,
              versions: textVersionsToRows(textData.textVersions || []),
            });
            extraBits |= EXTRA_TEXT_VERSIONS;
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

        // Track enrichment progress separately (subjects + text versions).
        if (extraBits > 0) {
          await ctx.runMutation(internal.mutations.setBillExtraSyncedBits, {
            billId,
            bits: extraBits,
          });
        }

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

    // If circuit breaker tripped, reschedule the SAME offset after a long
    // backoff rather than abandoning pagination. Previously this returned
    // early, which silently stranded any remaining bills at higher offsets
    // until the next historical sync — the root cause of Congress 119 drifting
    // ~8.8K bills behind. We advance offset by successCount so the next run
    // retries the failed bills as well as the unseen ones.
    if (rateLimitAborted) {
      const resumeOffset = args.offset + successCount;
      if (args.snapshotId) {
        await ctx.runMutation(internal.mutations.updateSyncSnapshot, {
          snapshotId: args.snapshotId,
          errorDetails: `Rate limit circuit breaker at offset ${args.offset} for ${args.billType}; resuming at ${resumeOffset} after backoff`,
          totalProcessed: args.offset + successCount,
          totalSuccess: (args.offset || 0) + successCount,
          totalFailed: failCount,
        });
      }
      await ctx.scheduler.runAfter(
        RATE_LIMIT_RESUME_DELAY_MS,
        internal.congressApi.syncBillBatch,
        {
          congress: args.congress,
          billType: args.billType,
          offset: resumeOffset,
          snapshotId: args.snapshotId,
          fromDateTime: args.fromDateTime,
        },
      );
      return { processed: successCount, hasMore: true, successCount, failCount, rateLimitAborted: true };
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
      await ctx.runAction(internal.mutations.recomputeCongressStats, {
        congress: args.congress,
      });
      await ctx.runAction(internal.mutations.recomputeCongressPolicyAreas, {
        congress: args.congress,
      });
      await ctx.runAction(internal.mutations.recomputeCongressSponsors, {
        congress: args.congress,
      });

      // Refresh the per-chamber deep breakdown for the chamber this bill
      // type belongs to. The other chamber will be recomputed when its own
      // bill types finish; the daily 4 AM cron does a full sweep regardless.
      const chamber: "house" | "senate" = HOUSE_TYPES_SET.has(args.billType)
        ? "house"
        : "senate";
      await ctx.runAction(
        internal.mutations.recomputeCongressChamberBreakdown,
        { congress: args.congress, chamber },
      );
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
        const detailUrl = `${BASE_URL}/bill/${bill.congress}/${bill.billType}/${bill.billNumber}?format=json`;
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
          const url = `${BASE_URL}/bill/${bill.congress}/${bill.billType}/${bill.billNumber}/actions?format=json&limit=250`;
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
          const url = `${BASE_URL}/bill/${bill.congress}/${bill.billType}/${bill.billNumber}/subjects?format=json`;
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
          const url = `${BASE_URL}/bill/${bill.congress}/${bill.billType}/${bill.billNumber}/summaries?format=json`;
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
          const url = `${BASE_URL}/bill/${bill.congress}/${bill.billType}/${bill.billNumber}/text?format=json`;
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

const STAGE_BACKFILL_PAGE = 40; // bills per mutation (≤250 actions each → read-limit safe)
const STAGE_BACKFILL_BILLS_PER_RUN = 5000; // bills per invocation before self-scheduling

/**
 * Re-derive the progress stage for ALL existing bills from their stored
 * actions, using the corrected calculator (no API calls). Patches only bills
 * whose stage changed; the trigger-wrapped mutation keeps the aggregates in
 * sync. Self-schedules across batches and, on completion, refreshes the
 * precomputed homepage stats (Part 1c). Idempotent and safe to re-run.
 *
 * Run from the CLI: `npx convex run congressApi:backfillBillStages '{}'`.
 */
export const backfillBillStages = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (
    ctx,
    args,
  ): Promise<{ done: boolean; processedThisRun: number; changedThisRun: number }> => {
    let cursor: string | null = args.cursor ?? null;
    let processedThisRun = 0;
    let changedThisRun = 0;

    for (;;) {
      const page: BillBackfillPage = await ctx.runQuery(internal.mutations.getBillBackfillPage, {
        cursor,
        numItems: STAGE_BACKFILL_PAGE,
      });

      if (page.bills.length > 0) {
        const { changed } = await ctx.runMutation(
          internal.mutations.rederiveStagesForBills,
          {
            bills: page.bills.map((b) => ({
              _id: b._id,
              billId: b.billId,
              progressStage: b.progressStage,
              progressDescription: b.progressDescription,
            })),
          },
        );
        changedThisRun += changed;
        processedThisRun += page.bills.length;
      }

      if (page.isDone) {
        console.log(
          `backfillBillStages: pass complete, ${changedThisRun} stages changed this run; refreshing rollups`,
        );
        // Part 1c: refresh precomputed homepage stats so corrected stages show.
        await ctx.scheduler.runAfter(0, internal.congressApi.recomputeAllStats, {});
        return { done: true, processedThisRun, changedThisRun };
      }

      cursor = page.continueCursor;

      if (processedThisRun >= STAGE_BACKFILL_BILLS_PER_RUN) {
        await ctx.scheduler.runAfter(
          1000,
          internal.congressApi.backfillBillStages,
          { cursor },
        );
        console.log(
          `backfillBillStages: processed ${processedThisRun} (changed ${changedThisRun}); scheduled continuation`,
        );
        return { done: false, processedThisRun, changedThisRun };
      }
    }
  },
});

const ENRICHMENT_PAGE = 100; // bills scanned per page (already-done bills skip cheaply)
const ENRICHMENT_DELAY_MS = 350; // per API call
const ENRICHMENT_RATE_FLOOR = 3000; // pause when x-ratelimit-remaining drops below this
const ENRICHMENT_MAX_RUN_MS = 8 * 60 * 1000; // 8 min — margin before the 10-min action kill
const ENRICHMENT_COOLDOWN_MS = 15 * 60 * 1000; // wait when the rate floor is hit
const ENRICHMENT_RESCHEDULE_MS = 2000; // gap between self-scheduled continuations

/**
 * Managed historical backfill of the richer LoC data that the original sync
 * discarded: all legislative subjects (paginated) and all text versions. Visits
 * each bill missing an enrichment bit and fetches only the endpoints it needs,
 * marking progress via `extraSyncedBits` so it always resumes where it stopped
 * and no-ops once everything is stored.
 *
 * "Never hit the limit": a ~350ms per-call delay holds throughput near
 * ~10k req/hr (half the 20k/hr cap), and an adaptive throttle pauses for a
 * cooldown the moment the live `x-ratelimit-remaining` header drops below a
 * safety floor. Each invocation stops after ~8 minutes (well under the 10-min
 * action limit) and self-schedules a continuation.
 *
 * Resilient by design: transient per-bill failures are caught and skipped
 * (the bill keeps its missing bit and is retried on a later pass), and on
 * reaching the end the action starts a fresh pass whenever the previous pass
 * enriched at least one bill — so anything skipped due to a network blip is
 * picked up automatically. The loop stops once a full pass enriches nothing.
 *
 * Run from the CLI: `npx convex run congressApi:backfillBillEnrichment '{}'`.
 */
export const backfillBillEnrichment = internalAction({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    // Bills enriched so far in the CURRENT pass (threaded across the pass's
    // self-scheduled invocations). Used to decide whether to start another pass.
    passEnriched: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    done: boolean;
    enrichedThisRun: number;
    pausedForRateLimit: boolean;
  }> => {
    const apiKey = process.env.CONGRESS_API_KEY;
    if (!apiKey) throw new Error("CONGRESS_API_KEY not configured");

    const startedAt = Date.now();
    let cursor: string | null = args.cursor ?? null;
    let passEnriched = args.passEnriched ?? 0;
    let enrichedThisRun = 0;

    for (;;) {
      const page: BillBackfillPage = await ctx.runQuery(internal.mutations.getBillBackfillPage, {
        cursor,
        numItems: ENRICHMENT_PAGE,
      });

      for (const bill of page.bills) {
        const needsSubjects =
          (bill.extraSyncedBits & EXTRA_LEGISLATIVE_SUBJECTS) === 0;
        const needsText = (bill.extraSyncedBits & EXTRA_TEXT_VERSIONS) === 0;
        if (!needsSubjects && !needsText) continue;

        // Adaptive throttle: bail before exhausting the hourly budget. Resume
        // from the current page cursor (already-done bills skip on re-run).
        if (
          lastRateLimitRemaining !== null &&
          lastRateLimitRemaining < ENRICHMENT_RATE_FLOOR
        ) {
          console.warn(
            `backfillBillEnrichment: rate-limit floor hit (${lastRateLimitRemaining} remaining); cooling down`,
          );
          await ctx.scheduler.runAfter(
            ENRICHMENT_COOLDOWN_MS,
            internal.congressApi.backfillBillEnrichment,
            { cursor, passEnriched },
          );
          return { done: false, enrichedThisRun, pausedForRateLimit: true };
        }

        // Per-bill work is isolated: a thrown error (network blip, bad JSON)
        // skips just this bill — it keeps its missing bit and is retried later.
        try {
          let bits = 0;

          if (needsSubjects) {
            await delay(ENRICHMENT_DELAY_MS);
            const subjects = await fetchBillSubjects(
              bill.congress,
              bill.billType,
              bill.billNumber,
              `enrich subjects ${bill.billId}`,
            );
            if (subjects) {
              if (subjects.policyArea) {
                await ctx.runMutation(internal.mutations.upsertBillSubject, {
                  billId: bill.billId,
                  policyAreaName: subjects.policyArea.name,
                  policyAreaUpdateDate: subjects.policyArea.updateDate,
                });
              }
              await ctx.runMutation(
                internal.mutations.replaceBillLegislativeSubjects,
                { billId: bill.billId, subjects: subjects.legislativeSubjects },
              );
              bits |= EXTRA_LEGISLATIVE_SUBJECTS;
            }
          }

          if (needsText) {
            await delay(ENRICHMENT_DELAY_MS);
            const textUrl = `${BASE_URL}/bill/${bill.congress}/${bill.billType}/${bill.billNumber}/text?format=json`;
            const resp = await fetchWithRetry(textUrl, `enrich text ${bill.billId}`);
            if (resp && resp.ok) {
              const data = await resp.json();
              await ctx.runMutation(internal.mutations.replaceBillTextVersions, {
                billId: bill.billId,
                versions: textVersionsToRows(data.textVersions || []),
              });
              bits |= EXTRA_TEXT_VERSIONS;
            }
          }

          if (bits > 0) {
            await ctx.runMutation(internal.mutations.setBillExtraSyncedBits, {
              billId: bill.billId,
              bits,
            });
            enrichedThisRun++;
            passEnriched++;
          }
        } catch (err: any) {
          console.error(
            `backfillBillEnrichment: skipping ${bill.billId} after error: ${err?.message ?? err}`,
          );
        }

        if (Date.now() - startedAt > ENRICHMENT_MAX_RUN_MS) {
          await ctx.scheduler.runAfter(
            ENRICHMENT_RESCHEDULE_MS,
            internal.congressApi.backfillBillEnrichment,
            { cursor, passEnriched },
          );
          console.log(
            `backfillBillEnrichment: time budget reached, enriched ${enrichedThisRun} (pass ${passEnriched}); scheduled continuation`,
          );
          return { done: false, enrichedThisRun, pausedForRateLimit: false };
        }
      }

      if (page.isDone) {
        // Self-heal: if this pass enriched anything, run another full pass to
        // pick up bills that were skipped due to transient errors. A pass that
        // enriches nothing means everything reachable is done — stop.
        if (passEnriched > 0) {
          console.log(
            `backfillBillEnrichment: pass complete (enriched ${passEnriched}); starting another pass to catch any skipped bills`,
          );
          await ctx.scheduler.runAfter(
            ENRICHMENT_RESCHEDULE_MS,
            internal.congressApi.backfillBillEnrichment,
            { cursor: null, passEnriched: 0 },
          );
          return { done: false, enrichedThisRun, pausedForRateLimit: false };
        }
        console.log(
          `backfillBillEnrichment: complete — a full pass enriched 0 bills`,
        );
        return { done: true, enrichedThisRun, pausedForRateLimit: false };
      }
      cursor = page.continueCursor;
    }
  },
});

/**
 * Verification query for the enrichment backfill: per-congress counts of bills
 * still missing legislative subjects / text versions, plus the global total
 * remaining. Watch `remaining` trend to 0.
 *
 * Run from the CLI: `npx convex run congressApi:backfillEnrichmentStatus '{}'`.
 */
export const backfillEnrichmentStatus = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    total: number;
    remaining: number;
    byCongress: Array<{
      congress: number;
      total: number;
      missingSubjects: number;
      missingText: number;
      complete: number;
    }>;
  }> => {
    let cursor: string | null = null;
    let total = 0;
    let remaining = 0;
    const perCongress = new Map<
      number,
      {
        total: number;
        missingSubjects: number;
        missingText: number;
        complete: number;
      }
    >();

    for (;;) {
      const page: BillBackfillPage = await ctx.runQuery(internal.mutations.getBillBackfillPage, {
        cursor,
        numItems: 2000,
      });
      for (const b of page.bills) {
        total++;
        const row =
          perCongress.get(b.congress) ??
          { total: 0, missingSubjects: 0, missingText: 0, complete: 0 };
        row.total++;
        if ((b.extraSyncedBits & EXTRA_LEGISLATIVE_SUBJECTS) === 0)
          row.missingSubjects++;
        if ((b.extraSyncedBits & EXTRA_TEXT_VERSIONS) === 0) row.missingText++;
        if ((b.extraSyncedBits & EXTRA_COMPLETE) === EXTRA_COMPLETE) {
          row.complete++;
        } else {
          remaining++;
        }
        perCongress.set(b.congress, row);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const byCongress = [...perCongress.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([congress, row]) => ({ congress, ...row }));

    console.log(
      `backfillEnrichmentStatus: total=${total}, remaining=${remaining}`,
    );
    return { total, remaining, byCongress };
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
      await ctx.runAction(internal.mutations.recomputeCongressStats, { congress });
    }

    // Recompute the per-chamber deep breakdown (party / state / monthly).
    // Each call paginates through ~6-7K bills, so we run them sequentially
    // to stay polite to the database.
    for (const congress of congressesToUpdate) {
      for (const chamber of ["house", "senate"] as const) {
        await ctx.runAction(
          internal.mutations.recomputeCongressChamberBreakdown,
          { congress, chamber },
        );
      }
    }

    console.log(`Recomputed stats for congresses: ${congressesToUpdate.join(", ")}`);
    return { congresses: congressesToUpdate };
  },
});

/**
 * Trigger a recompute of all congress stats. Internal-only — call from the
 * CLI (`npx convex run congressApi:triggerRecomputeStats`) or from server
 * code via `ctx.runAction`. Not exposed to the client because the cascade
 * paginates every bill in every congress and would let any visitor amplify
 * Convex function-quota cost on demand.
 */
export const triggerRecomputeStats = internalAction({
  args: {},
  handler: async (ctx): Promise<{ congresses: number[] }> => {
    const result = await ctx.runAction(internal.congressApi.recomputeAllStats);
    return result;
  },
});

/**
 * Rebuild the congressSponsors table for every congress that has bills.
 * Mirrors recomputeAllStats — probes the index for each congress in range
 * and recomputes sponsors only where data exists. Every sponsor is stored,
 * including members who sponsored a single bill.
 *
 * New congresses self-populate via the regular sync flow
 * (syncBillBatch → recomputeCongressSponsors at end-of-batch), so this
 * action is primarily for one-off backfills and manual refreshes.
 */
export const recomputeAllSponsors = internalAction({
  args: {},
  handler: async (ctx): Promise<{ congresses: number[] }> => {
    const congressesToUpdate: number[] = [];
    for (let c = 93; c <= 120; c++) {
      const hasBills = await ctx.runQuery(internal.bills.hasBillsForCongress, {
        congress: c,
      });
      if (hasBills) congressesToUpdate.push(c);
    }

    for (const congress of congressesToUpdate) {
      await ctx.runAction(internal.mutations.recomputeCongressSponsors, {
        congress,
      });
    }

    console.log(
      `Recomputed sponsors for congresses: ${congressesToUpdate.join(", ")}`,
    );
    return { congresses: congressesToUpdate };
  },
});

/**
 * Kick off the sponsor backfill from the CLI:
 *   npx convex run congressApi:triggerRecomputeAllSponsors
 *
 * Internal-only — `npx convex run` works for both `action` and
 * `internalAction`, so the documented workflow is unchanged. Not exposed
 * to clients because the cascade paginates every bill in every congress.
 */
export const triggerRecomputeAllSponsors = internalAction({
  args: {},
  handler: async (ctx): Promise<{ congresses: number[] }> => {
    return await ctx.runAction(internal.congressApi.recomputeAllSponsors);
  },
});

/**
 * Delete all bills for a specific congress. Internal-only — destructive
 * and irreversible (the next incremental sync only re-pulls the last 26
 * hours of activity, so historical congresses do NOT auto-recover). Run
 * from the CLI: `npx convex run congressApi:deleteCongress '{"congress": 108}'`.
 */
export const deleteCongress = internalAction({
  args: { congress: v.number() },
  handler: async (ctx, args): Promise<{ deleted: number }> => {
    let deleted = 0;
    for (;;) {
      const result = await ctx.runMutation(
        internal.mutations.deleteCongressBills,
        { congress: args.congress },
      );
      deleted += result.deleted;
      if (!result.hasMore) break;
    }
    return { deleted };
  },
});
