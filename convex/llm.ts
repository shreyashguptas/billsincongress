import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { rateLimiter } from "./rateLimits";
import { BillStageDescriptions as STAGE_DESCRIPTIONS } from "./billStage";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
/**
 * Baked-in chat model. Override it per-deployment with the OPENROUTER_MODEL
 * Convex environment variable so swapping models needs no code deploy.
 *
 * Pinned to a dated release rather than a `~…-latest` alias: a floating alias
 * can resolve to a version that no US-datacenter provider carries yet, which
 * the allowlist below would turn into a chat outage. Moving to a newer release
 * is a deliberate env-var change after checking its providers.
 */
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731";
/**
 * Provider allowlist, so questions are only served from providers that process
 * data in the US. Comma-separated OpenRouter provider slugs; override with
 * OPENROUTER_PROVIDERS.
 *
 * An empty or unset override falls back to this default rather than removing
 * the pin. The privacy page tells readers their questions are processed in the
 * United States, so dropping the allowlist has to be a deliberate code change,
 * not something a blank environment variable can do by accident.
 *
 * Every slug here must ALSO be permitted by the OpenRouter account's own
 * allowed-providers setting. If the two lists do not overlap, OpenRouter
 * rejects every request with a 404 rather than falling back — which is exactly
 * how this default previously took chat down in production.
 */
const DEFAULT_PROVIDERS = "deepinfra,amazon-bedrock";
/**
 * Automatic failover chain, tried in order when the primary errors. Any error
 * qualifies — rate limits, downtime, context-length rejections.
 *
 * Same family first, because it is the closest writing style; then a genuinely
 * independent provider, so a DeepInfra outage degrades the answer instead of
 * ending it.
 *
 * Every entry must satisfy the same constraints as the primary: US provider,
 * zero retention, no training on our readers, and inside MAX_PRICE. Verified
 * 2026-08-27 with scripts/check-provider-retention.ts plus a live tool-calling
 * probe. Re-verify before adding to this list — an entry that fails the
 * retention filters is silently unreachable, not loudly broken.
 *
 * Unlike OPENROUTER_PROVIDERS, a blank override here DISABLES fallbacks rather
 * than restoring this default. Blank means "behave as before this existed",
 * which is a safe direction. Blanking the provider pin would quietly weaken a
 * privacy promise, which is not — hence the different operators.
 */
const DEFAULT_FALLBACK_MODELS =
  "deepseek/deepseek-v4-flash,amazon/nova-lite-v1";
/**
 * Runaway-cost guard, in USD per million tokens. Not the target price — the
 * allowlisted provider sits well under this today ($0.080 in, $0.180 out).
 * It exists so that a provider repricing, or a careless OPENROUTER_MODEL
 * change, fails loudly instead of multiplying the bill.
 */
const MAX_PRICE = { prompt: 0.2, completion: 0.4 };
const SITE_URL = "https://billsincongress.com";
const ANONYMOUS_CHAT_DAILY_LIMIT = 5;
const AUTHED_CHAT_DAILY_LIMIT = 100;

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

## How to answer
- Use ONLY the bill information above. If it does not contain the answer, say so
  plainly in one sentence and point the reader to the bill text. Never infer,
  never fill gaps from outside knowledge, never predict what Congress will do.
- Write flowing plain-English prose. Do not use headings, bullet lists, numbered
  lists, tables, or bold text.
- Default to two short paragraphs, roughly 60-150 words. If the question asks for
  one sentence, answer in one sentence. Never exceed 250 words.
- Open with the answer. Never begin with "Based on the provided context",
  "According to the bill information", "Great question", or a restatement of the
  question.
- Name the bill by its title on first mention, then call it "the bill".
- Define any legal or procedural term the first time you use it, inline, in a
  clause rather than an aside.
- Quote dates exactly as given above. Do not calculate elapsed time and do not
  characterise how long something has taken.
- This database carries only the primary sponsor. If asked about co-sponsors, say
  the site does not have them and point to the bill text.
