/**
 * The grounded answer loop (spec §5).
 *
 * The model is given a dataset index, two tools, and no ability to write a
 * query. It describes, fetches, and answers. Every row it receives is recorded
 * in `allowed`; at the end, any handle it cited that is not in `allowed` is
 * deleted (see catalog/cite.ts). That is the whole anti-hallucination design.
 */
import { httpAction, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { rateLimiter } from "./rateLimits";
import { ANSWER_TOOLS, buildSystemPrompt, MAX_TOOL_ROUNDS } from "./catalog/tools";
import { describeDataset, isDatasetName } from "./catalog/datasets";
import { resolveAnswer } from "./catalog/cite";
import { checkSearchQuery } from "../lib/search-query-guard";
import type { Id } from "./_generated/dataModel";

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
/** Search engine behind the web fallback. Named on the privacy page. */
const WEB_ENGINE = "exa";
const WEB_MAX_RESULTS = 5;

export interface WorkLogEntry {
  tool: string;
  detail: string;
}

export interface WebSource {
  handle: string;
  url: string;
  title: string;
  excerpt: string;
}

export interface AnswerScope {
  dataset: string;
  filters: Record<string, unknown>;
  label: string;
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
  /**
   * The model's own one-sentence explanation of what we do not hold, shown to
   * the reader verbatim above the web sources (spec §4.6). Empty when the
   * answer came entirely from our data — which is the expected case.
   */
  webReason: string;
  webSources: WebSource[];
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

/**
 * The fallback lookup (spec §3.2).
 *
 * A SEPARATE request rather than OpenRouter's server tool. That matters: the
 * server tool's schema belongs to OpenRouter, so we could not make `reason` a
 * required argument on it. Defining our own tool means the model cannot search
 * without telling the reader why — and web results flow through the same
 * provenance path as database rows. Costs one extra request, on the fallback
 * path only.
 */
async function searchWeb(query: string, apiKey: string): Promise<WebSource[]> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": SITE_URL,
      "X-OpenRouter-Title": "Bills in Congress",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
      messages: [{ role: "user", content: query }],
      max_tokens: 512,
      plugins: [{ id: "web", engine: WEB_ENGINE, max_results: WEB_MAX_RESULTS }],
      provider: providerConfig(),
    }),
  });

  if (!response.ok) return [];
  const data = await response.json().catch(() => ({}));
  if (data.error) return [];

  // Verified 2026-08-26 against the pinned model + DeepInfra: annotations come
  // back as { type: "url_citation", url_citation: { url, title, content } }.
  // The flat fallbacks below cover a shape change without breaking citations.
  const annotations = data.choices?.[0]?.message?.annotations ?? [];
  type Annotation = {
    type?: string;
    url?: string;
    title?: string;
    content?: string;
    url_citation?: { url?: string; title?: string; content?: string };
  };
  return annotations
    .filter((a: Annotation) => a?.type === "url_citation")
    .slice(0, WEB_MAX_RESULTS)
    .map((a: Annotation, i: number) => ({
      handle: `web:${i + 1}`,
      url: a.url_citation?.url ?? a.url ?? "",
      title: a.url_citation?.title ?? a.title ?? "",
      excerpt: (a.url_citation?.content ?? a.content ?? "").slice(0, 500),
    }))
    .filter((s: WebSource) => s.url !== "");
}

