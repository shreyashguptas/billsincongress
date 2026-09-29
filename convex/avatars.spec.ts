/// <reference types="vite/client" />
/**
 * Profile photos (convex/avatars.ts), run as real Convex functions against an
 * in-memory database and file store (convex-test).
 *
 * Each case is a way a reader could be wronged: someone else's photo on their
 * account, a photo they removed coming back, a non-image stored under their
 * name, or old uploads left behind after they changed it.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const GOOGLE = "https://lh3.googleusercontent.com/a/photo";

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;

const seedUser = (t: T, fields: { image?: string; email?: string } = {}) =>
  t.run((ctx) => ctx.db.insert("users", { email: fields.email ?? "reader@example.com", ...fields }));

const asUser = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

// The first bytes of a WebP file: "RIFF", a length, "WEBP".
const WEBP_HEAD = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

const store = (t: T, head: number[] = WEBP_HEAD, bytes = 2_000) =>
  t.run((ctx) => {
    const data = new Uint8Array(bytes);
    data.set(head);
    return ctx.storage.store(new Blob([data]));
  });

const fileExists = (t: T, id: Id<"_storage">) => t.run(async (ctx) => (await ctx.db.system.get(id)) !== null);

describe("profile photos", () => {
  test("a Google reader shows their Google picture until they upload one", async () => {
    const t = setup();
    const userId = await seedUser(t, { image: GOOGLE });
    const me = asUser(t, userId);
    expect(await me.query(api.users.currentUser, {})).toMatchObject({ avatarUrl: GOOGLE, avatarSource: "google" });

    const photo = await store(t);
    await me.action(api.avatars.setAvatar, { storageId: photo });
    const after = await me.query(api.users.currentUser, {});
    expect(after?.avatarSource).toBe("upload");
    expect(after?.avatarUrl).not.toBe(GOOGLE);
  });

  test("replacing a photo deletes the old file", async () => {
    const t = setup();
    const me = asUser(t, await seedUser(t));
    const first = await store(t);
    const second = await store(t);
    await me.action(api.avatars.setAvatar, { storageId: first });
    await me.action(api.avatars.setAvatar, { storageId: second });
    expect(await fileExists(t, first)).toBe(false);
    expect(await fileExists(t, second)).toBe(true);
  });

  test("a removed Google picture stays removed, and can be brought back", async () => {
    const t = setup();
    const userId = await seedUser(t, { image: GOOGLE });
    const me = asUser(t, userId);
    await me.mutation(api.avatars.removeAvatar, {});
    // The next Google sign-in rewrites `image`; the choice must survive it.
    await t.run((ctx) => ctx.db.patch(userId, { image: GOOGLE }));
    expect(await me.query(api.users.currentUser, {})).toMatchObject({ avatarUrl: null, avatarSource: null });

    await me.mutation(api.avatars.restoreGooglePicture, {});
    expect(await me.query(api.users.currentUser, {})).toMatchObject({ avatarUrl: GOOGLE, avatarSource: "google" });
  });

  test("removing an upload deletes the file", async () => {
    const t = setup();
    const me = asUser(t, await seedUser(t));
    const photo = await store(t);
    await me.action(api.avatars.setAvatar, { storageId: photo });
    await me.mutation(api.avatars.removeAvatar, {});
    expect(await fileExists(t, photo)).toBe(false);
  });

  test("rejects and deletes a file that is not an image, or too big", async () => {
    const t = setup();
    const me = asUser(t, await seedUser(t));
    // An HTML page uploaded with an image Content-Type: the bytes give it away.
    const html = await store(t, [...new TextEncoder().encode("<html><script>")]);
    await expect(me.action(api.avatars.setAvatar, { storageId: html })).rejects.toThrow(/AVATAR_INVALID/);
    expect(await fileExists(t, html)).toBe(false);

    const huge = await store(t, WEBP_HEAD, 600 * 1024);
    await expect(me.action(api.avatars.setAvatar, { storageId: huge })).rejects.toThrow(/AVATAR_INVALID/);
    expect(await fileExists(t, huge)).toBe(false);
  });

  test("cannot take another reader's photo", async () => {
    const t = setup();
    const alice = asUser(t, await seedUser(t, { email: "alice@example.com" }));
    const mallory = asUser(t, await seedUser(t, { email: "mallory@example.com" }));
    const photo = await store(t);
    await alice.action(api.avatars.setAvatar, { storageId: photo });
    await expect(mallory.action(api.avatars.setAvatar, { storageId: photo })).rejects.toThrow();
    expect(await fileExists(t, photo)).toBe(true);
  });

  test("signed out, nothing works", async () => {
    const t = setup();
    await expect(t.mutation(api.avatars.generateUploadUrl, {})).rejects.toThrow(/UNAUTHENTICATED/);
    const photo = await store(t);
    await expect(t.action(api.avatars.setAvatar, { storageId: photo })).rejects.toThrow(/UNAUTHENTICATED/);
  });

  test("upload URLs are rate limited per reader", async () => {
    const t = setup();
    const me = asUser(t, await seedUser(t));
    for (let i = 0; i < 20; i++) await me.mutation(api.avatars.generateUploadUrl, {});
    await expect(me.mutation(api.avatars.generateUploadUrl, {})).rejects.toThrow();
  });

  test("the sweep deletes old unattached uploads and keeps everything else", async () => {
    const t = setup();
    const me = asUser(t, await seedUser(t));
    const kept = await store(t);
    await me.action(api.avatars.setAvatar, { storageId: kept });
    const orphan = await store(t);

    // Fresh orphans survive: a save may be in flight.
    await t.mutation(internal.avatars.sweepOrphans, {});
    expect(await fileExists(t, orphan)).toBe(true);

    const realNow = Date.now;
    Date.now = () => realNow() + 2 * 60 * 60 * 1000;
    try {
      await t.mutation(internal.avatars.sweepOrphans, {});
    } finally {
      Date.now = realNow;
    }
    expect(await fileExists(t, orphan)).toBe(false);
    expect(await fileExists(t, kept)).toBe(true);
  });
});
