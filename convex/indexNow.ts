import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { interpretIndexNowStatus } from "./indexNowStatus";

/**
 * One row taken from the queue. Written out rather than inferred: `submitBatch`
 * calls `takeBatch` in this same file through `ctx.runMutation`, and TypeScript
 * cannot resolve a function's type back through that circularity. Without the
 * annotation every `row` below silently becomes `any`.
 */
type QueuedRow = { id: Id<"indexNowQueue">; billId: string };

/**
 * IndexNow — announcing changed bill pages instead of waiting to be re-crawled.
 * The engines behind api.indexnow.org are Bing, Yandex, Seznam and Naver;
 * Google does not participate.
 *
 * `mutations.ts` enqueues a bill when the page a reader sees changed; a cron
 * drains the queue twice a day. The backlog seed writes into the same queue.
 *
 * Uses the RAW `internalMutation` from `_generated/server`, not the
 * trigger-wrapped one in `functions.ts`: the bill aggregates have nothing to do
 * with this table, and wrapping would fire them on writes that cannot affect
 * them.
 *
 * Everything here is internal; nothing in this file is callable from a browser.
 */

/**
 * The key, mirrored from `lib/indexnow.ts` — Convex bundles its own directory,
 * so nothing here can import it. `lib/indexnow.test.ts` reads this file from
 * disk and fails if this literal, the one in `lib/indexnow.ts`, and the served
 * `public/<key>.txt` disagree.
 *
 * Not a credential: the protocol requires it to be published at a public URL.
 */
export const INDEXNOW_KEY = "0e777a2e9680e516333e5d77dd7c37b9";

const INDEXNOW_HOST = "billsincongress.com";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;

/** Queue lanes: a real change must never wait behind the one-time backlog seed,
 *  which at ~4,000 URLs a day would delay announcements by about two weeks. */
export const CHANGE_PRIORITY = 0;
export const SEED_PRIORITY = 1;

/** URLs per submission. The protocol's ceiling is 10,000. */
const SUBMIT_BATCH_SIZE = 2000;

/** Bills read per seed-enqueue step, kept well inside Convex's transaction
 *  limits (32,000 documents scanned, 16,000 written, 16 MiB per function). */
const SEED_ENQUEUE_PAGE = 500;

/**
 * Deduped on billId, so a bill whose status, actions and summary all change in
 * one sync is announced once. A plain function rather than a Convex mutation so
 * it joins the caller's transaction in `mutations.ts` instead of racing it.
 */
export type QueueOutcome = "inserted" | "promoted" | "unchanged";

export async function queueForIndexNow(
  ctx: MutationCtx,
  billId: string,
  reason: string,
  priority: number = CHANGE_PRIORITY,
): Promise<QueueOutcome> {
  const existing = await ctx.db
    .query("indexNowQueue")
    .withIndex("by_billId", (q) => q.eq("billId", billId))
    .first();

  if (existing) {
    // A real change outranks a seed row already queued. `queuedAt` is restamped
    // with the priority — it records when the entry became what it now is, so a
    // seed's original timestamp cannot sort ahead of changes from this morning.
    if (priority < existing.priority) {
      await ctx.db.patch(existing._id, {
        priority,
        reason,
        queuedAt: new Date().toISOString(),
      });
      return "promoted";
    }
    return "unchanged";
  }

  await ctx.db.insert("indexNowQueue", {
    billId,
    queuedAt: new Date().toISOString(),
    reason,
    priority,
  });
  return "inserted";
}

function billUrl(billId: string): string {
  return `https://${INDEXNOW_HOST}/bills/${billId}`;
}

/** Oldest rows to submit next: real changes first, then seed rows filling
 *  whatever capacity is left. */
export const takeBatch = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args): Promise<QueuedRow[]> => {
    const changes = await ctx.db
      .query("indexNowQueue")
      .withIndex("by_priority_and_queuedAt", (q) => q.eq("priority", CHANGE_PRIORITY))
      .order("asc")
      .take(args.limit);

    const remaining = args.limit - changes.length;
    const seeds =
      remaining > 0
        ? await ctx.db
            .query("indexNowQueue")
            .withIndex("by_priority_and_queuedAt", (q) => q.eq("priority", SEED_PRIORITY))
            .order("asc")
            .take(remaining)
        : [];

    return [...changes, ...seeds].map((row) => ({ id: row._id, billId: row.billId }));
  },
});

