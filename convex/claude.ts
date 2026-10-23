/**
 * The Claude API route of the answer loop and of the web lookup, called
 * directly with Anthropic's SDK on the site's own key (ANTHROPIC_API_KEY).
 *
 * Kept free of Convex function definitions and Convex imports, like aiTrace.ts,
 * so scripts/check-grounding.ts drives the SAME request code production sends
 * and so the pure parts carry unit tests under `tsx` (convex/claude.test.ts).
 *
 * Three rules shape everything here:
 *
 * 1. US servers only. Every request sends `inference_geo: "us"` (the owner's
 *    hard rule; it costs 1.1x), and the geography Anthropic reports back is
 *    recorded on the trace and logged loudly if it is ever anything else.
 *
 * 2. The transcript is append-only. Claude 5.5 models bind each thinking block
 *    to the exact conversation before it: change the system prompt, the tool
 *    list or an earlier message and every later block is invalid (a 400 on
 *    accounts made since 2026-08-31). So Claude's own reply goes back verbatim
 *    (`ChatMessage.claude`), the tool list is the same on every round (the last
 *    round says `tool_choice: none` instead of withholding the tools), and the
 *    system prompt is fixed for the whole turn.
 *
 * 3. A price table is the runaway-cost guard. A model with no price here is
 *    refused before any request, so a careless ANTHROPIC_*_MODEL change to a
 *    pricier model fails loudly (and the turn moves on down the chain) instead
 *    of multiplying the bill. The same table prices every call for the trace.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ANSWER_TOOLS } from "./catalog/tools";
import type { AnswerTrace, GenerationRecord } from "./aiTrace";

/** Anthropic's own endpoint, pinned: `inference_geo` is a first-party parameter. */
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
/** The geography every request asks for. Not configurable on purpose. */
export const INFERENCE_GEO = "us";

/**
 * The answer model, tried first; override with ANTHROPIC_ANSWER_MODEL, and set
 * it blank to skip it.
 *
 * Claude Haiku 5.5 at low effort, chosen on 2026-10-13 on the truth questions
 * (20 scored, twice each, every flagged answer read by hand): 38 of 40 right
 * against gpt-oss's 37, at about a seventh of the token cost, but a median of
 * 3.7 s against 1.1 s. Medium and high effort scored the same and cost about
 * 3x; thinking off and max effort both scored lower. (Measured through
 * OpenRouter; the request is now the Claude API's own.)
 */
export const DEFAULT_ANSWER_MODEL = "claude-haiku-5-5";
/**
 * Tried when the answer model fails (an error, a refusal, a timeout); override
 * with ANTHROPIC_BACKUP_MODEL, and set it blank to skip it. It reads Claude
 * Haiku 5.5's thinking blocks on the Claude API, so a turn that moves up to it
 * keeps the reasoning done so far. About twenty times Haiku's price per token,
 * which is why it is the backup and not the answer model.
 */
export const DEFAULT_BACKUP_MODEL = "claude-sonnet-5-5";
/**
 * The model behind the web lookup, with Anthropic's server-side web search
 * tool; override with ANTHROPIC_WEB_MODEL, and set it blank to search through
 * OpenRouter's Exa plugin instead.
 *
 * The basic `web_search_20250305` tool, on purpose. The newer `_20260209`
 * version filters the results through server-side code first, and measured on
 * 2026-10-23 its reply then carried no citations at all: every lookup fell back
 * to Exa after paying for the search. The basic tool cites each sentence with
 * the text it quotes, which is what the reader's sources are built from, and it
 * read 12.8k input tokens against 29.8k for the same query.
 */
export const DEFAULT_WEB_MODEL = "claude-sonnet-5-5";

