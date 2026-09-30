/// <reference types="vite/client" />
/**
 * The feedback-picture endpoint and its purge, run as real Convex functions
 * against an in-memory database (convex-test). Each case is a way the public,
 * anonymous upload could be abused or could keep a picture longer than the
 * privacy policy says.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { internal } from "./_generated/api";
import schema from "./schema";
import { MAX_PICTURE_BYTES, PICTURE_RETENTION_MS } from "./feedbackPicture";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

const SITE = "https://billsincongress.com";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function upload(t: ReturnType<typeof setup>, body: Uint8Array, origin: string | null = SITE) {
  return t.fetch("/feedback/picture", {
    method: "POST",
    headers: { "Content-Type": "image/png", ...(origin ? { Origin: origin } : {}) },
    body: new Blob([body as BlobPart]),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /feedback/picture", () => {
  test("stores a picture and returns a link the site can show", async () => {
    const t = setup();
    const res = await upload(t, PNG);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^https?:\/\//);
    const rows = await t.run((ctx) => ctx.db.query("feedbackPictures").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ contentType: "image/png", size: PNG.byteLength });
  });

  test("stores the sniffed type, not the one the request claims", async () => {
    const t = setup();
    const res = await t.fetch("/feedback/picture", {
      method: "POST",
      headers: { "Content-Type": "text/html", Origin: SITE },
      body: new Blob([PNG]),
    });
    expect(res.status).toBe(200);
    const [row] = await t.run((ctx) => ctx.db.query("feedbackPictures").collect());
    expect(row.contentType).toBe("image/png");
  });

  test("refuses a page disguised as a picture", async () => {
    const t = setup();
    const res = await upload(t, new TextEncoder().encode("<!doctype html><script>alert(1)</script>"));
    expect(res.status).toBe(415);
    expect(await t.run((ctx) => ctx.db.query("feedbackPictures").collect())).toHaveLength(0);
  });

  test("refuses a file over 2 MB", async () => {
    const t = setup();
    const big = new Uint8Array(MAX_PICTURE_BYTES + 1);
    big.set(PNG);
    const res = await upload(t, big);
    expect(res.status).toBe(413);
  });

  test("refuses another website's page", async () => {
    const t = setup();
    const res = await upload(t, PNG, "https://evil.example");
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("answers the browser's preflight for our pages only", async () => {
    const t = setup();
    const ok = await t.fetch("/feedback/picture", { method: "OPTIONS", headers: { Origin: SITE } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    const no = await t.fetch("/feedback/picture", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    expect(no.status).toBe(403);
  });

  test("stops after 50 pictures in a day, site-wide", async () => {
    const t = setup();
    for (let i = 0; i < 50; i++) expect((await upload(t, PNG)).status).toBe(200);
    expect((await upload(t, PNG)).status).toBe(429);
  });
});

describe("purgeOldPictures", () => {
  test("deletes pictures older than 180 days, file and row, and keeps newer ones", async () => {
    const t = setup();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await upload(t, PNG);
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    await upload(t, PNG);

    vi.setSystemTime(new Date(new Date("2026-01-01T00:00:00Z").getTime() + PICTURE_RETENTION_MS + 60_000));
    await t.mutation(internal.feedback.purgeOldPictures, {});

    const rows = await t.run((ctx) => ctx.db.query("feedbackPictures").collect());
    expect(rows).toHaveLength(1);
    const files = await t.run((ctx) => ctx.db.system.query("_storage").collect());
    expect(files).toHaveLength(1);
    expect(files[0]._id).toBe(rows[0].storageId);
  });

  test("a file already deleted by hand does not stop the purge", async () => {
    const t = setup();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await upload(t, PNG);
    await t.run(async (ctx) => {
      const [row] = await ctx.db.query("feedbackPictures").collect();
      await ctx.storage.delete(row.storageId);
    });
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    await t.mutation(internal.feedback.purgeOldPictures, {});
    expect(await t.run((ctx) => ctx.db.query("feedbackPictures").collect())).toHaveLength(0);
  });
});
