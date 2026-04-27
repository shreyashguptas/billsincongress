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