/** The Claude models for one answer turn, in order. Blank values drop a link. */
export function claudeAnswerModels(env: Record<string, string | undefined> = process.env): string[] {
  // `??` not `||`: a blank value deliberately turns that model off.
  const answer = (env.ANTHROPIC_ANSWER_MODEL ?? DEFAULT_ANSWER_MODEL).trim();
  const backup = (env.ANTHROPIC_BACKUP_MODEL ?? DEFAULT_BACKUP_MODEL).trim();
  return [answer, backup].filter((m, i, all) => m !== "" && all.indexOf(m) === i);
}

/** The web-search model, or "" when the Claude web lookup is switched off. */
export function claudeWebModel(env: Record<string, string | undefined> = process.env): string {
  return (env.ANTHROPIC_WEB_MODEL ?? DEFAULT_WEB_MODEL).trim();
}

// ---------------------------------------------------------------------------
// PRICES. USD per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing
// (read 2026-10-22). Re-read that page before adding a model.
// ---------------------------------------------------------------------------

interface Rates {
  input: number;
  output: number;
  /** 5-minute cache write; the only TTL this code asks for. */
  cacheWrite: number;
  cacheRead: number;
}
export interface ClaudePrice extends Rates {
  /** Claude Haiku 5.5 charges more for the whole request when its prompt is over this many tokens. */
  long?: Rates & { overPromptTokens: number };
}

export const CLAUDE_PRICES: Readonly<Record<string, ClaudePrice>> = {
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheWrite: 0.125,
    cacheRead: 0.01,
    long: { overPromptTokens: 100_000, input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 },
  },
  // Cache reads on Sonnet 5.5 are 0.05x input, not the usual 0.1x.
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
};
/** `inference_geo: "us"` multiplies every token price, cache included. */
export const US_INFERENCE_MULTIPLIER = 1.1;
/** $10 per 1,000 searches; a search that errors is not billed. */
export const WEB_SEARCH_USD = 0.01;

export interface ClaudeUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  inference_geo?: string | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

/** What one call cost us, or undefined for a model with no price on file. */
export function claudeCostUsd(model: string, usage: ClaudeUsage | null | undefined): number | undefined {
  const price = CLAUDE_PRICES[model];
  if (!price || !usage) return undefined;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  // The prompt's length counts cached tokens too, and decides the rate card.
  const rates: Rates = price.long && input + write + read > price.long.overPromptTokens ? price.long : price;
  const tokens = (input * rates.input + output * rates.output + write * rates.cacheWrite + read * rates.cacheRead) / 1e6;
  // Priced at the US rate unless Anthropic says it ran elsewhere: every request asks for "us".
  const geo = usage.inference_geo ?? INFERENCE_GEO;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  return tokens * (geo === "us" ? US_INFERENCE_MULTIPLIER : 1) + searches * WEB_SEARCH_USD;
}

/** Refuses a model with no price on file. See rule 3 at the top of this file. */
function assertPriced(model: string) {
  if (!CLAUDE_PRICES[model]) {
    throw new Error(
      `No price on file for ${model}: add it to CLAUDE_PRICES in convex/claude.ts before using it`,
    );
  }
}

// ---------------------------------------------------------------------------
// EFFORT.
// ---------------------------------------------------------------------------

export type ClaudeEffort = "low" | "medium" | "high";

/**
 * The effort for Claude from the shared reasoning setting (convex/reasoning.ts,
 * OPENROUTER_REASONING). Always sent: Haiku 5.5 would otherwise run at medium.
 * An off-word means "low", not thinking off: Sonnet 5.5 refuses
 * `thinking: disabled`, and lowering effort is how both models are told to
 * think less (at low they skip thinking on most simple requests). "minimal",
 * gpt-oss's lowest level, has no Claude equivalent and maps to "low" too.
 */
export function claudeEffort(reasoning: { enabled: false } | { effort: string }): ClaudeEffort {
  if ("enabled" in reasoning) return "low";
  return reasoning.effort === "medium" || reasoning.effort === "high" ? reasoning.effort : "low";
}

