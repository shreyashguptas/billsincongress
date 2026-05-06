import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const planAtTimeValidator = v.union(v.literal("free"), v.literal("pro"));

const billSnapshotValidator = v.object({
  billId: v.string(),
  congress: v.number(),
  billType: v.string(),
  billNumber: v.string(),
  billTypeLabel: v.string(),
  title: v.string(),
  introducedDate: v.string(),
  sponsorFirstName: v.string(),
  sponsorLastName: v.string(),
  sponsorParty: v.string(),
  sponsorState: v.string(),
  progressStage: v.number(),
  progressDescription: v.string(),
  policyArea: v.string(),
  hasSummary: v.boolean(),
  summaryLength: v.number(),
  hasPdf: v.boolean(),
});

/**
 * Get or create a signed-in analytics session for one browser chat session and
 * bill. Timestamps are Convex-server UTC values, independent of user timezone.
 */
export const getOrCreateAnalyticsSession = internalMutation({
  args: {
    userId: v.id("users"),
    billId: v.string(),
    clientSessionId: v.string(),
    chatId: v.id("billChats"),
    nowUtc: v.number(),
    nowIso: v.string(),
    planAtTime: planAtTimeValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billChatAnalyticsSessions")
      .withIndex("by_user_and_clientSession_and_billId", (q) =>
        q
          .eq("userId", args.userId)
          .eq("clientSessionId", args.clientSessionId)
          .eq("billId", args.billId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        chatId: args.chatId,
        lastActivityAtUtc: args.nowUtc,
        lastActivityIso: args.nowIso,
        questionCount: existing.questionCount + 1,
        planAtTime: args.planAtTime,
      });
      return existing._id;
    }

    return await ctx.db.insert("billChatAnalyticsSessions", {
      userId: args.userId,
      billId: args.billId,
      clientSessionId: args.clientSessionId,
      chatId: args.chatId,
      startedAtUtc: args.nowUtc,
      startedAtIso: args.nowIso,
      lastActivityAtUtc: args.nowUtc,
      lastActivityIso: args.nowIso,
      questionCount: 1,
      planAtTime: args.planAtTime,
    });
  },
});

export const recordAnalyticsTurn = internalMutation({
  args: {
    analyticsSessionId: v.id("billChatAnalyticsSessions"),
    userId: v.id("users"),
    billId: v.string(),
    chatId: v.id("billChats"),
    userMessageId: v.id("billChatMessages"),
    assistantMessageId: v.id("billChatMessages"),
    question: v.string(),
    answer: v.string(),
    billSnapshot: billSnapshotValidator,
    model: v.string(),
    createdAtUtc: v.number(),
    createdAtIso: v.string(),
    answeredAtUtc: v.number(),
    answeredAtIso: v.string(),
    latencyMs: v.number(),
    planAtTime: planAtTimeValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("billChatAnalyticsTurns", args);
  },
});

export const _recentAnalyticsTurns = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    if (args.userId) {
      return await ctx.db
        .query("billChatAnalyticsTurns")
        .withIndex("by_user_and_createdAt", (q) => q.eq("userId", args.userId!))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("billChatAnalyticsTurns")
      .order("desc")
      .take(limit);
  },
});
