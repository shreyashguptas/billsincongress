/**
 * Records one answer as a PostHog AI Observability trace.
 *
 * Why: until this existed nothing recorded what the model was asked, what it
 * looked up or what it said — the only evidence of a wrong answer was a reader
 * noticing. A trace per question is what lets a wrong answer be found (by the
 * reader's "No", or by a grader configured in PostHog), saved to a dataset and
 * turned into a `scripts/truth/questions.ts` case.
 *
 * One question is one trace:
 *   $ai_generation — each model call: the messages sent, the reply, tokens, cost
 *   $ai_span       — each lookup the model made: its arguments and what came back
 *   $ai_trace      — the question and the final answer, once the turn is over
 *
 * Events are collected in memory and sent in ONE request by `flush()`, which
 * the caller awaits before its stream closes. An httpAction cannot run
 * "use node", so there is no SDK here — only `fetch` to PostHog's batch API.
 * Without `POSTHOG_KEY` in the Convex environment nothing is sent at all.
 *
 * Nothing here may break an answer: `flush()` never throws, and every recording
 * method is a plain push.
 *
 * Kept free of Convex function definitions so it can be unit-tested under `tsx`
 * (convex/aiTrace.test.ts).
 */

const DEFAULT_HOST = "https://us.i.posthog.com";
/** Longest single message content kept in `$ai_input`. Tool results can be large. */
export const MAX_MESSAGE_CHARS = 20_000;
/** Longest tool result kept on a span, and the longest answer kept on the trace. */
export const MAX_STATE_CHARS = 20_000;
/** The flush gives up after this long; a slow PostHog must not hold a stream open. */
const FLUSH_TIMEOUT_MS = 3_000;

/**
 * What the browser tells us about itself, forwarded by app/api/answer/route.ts.
 * All optional and all untrusted: `/answer/stream` is publicly addressable, so
 * each field is checked by `readTraceIdentity` before it is used.
 */
export interface TraceIdentity {
  /** PostHog's distinct id in the browser, so the trace joins the reader's person. */
  distinctId?: string;
  /** PostHog's session id in the browser, so the trace links to the session replay. */
  sessionId?: string;
  /** One id per conversation in the panel, so multi-turn threads group together. */
  conversationId?: string;
}

/** Ids from the browser: short, and no characters a PostHog id never contains. */
const ID_PATTERN = /^[A-Za-z0-9_.:@$-]{1,200}$/;

function readId(value: unknown): string | undefined {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : undefined;
}