// ---------------------------------------------------------------------------
// THE TRANSCRIPT. answer.ts keeps it in the OpenAI shape OpenRouter takes, so
// either route can pick a turn up; Claude's own reply rides along verbatim.
// ---------------------------------------------------------------------------

/** A Claude reply exactly as the API returned it, to be sent back unchanged. */
export interface ClaudeTurn {
  model: string;
  content: Anthropic.ContentBlock[];
}

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  /**
   * Never set by the loop. The model's reasoning is NOT handed back to
   * OpenRouter on later rounds: measured on 2026-10-05, DeepSeek through
   * OpenRouter answered fine without it, and when OpenRouter failed over to
   * Amazon Bedrock, Bedrock refused the whole request: "User messages cannot
   * contain reasoning content." gpt-oss scored 18-19 of 21 on the truth
   * questions without it (2026-10-05), and its failover hosts include Bedrock.
   * Kept in the type so the refusal path can strip it from anything that
   * carries it.
   */
  reasoning_details?: unknown[];
  /**
   * On an assistant message Claude wrote: its content blocks, thinking blocks
   * and signatures included, sent back to Claude exactly as received. Never
   * sent to OpenRouter (see forOpenRouter) or recorded on a trace.
   */
  claude?: ClaudeTurn;
};

/** The transcript as OpenRouter and the trace see it: without Claude's raw blocks. */
export function forOpenRouter(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(({ claude: _raw, ...rest }) => rest);
}

/** ANSWER_TOOLS in the Claude API's shape. The schemas are passed through untouched. */
export function claudeTools(): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = ANSWER_TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }));
  // Tools render first, so this breakpoint caches them for every request on the
  // site, whatever page or question it carries.
  tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: "ephemeral" } };
  return tools;
}

/** The loop's error results (answer.ts): a refused call, bad JSON, an unknown tool. */
function isErrorResult(content: string): boolean {
  return (
    content.startsWith("ERROR") ||
    content.startsWith("Your arguments were not valid JSON") ||
    content.startsWith("Unknown tool")
  );
}

/**
 * Opens the transcript when the turn would otherwise start with our own lookup:
 * the Messages API wants a user turn first, and runLoop opens a first question
 * with the describe_dataset exchange it primes (see primedDescriptions).
 */
export const OPENING_USER_TURN =
  "(The lookups below were run before the reader's question, which follows them.)";

/**
 * The transcript in the Claude API's shape. Deterministic and prefix-stable:
 * converting a longer transcript yields the shorter one's output plus more,
 * which is what keeps thinking blocks valid and the cache warm across rounds.
 *
 * - The first system message is the system prompt, cached. A later system
 *   message (the follow-up note) joins it as a second block: the API takes a
 *   mid-conversation system message only before an assistant turn or last, and
 *   this one sits before the reader's question. It is written before the first
 *   round, so the system prompt never changes within a turn.
 * - An assistant message Claude wrote goes back as its own content blocks.
 *   One we wrote (a primed or seeded lookup) becomes text and tool_use blocks.
 * - Consecutive tool results become one user message, as the API asks.
 */
