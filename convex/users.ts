import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  query,
  internalQuery,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// ─── Public queries ────────────────────────────────────────────────────────

/**
 * Returns the current user's row, scoped to the caller. Never accepts a
 * userId arg — identity always comes from `getAuthUserId(ctx)`.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});

/**
 * Returns true if the given email already has a password authAccount.
 * Used by the sign-up form to give a clean "already registered, try sign in"
 * message instead of the generic "Server Error" the auth library throws.
 *
 * Email enumeration trade-off: this lets anyone probe whether a given email
 * is registered. Standard for sign-up UX (most apps tell you the email is
 * taken). For sign-IN we keep error messages vague (no enumeration there).
 */
export const isEmailRegistered = query({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { email }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .first();
    return account !== null;
  },
});

// ─── Server-side helpers (not registered as functions) ─────────────────────

type AnyDbCtx = QueryCtx | MutationCtx;

/**
 * Throws UNAUTHENTICATED if the caller is not signed in. Returns the user doc.
 * Use inside any query/mutation that requires a user.
 */
export async function requireUser(ctx: AnyDbCtx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("UNAUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_MISSING");
  return user;
}

/**
 * Like `requireUser` but additionally requires the email is verified.
 * Used to gate Stripe checkout — Google OAuth users are auto-verified.
 */
export async function requireVerifiedUser(
  ctx: AnyDbCtx,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!user.emailVerificationTime) {
    throw new ConvexError("EMAIL_NOT_VERIFIED");
  }
  return user;
}

// (Action-context variants will be added in PR 2 alongside `convex/stripe.ts`,
// once the generated `internal.users._getUserById` reference exists.)

// ─── Internal lookups (called from Stripe webhook in PR 2) ─────────────────

export const _getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const _getByStripeCustomerId = internalQuery({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, { stripeCustomerId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", stripeCustomerId),
      )
      .unique();
  },
});

export const _getByStripeSubscriptionId = internalQuery({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, { stripeSubscriptionId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_stripeSubscriptionId", (q) =>
        q.eq("stripeSubscriptionId", stripeSubscriptionId),
      )
      .unique();
  },
});

// ─── Admin / debug helpers (internal-only) ─────────────────────────────────

/**
 * Inspect auth state for a given email — used during PR 1 testing to find
 * orphaned authAccounts left over from earlier deploys with stricter schema
 * validation. Safe to keep around: internal-only, read-only.
 */
export const _inspectAuthState = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .collect();

    // authAccounts has no by_email index so we scan and filter (small table during dev)
    const allAccounts = await ctx.db.query("authAccounts").take(500);
    const matching = allAccounts.filter(
      (a) => (a as any).providerAccountId === email,
    );

    return {
      userCount: users.length,
      users: users.map((u) => ({
        _id: u._id,
        email: u.email,
        name: u.name,
        plan: (u as any).plan ?? null,
        emailVerificationTime: u.emailVerificationTime ?? null,
      })),
      authAccountCount: matching.length,
      authAccounts: matching.map((a) => ({
        _id: a._id,
        provider: (a as any).provider,
        providerAccountId: (a as any).providerAccountId,
        userId: (a as any).userId,
      })),
    };
  },
});

/**
 * Delete a password authAccount for the given email — used to recover from
 * orphan accounts so the user can re-sign-up. Does NOT delete the user row
 * (so any Google-OAuth login for the same email keeps working). Internal-only.
 */
export const _deletePasswordAccount = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const allAccounts = await ctx.db.query("authAccounts").take(500);
    const targets = allAccounts.filter(
      (a) =>
        (a as any).provider === "password" &&
        (a as any).providerAccountId === email,
    );
    for (const t of targets) await ctx.db.delete(t._id);
    return { deleted: targets.length };
  },
});

/**
 * Delete duplicate user rows for a given email that have no auth accounts
 * pointing at them. Created during PR 1 testing when the `email` index on
 * users was briefly absent (after main wiped indexes mid-flight, before our
 * branch redeployed). Without the index, the auth library couldn't dedupe
 * by email and created multiple `users` rows for the same address.
 *
 * Safety: only deletes user rows that have ZERO authAccounts referencing
 * them. The active user (with the password authAccount) is preserved.
 * Also deletes any dangling authSessions / authRefreshTokens that point at
 * the deleted users.
 */
export const _deleteOrphanUsers = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .collect();
    if (users.length <= 1) return { deletedUsers: 0, deletedSessions: 0 };

    const allAccounts = await ctx.db.query("authAccounts").take(2000);
    const allSessions = await ctx.db.query("authSessions").take(2000);
    const allRefresh = await ctx.db.query("authRefreshTokens").take(2000);

    let deletedUsers = 0;
    let deletedSessions = 0;
    for (const u of users) {
      const hasAccounts = allAccounts.some(
        (a) => (a as any).userId === u._id,
      );
      if (hasAccounts) continue; // keep — this is the live user
      // Cascade: delete sessions + refresh tokens pointing at this user
      const userSessions = allSessions.filter(
        (s) => (s as any).userId === u._id,
      );
      for (const s of userSessions) {
        const refresh = allRefresh.filter(
          (r) => (r as any).sessionId === s._id,
        );
        for (const r of refresh) await ctx.db.delete(r._id);
        await ctx.db.delete(s._id);
        deletedSessions++;
      }
      await ctx.db.delete(u._id);
      deletedUsers++;
    }
    return { deletedUsers, deletedSessions };
  },
});

// ─── Internal billing-column mutation (webhook-only) ───────────────────────

const billingPatchValidator = v.object({
  plan: v.optional(v.union(v.literal("free"), v.literal("pro"))),
  stripeCustomerId: v.optional(v.string()),
  stripeSubscriptionId: v.optional(v.string()),
  stripeSubscriptionStatus: v.optional(
    v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("incomplete_expired"),
      v.literal("unpaid"),
      v.literal("paused"),
    ),
  ),
  stripePriceId: v.optional(v.string()),
  stripeCurrentPeriodEnd: v.optional(v.number()),
  cancelAtPeriodEnd: v.optional(v.boolean()),
});

/**
 * Patches billing-related columns on a user. Internal-only — never exposed
 * to the client. The Stripe webhook is the only call site.
 */
export const _updateBillingColumns = internalMutation({
  args: {
    userId: v.id("users"),
    patch: billingPatchValidator,
  },
  handler: async (ctx, { userId, patch }) => {
    await ctx.db.patch(userId, patch);
  },
});
