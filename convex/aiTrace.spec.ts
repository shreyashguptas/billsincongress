/// <reference types="vite/client" />
/**
 * The answer stream, recorded as a PostHog AI trace — run through the real
 * `/answer/stream` httpAction against an in-memory database (convex-test).
 *
 * Nothing leaves the process: `fetch` is stubbed, standing in for OpenRouter
 * (a scripted model that makes one lookup, then answers) and for PostHog's
 * batch endpoint (which records what it was sent). What is asserted is the
 * request PostHog WOULD have received.
 *
 * The cases are the ways the recording could quietly be useless: events that
 * do not share the id the reader's "No" carries, a trace that never names the
 * person or replay, a failed answer that leaves no trace, a bad id from the
 * browser trusted as-is, or a missing PostHog key breaking the answer itself.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const BATCH = "https://us.i.posthog.com/batch/";
const ANSWER = "No bill in our records matches that. [[cite:none]]";

type Sent = { url: string; body: Record<string, unknown> };
type BatchEvent = { event: string; properties: Record<string, unknown>; timestamp: string };

let sent: Sent[] = [];
let modelCalls = 0;
let modelFails = false;
let modelEmpty = false;

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

/** Round 1: the model asks to describe the bills dataset. Round 2: it answers. */
function modelReply() {
  modelCalls += 1;
  if (modelEmpty) {
    return {
      model: "deepseek/deepseek-v4-flash-0731",
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: "" } }],
      usage: { prompt_tokens: 900, completion_tokens: 0 },
    };
  }
  if (modelCalls === 1) {
    return {
      model: "deepseek/deepseek-v4-flash-0731",
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "describe_dataset", arguments: '{"name":"bills"}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 1200, completion_tokens: 20, cost: 0.0003 },
    };
  }
  return {
    model: "deepseek/deepseek-v4-flash-0731",
    choices: [{ finish_reason: "stop", message: { role: "assistant", content: ANSWER } }],
    usage: { prompt_tokens: 1500, completion_tokens: 30, cost: 0.0004 },
  };
}