export function readTraceIdentity(raw: unknown): TraceIdentity {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const identity: TraceIdentity = {};
  const distinctId = readId(r.distinctId);
  const sessionId = readId(r.sessionId);
  const conversationId = readId(r.conversationId);
  if (distinctId) identity.distinctId = distinctId;
  if (sessionId) identity.sessionId = sessionId;
  if (conversationId) identity.conversationId = conversationId;
  return identity;
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}… [clipped ${text.length - max} characters]` : text;
}

/**
 * Messages as sent to the model, with each content clipped. The system prompt
 * and the tool results are kept: a grader asking "is this answer grounded in
 * what the model was given?" needs exactly those.
 */
export function clipMessages<T extends { content: string | null }>(messages: T[]): T[] {
  return messages.map((m) =>
    typeof m.content === "string" && m.content.length > MAX_MESSAGE_CHARS
      ? { ...m, content: clip(m.content, MAX_MESSAGE_CHARS) }
      : m,
  );
}

export interface GenerationRecord {
  /** "answer" for the loop's own calls, "web_search" for the search call. */
  name: string;
  model: string;
  /**
   * The host OpenRouter routed to ("Cerebras", "Groq", "Amazon Bedrock"). Since
   * 2026-10-05 the failover is the same model on another host, so $ai_model no
   * longer shows a failover and this does. The hosts differ in speed by a factor
   * of two or more.
   */
  host?: string;
  input: Array<{ role: string; content: string | null }>;
  output?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs: number;
  httpStatus?: number;
  error?: string;
  tools?: unknown;
  temperature?: number;
  maxTokens?: number;
}

export interface SpanRecord {
  name: string;
  input: unknown;
  output: string;
  latencyMs: number;
  error?: string;
}

interface CapturedEvent {
  event: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

type Fetch = typeof fetch;

export class AnswerTrace {
  readonly traceId: string;
  private readonly identity: TraceIdentity;
  private readonly started: number;
  private readonly events: CapturedEvent[] = [];
  private readonly clock: () => number;
  private finished = false;

  constructor(opts: {
    traceId?: string;
    identity?: TraceIdentity;
    now?: () => number;
  } = {}) {
    this.clock = opts.now ?? Date.now;
    this.traceId = opts.traceId ?? crypto.randomUUID();
    this.identity = opts.identity ?? {};
    this.started = this.clock();
  }

  /**
   * Properties every event in this trace shares. With no distinct id from the
   * browser the trace is recorded under its own id without creating a person,
   * which is PostHog's documented way to capture anonymous server events.
   */
  private base(): Record<string, unknown> {
    return {
      distinct_id: this.identity.distinctId ?? this.traceId,
      ...(this.identity.distinctId ? {} : { $process_person_profile: false }),
      ...(this.identity.sessionId ? { $session_id: this.identity.sessionId } : {}),
      $ai_trace_id: this.traceId,
      $ai_session_id: this.identity.conversationId ?? null,
    };
  }

  private push(event: string, properties: Record<string, unknown>) {
    this.events.push({
      event,
      timestamp: new Date(this.clock()).toISOString(),
      properties: { ...this.base(), ...properties },
    });
  }

  generation(g: GenerationRecord) {
    this.push("$ai_generation", {
      $ai_span_id: crypto.randomUUID(),
      $ai_parent_id: this.traceId,
      $ai_span_name: g.name,
      $ai_model: g.model,
      $ai_provider: "openrouter",
      $ai_base_url: "https://openrouter.ai/api/v1",
      ...(g.host !== undefined ? { openrouter_host: g.host } : {}),
      $ai_input: clipMessages(g.input),
      ...(g.output !== undefined ? { $ai_output_choices: g.output } : {}),
      ...(g.inputTokens !== undefined ? { $ai_input_tokens: g.inputTokens } : {}),
      ...(g.outputTokens !== undefined ? { $ai_output_tokens: g.outputTokens } : {}),
      ...(g.costUsd !== undefined ? { $ai_total_cost_usd: g.costUsd } : {}),
      ...(g.httpStatus !== undefined ? { $ai_http_status: g.httpStatus } : {}),
      ...(g.tools !== undefined ? { $ai_tools: g.tools } : {}),
      ...(g.temperature !== undefined ? { $ai_temperature: g.temperature } : {}),
      ...(g.maxTokens !== undefined ? { $ai_max_tokens: g.maxTokens } : {}),
      $ai_latency: g.latencyMs / 1000,
      $ai_is_error: Boolean(g.error),
      ...(g.error ? { $ai_error: clip(g.error, 1000) } : {}),
    });
  }

  span(s: SpanRecord) {
    this.push("$ai_span", {
      $ai_span_id: crypto.randomUUID(),
      $ai_parent_id: this.traceId,
      $ai_span_name: s.name,
      $ai_input_state: s.input,
      $ai_output_state: clip(s.output, MAX_STATE_CHARS),
      $ai_latency: s.latencyMs / 1000,
      $ai_is_error: Boolean(s.error),
      ...(s.error ? { $ai_error: clip(s.error, 1000) } : {}),
    });
  }

  /**
   * The trace itself: the reader's question in, the answer out. `outcome` is
   * one of our own words for how the turn ended, for graders to filter on.
   *
   * Both states are sent as chat messages, not bare strings: PostHog's trace
   * view renders a message list as the conversation at the top of the trace,
   * and showed nothing there for a plain string (checked against a real trace,
   * 30 Sep 2026).
   */
  finish(t: {
    question: string;
    answer?: string;
    error?: string;
    outcome: "answered" | "asked_reader" | "failed";
    extra?: Record<string, unknown>;
  }) {
    // Once per trace. A later failure (the stream to the reader breaking after
    // the answer was recorded) must not add a second, contradicting outcome.
    if (this.finished) return;
    this.finished = true;
    this.push("$ai_trace", {
      $ai_span_name: "answer",
      $ai_input_state: [{ role: "user", content: t.question }],
      ...(t.answer !== undefined
        ? { $ai_output_state: [{ role: "assistant", content: clip(t.answer, MAX_STATE_CHARS) }] }
        : {}),
      $ai_latency: (this.clock() - this.started) / 1000,
      $ai_is_error: t.outcome === "failed",
      ...(t.error ? { $ai_error: clip(t.error, 1000) } : {}),
      outcome: t.outcome,
      ...t.extra,
    });
  }

  /** The events recorded so far. For tests. */
  recorded(): readonly CapturedEvent[] {
    return this.events;
  }

  /**
   * Send everything in one request. Never throws. Returns whether anything was
   * sent, so a caller can log a failure without having to catch one.
   */
  async flush(
    env: { key?: string; host?: string } = {
      key: process.env.POSTHOG_KEY,
      host: process.env.POSTHOG_HOST,
    },
    fetchImpl: Fetch = fetch,
  ): Promise<boolean> {
    if (!env.key || this.events.length === 0) return false;
    const host = env.host && env.host.startsWith("https://") ? env.host : DEFAULT_HOST;
    const batch = this.events.splice(0);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FLUSH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${host.replace(/\/$/, "")}/batch/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: env.key, batch }),
        signal: controller.signal,
      });
      if (!response.ok) {
        console.error(`PostHog trace flush failed: ${response.status} ${response.statusText}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error("PostHog trace flush failed:", error);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
