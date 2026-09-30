import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  mutation,
  internalMutation,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./users";
import { rateLimiter } from "./rateLimits";

/**
 * Profile photos. The browser crops and compresses the photo (512px square,
 * WebP, typically 20–60 KB; lib/avatar-image.ts), uploads it straight to
 * Convex file storage through a one-time URL, then hands the storage id to
 * `setAvatar`, which reads the file's first bytes to check it really is a
 * WebP, JPEG or PNG (the upload's Content-Type is whatever the client said)
 * and that it is small, before it is attached.
 *
 * The photo's URL is only ever returned to its owner (`users.currentUser`). It
 * is an unguessable capability link, like a Google or Slack avatar URL: no
 * listing, no index, no way to find another reader's photo.
 *
 * Convex storage holds nothing but these photos, which is what lets
 * `sweepOrphans` delete any file no user points at. A feature that stores
 * other files must teach the sweep about them first.
 */

// Well above what the editor produces (a JPEG fallback on browsers that
// cannot encode WebP lands near 100 KB), well below anything a photo needs.
const AVATAR_MAX_BYTES = 512 * 1024;
// An upload that was never attached (tab closed mid-save, a script) is kept
// this long before the sweep deletes it, so it never races a save in flight.
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

export type AvatarSource = "upload" | "google" | null;

/** What the reader's avatar shows: their upload, else their Google picture, else initials. */
export async function avatarFor(
  ctx: QueryCtx,
  user: Doc<"users">,
): Promise<{ avatarUrl: string | null; avatarSource: AvatarSource }> {
  if (user.avatarStorageId) {
    const url = await ctx.storage.getUrl(user.avatarStorageId);
    if (url) return { avatarUrl: url, avatarSource: "upload" };
  }
  const google = googlePicture(user);
  if (google && !user.avatarHidden) return { avatarUrl: google, avatarSource: "google" };
  return { avatarUrl: null, avatarSource: null };
}

/** The picture a Google sign-in wrote to `image`, if it is a plain https URL. */
export function googlePicture(user: Doc<"users">): string | null {
  const image = user.image;
  if (!image) return null;
  try {
    return new URL(image).protocol === "https:" ? image : null;
  } catch {
    return null;
  }
}

async function deleteUpload(ctx: MutationCtx, user: Doc<"users">) {
  if (!user.avatarStorageId) return;
  // Already gone (swept, or deleted by hand) is fine: the goal is that it is gone.
  const file = await ctx.db.system.get("_storage", user.avatarStorageId);
  if (file) await ctx.storage.delete(user.avatarStorageId);
}

/** A one-time URL the browser POSTs the compressed photo to. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await rateLimiter.limit(ctx, "avatarUploadPerUser", { key: user._id, throws: true });
    return await ctx.storage.generateUploadUrl();
  },
});

/** The image format a file's first bytes announce, or null if it is none we accept. */
export function sniffImage(head: Uint8Array): "webp" | "jpeg" | "png" | null {
  const at = (i: number, bytes: number[]) => bytes.every((b, j) => head[i + j] === b);
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "webp"; // RIFF....WEBP
  if (at(0, [0xff, 0xd8, 0xff])) return "jpeg";
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  return null;
}

/** A stored file's size from its metadata, without reading the file. */
export const uploadSize = internalQuery({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { storageId }) => (await ctx.db.system.get("_storage", storageId))?.size ?? null,
});

/**
 * Check an uploaded file and attach it as the caller's photo. An action,
 * because only actions can read a stored file's bytes. A file that is too big
 * or is not an image is deleted and refused. The size is checked from the
 * metadata first: an upload URL takes a file of any size, and reading a huge
 * one into the action just to refuse it is the cost this avoids.
 */
export const setAvatar = action({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    if (!(await getAuthUserId(ctx))) throw new ConvexError("UNAUTHENTICATED");
    const size: number | null = await ctx.runQuery(internal.avatars.uploadSize, { storageId });
    if (size === null) throw new ConvexError("AVATAR_MISSING");
    if (size > AVATAR_MAX_BYTES) {
      await ctx.runMutation(internal.avatars.discardUpload, { storageId });
      throw new ConvexError("AVATAR_INVALID");
    }
    const file = await ctx.storage.get(storageId);
    if (!file) throw new ConvexError("AVATAR_MISSING");
    if (sniffImage(new Uint8Array(await file.slice(0, 12).arrayBuffer())) === null) {
      await ctx.runMutation(internal.avatars.discardUpload, { storageId });
      throw new ConvexError("AVATAR_INVALID");
    }
    await ctx.runMutation(internal.avatars.attach, { storageId });
    return null;
  },
});

/** Delete a refused upload, unless (somehow) it is someone's photo. */
export const discardUpload = internalMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const owner = await ctx.db
      .query("users")
      .withIndex("by_avatarStorageId", (q) => q.eq("avatarStorageId", storageId))
      .first();
    if (!owner && (await ctx.db.system.get("_storage", storageId))) await ctx.storage.delete(storageId);
    return null;
  },
});

/**
 * Make a checked file the caller's photo, replacing and deleting their
 * previous upload. Refuses a file another reader already uses.
 */
export const attach = internalMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const user = await requireUser(ctx);
    if (user.avatarStorageId === storageId) return null;
    const owner = await ctx.db
      .query("users")
      .withIndex("by_avatarStorageId", (q) => q.eq("avatarStorageId", storageId))
      .first();
    if (owner) throw new ConvexError("AVATAR_MISSING");

    await deleteUpload(ctx, user);
    await ctx.db.patch(user._id, { avatarStorageId: storageId, avatarHidden: undefined });
    return null;
  },
});

/** Back to initials. Deletes the upload and hides a Google picture too. */
export const removeAvatar = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await deleteUpload(ctx, user);
    await ctx.db.patch(user._id, { avatarStorageId: undefined, avatarHidden: true });
    return null;
  },
});

/** Show the Google picture again, in place of an upload or initials. */
export const restoreGooglePicture = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!googlePicture(user)) throw new ConvexError("NO_GOOGLE_PICTURE");
    await deleteUpload(ctx, user);
    await ctx.db.patch(user._id, { avatarStorageId: undefined, avatarHidden: undefined });
    return null;
  },
});

/**
 * Delete stored files no user points at and older than the grace period:
 * uploads that were never attached, or were rejected before `setAvatar` ran.
 * Walks `_storage` a page at a time, rescheduling itself until done.
 */
export const sweepOrphans = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const cutoff = Date.now() - ORPHAN_GRACE_MS;
    const page = await ctx.db.system
      .query("_storage")
      .paginate({ numItems: 200, cursor: cursor ?? null });

    let deleted = 0;
    for (const file of page.page) {
      if (file._creationTime > cutoff) continue;
      const owner = await ctx.db
        .query("users")
        .withIndex("by_avatarStorageId", (q) =>
          q.eq("avatarStorageId", file._id as Id<"_storage">),
        )
        .first();
      if (!owner) {
        await ctx.storage.delete(file._id);
        deleted++;
      }
    }
    if (deleted > 0) console.log(`avatars.sweepOrphans: deleted ${deleted} unattached file(s)`);

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.avatars.sweepOrphans, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