export function toClaudeRequest(messages: ChatMessage[]): {
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
} {
  const system: Anthropic.TextBlockParam[] = [];
  const out: Anthropic.MessageParam[] = [];
  let toolResults: Anthropic.ToolResultBlockParam[] | null = null;
  const flushResults = () => {
    if (toolResults) out.push({ role: "user", content: toolResults });
    toolResults = null;
  };

  for (const m of messages) {
    if (m.role === "tool") {
      toolResults ??= [];
      const content = m.content ?? "";
      toolResults.push({
        type: "tool_result",
        tool_use_id: m.tool_call_id ?? "",
        content,
        ...(isErrorResult(content) ? { is_error: true } : {}),
      });
      continue;
    }
    flushResults();
    if (m.role === "system") {
      if (!m.content) continue;
      system.push(
        system.length === 0
          ? { type: "text", text: m.content, cache_control: { type: "ephemeral" } }
          : { type: "text", text: m.content },
      );
    } else if (m.role === "user") {
      out.push({ role: "user", content: m.content ?? "" });
    } else if (m.claude) {
      out.push({ role: "assistant", content: m.claude.content as Anthropic.ContentBlockParam[] });
    } else {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content && m.content.trim().length > 0) blocks.push({ type: "text", text: m.content });
      for (const call of m.tool_calls ?? []) {
        let input: unknown = {};
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          input = {};
        }
        blocks.push({ type: "tool_use", id: call.id, name: call.function.name, input });
      }
      if (blocks.length > 0) out.push({ role: "assistant", content: blocks });
    }
  }
  flushResults();
  if (out.length > 0 && out[0].role !== "user") out.unshift({ role: "user", content: OPENING_USER_TURN });
  return { system, messages: out };
}

// ---------------------------------------------------------------------------
// THE CALLS.
// ---------------------------------------------------------------------------

/**
 * One client per call: cheap, and it picks up the global `fetch` at the time
 * (the specs replace it). No SDK retries: the caller's chain is the retry (the
 * next model, then gpt-oss), and the reader's stall watchdog gives up after 45 s
 * with no new work-log step. The chain writes a step before each backup, so each
 * single try must finish inside that window; an SDK retry (or a 429's
 * retry-after wait, up to 60 s) would not. Haiku's median was 3.7 s on
 * 2026-10-13.
 */
/** One answer round on one model. Under the reader's 45 s stall watchdog. */
const ANSWER_TIMEOUT_MS = 40_000;
/**
 * One web lookup. The answer loop writes a work-log step before it and another
 * before the Exa fallback, so each call gets its own 45 s window.
 */
const WEB_TIMEOUT_MS = 30_000;
function client(apiKey: string, timeout: number): Anthropic {
  return new Anthropic({ apiKey, baseURL: ANTHROPIC_BASE_URL, maxRetries: 0, timeout });
}