export const clearBatch = internalMutation({
  args: { ids: v.array(v.id("indexNowQueue")) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      await ctx.db.delete(id);
    }
  },
});

/**
 * How many *real changes* are waiting — the number that answers "is anything
 * broken". Change lane only: it stays exact because that lane is small, and
 * scanning both lanes at 20,000 each would exceed Convex's 32,000-document
 * read limit. Use `queueDepth` for an exact total.
 */
export const pendingCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const CAP = 5_000;
    const changes = await ctx.db
      .query("indexNowQueue")
      .withIndex("by_priority_and_queuedAt", (q) => q.eq("priority", CHANGE_PRIORITY))
      .take(CAP);
    return {
      changes: changes.length,
      capped: changes.length === CAP,
      note: "change lane only — run indexNow:queueDepth for the seed backlog too",
    };
  },
});

export const queueDepthPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ changes: number; seed: number; cursor: string; isDone: boolean }> => {
    const page = await ctx.db
      .query("indexNowQueue")
      .paginate({ numItems: 2000, cursor: args.cursor });

    let changes = 0;
    let seed = 0;
    for (const row of page.page) {
      if (row.priority === CHANGE_PRIORITY) changes++;
      else seed++;
    }
    return { changes, seed, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * Exact queue depth, by lane. An action that pages rather than a query that
 * scans: Convex caps a transaction at 32,000 documents and the queue can hold
 * 55,000.
 *
 *   npx convex run --prod internal.indexNow.queueDepth '{}'
 */
export const queueDepth = internalAction({
  args: {},
  handler: async (ctx): Promise<{ changes: number; seed: number; total: number }> => {
    let cursor: string | null = null;
    let changes = 0;
    let seed = 0;

    for (;;) {
      const page: { changes: number; seed: number; cursor: string; isDone: boolean } =
        await ctx.runQuery(internal.indexNow.queueDepthPage, { cursor });
      changes += page.changes;
      seed += page.seed;
      if (page.isDone) break;
      cursor = page.cursor;
    }

    return { changes, seed, total: changes + seed };
  },
});

/**
 * Drain one batch to IndexNow, on a cron twice a day. A failure never loses
 * rows: only an accepted submission, or one rejected in a way retrying cannot
 * fix, deletes anything.
 */
export const submitBatch = internalAction({
  args: {},
  handler: async (ctx) => {
    const batch: QueuedRow[] = await ctx.runMutation(internal.indexNow.takeBatch, {
      limit: SUBMIT_BATCH_SIZE,
    });
    if (batch.length === 0) return { submitted: 0, outcome: "empty" as const };

    const urlList = batch.map((row) => billUrl(row.billId));

    let status = 0;
    try {
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: INDEXNOW_HOST,
          key: INDEXNOW_KEY,
          keyLocation: INDEXNOW_KEY_LOCATION,
          urlList,
        }),
      });
      status = response.status;
    } catch (error) {
      // A network failure means what a 5xx means: leave the rows and retry.
      console.error("IndexNow request failed before a response:", error);
      return { submitted: 0, outcome: "retry" as const };
    }

    const outcome = interpretIndexNowStatus(status);

    if (outcome.kind === "accepted") {
      await ctx.runMutation(internal.indexNow.clearBatch, {
        ids: batch.map((row) => row.id),
      });
      console.log(`IndexNow: ${urlList.length} URLs accepted (${status})`);
      return { submitted: urlList.length, outcome: "accepted" as const };
    }

    if (outcome.kind === "drop") {
      // Not retryable: leaving these queued would block every row behind them.
      console.error(
        `IndexNow ${status}: ${outcome.reason}. Dropping ${urlList.length} URLs. ` +
          `First few: ${urlList.slice(0, 5).join(", ")}`,
      );
      await ctx.runMutation(internal.indexNow.clearBatch, {
        ids: batch.map((row) => row.id),
      });
      return { submitted: 0, outcome: "drop" as const };
    }

    // "stop" and "retry" both leave the batch queued; a 403/429 will not self-heal.
    if (outcome.kind === "stop") {
      console.error(
        `IndexNow ${status}: ${outcome.reason}. ${batch.length} URLs left queued; ` +
          `no further submissions will succeed until this is resolved.`,
      );
      return { submitted: 0, outcome: "stop" as const };
    }

    console.warn(`IndexNow ${status}: ${outcome.reason}. ${batch.length} URLs left queued.`);
    return { submitted: 0, outcome: "retry" as const };
  },
});

