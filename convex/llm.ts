import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { rateLimiter } from "./rateLimits";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "groq/compound-mini";

interface BillContext {
  billId: string;
  congress: number;
  billType: string;
  billNumber: string;
  billTypeLabel: string;
  title: string;
  introducedDate: string;
  sponsorFirstName: string;
  sponsorLastName: string;
  sponsorParty: string;
  sponsorState: string;
  progressStage: number;
  progressDescription: string;
  policyArea: string;
  summary: string;
  pdfUrl: string;
  actions: Array<{ date: string; description: string }>;
}

const STAGE_DESCRIPTIONS: Record<number, string> = {
  20: "Introduced",
  40: "In Committee",
  60: "Passed One Chamber",
  80: "Passed Both Chambers",
  85: "Vetoed",
  90: "To President",
  95: "Signed by President",
  100: "Became Law",
};

const PARTY_NAMES: Record<string, string> = {
  R: "Republican",
  D: "Democrat",
  I: "Independent",
};

function getStageDescription(stage: number): string {
  return STAGE_DESCRIPTIONS[stage] || "Unknown";
}

/** Build a system prompt containing all bill context for the AI. */
function buildSystemPrompt(bill: BillContext): string {
  const sponsorParty = PARTY_NAMES[bill.sponsorParty] || bill.sponsorParty;
  const stageLabel = STAGE_DESCRIPTIONS[bill.progressStage] || "Unknown";

  return `You are a helpful assistant that explains U.S. legislation to regular citizens. You have been given information about a specific bill and will answer questions about it based ONLY on the provided context.

## Bill Information
- **Bill ID**: ${bill.billId}
- **Congress**: ${bill.congress}th Congress
- **Bill Type**: ${bill.billTypeLabel} ${bill.billNumber}
- **Title**: ${bill.title}
- **Introduced**: ${bill.introducedDate}
- **Policy Area**: ${bill.policyArea || "Not specified"}

## Sponsor
- **Name**: ${bill.sponsorFirstName} ${bill.sponsorLastName}
- **Party**: ${sponsorParty}
- **State**: ${bill.sponsorState}

## Current Status
- **Stage**: ${bill.progressDescription} (${stageLabel}, ${bill.progressStage}/100)

## Official Summary
${bill.summary || "No official summary available."}

## Recent Legislative Actions
${bill.actions.slice(0, 10).map((a, i) => `${i + 1}. [${a.date}] ${a.description}`).join("\n") || "No actions recorded."}

## Instructions
- Answer questions based ONLY on the bill information provided above
- Be clear, accurate, and easy to understand; use plain language
- Avoid legal jargon where possible; define terms if needed
- Cite specific details from the bill when relevant
- Keep answers concise but informative (2–4 paragraphs unless more detail is needed)
- This database only includes the primary sponsor; check the bill text for co-sponsors
- Use the conversation history to maintain context for follow-up questions`;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Get or create a chat session for a signed-in user and bill. */
export const getOrCreateBillChat = internalMutation({
  args: {
    billId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billChats")
      .withIndex("by_billId_and_userId", (q) =>
        q.eq("billId", args.billId).eq("userId", args.userId)
      )
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("billChats", {
      billId: args.billId,
      sessionId: `user:${args.userId}`,
      userId: args.userId,
      createdAt: new Date().toISOString(),
    });
  },
});

/** Append a message to an existing chat session. */
export const addChatMessage = internalMutation({
  args: {
    chatId: v.id("billChats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("billChatMessages", {
      chatId: args.chatId,
      role: args.role,
      content: args.content,
      createdAt: new Date().toISOString(),
    });
  },
});

/** Fetch all messages for a chat session in chronological order. */
export const getMessagesForChat = internalQuery({
  args: { chatId: v.id("billChats") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("billChatMessages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();
  },
});

// ─── Public queries ───────────────────────────────────────────────────────────

/**
 * Fetch persisted chat history for the signed-in user and bill.
 * Returns an empty array when no chat exists yet.
 */
export const getBillChatHistory = query({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const chat = await ctx.db
      .query("billChats")
      .withIndex("by_billId_and_userId", (q) =>
        q.eq("billId", args.billId).eq("userId", userId)
      )
      .first();
    if (!chat) return [];
    return await ctx.db
      .query("billChatMessages")
      .withIndex("by_chatId", (q) => q.eq("chatId", chat._id))
      .order("asc")
      .collect();
  },
});