/** A refusal or a truncated tool call is not an answer; the chain moves on. */
export class ClaudeDeclined extends Error {
  override name = "ClaudeDeclined";
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function warnIfNotUs(model: string, geo: string | null | undefined) {
  if (geo && geo !== INFERENCE_GEO) {
    console.error(
      `US-ONLY RULE BROKEN: ${model} reports inference_geo=${geo} although "${INFERENCE_GEO}" was requested`,
    );
  }
}

function usageRecord(model: string, usage: ClaudeUsage | null | undefined): Partial<GenerationRecord> {
  return {
    inputTokens: usage?.input_tokens ?? undefined,
    outputTokens: usage?.output_tokens ?? undefined,
    cacheReadTokens: usage?.cache_read_input_tokens ?? undefined,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? undefined,
    inferenceGeo: usage?.inference_geo ?? undefined,
    webSearchRequests: usage?.server_tool_use?.web_search_requests ?? undefined,
    costUsd: claudeCostUsd(model, usage),
  };
}

function httpStatusOf(error: unknown): number | undefined {
  return error instanceof Anthropic.APIError && typeof error.status === "number" ? error.status : undefined;
}

/**
 * One round of the answer loop on Claude. Returns the reply in the transcript's
 * shape with Claude's own blocks attached; throws on any failure, a refusal
 * included, so the caller can move the turn to the next model.
 *
 * `withTools: false` is the last round. The tools are still sent, with
 * `tool_choice: none`: the API then guarantees no call, as withholding them
 * does for OpenRouter, without changing the tool list (rule 2 above).
 */
export async function callClaude(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  withTools: boolean;
  effort: ClaudeEffort;
  maxTokens: number;
  trace?: AnswerTrace;
}): Promise<{ message: ChatMessage; lengthCapped: boolean }> {
  const { model, withTools, effort, maxTokens } = opts;
  const started = Date.now();
  const record = (g: Partial<GenerationRecord>) =>
    opts.trace?.generation({
      name: "answer",
      model,
      provider: "anthropic",
      input: forOpenRouter(opts.messages),
      latencyMs: Date.now() - started,
      tools: ANSWER_TOOLS,
      maxTokens,
      effort,
      ...g,
    });
  try {
    assertPriced(model);
  } catch (error) {
    record({ error: String(error) });
    throw error;
  }

  const { system, messages } = toClaudeRequest(opts.messages);
  let response: Anthropic.Message;
  try {
    response = await client(opts.apiKey, ANSWER_TIMEOUT_MS).messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      tools: claudeTools(),
      tool_choice: withTools ? { type: "auto" } : { type: "none" },
      thinking: { type: "adaptive" },
      output_config: { effort },
      inference_geo: INFERENCE_GEO,
      // Caches up to the last block, so the next round of this turn reads
      // everything this one sent. Tools and system prompt carry their own.
      cache_control: { type: "ephemeral" },
    });
  } catch (error) {
    record({ error: String(error), httpStatus: httpStatusOf(error) });
    throw error;
  }

  warnIfNotUs(model, response.usage?.inference_geo);
  const text = textOf(response.content);
  const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const usage = usageRecord(model, response.usage);

  // A decline arrives as a normal reply. Its content may be empty or cut off
  // mid-sentence, so none of it is used: the next model answers instead.
  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category ?? "unspecified";
    const message = `${model} declined the request (refusal, category ${category})`;
    record({ ...usage, model: response.model, error: message, stopReason: response.stop_reason, httpStatus: 200 });
    throw new ClaudeDeclined(message);
  }

  // Cut off at max_tokens. A tool call in a cut-off reply may be incomplete, so
  // only the text survives, and Claude's blocks are not kept: the transcript
  // must never carry a tool call that gets no result.
  const lengthCapped =
    response.stop_reason === "max_tokens" || response.stop_reason === "model_context_window_exceeded";
  const toolCalls = lengthCapped
    ? []
    : toolUses.map((b) => ({
        id: b.id,
        type: "function",
        function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      }));
  const message: ChatMessage = {
    role: "assistant",
    content: text,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    ...(lengthCapped ? {} : { claude: { model: response.model, content: response.content } }),
  };
  record({
    ...usage,
    model: response.model,
    output: [forOpenRouter([message])[0]],
    stopReason: response.stop_reason ?? undefined,
    httpStatus: 200,
  });
  return { message, lengthCapped };
}

// ---------------------------------------------------------------------------
// THE WEB LOOKUP.
// ---------------------------------------------------------------------------

export interface WebHit {
  url: string;
  title: string;
  excerpt: string;
}

/** Searches per lookup. One is the plan; a second only if the first finds nothing. */
export const WEB_MAX_USES = 2;
const WEB_MAX_TOKENS = 4096;
const EXCERPT_CHARS = 500;

function webInstructions(today: string): string {
  return (
    `You run web searches for a website about the United States Congress. The current date is ${today}. ` +
    `Search the web for the query you are given. Search once; search a second time only if the first ` +
    `search found nothing relevant. Then state, in a few short sentences, only what the search results ` +
    `say about the query, citing them. Do not answer from memory, and do not add anything the results ` +
    `do not say.`
  );
}

/**
 * The sources of one Claude web-search reply, in the order Claude cited them,
 * each with the text it quoted from that page. A page it found but never
 * quoted is left out. At most `max`.
 *
 * The reader-visible contract is unchanged from the Exa path: a URL, a title
 * and an excerpt per source. The excerpt is what the answer model reads, so it
 * is Claude's quotation from the page, never Claude's own summary.
 */
