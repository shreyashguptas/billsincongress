/**
 * The grounded answer loop (spec §5). Every row the model is given is recorded
 * in `allowed`; any handle it cites that is not in `allowed` is deleted (see
 * catalog/cite.ts). That is the whole anti-hallucination design.
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
import { payloadFor, workLogLabel } from "./catalog/completeness";
import { sanitizeAnswer } from "./catalog/answerSanitize";
import { parsePageContext, type PageContext } from "./catalog/context";
import { checkSearchQuery } from "../lib/search-query-guard";
import type { Id } from "./_generated/dataModel";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Kept in step with convex/llm.ts — both are overridden by the same env vars. */
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731";
const DEFAULT_PROVIDERS = "deepinfra,amazon-bedrock";
/** Failover chain. Rules live on DEFAULT_FALLBACK_MODELS in convex/llm.ts. */
const DEFAULT_FALLBACK_MODELS =
  "deepseek/deepseek-v4-flash,amazon/nova-lite-v1";
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
/**
 * Sent on the last round, with the tools withheld. It licenses a PARTIAL answer
 * explicitly: the failure it replaces was a full apology delivered on top of 17
 * successful lookups, because nothing told the model that half an answer beats
 * none.
 */
const FINAL_ROUND_INSTRUCTION =
  "You have no lookups left. Answer now from what you already retrieved. If that covers only " +
  "part of what was asked, give that part and say plainly, in the same sentence, which part you " +
  "could not get. Do not ask the reader to rephrase.";
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
   * Every handle the model was given this turn; the client resolves entity
   * directives from it (spec §6.6). NOT `sources`, which is only what it cited.
   */
  allowed: string[];
  /** Display projection per bill handle, so entity cards avoid a request storm. */
  entities: Record<string, Record<string, unknown>>;
  /**
   * The model's one-sentence explanation of what we do not hold, shown to the
   * reader verbatim above the web sources (spec §4.6). Usually empty.
   */
  webReason: string;
  webSources: WebSource[];
  /**
   * Set when the model called ask_reader instead of answering. The text IS the
   * question. The reader replies as a normal next turn.
   */
  askedReader?: boolean;
  /**
   * The model hit its token ceiling mid-sentence. Previously undetected, which
   * mattered because the answer is written claim-first and the caveat last, so a
   * cut-off answer loses precisely the qualification that made it honest.
   */
  truncatedByLength?: boolean;
  error?: string;
}

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

/**
 * Trim client-supplied history: it arrives from the browser (spec §4.7), so an
 * unbounded transcript is a cost attack. Oldest turns go first.
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

/**
 * For the main answer loop only. Do NOT apply fallbacks to searchWeb: that call
 * parses provider-specific citation annotations, so swapping the model could
 * return a shape we do not read.
 */
