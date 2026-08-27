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
 * One row taken from the queue, ready to submit.
 *
 * Written out rather than inferred because `submitBatch` calls `takeBatch` in
 * this same file, and TypeScript cannot resolve a function's type through a
 * `ctx.runMutation` back into itself — the circularity the Convex guidelines
 * call out. Without the annotation every `row` below silently becomes `any`.
 */
type QueuedRow = { id: Id<"indexNowQueue">; billId: string };

/**
 * IndexNow — announcing a changed bill page instead of waiting to be re-crawled.
 *
 * Bing carries essentially all of this site's search traffic and has listed
 * "Set up IndexNow" as its top recommendation for weeks. **Google does not
 * participate**; the engines behind api.indexnow.org are Bing, Yandex, Seznam
 * and Naver.
 *
 * ── Shape ─────────────────────────────────────────────────────────────────
 *
 * `mutations.ts` enqueues a bill when the page a reader sees actually changed.
 * A cron drains the queue twice a day. There is exactly one submission path,
 * so the one-time backlog seed also writes into the queue rather than posting
 * on its own.
 *
 * Raw `internalMutation` from `_generated/server`, not the trigger-wrapped one
 * in `functions.ts`: the bill aggregates have nothing to do with this table,
 * and wrapping would fire them on writes that cannot affect them.
 *
 * Everything here is internal. Nothing in this file is callable from a browser.
 */

/**
 * The key, mirrored from `lib/indexnow.ts`.
 *
 * It is duplicated because Convex bundles its own directory — nothing in
 * `convex/` imports from outside it, and the `@/` alias does not resolve here.
 * `lib/indexnow.test.ts` reads this file from disk and fails if this literal,
 * the one in `lib/indexnow.ts`, and the served `public/<key>.txt` disagree.
 *
 * Not a credential: the protocol requires it to be published at a public URL,
 * and that publication is the proof of domain control.
 */
export const INDEXNOW_KEY = "0e777a2e9680e516333e5d77dd7c37b9";

const INDEXNOW_HOST = "billsincongress.com";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;

/**
 * Queue priorities. A bill that becomes law must not wait behind a backlog of
 * pages that have not changed — with 55,000 seed rows draining at 4,000 a day,
 * strict oldest-first ordering would have delayed every real announcement by
 * about two weeks, which is the entire point of the feature.
 */
export const CHANGE_PRIORITY = 0;
export const SEED_PRIORITY = 1;

/** URLs per submission. The protocol's ceiling is 10,000. */
const SUBMIT_BATCH_SIZE = 2000;

/** Bills read per seed-enqueue step, kept well inside Convex's transaction
 *  limits (32,000 documents scanned, 16,000 written, 16 MiB per function). */
const SEED_ENQUEUE_PAGE = 500;

/**
 * Note that a bill's page changed in a way a reader would see.
 *
 * Deduped on billId, so a bill whose status, actions and summary all change in
 * one sync is announced once. Called from `mutations.ts`; exported as a plain
 * function rather than a Convex mutation so it joins the caller's transaction
 * instead of racing it.
 */
export async function queueForIndexNow(
  ctx: MutationCtx,
  billId: string,
  reason: string,
  priority: number = CHANGE_PRIORITY,
): Promise<void> {
  const existing = await ctx.db
    .query("indexNowQueue")
    .withIndex("by_billId", (q) => q.eq("billId", billId))
    .first();

  if (existing) {
    // A real change outranks a seed row already sitting in the queue.
    //
    // `queuedAt` is restamped along with the priority. It records when this
    // entry became what it now is, so leaving the seed's original timestamp
    // would sort a bill first announced weeks ago ahead of changes that
    // happened this morning. Harmless while change volume stays under one
    // batch, wrong as soon as it does not.
    if (priority < existing.priority) {
      await ctx.db.patch(existing._id, {
        priority,
        reason,
        queuedAt: new Date().toISOString(),
      });
    }
    return;
  }

  await ctx.db.insert("indexNowQueue", {
    billId,
    queuedAt: new Date().toISOString(),
    reason,
    priority,
  });
}

/** Public URL of a bill page — what actually gets announced. */
function billUrl(billId: string): string {
  return `https://${INDEXNOW_HOST}/bills/${billId}`;
}

// ── Queue operations ───────────────────────────────────────────────────────

