import { v } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { rateLimiter } from "./rateLimits";
import {
  isAllowedOrigin,
  MAX_PICTURE_BYTES,
  MAX_STORED_PICTURES,
  PICTURE_RETENTION_MS,
  sniffPictureType,
} from "./feedbackPicture";

// Pictures attached to the header's Feedback box (components/feedback/).
//
// The reader's message never comes here: it goes to PostHog as a survey
// response, carrying the link this endpoint returns. So this file stores a file
// and hands back its URL, and that is all it knows. No account, no message, no
// page. The URL is unguessable but public, which is what lets PostHog's Surveys
// tab show it; the privacy policy says so.

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function reply(origin: string | null, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(isAllowedOrigin(origin) ? corsHeaders(origin) : {}),
    },
  });
}

export const pictureOptions = httpAction(async (_ctx, request) => {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
});

/** POST the picture's bytes as the body. Replies `{ url }`, or `{ error }`. */
export const uploadPicture = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return reply(origin, 403, { error: "forbidden" });

  // Refuse an oversized body before reading it when the length is declared,
  // and again after, because a declared length can be missing or wrong.
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_PICTURE_BYTES) return reply(origin, 413, { error: "too_large" });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return reply(origin, 400, { error: "empty" });
  if (bytes.byteLength > MAX_PICTURE_BYTES) return reply(origin, 413, { error: "too_large" });

  const contentType = sniffPictureType(bytes);
  if (!contentType) return reply(origin, 415, { error: "not_a_picture" });

  const full: boolean = await ctx.runQuery(internal.feedback.pictureStoreFull, {});
  if (full) return reply(origin, 503, { error: "full" });

  const status = await rateLimiter.limit(ctx, "feedbackPicturesPerDay", { key: "all" });
  if (!status.ok) return reply(origin, 429, { error: "busy" });

  const storageId = await ctx.storage.store(new Blob([bytes], { type: contentType }));
  await ctx.runMutation(internal.feedback.recordPicture, {
    storageId,
    contentType,
    size: bytes.byteLength,
  });
  const url = await ctx.storage.getUrl(storageId);
  if (!url) return reply(origin, 500, { error: "stored_without_url" });
  return reply(origin, 200, { url });
});

/** Whether MAX_STORED_PICTURES are already kept. Reads at most that many rows. */
export const pictureStoreFull = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const rows = await ctx.db.query("feedbackPictures").take(MAX_STORED_PICTURES);
    return rows.length >= MAX_STORED_PICTURES;
  },
});

export const recordPicture = internalMutation({
  args: { storageId: v.id("_storage"), contentType: v.string(), size: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("feedbackPictures", args);
    return null;
  },
});

const PURGE_BATCH = 100;

/** Daily: delete pictures older than 180 days, file and row together. */
export const purgeOldPictures = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - PICTURE_RETENTION_MS;
    const old = await ctx.db
      .query("feedbackPictures")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .take(PURGE_BATCH);
    for (const row of old) {
      // A file already removed by hand must not stall every later purge.
      if (await ctx.db.system.get(row.storageId)) await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
    if (old.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.feedback.purgeOldPictures, {});
    }
    return null;
  },
});