/**
 * Enqueue one page of existing bills at seed priority, newest Congress first
 * (`by_congress` descending) because the current Congress is what people
 * search for. Idempotent — `queueForIndexNow` dedupes on billId.
 */
export const seedEnqueuePage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ inserted: number; walked: number; cursor: string; isDone: boolean }> => {
    const page = await ctx.db
      .query("bills")
      .withIndex("by_congress")
      .order("desc")
      .paginate({ numItems: SEED_ENQUEUE_PAGE, cursor: args.cursor });

    // Rows added, not bills looked at, so a re-run of an already-seeded backlog
    // reports 0 rather than repeating the first run's figures.
    let inserted = 0;
    for (const bill of page.page) {
      if ((await queueForIndexNow(ctx, bill.billId, "seed", SEED_PRIORITY)) === "inserted") {
        inserted++;
      }
    }

    return {
      inserted,
      walked: page.page.length,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * Walk every bill once, adding it to the queue at seed priority. Started by
 * hand, never on a cron; it finishes in minutes, and the twice-daily cron then
 * drains ~4,000 URLs a day. Progress lives in the queue table rather than in a
 * scheduled chain, so a failure part-way resumes rather than restarts.
 *
 *   npx convex run --prod internal.indexNow.seedBacklog
 */
export const seedBacklog = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (
    ctx,
    args,
  ): Promise<{ inserted: number; walked: number; done: boolean }> => {
    let cursor: string | null = args.cursor ?? null;
    let inserted = 0;
    let walked = 0;

    // Bounded so one invocation cannot run away; it self-schedules to continue.
    for (let step = 0; step < 20; step++) {
      const result: {
        inserted: number;
        walked: number;
        cursor: string;
        isDone: boolean;
      } = await ctx.runMutation(internal.indexNow.seedEnqueuePage, { cursor });
      inserted += result.inserted;
      walked += result.walked;
      cursor = result.cursor;
      if (result.isDone) {
        console.log(
          `IndexNow seed complete: ${inserted} rows added from ${walked} bills walked in this run.`,
        );
        return { inserted, walked, done: true };
      }
    }

    await ctx.scheduler.runAfter(0, internal.indexNow.seedBacklog, { cursor });
    console.log(
      `IndexNow seed: ${inserted} rows added from ${walked} bills walked so far, continuing.`,
    );
    return { inserted, walked, done: false };
  },
});

/** Delete one batch of seed rows. Change-lane rows are never touched. */
export const clearSeedQueueBatch = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args): Promise<{ deleted: number }> => {
    const rows = await ctx.db
      .query("indexNowQueue")
      .withIndex("by_priority_and_queuedAt", (q) => q.eq("priority", SEED_PRIORITY))
      .take(args.limit);

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { deleted: rows.length };
  },
});

/**
 * Abandon the backlog seed, leaving real changes queued — an escape hatch that
 * stops the 55,000-page seed without stopping real change announcements.
 *
 *   npx convex run --prod internal.indexNow.clearSeedQueue '{}'
 */
export const clearSeedQueue = internalAction({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    let deleted = 0;
    // 2,000 deletes a batch, well inside Convex's 16,000-writes-per-transaction
    // limit; 40 batches covers 80,000 rows, more than the whole corpus.
    for (let batch = 0; batch < 40; batch++) {
      const result: { deleted: number } = await ctx.runMutation(
        internal.indexNow.clearSeedQueueBatch,
        { limit: 2000 },
      );
      deleted += result.deleted;
      if (result.deleted === 0) break;
    }
    console.log(`IndexNow seed abandoned: ${deleted} seed rows deleted. Real changes untouched.`);
    return { deleted };
  },
});