/**
 * The oldest rows to submit next: real changes first, then backlog seed rows
 * filling whatever capacity is left.
 */
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

/** Remove rows a submission accounted for. */
export const clearBatch = internalMutation({
  args: { ids: v.array(v.id("indexNowQueue")) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      await ctx.db.delete(id);
    }
  },
});

/**
 * Queue depth, split by priority.
 *
 * Worth checking periodically: if submissions start failing on a rejected key
 * the queue grows and nothing else says so. Counts are capped because a count
 * that scans an unbounded table is itself a hazard.
 */
export const pendingCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const CAP = 20_000;
    const changes = await ctx.db
      .query("indexNowQueue")
      .withIndex("by_priority_and_queuedAt", (q) => q.eq("priority", CHANGE_PRIORITY))
      .take(CAP);
    const seeds = await ctx.db
      .query("indexNowQueue")
      .withIndex("by_priority_and_queuedAt", (q) => q.eq("priority", SEED_PRIORITY))
      .take(CAP);
    return {
      changes: changes.length,
      seed: seeds.length,
      capped: changes.length === CAP || seeds.length === CAP,
    };
  },
});

// ── Submitting ─────────────────────────────────────────────────────────────

/**
 * Drain one batch to IndexNow.
 *
 * Runs on a cron twice a day. A failure never loses rows: only an accepted
 * submission, or one rejected in a way retrying cannot fix, deletes anything.
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
      // A network failure is indistinguishable from a 5xx here, and both mean
      // the same thing: leave the rows alone and try again next run.
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
      // Not retryable and not survivable — leaving these queued would block
      // every row behind them forever. Log enough to fix the cause.
      console.error(
        `IndexNow ${status}: ${outcome.reason}. Dropping ${urlList.length} URLs. ` +
          `First few: ${urlList.slice(0, 5).join(", ")}`,
      );
      await ctx.runMutation(internal.indexNow.clearBatch, {
        ids: batch.map((row) => row.id),
      });
      return { submitted: 0, outcome: "drop" as const };
    }

    // "stop" and "retry" both leave the batch queued. The difference is how
    // loudly to complain: a 403 or 429 will not fix itself.
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

// ── One-time backlog seed ──────────────────────────────────────────────────

/**
 * Enqueue one page of existing bills at seed priority.
 *
 * Newest Congress first — `by_congress` descending — because the 119th is what
 * people search for. Idempotent: `queueForIndexNow` dedupes on billId, so
 * re-running after a failure costs reads and changes nothing.
 */
export const seedEnqueuePage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ queued: number; cursor: string; isDone: boolean }> => {
    const page = await ctx.db
      .query("bills")
      .withIndex("by_congress")
      .order("desc")
      .paginate({ numItems: SEED_ENQUEUE_PAGE, cursor: args.cursor });

    for (const bill of page.page) {
      await queueForIndexNow(ctx, bill.billId, "seed", SEED_PRIORITY);
    }

    return {
      queued: page.page.length,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * Walk every bill once, adding it to the queue at seed priority.
 *
 * Started by hand (`npx convex run --prod internal.indexNow.seedBacklog`), never
 * on a cron. It finishes in minutes; the pacing that matters happens afterwards,
 * as the twice-daily cron drains ~4,000 URLs a day.
 *
 * Progress lives in the queue table rather than in a scheduled chain, so a
 * failure part-way leaves durable rows and re-running resumes rather than
 * restarts. An earlier design held a cursor in a 14-day chain of scheduled
 * calls, where a single failure would have ended the seed silently with no
 * record of where it stopped.
 */
export const seedBacklog = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<{ queued: number; done: boolean }> => {
    let cursor: string | null = args.cursor ?? null;
    let queued = 0;

    // Bounded so one invocation cannot run away; it self-schedules to continue.
    for (let step = 0; step < 20; step++) {
      const result: { queued: number; cursor: string; isDone: boolean } =
        await ctx.runMutation(internal.indexNow.seedEnqueuePage, { cursor });
      queued += result.queued;
      cursor = result.cursor;
      if (result.isDone) {
        console.log(`IndexNow seed complete: ${queued} bills queued in this run.`);
        return { queued, done: true };
      }
    }

    await ctx.scheduler.runAfter(0, internal.indexNow.seedBacklog, { cursor });
    console.log(`IndexNow seed: ${queued} bills queued so far, continuing.`);
    return { queued, done: false };
  },
});