beforeEach(() => {
  sent = [];
  modelCalls = 0;
  modelFails = false;
  modelEmpty = false;
  process.env.OPENROUTER_API_KEY = "sk-or-test-not-a-real-key";
  process.env.POSTHOG_KEY = "phc_test_not_a_real_key";
  delete process.env.POSTHOG_HOST;
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sent.push({ url, body });
    if (url === OPENROUTER) {
      if (modelFails) return new Response("upstream down", { status: 502, statusText: "Bad Gateway" });
      return Response.json(modelReply());
    }
    if (url === BATCH) return Response.json({ status: 1 });
    throw new Error(`unexpected fetch in test: ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.POSTHOG_KEY;
});

async function ask(
  t: ReturnType<typeof setup>,
  posthog: Record<string, unknown> | undefined = {
    distinctId: "019a-reader-distinct-id",
    sessionId: "019a-session-id",
    conversationId: "conv-1234",
  },
) {
  const res = await t.fetch("/answer/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: "Which bills about llamas became law?",
      anonymousSessionId: "anon-test-session",
      history: [],
      ...(posthog ? { posthog } : {}),
    }),
  });
  const text = await res.text();
  const frames = [...text.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map((m) => ({
    event: m[1],
    data: JSON.parse(m[2]),
  }));
  return frames;
}

function batches(): BatchEvent[][] {
  return sent
    .filter((s) => s.url === BATCH)
    .map((s) => s.body.batch as BatchEvent[]);
}

describe("recording an answer as a PostHog trace", () => {
  test("one request to PostHog, with every model call, lookup and the trace itself", async () => {
    const t = setup();
    const frames = await ask(t);
    const done = frames.find((f) => f.event === "done");
    expect(done, "the answer finished").toBeTruthy();

    expect(batches()).toHaveLength(1);
    const [events] = batches();
    expect(events.map((e) => e.event)).toEqual([
      "$ai_generation",
      "$ai_span",
      "$ai_generation",
      "$ai_trace",
    ]);
    const body = sent.find((s) => s.url === BATCH)!.body;
    expect(body.api_key).toBe("phc_test_not_a_real_key");
  });

  test("every event carries the trace id the browser gets on `done`", async () => {
    const t = setup();
    const frames = await ask(t);
    const traceId = frames.find((f) => f.event === "done")!.data.traceId;
    expect(typeof traceId).toBe("string");
    for (const e of batches()[0]) expect(e.properties.$ai_trace_id).toBe(traceId);
  });

  test("names the reader's person, session replay and conversation", async () => {
    const t = setup();
    await ask(t);
    for (const e of batches()[0]) {
      expect(e.properties.distinct_id).toBe("019a-reader-distinct-id");
      expect(e.properties.$session_id).toBe("019a-session-id");
      expect(e.properties.$ai_session_id).toBe("conv-1234");
      expect(e.properties.$process_person_profile).toBeUndefined();
    }
  });

  test("a generation holds what the model was sent, what it said, and what it cost", async () => {
    const t = setup();
    await ask(t);
    const [first, , second] = batches()[0];
    const input = first.properties.$ai_input as Array<{ role: string; content: string | null }>;
    expect(input[0].role).toBe("system");
    expect(input.at(-1)).toEqual({ role: "user", content: "Which bills about llamas became law?" });
    expect(first.properties.$ai_model).toBe("deepseek/deepseek-v4-flash-0731");
    expect(first.properties.$ai_input_tokens).toBe(1200);
    expect(first.properties.$ai_output_tokens).toBe(20);
    expect(first.properties.$ai_total_cost_usd).toBe(0.0003);
    expect(first.properties.$ai_is_error).toBe(false);
    expect(first.properties.$ai_tools).toBeTruthy();
    expect(second.properties.$ai_output_choices).toEqual([
      { role: "assistant", content: ANSWER },
    ]);
  });

  test("a lookup is a span with its arguments and its result", async () => {
    const t = setup();
    await ask(t);
    const span = batches()[0][1];
    expect(span.properties.$ai_span_name).toBe("describe_dataset");
    expect(span.properties.$ai_input_state).toEqual({ name: "bills" });
    expect(String(span.properties.$ai_output_state).length).toBeGreaterThan(0);
  });

  test("the trace holds the reader's question and the answer they were shown", async () => {
    const t = setup();
    await ask(t);
    const trace = batches()[0].at(-1)!;
    expect(trace.properties.$ai_input_state).toBe("Which bills about llamas became law?");
    expect(String(trace.properties.$ai_output_state)).toContain("No bill in our records");
    expect(trace.properties.outcome).toBe("answered");
    expect(trace.properties.$ai_is_error).toBe(false);
    expect(trace.properties.signed_in).toBe(false);
  });

  test("a failed answer still leaves a trace, and the error frame names it", async () => {
    modelFails = true;
    const t = setup();
    const frames = await ask(t);
    const error = frames.find((f) => f.event === "error");
    expect(error?.data.traceId).toBeTruthy();
    const events = batches()[0];
    const generation = events.find((e) => e.event === "$ai_generation")!;
    expect(generation.properties.$ai_is_error).toBe(true);
    expect(generation.properties.$ai_http_status).toBe(502);
    const trace = events.find((e) => e.event === "$ai_trace")!;
    expect(trace.properties.outcome).toBe("failed");
    expect(trace.properties.$ai_trace_id).toBe(error!.data.traceId);
  });

  test("a model that never answers is recorded as a failure, and still sent", async () => {
    modelEmpty = true;
    const t = setup();
    const frames = await ask(t);
    const error = frames.find((f) => f.event === "error");
    expect(error?.data.reason).toBe("empty_model_output");
    expect(error?.data.traceId).toBeTruthy();
    expect(batches()).toHaveLength(1);
    const trace = batches()[0].find((e) => e.event === "$ai_trace")!;
    expect(trace.properties.outcome).toBe("failed");
    expect(trace.properties.$ai_error).toBe("empty_model_output");
    expect(trace.properties.$ai_trace_id).toBe(error!.data.traceId);
    // Every empty reply the loop retried is there to see.
    const generations = batches()[0].filter((e) => e.event === "$ai_generation");
    expect(generations.length).toBe(modelCalls);
    expect(generations.length).toBeGreaterThan(1);
  });

  test("an id from the browser that is not a PostHog id is not trusted", async () => {
    const t = setup();
    await ask(t, { distinctId: "not an id <script>", sessionId: 42 });
    for (const e of batches()[0]) {
      expect(e.properties.distinct_id).toBe(e.properties.$ai_trace_id);
      expect(e.properties.$process_person_profile).toBe(false);
      expect(e.properties.$session_id).toBeUndefined();
      expect(e.properties.$ai_session_id).toBeNull();
    }
  });

  test("without a PostHog key nothing is sent, and the answer is unaffected", async () => {
    delete process.env.POSTHOG_KEY;
    const t = setup();
    const frames = await ask(t);
    expect(frames.find((f) => f.event === "done")).toBeTruthy();
    expect(sent.filter((s) => s.url === BATCH)).toHaveLength(0);
  });

  test("a PostHog outage does not cost the reader their answer", async () => {
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === OPENROUTER) return Response.json(modelReply());
      return new Response("down", { status: 503 });
    });
    const t = setup();
    const frames = await ask(t);
    expect(frames.find((f) => f.event === "done")).toBeTruthy();
  });
});
