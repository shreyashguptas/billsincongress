import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./users";

// Account-page list cap. Bookmarks are added one click at a time, so 200 is
// far beyond realistic use; rows past it still exist, they just fall off the
// list view. Keeps the query bounded without pagination UI.
const MAX_SAVED_BILLS = 200;

/**
 * Whether the current user has saved the given bill. Anonymous callers get
 * `false` (never throws — the save button renders for signed-out visitors).
 */
export const isSaved = query({
  args: { billId: v.string() },
  handler: async (ctx, { billId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const existing = await ctx.db
      .query("savedBills")
      .withIndex("by_user_and_bill", (q) =>
        q.eq("userId", userId).eq("billId", billId),
      )
      .unique();
    return existing !== null;
  },
});

/**
 * Toggle a bookmark for the current user. Returns the resulting state so the
 * client can report accurate analytics.
 */
export const toggleSave = mutation({
  args: { billId: v.string() },
  handler: async (ctx, { billId }) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("savedBills")
      .withIndex("by_user_and_bill", (q) =>
        q.eq("userId", user._id).eq("billId", billId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { saved: false };
    }

    // Reject saves of bills that don't exist (forged/stale client calls).
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", billId))
      .first();
    if (!bill) throw new ConvexError("BILL_NOT_FOUND");

    await ctx.db.insert("savedBills", {
      userId: user._id,
      billId,
      savedAt: Date.now(),
    });
    return { saved: true };
  },
});

/**
 * The current user's saved bills, newest first, joined with display fields
 * from the bills table. Missing bills come back as `bill: null` so the UI can
 * still show (and explain) the row. Anonymous callers get an empty list —
 * /account is middleware-gated, but a query desync must not throw.
 */
export const listSaved = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const rows = await ctx.db
      .query("savedBills")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_SAVED_BILLS);

    return await Promise.all(
      rows.map(async (row) => {
        const bill = await ctx.db
          .query("bills")
          .withIndex("by_billId", (q) => q.eq("billId", row.billId))
          .first();
        return {
          billId: row.billId,
          savedAt: row.savedAt,
          bill: bill
            ? {
                title: bill.title,
                billTypeLabel: bill.billTypeLabel,
                billNumber: bill.billNumber,
                congress: bill.congress,
                progressDescription: bill.progressDescription ?? null,
              }
            : null,
        };
      }),
    );
  },
});
