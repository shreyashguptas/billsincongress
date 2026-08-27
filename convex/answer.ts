/**
 * The grounded answer loop (spec §5).
 *
 * The model is given a dataset index, two tools, and no ability to write a
 * query. It describes, fetches, and answers. Every row it receives is recorded
 * in `allowed`; at the end, any handle it cited that is not in `allowed` is
 * deleted (see catalog/cite.ts). That is the whole anti-hallucination design.
 */
import { action, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { rateLimiter } from "./rateLimits";
import { ANSWER_TOOLS, buildSystemPrompt, MAX_TOOL_ROUNDS } from "./catalog/tools";
import { describeDataset, isDatasetName } from "./catalog/datasets";
import { resolveAnswer } from "./catalog/cite";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Kept in step with convex/llm.ts — both are overridden by the same env vars. */
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731";
const DEFAULT_PROVIDERS = "deepinfra";
const MAX_PRICE = { prompt: 0.2, completion: 0.4 };
const SITE_URL = "https://billsincongress.com";
/** Cap on client-supplied history (spec §4.7). */
const MAX_HISTORY_TURNS = 10;
const MAX_HISTORY_CHARS = 8000;
const MAX_QUESTION_LENGTH = 2000;
/** Mirrors convex/rateLimits.ts. Shown to the reader, so it must match. */
const ANONYMOUS_CHAT_DAILY_LIMIT = 5;
const AUTHED_CHAT_DAILY_LIMIT = 100;

export interface WorkLogEntry {
  tool: string;
  detail: string;
}

export interface AnswerResult {
  text: string;
  sources: string[];
  workLog: WorkLogEntry[];
  dropped: number;
  partial: boolean;
  /**
   * Every handle the model was given this turn. The client needs it to resolve
   * entity directives (spec §6.6). NOT the same as `sources`, which is only
   * what it actually cited.
   */
  allowed: string[];
  /**
   * A small display projection per bill handle, so entity cards can show a
   * title without a per-card request storm. Keyed by handle.
   */
  entities: Record<string, Record<string, unknown>>;
  error?: string;
}

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

/**
 * Trim client-supplied history. Anonymous transcripts arrive from the browser
 * (spec §4.7), so an unbounded one is a cost attack. Oldest turns go first and
 * a turn is never split from its role.
 */
export function capHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  const recent = history.slice(-MAX_HISTORY_TURNS);
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  let chars = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const turn = recent[i];
    if (chars + turn.content.length > MAX_HISTORY_CHARS) break;
    chars += turn.content.length;
    out.unshift(turn);
  }
  return out;
}

function providerConfig() {
  const providers = (process.env.OPENROUTER_PROVIDERS || DEFAULT_PROVIDERS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    ...(providers.length > 0 && { only: providers }),
    max_price: MAX_PRICE,
    // Verified compatible with the provider pin by
    // scripts/check-provider-retention.ts. Re-run that probe on any model or
    // provider change — these flags are filters and can empty the pool.
    data_collection: "deny",
    zdr: true,
  };
}

async function callModel(messages: ChatMessage[], apiKey: string) {
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": SITE_URL,
      "X-OpenRouter-Title": "Bills in Congress",
    },
    body: JSON.stringify({
      model,
      messages,
      tools: ANSWER_TOOLS,
      max_tokens: 2048,
      temperature: 0.3,
      reasoning: { enabled: false },
      provider: providerConfig(),
    }),
  });

  if (!response.ok) {
    const body = (await response.text())
      .slice(0, 500)
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
    throw new Error(`OpenRouter ${response.status} ${response.statusText}: ${body}`);
  }
  const data = await response.json();
  // OpenRouter can answer 200 with an error payload when no provider could serve.
  if (data.error) throw new Error(`OpenRouter error: ${JSON.stringify(data.error).slice(0, 500)}`);
  return data.choices?.[0]?.message;
}

