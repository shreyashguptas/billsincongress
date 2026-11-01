/**
 * An emailed code signs in only the reader it was sent to.
 *
 * The auth library finds a code by its value alone, across every account, and
 * signs in as whoever owns it. Without the provider's `authorize` check, a
 * reader could type someone else's pending sign-up code next to their own
 * email and land in the other account — the email they typed was never
 * compared with the code's owner. These run the library's real redemption
 * (`auth:store`, "verifyCodeAndSignIn") against seeded accounts and codes.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const VERIFY = "resend-otp";
const RESET = "resend-otp-password-reset";

function setup() {
  return convexTest(schema, modules);
}
type T = ReturnType<typeof setup>;

// The library stores codes as lower-case hex SHA-256.
async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function seedPendingCode(t: T, email: string, code: string, provider: string) {
  const hash = await sha256(code);
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email });
    const accountId = await ctx.db.insert("authAccounts", {
      userId,
      provider: "password",
      providerAccountId: email,
    });
    await ctx.db.insert("authVerificationCodes", {
      accountId,
      provider,
      code: hash,
      expirationTime: Date.now() + 15 * 60 * 1000,
      emailVerified: email,
    });
    return userId;
  });
}

function redeem(t: T, email: string, code: string, provider: string) {
  return t.mutation(internal.auth.store, {
    args: {
      type: "verifyCodeAndSignIn",
      params: { email, code },
      provider,
      generateTokens: false,
      allowExtraProviders: true,
    },
  }) as Promise<{ userId: Id<"users"> } | null>;
}

async function codesLeft(t: T) {
  return t.run(async (ctx) => (await ctx.db.query("authVerificationCodes").take(10)).length);
}

describe("emailed codes are tied to the email they were sent to", () => {
  test("a reader's own sign-up code signs them in", async () => {
    const t = setup();
    const owner = await seedPendingCode(t, "owner@example.com", "123456", VERIFY);
    const result = await redeem(t, "owner@example.com", "123456", VERIFY);
    expect(result?.userId).toBe(owner);
  });

  test("someone else's sign-up code, typed with your email, signs in nobody", async () => {
    const t = setup();
    await seedPendingCode(t, "victim@example.com", "123456", VERIFY);
    await seedPendingCode(t, "attacker@example.com", "654321", VERIFY);
    expect(await redeem(t, "attacker@example.com", "123456", VERIFY)).toBeNull();
    // The victim's code is not used up, so their own sign-up still finishes.
    expect(await codesLeft(t)).toBe(2);
  });

  test("someone else's reset code, typed with your email, signs in nobody", async () => {
    const t = setup();
    await seedPendingCode(t, "victim@example.com", "123456", RESET);
    await seedPendingCode(t, "attacker@example.com", "654321", RESET);
    expect(await redeem(t, "attacker@example.com", "123456", RESET)).toBeNull();
  });

  test("the email is compared the way the forms send it, ignoring case and spaces", async () => {
    const t = setup();
    const owner = await seedPendingCode(t, "owner@example.com", "123456", VERIFY);
    const result = await redeem(t, " Owner@Example.com ", "123456", VERIFY);
    expect(result?.userId).toBe(owner);
  });

  test("a code with no email at all is refused", async () => {
    const t = setup();
    await seedPendingCode(t, "owner@example.com", "123456", VERIFY);
    const result = await t.mutation(internal.auth.store, {
      args: {
        type: "verifyCodeAndSignIn",
        params: { code: "123456" },
        provider: VERIFY,
        generateTokens: false,
        allowExtraProviders: true,
      },
    });
    expect(result).toBeNull();
  });
});
