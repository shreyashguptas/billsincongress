/// <reference types="vite/client" />
/**
 * One more try after a momentary upstream failure (convex/transientRetry.ts).
 *
 * Every "Failed to get a response." in early October was one of these: two
 * provider timeouts sent as a 504 inside a 200 (2026-10-05), a 429 "retry
 * shortly" (10-07) and a network error before the request left (10-13). Each
 * ended the reader's answer on the first attempt.
 *
 * OpenRouter is replaced by a queue of replies; the fetch layer runs for real
 * against an empty in-memory database.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Reply =
  | { content: string }
  | { toolCall: { name: string; args: Record<string, unknown> } }
  | { status: number; retryAfter?: string }
  | { payloadError: Record<string, unknown> }
  | { network: true };

let requests: Array<{ plugins?: unknown }>;

function replyWith(replies: Reply[]) {
  const queue = [...replies];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      const next = queue.shift() ?? { content: "" };
      if ("network" in next) throw new TypeError("error sending request for url (https://openrouter.ai/)");
      if ("status" in next) {
        return new Response("upstream", {
          status: next.status,
          headers: next.retryAfter ? { "Retry-After": next.retryAfter } : {},
        });
      }
      const body =
        "payloadError" in next
          ? { error: next.payloadError }
          : "toolCall" in next
            ? {
                choices: [
                  {
                    message: {
                      content: "",
                      tool_calls: [
                        {
                          id: "call_1",
                          type: "function",
                          function: { name: next.toolCall.name, arguments: JSON.stringify(next.toolCall.args) },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              }
            : { choices: [{ message: { content: next.content }, finish_reason: "stop" }] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  requests = [];
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  // The default model; a Claude failure already hands the turn to it.
  vi.stubEnv("OPENROUTER_CLAUDE_MODEL", "");
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

test("a provider timeout sent inside a 200 is tried once more", async () => {
  replyWith([{ payloadError: { message: "Provider timed out after 17011ms", code: 504 } }, { content: ANSWER }]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe(ANSWER);
  expect(requests).toHaveLength(2);
});

test("a 429 is tried once more", async () => {
  replyWith([{ status: 429, retryAfter: "0" }, { content: ANSWER }]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe(ANSWER);
  expect(requests).toHaveLength(2);
});

test("a network error before the request left is tried once more", async () => {
  replyWith([{ network: true }, { content: ANSWER }]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe(ANSWER);
  expect(requests).toHaveLength(2);
});

test("only once: a second momentary failure still ends the answer", async () => {
  replyWith([{ status: 503 }, { status: 503 }, { content: ANSWER }]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.error).toBe("Failed to get a response.");
  expect(requests).toHaveLength(2);
});

test("a refused request is not tried again", async () => {
  replyWith([{ status: 401 }, { content: ANSWER }]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.error).toBe("Failed to get a response.");
  expect(requests).toHaveLength(1);
});

test("a web search with no connection is a missing search, not the end of the answer", async () => {
  // It used to throw out of the whole turn, where an HTTP error here already
  // meant only "no web results".
  replyWith([
    {
      toolCall: {
        name: "search_web",
        args: { query: "lighthouse preservation legislation 2026", reason: "We don't track news coverage." },
      },
    },
    { network: true },
    { network: true },
    { content: ANSWER },
  ]);
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe(ANSWER);
  // The answer call, the search and its one retry, then the answer.
  expect(requests).toHaveLength(4);
  expect(requests.filter((r) => r.plugins !== undefined)).toHaveLength(2);
  expect(result.webSources).toEqual([]);
});