async function runLoop(
  ctx: ActionCtx,
  opts: {
    question: string;
    focusBillId?: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
    apiKey: string;
    onWork?: (entry: WorkLogEntry) => void;
  },
): Promise<AnswerResult> {
  const allowed = new Set<string>();
  /** Display projection per bill handle — see AnswerResult.entities. */
  const display = new Map<string, Record<string, unknown>>();
  const workLog: WorkLogEntry[] = [];
  const note = (entry: WorkLogEntry) => {
    workLog.push(entry);
    opts.onWork?.(entry);
  };

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt({ focusBillId: opts.focusBillId }) },
    ...capHistory(opts.history).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: opts.question },
  ];

  let partial = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // On the last permitted round, tell the model to stop looking and answer.
    const message = await callModel(
      round === MAX_TOOL_ROUNDS
        ? [...messages, { role: "user", content: "Answer now with what you have." }]
        : messages,
      opts.apiKey,
    );

    const toolCalls = message?.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const resolved = resolveAnswer(message?.content ?? "", allowed);
      return {
        ...resolved,
        workLog,
        partial,
        allowed: [...allowed],
        entities: Object.fromEntries(display),
      };
    }

    if (round === MAX_TOOL_ROUNDS) partial = true;

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      let result: string;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        result = "Your arguments were not valid JSON. Send a JSON object.";
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
        continue;
      }

      if (call.function.name === "describe_dataset") {
        const name = String(args.name ?? "");
        result = isDatasetName(name)
          ? describeDataset(name)
          : `Unknown dataset '${name}'. See the dataset index in your instructions.`;
        note({ tool: "describe", detail: name });
      } else if (call.function.name === "fetch_dataset") {
        const fetched = await ctx.runQuery(internal.catalog.fetch.fetchDataset, {
          name: String(args.name ?? ""),
          filters: args.filters ?? {},
          ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
        });
        if (fetched.ok) {
          for (const row of fetched.rows) {
            if (typeof row._cite !== "string") continue;
            allowed.add(row._cite);
            if (args.name === "bills") {
              display.set(row._cite, {
                label: row.label,
                title: row.title,
                sponsor: row.sponsor,
                sponsorParty: row.sponsorParty,
                progressStage: row.progressStage,
              });
            }
          }
          result = JSON.stringify({
            rows: fetched.rows,
            truncated: fetched.truncated,
            total_matching: fetched.count,
          });
          note({
            tool: "fetch",
            detail: `${String(args.name)} · ${fetched.count} match${fetched.count === 1 ? "" : "es"}`,
          });
        } else {
          result = `ERROR: ${fetched.error}`;
          note({ tool: "fetch", detail: `${String(args.name)} · rejected` });
        }
      } else {
        result = `Unknown tool '${call.function.name}'.`;
      }

      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  return {
    text: "I could not finish looking that up. Please try asking more specifically.",
    sources: [],
    workLog,
    dropped: 0,
    partial: true,
    allowed: [...allowed],
    entities: Object.fromEntries(display),
  };
}

export const ask = action({
  args: {
    question: v.string(),
    focusBillId: v.optional(v.string()),
    history: v.optional(
      v.array(
        v.object({
          role: v.union(v.literal("user"), v.literal("assistant")),
          content: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args): Promise<AnswerResult> => {
    const empty = {
      sources: [],
      workLog: [],
      dropped: 0,
      partial: false,
      allowed: [],
      entities: {},
    };
    if (args.question.trim().length === 0 || args.question.length > MAX_QUESTION_LENGTH) {
      return { text: "", ...empty, error: "Question must be between 1 and 2000 characters." };
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return { text: "", ...empty, error: "AI chat is not configured." };

    try {
      return await runLoop(ctx, {
        question: args.question,
        focusBillId: args.focusBillId,
        history: args.history ?? [],
        apiKey,
      });
    } catch (error) {
      console.error("answer.ask failed:", error);
      return { text: "", ...empty, error: "Failed to get a response." };
    }
  },
});

/**
 * SSE entry point (spec §7.3). Same loop as `ask`, but tool progress and answer
 * text are emitted as they happen — which is what makes the extra round trips
 * feel like visible work rather than dead time.
 *
 * Events: work {tool,detail} · delta {text} · done {sources,dropped,partial}
 *         · rate_limited {kind,max,resetAt} · error {message}
 */
export const stream = httpAction(async (ctx, request) => {
  const body = await request.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question : "";
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Read identity outside the stream so a rejection can still be reported.
  const userId = await getAuthUserId(ctx);
  const anonymousSessionId =
    typeof body.anonymousSessionId === "string" ? body.anonymousSessionId : null;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      if (!apiKey) {
        send("error", { message: "AI chat is not configured." });
        controller.close();
        return;
      }
      if (question.trim().length === 0 || question.length > MAX_QUESTION_LENGTH) {
        send("error", { message: "Question must be between 1 and 2000 characters." });
        controller.close();
        return;
      }
      if (!userId && !anonymousSessionId) {
        send("error", { message: "Could not identify this session." });
        controller.close();
        return;
      }

      // Consume the daily token BEFORE calling the model (spec §9). Without
      // this the new engine would have no spend cap at all — the old cap lives
      // inside convex/llm.ts, which this path deliberately bypasses.
      const limitStatus = userId
        ? await rateLimiter.limit(ctx, "chatAuthedPerDay", { key: userId })
        : await rateLimiter.limit(ctx, "chatAnonPerDay", { key: anonymousSessionId! });

      if (!limitStatus.ok) {
        const retryAfterMs = limitStatus.retryAfter ?? 0;
        send("rate_limited", {
          kind: userId ? "authed" : "anonymous",
          max: userId ? AUTHED_CHAT_DAILY_LIMIT : ANONYMOUS_CHAT_DAILY_LIMIT,
          resetAt: Date.now() + retryAfterMs,
        });
        controller.close();
        return;
      }

      try {
        const result = await runLoop(ctx, {
          question,
          focusBillId: typeof body.focusBillId === "string" ? body.focusBillId : undefined,
          history: Array.isArray(body.history) ? body.history : [],
          apiKey,
          onWork: (entry) => send("work", entry),
        });
        // Citations can only be resolved once the whole answer exists, so text
        // is emitted after resolution rather than token-by-token from the
        // model. Deltas are chunked to keep the reading experience live.
        for (const chunk of result.text.match(/[\s\S]{1,60}/g) ?? []) {
          send("delta", { text: chunk });
        }
        send("done", {
          sources: result.sources,
          dropped: result.dropped,
          partial: result.partial,
          allowed: result.allowed,
          entities: result.entities,
        });
      } catch (error) {
        console.error("answer stream failed:", error);
        send("error", { message: "Failed to get a response." });
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