async function runLoop(
  ctx: ActionCtx,
  opts: {
    question: string;
    focusBillId?: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
    apiKey: string;
    scope?: AnswerScope;
    onWork?: (entry: WorkLogEntry) => void;
  },
): Promise<AnswerResult> {
  const allowed = new Set<string>();
  /** Display projection per bill handle — see AnswerResult.entities. */
  const display = new Map<string, Record<string, unknown>>();
  const workLog: WorkLogEntry[] = [];
  let webReason = "";
  const webSources: WebSource[] = [];
  const note = (entry: WorkLogEntry) => {
    workLog.push(entry);
    opts.onWork?.(entry);
  };

  // System prompt and history first. The scope block (below) has to land
  // BETWEEN the history and the reader's question, so the model sees the rows
  // as context it already has rather than as an answer to the question.
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        focusBillId: opts.focusBillId,
        scopeLabel: opts.scope?.label,
      }),
    },
    ...capHistory(opts.history).map((m) => ({ role: m.role, content: m.content })),
  ];

  // A pre-applied scope (spec §6.3): the reader already filtered to exactly the
  // set they care about, so hand the model the ROWS rather than a sentence
  // describing them. Describing invites it to re-derive a slightly different
  // set and answer about the wrong one.
  if (opts.scope) {
    const seeded = await ctx.runQuery(internal.catalog.fetch.fetchDataset, {
      name: opts.scope.dataset,
      filters: opts.scope.filters,
    });
    if (seeded.ok) {
      for (const row of seeded.rows) {
        if (typeof row._cite !== "string") continue;
        allowed.add(row._cite);
        if (opts.scope.dataset === "bills") {
          display.set(row._cite, {
            label: row.label,
            title: row.title,
            sponsor: row.sponsor,
            sponsorParty: row.sponsorParty,
            progressStage: row.progressStage,
          });
        }
      }
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "scope_0",
            type: "function",
            function: {
              name: "fetch_dataset",
              arguments: JSON.stringify({
                name: opts.scope.dataset,
                filters: opts.scope.filters,
              }),
            },
          },
        ],
      });
      messages.push({
        role: "tool",
        tool_call_id: "scope_0",
        content: JSON.stringify({
          rows: seeded.rows,
          truncated: seeded.truncated,
          total_matching: seeded.count,
          ...(seeded.countIsLowerBound ? { total_is_at_least: true } : {}),
        }),
      });
      note({ tool: "fetch", detail: `${opts.scope.label} · ${seeded.count} matches` });
    }
  }

  messages.push({ role: "user", content: opts.question });

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
        webReason,
        webSources,
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
            // When the scan hit its window, total_matching counts only what we
            // read, not what exists. Saying so is the difference between "at
            // least 12" and a confidently wrong "12".
            ...(fetched.countIsLowerBound ? { total_is_at_least: true } : {}),
          });
          note({
            tool: "fetch",
            detail: `${String(args.name)} · ${fetched.count} match${fetched.count === 1 ? "" : "es"}`,
          });
        } else {
          result = `ERROR: ${fetched.error}`;
          note({ tool: "fetch", detail: `${String(args.name)} · rejected` });
        }
      } else if (call.function.name === "search_web") {
        const query = String(args.query ?? "");
        const reason = String(args.reason ?? "");

        if (reason.trim().length === 0) {
          result =
            "ERROR: 'reason' is required. Name the specific gap in our data in one sentence.";
        } else {
          // The privacy control (spec §4.6): the reader's own words never
          // leave our servers. A rejection here is recoverable — the model
          // rephrases and calls again.
          const guard = checkSearchQuery(query, opts.question);
          if (!guard.ok) {
            result = `ERROR: ${guard.error}`;
          } else {
            const hits = await searchWeb(query, opts.apiKey);
            for (const h of hits) {
              allowed.add(h.handle);
              webSources.push(h);
            }
            webReason = reason;
            result = JSON.stringify({
              results: hits.map((h) => ({ _cite: h.handle, url: h.url, excerpt: h.excerpt })),
            });
            note({ tool: "web", detail: reason });
          }
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
    webReason,
    webSources,
  };
}

/**
 * Non-streaming entry point, for `npx convex run answer:ask '{...}'`.
 *
 * INTERNAL on purpose. A public action here would be reachable by anyone with
 * the deployment URL, and this path has no rate limiter — the daily cap lives
 * in `stream` below. Exporting it publicly would leave an unmetered door
 * straight through to OpenRouter at our expense, which is exactly the spend cap
 * `stream` exists to enforce. `convex run` calls internal functions as admin,
 * so CLI testing is unaffected.
 */
export const ask = internalAction({
  args: {
    question: v.string(),
    focusBillId: v.optional(v.string()),
    scope: v.optional(
      v.object({ dataset: v.string(), filters: v.any(), label: v.string() }),
    ),
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
      webReason: "",
      webSources: [],
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
        scope: args.scope as AnswerScope | undefined,
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
          scope:
            body.scope && typeof body.scope.dataset === "string"
              ? (body.scope as AnswerScope)
              : undefined,
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
        // Persist ONLY when signed in. Anonymous conversations are never
        // written (spec §4.7); this branch is the whole of that guarantee on
        // the write path — do not add an `else`.
        let savedChatId = typeof body.chatId === "string" ? body.chatId : undefined;
        if (userId) {
          try {
            savedChatId = await ctx.runMutation(internal.chats.appendTurn, {
              ...(savedChatId ? { chatId: savedChatId as Id<"chats"> } : {}),
              userId,
              question,
              answer: result.text,
              citations: result.sources,
              allowed: result.allowed,
              entities: result.entities,
              ...(result.webReason ? { webReason: result.webReason } : {}),
              ...(result.webSources.length > 0 ? { webSources: result.webSources } : {}),
              workLog: result.workLog,
              now: Date.now(),
            });
          } catch (error) {
            // A failed save must not cost the reader their answer.
            console.error("failed to persist chat turn:", error);
            savedChatId = undefined;
          }
        }

        send("done", {
          sources: result.sources,
          dropped: result.dropped,
          partial: result.partial,
          allowed: result.allowed,
          entities: result.entities,
          webReason: result.webReason,
          webSources: result.webSources,
          chatId: savedChatId ?? null,
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