// ─── Public actions ───────────────────────────────────────────────────────────

/**
 * Send a chat message about a bill and return the AI response.
 *
 * - Persists the full conversation (user + assistant turns) in Convex so
 *   returning visitors pick up where they left off.
 * - Passes prior turns as Groq `messages` for proper multi-turn context.
 */
export const sendChatMessage = action({
  args: {
    billId: v.string(),
    question: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    answer: string;
    error?: string;
    rateLimit?: {
      kind: "anonymous" | "authed";
      max: number;
      retryAfterMs: number;
      resetAt: number;
    };
  }> => {
    const { billId, question } = args;

    if (question.trim().length === 0 || question.length > 2000) {
      return {
        answer: "",
        error: "Question must be between 1 and 2000 characters.",
      };
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return { answer: "", error: "Groq API key not configured." };
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        answer: "",
        error: "Sign in to use bill chat.",
      };
    }

    // Consume the token before calling Groq. If Groq fails after, the user
    // loses that question; keep this simple unless upstream errors get noisy.
    const limitMax = 100;
    const limitStatus = await rateLimiter.limit(ctx, "chatAuthedPerDay", {
      key: userId,
    });
    if (!limitStatus.ok) {
      return {
        answer: "",
        error: "RATE_LIMITED",
        rateLimit: {
          kind: "authed",
          max: limitMax,
          retryAfterMs: limitStatus.retryAfter ?? 0,
          resetAt: Date.now() + (limitStatus.retryAfter ?? 0),
        },
      };
    }

    try {
      // Fetch bill data
      const bill = await ctx.runQuery(api.bills.getById, { billId });
      if (!bill) return { answer: "", error: "Bill not found." };

      const actions = await ctx.runQuery(internal.bills.getBillActions, { billId });

      const billContext: BillContext = {
        billId: bill.billId || "",
        congress: bill.congress || 119,
        billType: bill.billType || "",
        billNumber: bill.billNumber || "",
        billTypeLabel: bill.billTypeLabel || "",
        title: bill.title || "",
        introducedDate: bill.introducedDate || "",
        sponsorFirstName: bill.sponsorFirstName || "",
        sponsorLastName: bill.sponsorLastName || "",
        sponsorParty: bill.sponsorParty || "",
        sponsorState: bill.sponsorState || "",
        progressStage: bill.progressStage || 20,
        progressDescription: getStageDescription(bill.progressStage || 20),
        policyArea: bill.bill_subjects?.policy_area_name || "",
        summary: bill.latest_summary || "",
        pdfUrl: bill.pdf_url || "",
        actions: actions || [],
      };

      // Get or create chat session
      const chatId = await ctx.runMutation(internal.llm.getOrCreateBillChat, {
        billId,
        userId,
      });

      // Fetch existing conversation history (before this turn)
      const history = await ctx.runQuery(internal.llm.getMessagesForChat, { chatId });

      // Persist user message
      await ctx.runMutation(internal.llm.addChatMessage, {
        chatId,
        role: "user",
        content: question,
      });

      // Build messages array: system prompt + full history + current question
      const systemPrompt = buildSystemPrompt(billContext);
      const llmMessages = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: question },
      ];

      // Call Groq
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: llmMessages,
          max_tokens: 2048,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        // Redact any echoed Authorization header before logging — defends
        // against future upstream changes that might surface the bearer
        // in error responses. Truncate to keep log lines bounded.
        const body = (await response.text())
          .slice(0, 500)
          .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
        console.error(
          `Groq API error ${response.status} ${response.statusText}: ${body}`,
        );
        return { answer: "", error: "Failed to get response from AI." };
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content || "No response generated.";

      // Persist assistant response
      await ctx.runMutation(internal.llm.addChatMessage, {
        chatId,
        role: "assistant",
        content: answer,
      });

      return { answer };
    } catch (error) {
      console.error("Error in sendChatMessage:", error);
      return { answer: "", error: "An unexpected error occurred." };
    }
  },
});
