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

type AnyDbCtx = QueryCtx | MutationCtx;

// Throws UNAUTHENTICATED / USER_MISSING. Use in anything that requires a user.
export async function requireUser(ctx: AnyDbCtx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("UNAUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_MISSING");
  return user;
}

export const _getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

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
 * Deletes duplicate user rows for an email that have ZERO authAccounts
 * pointing at them (the live user, which owns the password account, is kept),
 * plus any dangling authSessions / authRefreshTokens for the deleted users.
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

