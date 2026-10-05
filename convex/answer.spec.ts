/// <reference types="vite/client" />
/**
 * The answer loop when the model returns no answer and no tool call.
 *
 * The loop used to stop at the first such round and give the reader "I could
 * not finish looking that up" about four seconds in, with every starter
 * question on the bill page affected. The client then recorded it as an
 * `answer_received`, so completion metrics did not show it.
 *
 * OpenRouter is replaced by a queue of replies; the fetch layer runs for real
 * against an empty in-memory database.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { EMPTY_MODEL_OUTPUT } from "./answer";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Request = { messages: Array<{ role: string; content: string | null }>; tools?: unknown };

let requests: Request[];

function replyWith(contents: string[]) {
  const queue = [...contents];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      const content = queue.shift() ?? "";
      return new Response(
        JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

beforeEach(() => {
  requests = [];
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const ask = (question: string) =>
  convexTest(schema, modules).action(internal.answer.ask, { question });

test("an answer on the first round is returned as it is", async () => {
  replyWith(["No bill in the 119th Congress matches that."]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe("No bill in the 119th Congress matches that.");
  expect(requests).toHaveLength(1);
});

test("narration with no tool call gets a nudge, not the canned apology", async () => {
  replyWith([
    "Let me fetch the remaining policy areas I haven't gotten yet.",
    "No bill in the 119th Congress matches that.",
  ]);
  const result = await ask("Where does it stand right now?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe("No bill in the 119th Congress matches that.");
  expect(result.partial).toBe(false);
  expect(requests).toHaveLength(2);
  // The retry still offers the tools, so the model can make the lookup it described.
  expect(requests[1].tools).toBeDefined();
  expect(requests[1].messages[requests[1].messages.length - 1]?.role).toBe("user");
  expect(requests[1].messages[requests[1].messages.length - 1]?.content).toMatch(/call a tool now/);
  // A work entry per retry, so the client's stall watchdog restarts.
  expect(result.workLog.filter((e) => e.tool === "retry")).toEqual([
    { tool: "retry", detail: "checking again" },
  ]);
});

test("a second empty round goes straight to the round without tools", async () => {
  replyWith(["", "", "No bill in the 119th Congress matches that."]);
  const result = await ask("Where does it stand right now?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe("No bill in the 119th Congress matches that.");
  expect(result.partial).toBe(true);
  expect(requests).toHaveLength(3);
  expect(requests[2].tools).toBeUndefined();
  expect(result.workLog.filter((e) => e.tool === "retry").map((e) => e.detail)).toEqual([
    "checking again",
    "answering from what was found",
  ]);
});

test("empty output on every attempt is reported as a failure, not an answer", async () => {
  replyWith(["", "", ""]);
  const result = await ask("Where does it stand right now?");
  expect(result.error).toBe(EMPTY_MODEL_OUTPUT);
  expect(result.text).toBe("");
  expect(result.sources).toEqual([]);
  // One nudge and one final round. Not all five rounds.
  expect(requests).toHaveLength(3);
});

test("a lookup written as text is not published, and its invented number never reaches the reader", async () => {
  replyWith([
    "fetch_dataset(dataset=\"bills\", filters={\"congress\": 119}, limit=0)\n" +
      "So far 1,557 bills have been introduced in the 119th Congress.",
    "No bill in the 119th Congress matches that.",
  ]);
  const result = await ask("How many bills have been introduced?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe("No bill in the 119th Congress matches that.");
  expect(requests).toHaveLength(2);
  expect(requests[1].tools).toBeDefined();
  expect(requests[1].messages[requests[1].messages.length - 1]?.content).toMatch(/was not run/);
  // The rejected reply is not fed back as something the model "retrieved".
  expect(JSON.stringify(requests[1].messages)).not.toContain("1,557");
  expect(JSON.stringify(requests[1].messages)).not.toContain("fetch_dataset(");
});

test("text-form lookups on every attempt end as a failure, not as an answer", async () => {
  const fake = "query: \"farm bill status\"\nreason: \"We do not hold news coverage.\"";
  replyWith([fake, fake, fake]);
  const result = await ask("What happened to the farm bill?");
  expect(result.error).toBe(EMPTY_MODEL_OUTPUT);
  expect(result.text).toBe("");
  expect(requests).toHaveLength(3);
  // Not even the final, tool-less round sees the fake call.
  expect(JSON.stringify(requests[2].messages)).not.toContain("farm bill status");
});

test("a first line repeating the end of the question is dropped", async () => {
  replyWith(["introduced this year about lighthouses\nNo bill in the 119th Congress matches that."]);
  const result = await ask("Was a bill introduced this year about lighthouses?");
  expect(result.text).toBe("No bill in the 119th Congress matches that.");
});

// --- Private reasoning (2026-10-05) ------------------------------------------

type Reply = { status?: number; message?: Record<string, unknown> };

/** Like replyWith, but each reply can carry reasoning, tool calls or an HTTP status. */
function replyWithMessages(replies: Reply[]) {
  const queue = [...replies];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      const next = queue.shift() ?? { message: { content: "" } };
      if (next.status && next.status !== 200) {
        return new Response("Bad Request: reasoning", { status: next.status });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: next.message, finish_reason: "stop" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

type ReasoningRequest = {
  tools?: unknown;
  reasoning?: Record<string, unknown>;
  max_tokens?: number;
  messages: Array<{ role: string; content: string | null; reasoning_details?: unknown }>;
};

test("by default the model reasons privately at low effort, with room for it and the answer", async () => {
  replyWith(["No bill in the 119th Congress matches that."]);
  await ask("Is there a bill about lighthouses?");
  const sent = requests[0] as unknown as ReasoningRequest;
  expect(sent.reasoning).toEqual({ effort: "low" });
  expect(sent.max_tokens).toBe(4096);
});

test("OPENROUTER_REASONING=off asks for none and gives the answer its own budget", async () => {
  vi.stubEnv("OPENROUTER_REASONING", "off");
  replyWith(["No bill in the 119th Congress matches that."]);
  await ask("Is there a bill about lighthouses?");
  const sent = requests[0] as unknown as ReasoningRequest;
  expect(sent.reasoning).toEqual({ enabled: false });
  expect(sent.max_tokens).toBe(2048);
});

test("a model that cannot switch reasoning off still answers when it is set off", async () => {
  // gpt-oss, 2026-10-05: "Reasoning is mandatory for this endpoint and cannot be
  // disabled." The retry leaves the setting out, so the model uses its default.
  vi.stubEnv("OPENROUTER_REASONING", "off");
  replyWithMessages([
    { status: 400 },
    { message: { content: "No bill in the 119th Congress matches that." } },
  ]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe("No bill in the 119th Congress matches that.");
  const sent = requests as unknown as ReasoningRequest[];
  expect(sent.map((r) => r.reasoning)).toEqual([{ enabled: false }, undefined]);
  expect(sent[1].max_tokens).toBe(4096);
});

test("the hosts are tried in the listed order, fastest first, not by price", async () => {
  replyWith(["No bill in the 119th Congress matches that."]);
  await ask("Is there a bill about lighthouses?");
  const sent = requests[0] as unknown as { model: string; models?: string[]; provider: Record<string, unknown> };
  expect(sent.model).toBe("openai/gpt-oss-120b");
  expect(sent.provider.only).toEqual(["cerebras", "groq", "amazon-bedrock"]);
  expect(sent.provider.order).toEqual(sent.provider.only);
  // The failover is the same model on the next host, never a weaker model.
  expect(sent.models).toBeUndefined();
  expect(sent.provider).toMatchObject({ zdr: true, data_collection: "deny" });
});

test("an overridden host list is tried in its own order", async () => {
  vi.stubEnv("OPENROUTER_PROVIDERS", "groq, cerebras");
  replyWith(["No bill in the 119th Congress matches that."]);
  await ask("Is there a bill about lighthouses?");
  const sent = requests[0] as unknown as { provider: Record<string, unknown> };
  expect(sent.provider.order).toEqual(["groq", "cerebras"]);
});

test("the model's reasoning never reaches the reader", async () => {
  // A REGRESSION GUARD, not evidence for the change: runLoop has only ever read
  // message.content, so this passed before reasoning was turned on too. It pins
  // that the separate field stays separate. Shaped like the senator answer a
  // reader saw on 2026-10-05.
  replyWithMessages([
    {
      message: {
        content: "Rick Scott introduced the most bills of any senator this Congress: 189.",
        reasoning:
          "Since the list is ordered most-bills-first and the top is Rick Scott, a senator, with 189. " +
          "But the question is about senators specifically.",
      },
    },
  ]);
  const result = await ask("Which senator introduced the most bills this Congress?");
  expect(result.text).toBe("Rick Scott introduced the most bills of any senator this Congress: 189.");
  expect(result.text).not.toMatch(/ordered most-bills-first|question is about/);
});

test("does not hand the reasoning back on the round after a lookup", async () => {
  vi.stubEnv("OPENROUTER_REASONING", "low");
  // Measured 2026-10-05: with it handed back, a failover to amazon/nova-lite-v1
  // on Amazon Bedrock refused the request ("User messages cannot contain
  // reasoning content"). DeepSeek through OpenRouter answers without it.
  const details = [{ type: "reasoning.text", text: "Check the sponsors dataset first." }];
  replyWithMessages([
    {
      message: {
        content: null,
        reasoning: "Check the sponsors dataset first.",
        reasoning_details: details,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "describe_dataset", arguments: JSON.stringify({ dataset: "sponsors" }) },
          },
        ],
      },
    },
    { message: { content: "We list every member who sponsored a bill this Congress." } },
  ]);
  const result = await ask("Who sponsors bills?");
  expect(result.error).toBeUndefined();
  const second = requests[1] as unknown as ReasoningRequest;
  expect(second.messages.some((m) => "reasoning_details" in m || "reasoning" in m)).toBe(false);
});

