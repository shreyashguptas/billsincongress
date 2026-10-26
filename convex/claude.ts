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
 * 3. A price table is the runaway-cost guard. A model with no price is refused
 *    before any request, so a careless ANTHROPIC_*_MODEL change to a pricier
 *    model fails loudly (and the turn moves on down the chain) instead of
 *    multiplying the bill. The same table prices every call for the trace.
 *    CLAUDE_PRICES_JSON adds or overrides prices from the Convex environment,
 *    so a new model needs two env changes, not a deploy (see claudePrices).
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
 * Claude Sonnet 5.5 since 2026-10-23, at medium effort (convex/reasoning.ts),
 * the owner's call: the most accurate answer the price allows. It costs about twenty times Haiku per
 * token; measured live on 2026-10-23 a four-round answer cost about 12 cents
 * and took about 13 s. (Before that, Claude Haiku 5.5, chosen on 2026-10-13 on
 * the truth questions: 38 of 40 right against gpt-oss's 37.)
 */
export const DEFAULT_ANSWER_MODEL = "claude-sonnet-5-5";
/**
 * Tried when the answer model fails (an error, a refusal, a timeout); override
 * with ANTHROPIC_BACKUP_MODEL, and set it blank to skip it. Claude Haiku 5.5
 * cannot read Sonnet 5.5's thinking blocks; they are still sent back unchanged,
 * and the API drops the ones it cannot read (unbilled), so the transcript stays
 * append-only and the turn carries on from the visible tool calls and results.
 * Skipped when the Claude API itself is unreachable (claudeServiceDown).
 */
export const DEFAULT_BACKUP_MODEL = "claude-haiku-5-5";
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
/**
 * Tried for the web lookup when the web model fails; override with
 * ANTHROPIC_WEB_BACKUP_MODEL, and set it blank to go straight to Exa. Skipped,
 * like the answer backup, when the Claude API itself is unreachable.
 */
export const DEFAULT_WEB_BACKUP_MODEL = "claude-haiku-5-5";

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

/** The Claude models for one web lookup, in order. Blank values drop a link. */
export function claudeWebModels(env: Record<string, string | undefined> = process.env): string[] {
  const backup = (env.ANTHROPIC_WEB_BACKUP_MODEL ?? DEFAULT_WEB_BACKUP_MODEL).trim();
  return [claudeWebModel(env), backup].filter((m, i, all) => m !== "" && all.indexOf(m) === i);
}

/**
 * True when the Claude API as a whole looks down, not one model: the request
 * never got an answer (a refused connection, a DNS or TLS failure) or Anthropic
 * answered with a gateway error (502, 503, 504). Then the other Claude model
 * would fail the same way, so the chain goes straight to the non-Claude
 * fallback instead of spending another try on it. Not a 500: with no SDK
 * retries, a one-off failed request would otherwise send the rest of the turn
 * to the least accurate model. Not a timeout (one slow model), not 529 (one
 * model overloaded), not 429 (our rate), not a refusal.
 */
export function claudeServiceDown(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return false;
  if (error instanceof Anthropic.APIConnectionError) return true;
  return error instanceof Anthropic.APIError && [502, 503, 504].includes(error.status ?? 0);
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
  server_tool_use?: { web_search_requests?: number | null; web_fetch_requests?: number | null } | null;
}

/**
 * Above this, a price in CLAUDE_PRICES_JSON is taken for a typo ($2 written as
 * 2000) and the entry is ignored. The dearest model on 2026-10-22 was $50 per
 * million output tokens (Claude Fable 5.1).
 */
export const MAX_PRICE_PER_MTOK = 100;
const MODEL_ID = /^claude-[a-z0-9.-]+$/;

/**
 * The price table: CLAUDE_PRICES, plus or overridden by the CLAUDE_PRICES_JSON
 * environment variable, so switching to a newly released model needs two
 * Convex env changes and no deploy:
 *
 *   CLAUDE_PRICES_JSON={"claude-haiku-6":{"input":0.1,"output":0.5}}
 *   ANTHROPIC_ANSWER_MODEL=claude-haiku-6
 *
 * USD per million tokens, before the US 1.1x. `cacheWrite` defaults to 1.25x
 * input and `cacheRead` to 0.1x input (the usual rates; give them when a model
 * differs, as Sonnet 5.5's 0.05x read does). `long` is optional, as in
 * ClaudePrice. Read strictly: bad JSON drops the whole setting, a bad entry
 * drops that entry, and either is logged; neither ever fails an answer. A model
 * priced nowhere is still refused.
 */
export function claudePrices(env: Record<string, string | undefined> = process.env): Record<string, ClaudePrice> {
  const raw = (env.CLAUDE_PRICES_JSON ?? "").trim();
  if (raw === "") return { ...CLAUDE_PRICES };
  if (raw === parsedPrices?.raw) return parsedPrices.prices;
  const prices: Record<string, ClaudePrice> = { ...CLAUDE_PRICES };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(`CLAUDE_PRICES_JSON is not valid JSON and is ignored: ${String(error)}`);
  }
  if (parsed !== undefined && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) {
    console.error("CLAUDE_PRICES_JSON must be an object of model id to prices; it is ignored");
  } else if (parsed !== undefined) {
    for (const [model, value] of Object.entries(parsed as Record<string, unknown>)) {
      const price = readPrice(value);
      if (!MODEL_ID.test(model) || typeof price === "string") {
        console.error(
          `CLAUDE_PRICES_JSON entry for ${JSON.stringify(model)} is ignored: ` +
            (MODEL_ID.test(model) ? price : "not a Claude model id"),
        );
        continue;
      }
      prices[model] = price;
    }
  }
  parsedPrices = { raw, prices };
  return prices;
}
/** One parse per value, not per call: the log lines above would repeat every round. */
let parsedPrices: { raw: string; prices: Record<string, ClaudePrice> } | undefined;

