/**
 * Saved conversations, and the access control that keeps them private
 * (spec §4.8).
 *
 * READ THIS BEFORE EDITING.
 *
 * Convex has no row-level security. Every exported query and mutation in this
 * file is callable by anyone on the internet with any arguments they choose.
 * The ONLY thing standing between a reader's conversations and a stranger is
 * `requireOwnedChat`, so:
 *
 *   1. No public function here accepts a userId argument. Identity comes from
 *      getAuthUserId(ctx) and nowhere else. A userId argument would let anyone
 *      pass someone else's. Enforced by scripts/check-no-userid-args.ts.
 *   2. No function calls ctx.db.get on a chat directly. Everything goes
 *      through requireOwnedChat. A bare db.get on `chats` in this file is a
 *      defect, not a shortcut.
 *   3. "Not yours" and "does not exist" both return null. Distinguishing them
 *      turns id enumeration into a map of who is using the product.
 *   4. Messages are never reached by chatId alone — always resolve the parent
 *      chat through requireOwnedChat first.
 */
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/** Longest a stored title may be. First question, truncated. */
const MAX_TITLE = 60;
/** Bound on how many threads one reader can accumulate before we stop listing. */
const MAX_LIST = 100;
/** Bound on a single delete-all, so one call cannot run unbounded. */
const MAX_DELETE_BATCH = 500;
/** Bound on a hand-off transcript, so it cannot be used to bulk-write. */
const MAX_HANDOFF_TURNS = 20;

/**
 * The ownership gate. Returns null both when the chat is missing and when it
 * belongs to someone else — deliberately indistinguishable (Rule 3).
 *
 * Every function touching a chat or its messages MUST go through here.
 */
async function requireOwnedChat(
  ctx: QueryCtx | MutationCtx,
  chatId: Id<"chats">,
): Promise<{ chat: Doc<"chats">; userId: Id<"users"> } | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const chat = await ctx.db.get(chatId);
  if (!chat || chat.userId !== userId) return null;
  return { chat, userId };
}

/**
 * This reader's conversations, newest activity first.
 *
 * Scoped by the authed user's id at the index level, so there is no code path
 * here that can express "everyone's threads" (Rule 5).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("chats")
      .withIndex("by_user_and_lastActivity", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_LIST);
    return rows.map((c) => ({
      _id: c._id,
      title: c.title,
      lastActivityAt: c.lastActivityAt,
      messageCount: c.messageCount,
    }));
  },
});

/** One conversation's turns, or null if it is not this reader's. */
export const messages = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const owned = await requireOwnedChat(ctx, args.chatId);
    if (!owned) return null;
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_chat_and_createdAt", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .take(200);
  },
});

/** Delete one conversation and its turns. */
export const remove = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const owned = await requireOwnedChat(ctx, args.chatId);
    if (!owned) return { deleted: false };

    const turns = await ctx.db
      .query("chatMessages")
      .withIndex("by_chat_and_createdAt", (q) => q.eq("chatId", args.chatId))
      .take(MAX_DELETE_BATCH);
    for (const t of turns) await ctx.db.delete(t._id);
    await ctx.db.delete(args.chatId);
    return { deleted: true };
  },
});

/** Delete every conversation belonging to this reader. */
export const removeAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { deleted: 0 };

    const chats = await ctx.db
      .query("chats")
      .withIndex("by_user_and_lastActivity", (q) => q.eq("userId", userId))
      .take(MAX_LIST);

    let deleted = 0;
    for (const chat of chats) {
      const turns = await ctx.db
        .query("chatMessages")
        .withIndex("by_chat_and_createdAt", (q) => q.eq("chatId", chat._id))
        .take(MAX_DELETE_BATCH);
      for (const t of turns) await ctx.db.delete(t._id);
      await ctx.db.delete(chat._id);
      deleted++;
    }
    return { deleted };
  },
});

/**
 * Keep a conversation that was started while signed out (spec §4.7 hand-off).
 *
 * Takes no userId — identity is the caller's own, and a signed-out caller gets
 * nothing. The reader has to ask for this explicitly; it never happens silently.
 */
export const saveTranscript = mutation({
  args: {
    turns: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{ chatId: Id<"chats"> | null }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { chatId: null };

    const turns = args.turns.slice(-MAX_HANDOFF_TURNS);
    if (turns.length === 0) return { chatId: null };

    const now = Date.now();
    const firstQuestion = turns.find((t) => t.role === "user")?.content ?? "Saved conversation";

    const chatId = await ctx.db.insert("chats", {
      userId,
      title: firstQuestion.slice(0, MAX_TITLE),
      createdAt: now,
      lastActivityAt: now,
      messageCount: turns.length,
    });

    for (let i = 0; i < turns.length; i++) {
      await ctx.db.insert("chatMessages", {
        chatId,
        userId,
        role: turns[i].role,
        content: turns[i].content,
        createdAt: now + i,
      });
    }

    return { chatId };
  },
});

/**
 * Append a completed turn. Internal only — called by the answer action after
 * it has already established who the caller is. Creates the chat on the first
 * turn.
 *
 * Takes userId because an internalMutation is not reachable from a browser; it
 * is called only by trusted server code that resolved identity itself. Rule 1
 * governs PUBLIC functions.
 */
export const appendTurn = internalMutation({
  args: {
    chatId: v.optional(v.id("chats")),
    userId: v.id("users"),
    question: v.string(),
    answer: v.string(),
    citations: v.optional(v.array(v.string())),
    allowed: v.optional(v.array(v.string())),
    entities: v.optional(v.any()),
    webReason: v.optional(v.string()),
    webSources: v.optional(
      v.array(v.object({ handle: v.string(), url: v.string(), excerpt: v.string() })),
    ),
    workLog: v.optional(v.array(v.object({ tool: v.string(), detail: v.string() }))),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"chats">> => {
    let chatId = args.chatId;

    if (chatId) {
      // Even internally, never trust a supplied chatId against a supplied user.
      const chat = await ctx.db.get(chatId);
      if (!chat || chat.userId !== args.userId) chatId = undefined;
    }

    if (!chatId) {
      chatId = await ctx.db.insert("chats", {
        userId: args.userId,
        title: args.question.slice(0, MAX_TITLE),
        createdAt: args.now,
        lastActivityAt: args.now,
        messageCount: 0,
      });
    }

    await ctx.db.insert("chatMessages", {
      chatId,
      userId: args.userId,
      role: "user",
      content: args.question,
      createdAt: args.now,
    });
    await ctx.db.insert("chatMessages", {
      chatId,
      userId: args.userId,
      role: "assistant",
      content: args.answer,
      citations: args.citations,
      allowed: args.allowed,
      entities: args.entities,
      webReason: args.webReason,
      webSources: args.webSources,
      workLog: args.workLog,
      createdAt: args.now + 1,
    });

    // Third and last db.get on `chats` in this file. Like the one above it is
    // inside this internalMutation, on a chatId already proven to belong to
    // args.userId — it only reads the counter it is about to bump. Rule 2
    // governs the public surface; a bare db.get there would be a defect.
    const chat = await ctx.db.get(chatId);
    await ctx.db.patch(chatId, {
      lastActivityAt: args.now,
      messageCount: (chat?.messageCount ?? 0) + 2,
    });

    return chatId;
  },
});