function fallbackModels(): string[] {
  // `??` not `||`: a blank value here deliberately turns fallbacks off.
  return (process.env.OPENROUTER_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function providerConfig() {
  const providers = (process.env.OPENROUTER_PROVIDERS || DEFAULT_PROVIDERS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    ...(providers.length > 0 && { only: providers }),
    max_price: MAX_PRICE,
    // These flags are FILTERS and can empty the provider pool; re-run
    // scripts/check-provider-retention.ts on any model or provider change.
    data_collection: "deny",
    zdr: true,
  };
}

async function callModel(
  messages: ChatMessage[],
  apiKey: string,
  opts: { withTools?: boolean } = {},
) {
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const fallbacks = fallbackModels();
  const withTools = opts.withTools ?? true;

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
      ...(fallbacks.length > 0 && { models: fallbacks }),
      messages,
      // Omitted entirely on the final round. Sending the tools and asking the
      // model not to use them is advice; not sending them is a guarantee. When it
      // was advice, a model that asked for one more lookup fell out of the loop
      // and the reader got a canned apology on top of 17 successful fetches.
      ...(withTools ? { tools: ANSWER_TOOLS } : {}),
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
  // No analytics on this path, so this log is the only place a degraded
  // fallback answer would ever surface.
  const servedModel = typeof data.model === "string" ? data.model : model;
  if (servedModel !== model) {
    console.error(
      `OpenRouter served ${servedModel} instead of requested ${model}`,
    );
  }
  const choice = data.choices?.[0];
  // finish_reason was never read, so a completion cut off at max_tokens was
  // returned as if it were whole. Surfaced here so the loop can say so.
  return {
    message: choice?.message,
    lengthCapped: choice?.finish_reason === "length",
  };
}

/**
 * The fallback lookup (spec §3.2). A SEPARATE request rather than OpenRouter's
 * server-side web tool: their schema cannot make `reason` a required argument,
 * and the model must not search without telling the reader why.
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

  // Annotations come back as { type: "url_citation", url_citation: { url,
  // title, content } }; the flat fallbacks below survive a shape change.
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

/**
 * Read what the reader has open, from whichever field carries it.
 *
 * `focusBillId` is the older channel and is still honoured. Convex deploys are
 * manual and separate from the site's, so for one release either half may be
 * the older one — and neither ordering may cost a reader their context. Delete
 * the fallback once both halves have shipped.
 *
 * Nothing here trusts the caller: `/answer/stream` is publicly addressable, so
 * every field goes through `parsePageContext` regardless of which route it
 * arrived on.
 */
function readContext(raw: unknown, legacyBillId: unknown): PageContext | null {
  const parsed = parsePageContext(raw);
  if (parsed) return parsed;
  if (typeof legacyBillId !== "string") return null;
  return parsePageContext({ route: "bill", billId: legacyBillId });
}

async function runLoop(
  ctx: ActionCtx,
  opts: {
    question: string;
    pageContext?: PageContext | null;
    history: Array<{ role: "user" | "assistant"; content: string }>;
    apiKey: string;
    scope?: AnswerScope;
    onWork?: (entry: WorkLogEntry) => void;
  },
): Promise<AnswerResult> {
  const allowed = new Set<string>();
  const display = new Map<string, Record<string, unknown>>();
  const workLog: WorkLogEntry[] = [];
  let webReason = "";
  const webSources: WebSource[] = [];
  const note = (entry: WorkLogEntry) => {
    workLog.push(entry);
    opts.onWork?.(entry);
  };

  // The scope block below must land BETWEEN the history and the question, so
  // the model reads those rows as prior context, not as the answer.
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        pageContext: opts.pageContext,
        scopeLabel: opts.scope?.label,
        // Without this the model dated "recent", "this year" and "how long ago"
        // from its own training cutoff, and had no way to know that two of the
        // three Congresses we hold have already adjourned.
        today: new Date().toISOString().slice(0, 10),
      }),
    },
    ...capHistory(opts.history).map((m) => ({ role: m.role, content: m.content })),
  ];

  /**
   * Hand the model ROWS for something it already knows the reader is looking
   * at, as a tool result it appears to have fetched itself.
   *
   * The rows arrive carrying their `_cite` handles, which is the whole point:
   * describing the reader's context in prose would give the model facts it
   * cannot cite, and `cite.ts` deletes citations for handles that were never
   * issued — so the reader would get a confident sentence with nothing behind
   * it, on the one site whose entire promise is provenance.
   */
  const seed = async (
    callId: string,
    dataset: string,
    filters: Record<string, unknown>,
    detail: (count: string) => string,
  ) => {
    const seeded = await ctx.runQuery(internal.catalog.fetch.fetchDataset, {
      name: dataset,
      filters,
    });
    if (!seeded.ok) return;

    for (const row of seeded.rows) {
      if (typeof row._cite !== "string") continue;
      allowed.add(row._cite);
      if (dataset === "bills") {
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
          id: callId,
          type: "function",
          function: {
            name: "fetch_dataset",
            arguments: JSON.stringify({ name: dataset, filters }),
          },
        },
      ],
    });
    messages.push({
      role: "tool",
      tool_call_id: callId,
      content: payloadFor(seeded.rows, seeded.report),
    });
    note({ tool: "fetch", detail: detail(workLogLabel(seeded.report)) });
  };

  // The bill the reader has open (spec §6.4). Seeded rather than described, so
  // the answer can say what the bill IS — title, sponsor, where it has got to —
  // and cite it, without spending a tool round trip discovering a bill we
  // already knew the id of.
  if (opts.pageContext?.billId) {
    await seed(
      "focus_0",
      "bills",
      { billId: opts.pageContext.billId },
      () => `the bill on screen · ${opts.pageContext!.billId}`,
    );
  }

  // Pre-applied scope (spec §6.3): hand the model the ROWS, not a sentence
  // describing them — describing invites it to re-derive a different set.
  if (opts.scope) {
    const scope = opts.scope;
    await seed(
      "scope_0",
      scope.dataset,
      scope.filters,
      (count) => `${scope.label} · ${count}`,
    );
  }

  messages.push({ role: "user", content: opts.question });

  let partial = false;
  let truncatedByLength = false;

  const finish = (raw: string, extra: Partial<AnswerResult> = {}): AnswerResult => {
    // Strip the model's working-out BEFORE citations are resolved, so a handle
    // cited only inside a deleted deliberation paragraph does not become a
    // dangling source. Enforced in code because the prompt asking for it did not
    // hold: readers were shown "The result says truncated: false" as reassurance,
    // and once a false claim that our own data was incomplete.
    const cleaned = sanitizeAnswer(raw);
    const resolved = resolveAnswer(cleaned.text, allowed);
    return {
      ...resolved,
      workLog,
      partial,
      allowed: [...allowed],
      entities: Object.fromEntries(display),
      webReason,
      webSources,
      ...(truncatedByLength ? { truncatedByLength: true } : {}),
      ...extra,
    };
  };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // On the final round the tools are WITHHELD, not discouraged. Asking the
    // model to "answer now" while still handing it the tool schema left it free
    // to call one more tool, after which the loop fell out of the bottom and
    // returned a canned apology — discarding everything it had gathered.
    const isFinalRound = round === MAX_TOOL_ROUNDS;
    if (isFinalRound) partial = true;

    const { message, lengthCapped } = await callModel(
      isFinalRound
        ? [...messages, { role: "user", content: FINAL_ROUND_INSTRUCTION }]
        : messages,
      opts.apiKey,
      { withTools: !isFinalRound },
    );
    if (lengthCapped) truncatedByLength = true;

    const toolCalls = message?.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const text = message?.content ?? "";
      // Empty prose is not an answer; fall through to the message below rather
      // than streaming the reader a blank panel.
      if (text.trim().length === 0) break;
      return finish(text);
    }

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: toolCalls });

    // ask_reader ends the turn. Handled before the tool loop because there is
    // nothing to append to the transcript — the reader's reply is the next turn.
    const askCall = toolCalls.find(
      (c: { function: { name: string } }) => c.function.name === "ask_reader",
    );
    if (askCall) {
      let question = "";
      let why = "";
      try {
        const parsed = JSON.parse(askCall.function.arguments || "{}");
        question = typeof parsed.question === "string" ? parsed.question : "";
        why = typeof parsed.why === "string" ? parsed.why : "";
      } catch {
        question = "";
      }
      if (question.trim().length > 0) {
        note({ tool: "ask", detail: why || "needs one detail before answering" });
        const prose = why.trim().length > 0 ? `${why.trim()}\n\n${question.trim()}` : question.trim();
        return finish(prose, { askedReader: true, partial: false });
      }
      // A malformed ask_reader is not fatal: tell the model and let it retry.
      messages.push({
        role: "tool",
        tool_call_id: askCall.id,
        content: "ERROR: 'question' is required and must be a non-empty string.",
      });
    }

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
          result = payloadFor(fetched.rows, fetched.report);
          note({
            tool: "fetch",
            detail: `${String(args.name)} · ${workLogLabel(fetched.report)}`,
          });
        } else {
          // A rejected filter is an error in the model's CALL, not a gap in our
          // holdings. Labelled as such because the model laundered one into
          // "we don't have data on Texas bills that became law" — a statement
          // about the site, made in the site's voice, that was false.
          result = `ERROR (your call was invalid — this says nothing about what we hold): ${fetched.error}`;
          note({ tool: "fetch", detail: `${String(args.name)} · invalid request, retrying` });
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
      } else if (call.function.name === "ask_reader") {
        // Reached only when the ask was malformed and already answered above.
        continue;
      } else {
        result = `Unknown tool '${call.function.name}'.`;
      }

      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  // Unreachable in normal operation: the final round is called without tools, so
  // it cannot end in a tool call, and any non-empty answer returns above. Kept as
  // the honest thing to say when the model returns nothing at all.
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
 * INTERNAL on purpose: this path has no rate limiter — the daily spend cap
 * lives in `stream` below — so a public export would be an unmetered door to
 * OpenRouter for anyone holding the deployment URL. `convex run` calls internal
 * functions as admin, so CLI testing is unaffected.
 */
export const ask = internalAction({
  args: {
    question: v.string(),
    /** Kept for `convex run` ergonomics; `context.billId` is the real channel. */
    focusBillId: v.optional(v.string()),
    context: v.optional(v.any()),
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
        pageContext: readContext(args.context, args.focusBillId),
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
 * SSE entry point (spec §7.3). Same loop as `ask`, streamed as it happens.
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

      // Consume the daily token BEFORE calling the model (spec §9): this is the
      // only spend cap on this path, which bypasses the one in convex/llm.ts.
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
          pageContext: readContext(body.context, body.focusBillId),
          scope:
            body.scope && typeof body.scope.dataset === "string"
              ? (body.scope as AnswerScope)
              : undefined,
          history: Array.isArray(body.history) ? body.history : [],
          apiKey,
          onWork: (entry) => send("work", entry),
        });
        // Citations resolve only once the whole answer exists, so text is
        // emitted after resolution, chunked — never token-by-token.
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
          askedReader: result.askedReader ?? false,
          // The model hit its token ceiling mid-answer. Reported so a rising
          // rate is visible: an answer cut off here loses whatever qualification
          // was still to come.
          truncatedByLength: result.truncatedByLength ?? false,
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