/** A ClaudePrice from one CLAUDE_PRICES_JSON entry, or why it is not one. */
function readPrice(value: unknown): ClaudePrice | string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "not an object";
  const v = value as Record<string, unknown>;
  const rates = (r: Record<string, unknown>): Rates | string => {
    for (const key of ["input", "output"]) {
      if (r[key] == null) return `missing "${key}"`;
    }
    const out: Record<string, number> = {};
    for (const key of ["input", "output", "cacheWrite", "cacheRead"]) {
      // Only the cache rates have defaults, and only when left out: a given
      // null or string is a bad entry, never a made-up price.
      const given = r[key];
      const n =
        given === undefined && key === "cacheWrite" ? Number(r.input) * 1.25
        : given === undefined && key === "cacheRead" ? Number(r.input) / 10
        : given;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return `"${key}" is not a price`;
      if (n > MAX_PRICE_PER_MTOK) return `"${key}" is over $${MAX_PRICE_PER_MTOK} per million tokens`;
      out[key] = n;
    }
    return out as unknown as Rates;
  };
  const base = rates(v);
  if (typeof base === "string") return base;
  if (v.long === undefined) return base;
  if (typeof v.long !== "object" || v.long === null) return `"long" is not an object`;
  const longRaw = v.long as Record<string, unknown>;
  const over = longRaw.overPromptTokens;
  if (typeof over !== "number" || !Number.isInteger(over) || over <= 0) return `"long.overPromptTokens" is not a token count`;
  const long = rates(longRaw);
  if (typeof long === "string") return `long: ${long}`;
  return { ...base, long: { ...long, overPromptTokens: over } };
}