export function webHitsFrom(content: Anthropic.ContentBlock[], max: number): WebHit[] {
  const cited = new Map<string, { title: string; quotes: string[] }>();
  for (const block of content) {
    if (block.type !== "text") continue;
    for (const c of block.citations ?? []) {
      if (c.type !== "web_search_result_location" || !c.url) continue;
      const entry = cited.get(c.url) ?? { title: c.title ?? "", quotes: [] };
      const quote = c.cited_text.trim();
      if (quote && !entry.quotes.includes(quote)) entry.quotes.push(quote);
      if (!entry.title && c.title) entry.title = c.title;
      cited.set(c.url, entry);
    }
  }
  // Only quoted sources. A page Claude found but never quoted gave the answer
  // model nothing to stand on: its title as the "excerpt" let it cite a source
  // for a claim the source never showed it. No quotes is a failed lookup, and
  // the caller falls back to Exa, whose excerpts are page text.
  return [...cited]
    .filter(([, { quotes }]) => quotes.length > 0)
    .slice(0, max)
    .map(([url, { title, quotes }]) => ({ url, title, excerpt: quotes.join(" … ").slice(0, EXCERPT_CHARS) }));
}

/**
 * One web lookup on Claude with Anthropic's server-side web search tool.
 * Throws when it cannot stand behind a result — an API error, a refusal, a
 * search that errored, no search at all, or no source — so the caller can
 * fall back to the Exa path.
 */
export async function searchWebClaude(opts: {
  apiKey: string;
  model: string;
  query: string;
  maxResults: number;
  effort: ClaudeEffort;
  today?: string;
  trace?: AnswerTrace;
}): Promise<WebHit[]> {
  const { model, query } = opts;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const started = Date.now();
  const record = (g: Partial<GenerationRecord>) =>
    opts.trace?.generation({
      name: "web_search",
      model,
      provider: "anthropic",
      input: [{ role: "user", content: query }],
      latencyMs: Date.now() - started,
      maxTokens: WEB_MAX_TOKENS,
      effort: opts.effort,
      ...g,
    });
  try {
    assertPriced(model);
  } catch (error) {
    record({ error: String(error) });
    throw error;
  }

  let response: Anthropic.Message;
  try {
    response = await client(opts.apiKey, WEB_TIMEOUT_MS).messages.create({
      model,
      max_tokens: WEB_MAX_TOKENS,
      system: webInstructions(today),
      messages: [{ role: "user", content: query }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: WEB_MAX_USES,
          user_location: { type: "approximate", country: "US" },
        },
      ],
      tool_choice: { type: "auto" },
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort },
      inference_geo: INFERENCE_GEO,
    });
  } catch (error) {
    record({ error: String(error), httpStatus: httpStatusOf(error) });
    throw error;
  }

  warnIfNotUs(model, response.usage?.inference_geo);
  const usage = usageRecord(model, response.usage);
  const hits = webHitsFrom(response.content, opts.maxResults);
  const searchErrors = response.content
    .filter((b): b is Anthropic.WebSearchToolResultBlock => b.type === "web_search_tool_result")
    .map((b) => b.content)
    .filter((c): c is Anthropic.WebSearchToolResultError => !Array.isArray(c) && c.type === "web_search_tool_result_error")
    .map((c) => c.error_code);
  const searched = response.content.some((b) => b.type === "server_tool_use" && b.name === "web_search");

  let failure: string | null = null;
  if (response.stop_reason === "refusal") {
    failure = `${model} declined the search (refusal, category ${response.stop_details?.category ?? "unspecified"})`;
  } else if (hits.length === 0) {
    failure = searchErrors.length > 0
      ? `web search failed: ${searchErrors.join(", ")}`
      : searched
        ? "web search returned no sources"
        : `${model} did not search`;
  }
  record({
    ...usage,
    model: response.model,
    output: [{ role: "assistant", content: textOf(response.content) }],
    stopReason: response.stop_reason ?? undefined,
    httpStatus: 200,
    ...(failure ? { error: failure } : {}),
  });
  if (failure) throw new ClaudeDeclined(failure);
  return hits;
}