- Use the conversation history for follow-up questions, and do not repeat
  information you already gave earlier in this conversation.`;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Get or create a chat session for a signed-in user and bill. */
export const getOrCreateBillChat = internalMutation({
  args: {
    billId: v.string(),
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const existing = args.userId
      ? await ctx.db
          .query("billChats")
          .withIndex("by_billId_and_userId", (q) =>
            q.eq("billId", args.billId).eq("userId", args.userId)
          )
          .first()
      : await ctx.db
          .query("billChats")
          .withIndex("by_billId_and_session", (q) =>
            q.eq("billId", args.billId).eq("sessionId", args.sessionId)
          )
          .first();
    if (existing) return existing._id;
    return await ctx.db.insert("billChats", {
      billId: args.billId,
      sessionId: args.sessionId,
      ...(args.userId ? { userId: args.userId } : {}),
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
 * - Passes prior turns as OpenRouter `messages` for proper multi-turn context.
 */
export const sendChatMessage = action({
  args: {
    billId: v.string(),
    question: v.string(),
    anonymousSessionId: v.optional(v.string()),
    clientSessionId: v.optional(v.string()),
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

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return { answer: "", error: "AI chat is not configured." };
    }
    const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const providers = (process.env.OPENROUTER_PROVIDERS || DEFAULT_PROVIDERS)
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean);
    // `??` not `||`: a blank value here deliberately turns fallbacks off.
    const fallbackModels = (
      process.env.OPENROUTER_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS
    )
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean);

    const userId = await getAuthUserId(ctx);
    const isAuthed = userId !== null;
    const sessionId = isAuthed
      ? `user:${userId}`
      : args.anonymousSessionId
        ? `anon:${args.anonymousSessionId}`
        : null;

    if (!sessionId) {
      return {
        answer: "",
        error: "Sign in to use bill chat.",
      };
    }

    // Consume the token before calling the model. If the call fails after, the
    // user loses that question; keep this simple unless upstream errors get noisy.
    const limitStatus = isAuthed
      ? await rateLimiter.limit(ctx, "chatAuthedPerDay", {
          key: userId,
        })
      : await rateLimiter.limit(ctx, "chatAnonPerDay", {
          key: args.anonymousSessionId!,
        });
    if (!limitStatus.ok) {
      const retryAfterMs = limitStatus.retryAfter ?? 0;
      return {
        answer: "",
        error: "RATE_LIMITED",
        rateLimit: {
          kind: isAuthed ? "authed" : "anonymous",
          max: isAuthed ? AUTHED_CHAT_DAILY_LIMIT : ANONYMOUS_CHAT_DAILY_LIMIT,
          retryAfterMs,
          resetAt: Date.now() + retryAfterMs,
        },
      };
    }

    try {
      const askedAtUtc = Date.now();
      const askedAtIso = new Date(askedAtUtc).toISOString();
      const user = isAuthed
        ? await ctx.runQuery(internal.users._getUserById, { userId })
        : null;
      const planAtTime = user?.plan === "pro" ? "pro" : "free";

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
      const chatId = await ctx.runMutation(
        internal.llm.getOrCreateBillChat,
        isAuthed
          ? {
              billId,
              sessionId,
              userId,
            }
          : {
              billId,
              sessionId,
            },
      );

      // Fetch existing conversation history (before this turn)
      const history = await ctx.runQuery(internal.llm.getMessagesForChat, { chatId });

      // Persist user message
      const userMessageId = await ctx.runMutation(internal.llm.addChatMessage, {
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

      // Call OpenRouter
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          // Attribution for the OpenRouter dashboard; both are optional.
          "HTTP-Referer": SITE_URL,
          "X-OpenRouter-Title": "Bills in Congress",
        },
        body: JSON.stringify({
          model,
          // Automatic failover, tried in order if `model` errors. OpenRouter
          // prices the request against whichever one answered, and reports it
          // back as `data.model` — which is what we record.
          ...(fallbackModels.length > 0 && { models: fallbackModels }),
          // Pin routing to the allowlist. OpenRouter's own region-locked
          // routing is enterprise-only, so this is the strongest control we
          // have over where a question gets processed.
          provider: {
            ...(providers.length > 0 && { only: providers }),
            max_price: MAX_PRICE,
            // Retention controls (spec §3.1). These are FILTERS: they narrow
            // the eligible provider set, so they are verified against the
            // `only` pin by scripts/check-provider-retention.ts. Re-run that
            // probe whenever OPENROUTER_MODEL or OPENROUTER_PROVIDERS changes
            // — a model swap can silently change which providers qualify.
            data_collection: "deny",
            zdr: true,
          },
          messages: llmMessages,
          max_tokens: 2048,
          temperature: 0.3,
          // Grounded Q&A over a supplied context: thinking tokens add latency
          // and output cost without improving the answer.
          reasoning: { enabled: false },
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
          `OpenRouter API error ${response.status} ${response.statusText}: ${body}`,
        );
        return { answer: "", error: "Failed to get response from AI." };
      }

      const data = await response.json();
      // OpenRouter can answer HTTP 200 with an error payload when no upstream
      // provider could serve the request.
      if (data.error) {
        console.error(
          `OpenRouter error for ${model}: ${JSON.stringify(data.error).slice(0, 500)}`,
        );
        return { answer: "", error: "Failed to get response from AI." };
      }
      const answer = data.choices?.[0]?.message?.content || "No response generated.";
      // OpenRouter reports the upstream that served the request; read it
      // defensively so a missing field never breaks a turn.
      const servedBy =
        typeof data.provider === "string" ? data.provider : undefined;
      // OpenRouter also reports which model answered. Today that always equals
      // `model`, but a fallback chain would make them diverge — and the
      // analytics table should record what answered, not what we asked for.
      const servedModel = typeof data.model === "string" ? data.model : model;
      if (servedModel !== model) {
        console.error(
          `OpenRouter served ${servedModel} instead of requested ${model}`,
        );
      }
      const answeredAtUtc = Date.now();
      const answeredAtIso = new Date(answeredAtUtc).toISOString();

      // Persist assistant response
      const assistantMessageId = await ctx.runMutation(internal.llm.addChatMessage, {
        chatId,
        role: "assistant",
        content: answer,
      });

      if (isAuthed) {
        try {
          const analyticsSessionId = await ctx.runMutation(
            internal.chatAnalytics.getOrCreateAnalyticsSession,
            {
              userId,
              billId,
              clientSessionId: args.clientSessionId ?? sessionId,
              chatId,
              nowUtc: answeredAtUtc,
              nowIso: answeredAtIso,
              planAtTime,
            },
          );
          await ctx.runMutation(internal.chatAnalytics.recordAnalyticsTurn, {
            analyticsSessionId,
            userId,
            billId,
            chatId,
            userMessageId,
            assistantMessageId,
            billSnapshot: {
              billId: billContext.billId,
              congress: billContext.congress,
              billType: billContext.billType,
              billNumber: billContext.billNumber,
              billTypeLabel: billContext.billTypeLabel,
              title: billContext.title,
              introducedDate: billContext.introducedDate,
              sponsorFirstName: billContext.sponsorFirstName,
              sponsorLastName: billContext.sponsorLastName,
              sponsorParty: billContext.sponsorParty,
              sponsorState: billContext.sponsorState,
              progressStage: billContext.progressStage,
              progressDescription: billContext.progressDescription,
              policyArea: billContext.policyArea,
              hasSummary: billContext.summary.length > 0,
              summaryLength: billContext.summary.length,
              hasPdf: billContext.pdfUrl.length > 0,
            },
            model: servedModel,
            provider: servedBy,
            createdAtUtc: askedAtUtc,
            createdAtIso: askedAtIso,
            answeredAtUtc,
            answeredAtIso,
            latencyMs: answeredAtUtc - askedAtUtc,
            planAtTime,
          });
        } catch (analyticsError) {
          console.error("Failed to record bill chat analytics:", analyticsError);
        }
      }

      return { answer };
    } catch (error) {
      console.error("Error in sendChatMessage:", error);
      return { answer: "", error: "An unexpected error occurred." };
    }
  },
});