/** What one call cost us, or undefined for a model with no price on file. */
export function claudeCostUsd(model: string, usage: ClaudeUsage | null | undefined): number | undefined {
  const price = claudePrices()[model];
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
  if (!claudePrices()[model]) {
    throw new Error(
      `No price on file for ${model}: add it to the CLAUDE_PRICES_JSON Convex env var ` +
        `(or to CLAUDE_PRICES in convex/claude.ts) before using it`,
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
    webFetchRequests: usage?.server_tool_use?.web_fetch_requests ?? undefined,
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
/**
 * Pages read in full per lookup: the one result that best answers the query.
 * Two, at 6,000 tokens each, measured on 2026-10-26 at 7.4 to 25.7 s and 9 to
 * 13 cents a lookup, against 5.6 s and 4.7 cents before pages were read.
 */
export const WEB_FETCH_MAX_USES = 1;
/**
 * The most of the page Claude reads, in tokens. A bill page or a press release
 * fits; a full bill text is cut here, which still leaves far more than a quote.
 */
const WEB_FETCH_MAX_CONTENT_TOKENS = 3000;
const WEB_MAX_TOKENS = 4096;
/** One source's excerpt for the answer model: a few whole sentences. */
const EXCERPT_CHARS = 1200;
/** How far a quote is widened, each way, to reach the edge of its sentence. */
const SENTENCE_REACH_CHARS = 300;
/** Where a quote stops short of its sentence, so the answer model cannot finish it. */
export const CUT_OFF = "[cut off]";
/** Sent with web results whenever an excerpt carries CUT_OFF. */
export const CUT_OFF_NOTE =
  `${CUT_OFF} marks where an excerpt stops before the page does. Say nothing about what follows it, ` +
  `and do not complete the sentence it cuts.`;

/** An excerpt cut at `max` characters on a word boundary, the cut marked. */
export function clipExcerpt(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const space = head.lastIndexOf(" ");
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()} ${CUT_OFF}`;
}

function webInstructions(today: string): string {
  return (
    `You run web searches for a website about the United States Congress. The current date is ${today}. ` +
    `Search the web for the query you are given. Search once; search a second time only if the first ` +
    `search found nothing relevant. Then fetch the one result that best answers the query, to read ` +
    `it in full: for a bill's text prefer govinfo.gov, and never fetch congress.gov, which refuses it. Then state, in a few short ` +
    `sentences, only what the pages say about the query, citing them. Do not answer from memory, and ` +
    `do not add anything the pages do not say.`
  );
}

/**
 * Page text as prose. Fetched pages arrive as Markdown, or as raw XML for a
 * bill's govinfo file; measured on 2026-10-26, widening a quote on that text
 * handed the answer model navigation menus, link targets and tags. Links keep
 * their words, images, tags and entity escapes go, and each line break stays a
 * line break: a heading, a list item or an XML element is an edge a sentence
 * does not cross.
 */
export function readable(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // The tail of a link whose start was cut off: a citation can begin inside one.
    .replace(/\]\([^)\s]*\)/g, " ")
    // Divider lines: "* * *", "---".
    .replace(/^[ \t]*(?:[*_-][ \t]*){2,}$/gm, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/^[ \t]*(?:#{1,6}|[*+-])(?:[ \t]+|$)/gm, "")
    .replace(/\\([\\[\]|*_#()])/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n[\s]*/g, "\n")
    .trim();
}

/** Whitespace collapsed, so a quote matches the page however either was wrapped. */
function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A URL as a key: no fragment, no trailing slash. */
function urlKey(url: string): string {
  return url.replace(/#.*$/, "").replace(/\/+$/, "");
}

/**
 * A search quote as the answer model may read it. Anthropic gives a search
 * result's cited text as at most about 150 characters and ends a longer one
 * with "...", often mid-word: "a report to Con...". Measured on 2026-10-23 to
 * 26, the answer model finished those sentences itself ("contr..." became
 * "controlled by such an entity") in 5 of the 7 answers the fact-check judge
 * failed. So the half word goes, and the cut is said out loud.
 */
export function markCutOff(quote: string): string {
  const q = quote.trim();
  const m = /^([\s\S]*?)\s*(?:\.\.\.|…)$/.exec(q);
  if (!m) return q;
  // A cut just after a heading or list mark ("Video\n##...") leaves the mark
  // alone, and the word before it whole.
  const kept = m[1].replace(/[\s#*|>-]+$/, "");
  const midWord = kept === m[1] && /[A-Za-z0-9]$/.test(kept);
  // A cut inside a word: drop back to the last whole word.
  const whole = midWord && kept.includes(" ") ? kept.slice(0, kept.lastIndexOf(" ")) : kept;
  return `${whole.trimEnd()} ${CUT_OFF}`;
}

/**
 * A full stop that ends an abbreviation, not a sentence: "H.R. 2481", "U.S.
 * Code", "Mr. Wicker", "Sec. 2". Splitting there started an excerpt at
 * "2481, the Romance Scam Prevention Act" (live check, 2026-10-26).
 */
const ABBREVIATION =
  /(?:\b[A-Z](?:\.[A-Z])*|\b(?:Mr|Mrs|Ms|Dr|Sec|Secs|No|Nos|Rep|Reps|Sen|Sens|Jr|Sr|Inc|Co|St|Cong|sess|Stat|Res|Con|Rept|Doc|ed|vol|pp|etc|vs|e\.g|i\.e))$/;

/** Where each sentence in `text` ends: the index just past its [.!?]. */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  for (const m of text.matchAll(/[.!?](?=\s|$)/g)) {
    const i = m.index ?? 0;
    if (m[0] === "." && ABBREVIATION.test(text.slice(Math.max(0, i - 12), i))) continue;
    ends.push(i + 1);
  }
  return ends;
}

/**
 * The page's own text around a quote, widened to whole sentences, or null
 * when the quote is not on the page. Every character returned is the page's,
 * which is what lets the answer model read a sentence the search engine only
 * quoted the start of. A sentence that runs past the reach is still marked as
 * cut off.
 */
export function sentencesAround(page: string, quote: string): string | null {
  const text = readable(page);
  // The same text on one line, for matching: one character for one, so an
  // index into it is an index into `text`, whose line breaks are edges.
  const oneLine = text.replace(/\n/g, " ");
  const q = flat(readable(quote)).replace(/^(?:\.\.\.|…)\s*/, "").replace(/\s*(?:\.\.\.|…)$/, "");
  if (q.length < 20) return null;
  let at = oneLine.indexOf(q);
  let length = q.length;
  if (at < 0) {
    // A cut quote may end mid-word; its first 60 characters still locate it.
    const head = q.slice(0, 60);
    at = oneLine.indexOf(head);
    length = head.length;
  }
  if (at < 0) return null;
  if (length < q.length) {
    // Only the head matched (the page's markup differs from the quote's
    // somewhere inside it). Its last whole words, found after the head, still
    // close the span, so a long quote is not shrunk to its first line.
    const lastSpace = q.lastIndexOf(" ");
    const tail = q.slice(Math.max(0, lastSpace - 50), lastSpace).trim();
    const tailAt = tail.length >= 20 ? oneLine.indexOf(tail, at + length) : -1;
    if (tailAt >= 0 && tailAt - at < q.length * 2) length = tailAt + tail.length - at;
  }

  // Back to the start of the sentence or the line, or of the page; failing all
  // within reach, the quote's own start (a missing opening is not one to finish).
  const from = Math.max(0, at - SENTENCE_REACH_CHARS);
  const before = text.slice(from, at);
  const sentenceStart = sentenceEnds(before).filter((i) => i < before.length).pop() ?? -1;
  const lineStart = before.lastIndexOf("\n") + 1;
  const start =
    sentenceStart >= 0 && sentenceStart + 1 >= lineStart ? from + sentenceStart + 1
    : lineStart > 0 ? from + lineStart
    : from === 0 ? 0
    : at;

  // On to the end of the sentence or the line, whichever comes first.
  const after = text.slice(at + length, at + length + SENTENCE_REACH_CHARS);
  const nextSentence = (sentenceEnds(after)[0] ?? 0) - 1;
  const nextLine = after.indexOf("\n");
  let end: number;
  let cut = false;
  if (nextLine >= 0 && (nextSentence < 0 || nextLine <= nextSentence)) {
    end = at + length + nextLine;
  } else if (nextSentence >= 0) {
    end = at + length + nextSentence + 1;
  } else if (at + length + after.length >= text.length) {
    end = text.length;
  } else {
    const lastSpace = after.lastIndexOf(" ");
    end = at + length + (lastSpace > 0 ? lastSpace : after.length);
    cut = true;
  }
  const excerpt = flat(text.slice(start, end));
  return cut ? `${excerpt} ${CUT_OFF}` : excerpt;
}

/** The pages Claude fetched in this reply, with their text where it has one. */
function fetchedPages(content: Anthropic.ContentBlock[]): Array<{ url: string; title: string; text: string | null }> {
  const pages: Array<{ url: string; title: string; text: string | null }> = [];
  for (const block of content) {
    if (block.type !== "web_fetch_tool_result" || block.content.type !== "web_fetch_result") continue;
    const doc = block.content.content;
    pages.push({
      url: block.content.url,
      title: doc.title ?? "",
      // A PDF arrives as base64: no text of ours to widen a quote with.
      text: doc.source.type === "text" ? doc.source.data : null,
    });
  }
  return pages;
}

/**
 * The sources of one Claude web-search reply, in the order Claude cited them,
 * each with what the page says. A page it found but never quoted is left out.
 * At most `max`.
 *
 * The reader-visible contract is unchanged from the Exa path: a URL, a title
 * and an excerpt per source. The excerpt is what the answer model reads, so it
 * is always the page's own words, never Claude's summary of them: whole
 * sentences from the page text where Claude fetched it (a fetched page's
 * citations point into that text exactly), and otherwise the search engine's
 * short quote with any cut marked.
 */
export function webHitsFrom(content: Anthropic.ContentBlock[], max: number): WebHit[] {
  const pages = fetchedPages(content);
  const pageText = new Map(pages.filter((p) => p.text !== null).map((p) => [urlKey(p.url), p.text as string]));
  const cited = new Map<string, { title: string; quotes: string[] }>();
  const add = (url: string, title: string, quote: string) => {
    const entry = cited.get(url) ?? { title, quotes: [] };
    if (quote && !entry.quotes.includes(quote)) entry.quotes.push(quote);
    if (!entry.title && title) entry.title = title;
    cited.set(url, entry);
  };

  for (const block of content) {
    if (block.type !== "text") continue;
    for (const c of block.citations ?? []) {
      if (c.type === "web_search_result_location" && c.url) {
        add(c.url, c.title ?? "", c.cited_text.trim());
      } else if (c.type === "char_location" || c.type === "page_location") {
        // A fetched page. The citation names it only by position, so it is
        // matched by its text: the page whose text holds the cited words.
        const quote = c.cited_text.trim();
        const page =
          pages.find((p) => p.text !== null && c.type === "char_location" &&
            p.text.slice(c.start_char_index, c.end_char_index) === c.cited_text) ??
          pages.find((p) => p.text !== null && flat(p.text).includes(flat(quote))) ??
          pages.find((p) => p.text === null && p.title !== "" && p.title === c.document_title);
        if (page) add(page.url, page.title, quote);
      }
    }
  }

  // Only quoted sources. A page Claude found but never quoted gave the answer
  // model nothing to stand on: its title as the "excerpt" let it cite a source
  // for a claim the source never showed it. No quotes is a failed lookup, and
  // the caller falls back to Exa, whose excerpts are page text.
  return [...cited]
    .filter(([, { quotes }]) => quotes.length > 0)
    .slice(0, max)
    .map(([url, { title, quotes }]) => {
      const text = pageText.get(urlKey(url));
      const parts: string[] = [];
      for (const quote of quotes) {
        const part = (text !== undefined && sentencesAround(text, quote)) || markCutOff(flat(readable(quote)));
        // Two quotes from one sentence widen to the same words.
        if (parts.some((p) => p.includes(part.replace(` ${CUT_OFF}`, "")))) continue;
        if (parts.length > 0 && [...parts, part].join(" … ").length > EXCERPT_CHARS) break;
        parts.push(part);
      }
      return { url, title, excerpt: clipExcerpt(parts.join(" … "), EXCERPT_CHARS) };
    });
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
        {
          type: "web_fetch_20250910",
          name: "web_fetch",
          max_uses: WEB_FETCH_MAX_USES,
          max_content_tokens: WEB_FETCH_MAX_CONTENT_TOKENS,
          // Citations into the fetched text, so each quote can be found on the page.
          citations: { enabled: true },
          // congress.gov refuses Anthropic's fetcher (url_not_allowed, measured on
          // 2026-10-26), and a refused fetch spent the lookup's one page.
          // govinfo.gov serves the same bill texts and lets it read them.
          blocked_domains: ["congress.gov"],
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