test("a request refused with a reasoning setting is retried once without it", async () => {
  vi.stubEnv("OPENROUTER_REASONING", "low");
  replyWithMessages([
    { status: 400 },
    { message: { content: "No bill in the 119th Congress matches that." } },
  ]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe("No bill in the 119th Congress matches that.");
  expect(requests).toHaveLength(2);
  expect((requests[0] as unknown as ReasoningRequest).reasoning).toEqual({ effort: "low" });
  // Left out, not { enabled: false }: a model that always reasons refuses that too.
  expect((requests[1] as unknown as ReasoningRequest).reasoning).toBeUndefined();
  expect((requests[1] as unknown as ReasoningRequest).max_tokens).toBe(4096);
  expect((requests[1] as unknown as ReasoningRequest).messages.some((m) => "reasoning_details" in m)).toBe(false);
});

test("once a request with a reasoning setting is refused, the rest of the turn leaves it out", async () => {
  vi.stubEnv("OPENROUTER_REASONING", "low");
  // Review finding on #169: the downgrade used to last one call, so a refusal
  // that kept happening cost a failed request on every round.
  replyWithMessages([
    {
      message: {
        content: null,
        reasoning_details: [{ type: "reasoning.text", text: "Look up the sponsors." }],
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "describe_dataset", arguments: JSON.stringify({ dataset: "sponsors" }) },
          },
        ],
      },
    },
    { status: 400 },
    {
      message: {
        content: null,
        tool_calls: [
          {
            id: "call_2",
            type: "function",
            function: { name: "describe_dataset", arguments: JSON.stringify({ dataset: "topics" }) },
          },
        ],
      },
    },
    { message: { content: "We list every member who sponsored a bill this Congress." } },
  ]);
  const result = await ask("Who sponsors bills?");
  expect(result.error).toBeUndefined();
  const sent = requests as unknown as ReasoningRequest[];
  expect(sent.map((r) => r.reasoning)).toEqual([
    { effort: "low" },
    { effort: "low" },
    undefined,
    undefined,
  ]);
  // No refused request after the first one.
  expect(sent).toHaveLength(4);
});

test("a final round refused with and without the setting does not put it back", async () => {
  // Review finding on #169: the turn-wide flag was set only when the retry
  // succeeded, so this path went with, without, then WITH reasoning again.
  vi.stubEnv("OPENROUTER_REASONING", "low");
  replyWithMessages([
    { message: { content: "" } },
    { message: { content: "" } },
    { status: 400 },
    { status: 400 },
    { message: { content: "No bill in the 119th Congress matches that." } },
  ]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe("No bill in the 119th Congress matches that.");
  const sent = requests as unknown as ReasoningRequest[];
  // Two empty rounds, then the final round: refused with the setting, refused
  // without it, then retried with the tools and still without it.
  expect(sent.slice(2).map((r) => r.reasoning)).toEqual([{ effort: "low" }, undefined, undefined]);
  expect(sent).toHaveLength(5);
});
