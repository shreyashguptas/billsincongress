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
  expect(requests[1].messages.at(-1)?.role).toBe("user");
  expect(requests[1].messages.at(-1)?.content).toMatch(/call a tool now/);
});

test("a second empty round goes straight to the round without tools", async () => {
  replyWith(["", "", "No bill in the 119th Congress matches that."]);
  const result = await ask("Where does it stand right now?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe("No bill in the 119th Congress matches that.");
  expect(result.partial).toBe(true);
  expect(requests).toHaveLength(3);
  expect(requests[2].tools).toBeUndefined();
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
