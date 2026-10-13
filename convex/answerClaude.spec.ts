/// <reference types="vite/client" />
/**
 * The Claude route of the answer loop (DEFAULT_CLAUDE_MODEL in answer.ts).
 *
 * Claude must run on the site's own Anthropic key through OpenRouter BYOK and
 * never on OpenRouter credits, and a failed Claude call must cost the reader
 * nothing but a little time: the turn carries on on the default model.
 *
 * OpenRouter is replaced by a queue of replies; the fetch layer runs for real
 * against an empty in-memory database.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Sent = {
  model: string;
  models?: string[];
  temperature?: number;
  provider: Record<string, unknown>;
  usage?: unknown;
};
type Reply = { status?: number; content?: string; byok?: boolean };

let requests: Sent[];

function replyWith(replies: Reply[]) {
  const queue = [...replies];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      const r = queue.shift() ?? { content: "" };
      if (r.status && r.status !== 200) return new Response("upstream down", { status: r.status });
      return Response.json({
        choices: [{ message: { content: r.content ?? "" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.00001, ...(r.byok !== undefined && { is_byok: r.byok }) },
      });
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

const ANSWER = "No bill in the 119th Congress matches that.";

test("answers on Claude Haiku, pinned to Anthropic's own endpoint", async () => {
  replyWith([{ content: ANSWER, byok: true }]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe(ANSWER);
  expect(requests).toHaveLength(1);
  const sent = requests[0];
  expect(sent.model).toBe("anthropic/claude-haiku-5.5");
  // Anthropic only: Amazon Bedrock also serves Claude, on OpenRouter credits.
  expect(sent.provider).toMatchObject({ only: ["anthropic"], allow_fallbacks: false, data_collection: "deny" });
  // OpenRouter's own failover would share this provider config; ours does not.
  expect(sent.models).toBeUndefined();
  expect(sent.temperature).toBeUndefined();
  expect(sent.usage).toEqual({ include: true });
});

test("a Claude reply not billed to our key is discarded and the turn moves to the default model", async () => {
  replyWith([
    { content: "Billed to OpenRouter credits.", byok: false },
    { content: "Let me fetch the remaining policy areas I haven't gotten yet." },
    { content: ANSWER },
  ]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe(ANSWER);
  // One Claude request, then the default model for every later round.
  expect(requests.map((r) => r.model)).toEqual([
    "anthropic/claude-haiku-5.5",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-120b",
  ]);
  expect(requests[1].provider).toMatchObject({ only: ["cerebras", "groq", "amazon-bedrock"], zdr: true });
});

test("a reply with no BYOK flag at all counts as not billed to our key", async () => {
  replyWith([{ content: "Unknown billing." }, { content: ANSWER }]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe(ANSWER);
  expect(requests.map((r) => r.model)).toEqual(["anthropic/claude-haiku-5.5", "openai/gpt-oss-120b"]);
});

test("a failed Claude request is answered on the default model", async () => {
  replyWith([{ status: 502 }, { content: ANSWER }]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe(ANSWER);
  expect(requests.map((r) => r.model)).toEqual(["anthropic/claude-haiku-5.5", "openai/gpt-oss-120b"]);
});

test("a blank OPENROUTER_CLAUDE_MODEL answers on the default model alone", async () => {
  vi.stubEnv("OPENROUTER_CLAUDE_MODEL", "");
  replyWith([{ content: ANSWER }]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe(ANSWER);
  expect(requests.map((r) => r.model)).toEqual(["openai/gpt-oss-120b"]);
});
