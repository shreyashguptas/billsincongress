/**
 * `currentUser.hasPassword` decides whether the account page offers "Change
 * password". A Google-only account has no password to change, and a reader
 * who signed up both ways has one.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  return convexTest(schema, modules);
}
type T = ReturnType<typeof setup>;

async function seedUser(t: T, providers: string[]) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "reader@example.com" });
    for (const provider of providers) {
      await ctx.db.insert("authAccounts", { userId, provider, providerAccountId: "reader@example.com" });
    }
    return userId;
  });
}

const asUser = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

describe("currentUser.hasPassword", () => {
  test("an email-and-password account has one", async () => {
    const t = setup();
    const me = asUser(t, await seedUser(t, ["password"]));
    expect(await me.query(api.users.currentUser, {})).toMatchObject({ hasPassword: true });
  });

  test("a Google-only account has none", async () => {
    const t = setup();
    const me = asUser(t, await seedUser(t, ["google"]));
    expect(await me.query(api.users.currentUser, {})).toMatchObject({ hasPassword: false });
  });

  test("an account linked to both has one", async () => {
    const t = setup();
    const me = asUser(t, await seedUser(t, ["google", "password"]));
    expect(await me.query(api.users.currentUser, {})).toMatchObject({ hasPassword: true });
  });
});
