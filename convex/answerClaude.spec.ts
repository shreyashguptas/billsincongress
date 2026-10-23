/// <reference types="vite/client" />
/**
 * The Claude route of the answer loop (convex/claude.ts, called from runLoop in
 * answer.ts), through Anthropic's real SDK.
 *
 * Every answer is asked of Claude Haiku 5.5 first, then Claude Sonnet 5.5,
 * both on the site's own key and on US servers only, then gpt-oss on
 * OpenRouter as the last resort. A failed model must cost the reader nothing
 * but a little time, Claude's thinking must go back to Claude unchanged, and
 * the web lookup must fall back to Exa without the reader seeing a difference.
 *
 * `fetch` is replaced by two queues of replies, one standing in for the Claude
 * API and one for OpenRouter; the SDK and the fetch layer run for real against
 * an empty in-memory database.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const ANSWER = "No bill in the 119th Congress matches that.";

type Body = Record<string, any>;
type Sent = { url: string; body: Body; headers: Headers };
type Reply = (body: Body) => Response;

let sent: Sent[];
let claudeReplies: Reply[];
let openRouterReplies: Reply[];

const claude = (b: Sent) => b.url === ANTHROPIC;
const answerCalls = () => sent.filter((s) => claude(s) && !isWebSearch(s.body));
const isWebSearch = (body: Body) =>
  Array.isArray(body.tools) && body.tools.some((t: Body) => t.type === "web_search_20250305");

/** A Claude API reply. The model echoes what was asked for. */
function message(content: unknown[], stop_reason = "end_turn", extra: Body = {}): Reply {
  return (body) =>
    Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: body.model,
      content,
      stop_reason,
      stop_sequence: null,
      stop_details: null,
      usage: {
        input_tokens: 1200,
        output_tokens: 40,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 3000,
        inference_geo: "us",
        server_tool_use: null,
      },
      ...extra,
    });
}
const text = (t: string) => ({ type: "text", text: t, citations: null });
const thinking = (signature: string) => ({ type: "thinking", thinking: "", signature });
const toolUse = (id: string, name: string, input: Body) => ({ type: "tool_use", id, name, input, caller: { type: "direct" } });
/** A request the API rejects. Not retried, and the next Claude model is skipped. */
const badRequest: Reply = () =>
  Response.json({ type: "error", error: { type: "invalid_request_error", message: "nope" } }, { status: 400 });
/** An overloaded model. The SDK retries once (after 1 ms here), then the chain moves on. */
const overloaded: Reply = () =>
  Response.json(
    { type: "error", error: { type: "overloaded_error", message: "busy" } },
    { status: 529, headers: { "retry-after-ms": "1" } },
  );

const openRouterAnswer =
  (content: string): Reply =>
  () =>
    Response.json({
      model: "openai/gpt-oss-120b",
      provider: "Cerebras",
      choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 },
    });

beforeEach(() => {
  sent = [];
  claudeReplies = [];
  openRouterReplies = [];
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-not-a-real-key");
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-not-a-real-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sent.push({ url, body, headers: new Headers(init?.headers) });
    if (url === ANTHROPIC) return (claudeReplies.shift() ?? message([text("")]))(body);
    if (url === OPENROUTER) return (openRouterReplies.shift() ?? openRouterAnswer(""))(body);
    throw new Error(`unexpected fetch in test: ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const ask = (question: string) => convexTest(schema, modules).action(internal.answer.ask, { question });

test("answers on Claude Haiku over the Claude API, on US servers, with no OpenRouter call", async () => {
  claudeReplies = [message([thinking("sig-1"), text(ANSWER)])];
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe(ANSWER);
  expect(result.answeredBy).toBe("claude-haiku-5-5");
  expect(sent.map((s) => s.url)).toEqual([ANTHROPIC]);

  const { body, headers } = sent[0];
  // Our key, sent the way SDK 1.x sends an API key.
  expect(headers.get("authorization")).toBe("Bearer sk-ant-test-not-a-real-key");
  expect(headers.get("anthropic-version")).toBe("2026-10-21");
  expect(body.model).toBe("claude-haiku-5-5");
  // The owner's hard rule: AI on US servers only.
  expect(body.inference_geo).toBe("us");
  // Effort is always sent: Haiku 5.5 would otherwise run at medium.
  expect(body.thinking).toEqual({ type: "adaptive" });
  expect(body.output_config).toEqual({ effort: "low" });
  // Claude 5.5 refuses sampling parameters and forced tool choice.
  expect(body.temperature).toBeUndefined();
  expect(body.tool_choice).toEqual({ type: "auto" });
  expect(body.tools.map((t: Body) => t.name)).toEqual([
    "describe_dataset",
    "fetch_dataset",
    "search_web",
    "ask_reader",
  ]);
  // Cached: the tool list, the system prompt, and the transcript so far.
  expect(body.tools[3].cache_control).toEqual({ type: "ephemeral" });
  expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
  expect(body.cache_control).toEqual({ type: "ephemeral" });
  // The Messages API wants a user turn first; the loop opens with its own lookups.
  expect(body.messages[0].role).toBe("user");
  expect(body.messages[body.messages.length - 1]).toEqual({
    role: "user",
    content: "Is there a bill about lighthouses?",
  });
});

test("Claude's reply goes back unchanged, and the system prompt and tools never change mid-turn", async () => {
  const round1 = [thinking("sig-round-1"), toolUse("toolu_1", "describe_dataset", { name: "stats" })];
  claudeReplies = [message(round1, "tool_use"), message([thinking("sig-round-2"), text(ANSWER)])];
  const result = await ask("How many bills became law?");
  expect(result.text).toBe(ANSWER);
  const [first, second] = answerCalls().map((s) => s.body);
  // Append-only: the first request is a prefix of the second.
  expect(second.system).toEqual(first.system);
  expect(second.tools).toEqual(first.tools);
  expect(second.messages.slice(0, first.messages.length)).toEqual(first.messages);
  // Then Claude's own blocks, thinking signature included, then the result.
  expect(second.messages[first.messages.length]).toEqual({ role: "assistant", content: round1 });
  const results = second.messages[first.messages.length + 1];
  expect(results.role).toBe("user");
  expect(results.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
});

test("a failed Haiku call moves the turn to Sonnet, which picks up Haiku's work", async () => {
  const round1 = [thinking("haiku-sig"), toolUse("toolu_1", "describe_dataset", { name: "stats" })];
  claudeReplies = [
    message(round1, "tool_use"),
    overloaded,
    message([toolUse("toolu_2", "describe_dataset", { name: "members" })], "tool_use"),
    message([text(ANSWER)]),
  ];
  const result = await ask("How many bills became law?");
  expect(result.error).toBeUndefined();
  expect(result.text).toBe(ANSWER);
  expect(result.answeredBy).toBe("claude-sonnet-5-5");
  // Once Haiku fails (no SDK retry: the chain is the retry), every later round is Sonnet's.
  expect(answerCalls().map((s) => s.body.model)).toEqual([
    "claude-haiku-5-5",
    "claude-haiku-5-5",
    "claude-sonnet-5-5",
    "claude-sonnet-5-5",
  ]);
  // The reader's stall watchdog restarts for the backup model's call.
  expect(result.workLog).toContainEqual({ tool: "retry", detail: "trying a backup model" });
  // Sonnet is handed Haiku's blocks as they came: on the Claude API it reads them.
  const sonnet = answerCalls()[2].body;
  expect(sonnet.messages).toContainEqual({ role: "assistant", content: round1 });
  expect(sent.some((s) => s.url === OPENROUTER)).toBe(false);
});

test("when both Claude models fail, gpt-oss answers on OpenRouter, without Claude's blocks", async () => {
  claudeReplies = [
    message([thinking("sig"), toolUse("toolu_1", "describe_dataset", { name: "stats" })], "tool_use"),
    overloaded,
    overloaded,
  ];
  openRouterReplies = [openRouterAnswer(ANSWER)];
  const result = await ask("How many bills became law?");
  expect(result.text).toBe(ANSWER);
  expect(result.answeredBy).toBe("openai/gpt-oss-120b");
  expect(sent.map((s) => s.body.model)).toEqual([
    "claude-haiku-5-5",
    "claude-haiku-5-5",
    "claude-sonnet-5-5",
    "openai/gpt-oss-120b",
  ]);
  const gptOss = sent[3].body;
  expect(gptOss.provider).toMatchObject({ only: ["cerebras", "groq", "amazon-bedrock"], zdr: true });
  // The transcript arrives as plain content and tool calls.
  for (const m of gptOss.messages) expect(m).not.toHaveProperty("claude");
  expect(gptOss.messages).toContainEqual(
    expect.objectContaining({
      role: "assistant",
      tool_calls: [{ id: "toolu_1", type: "function", function: { name: "describe_dataset", arguments: '{"name":"stats"}' } }],
    }),
  );
});

test("a request Claude rejects as malformed still tries Sonnet, then the last resort", async () => {
  claudeReplies = [badRequest, badRequest];
  openRouterReplies = [openRouterAnswer(ANSWER)];
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe(ANSWER);
  expect(sent.map((s) => s.body.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5", "openai/gpt-oss-120b"]);
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("CLAUDE REQUEST REJECTED (400)"), expect.anything());
});

test("a refusal is not an answer: none of its text reaches the reader, and Sonnet answers", async () => {
  claudeReplies = [
    message([text("Here is a partial answ")], "refusal", {
      stop_details: { type: "refusal", category: "general_harms", explanation: null },
    }),
    message([text(ANSWER)]),
  ];
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe(ANSWER);
  expect(answerCalls().map((s) => s.body.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
});

test("a server error is not retried on the same model: Sonnet is the retry, under the reader's 45 s watchdog", async () => {
  claudeReplies = [overloaded, message([text(ANSWER)])];
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe(ANSWER);
  expect(answerCalls().map((s) => s.body.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
});

test("without ANTHROPIC_API_KEY the answer comes from gpt-oss, and the gap is logged loudly", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  openRouterReplies = [openRouterAnswer(ANSWER)];
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe(ANSWER);
  expect(sent.map((s) => s.url)).toEqual([OPENROUTER]);
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY is not set"));
});

test("a Claude model with no price on file is never called", async () => {
  vi.stubEnv("ANTHROPIC_ANSWER_MODEL", "claude-opus-5-5");
  claudeReplies = [message([text(ANSWER)])];
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe(ANSWER);
  expect(sent.map((s) => s.body.model)).toEqual(["claude-sonnet-5-5"]);
});

test("blank Claude models answer on gpt-oss alone", async () => {
  vi.stubEnv("ANTHROPIC_ANSWER_MODEL", "");
  vi.stubEnv("ANTHROPIC_BACKUP_MODEL", "");
  openRouterReplies = [openRouterAnswer(ANSWER)];
  const result = await ask("Is there a bill about lighthouses?");
  expect(result.text).toBe(ANSWER);
  expect(sent.map((s) => s.url)).toEqual([OPENROUTER]);
});

test("the last round keeps the same tools and forbids calling them, rather than withholding them", async () => {
  // A model that looks something up every round until it is out of rounds.
  claudeReplies = [0, 1, 2, 3].map((i) =>
    message([thinking(`sig-${i}`), toolUse(`toolu_${i}`, "describe_dataset", { name: "bills" })], "tool_use"),
  );
  claudeReplies.push(message([text(ANSWER)]));
  const result = await ask("How many bills became law?");
  expect(result.text).toBe(ANSWER);
  expect(result.partial).toBe(true);
  const calls = answerCalls().map((s) => s.body);
  expect(calls).toHaveLength(5);
  const last = calls[4];
  expect(last.tool_choice).toEqual({ type: "none" });
  expect(last.tools).toEqual(calls[0].tools);
  expect(last.messages[last.messages.length - 1].content).toMatch(/no lookups left/);
});

test("a reply cut off at max_tokens is marked truncated", async () => {
  claudeReplies = [message([text("Three bills became law: H.R. 1, H.R. 2 and")], "max_tokens")];
  const result = await ask("Which bills became law?");
  expect(result.truncatedByLength).toBe(true);
  expect(result.text).toBe("Three bills became law: H.R. 1, H.R. 2 and");
});

const SEARCH_CALL = toolUse("toolu_web", "search_web", {
  query: "House Ways and Means Committee hearing schedule 2026",
  reason: "We don't track committee hearing schedules.",
});
const WEB_ANSWER = "The committee meets on Tuesday [[cite:web:1]].";

test("the web lookup runs on Claude Sonnet with Anthropic's search tool, and its citations become the sources", async () => {
  claudeReplies = [
    message([SEARCH_CALL], "tool_use"),
    message([
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "Ways and Means hearings" } },
      {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: [
          { type: "web_search_result", url: "https://waysandmeans.house.gov/hearings", title: "Hearings", encrypted_content: "e", page_age: null },
        ],
      },
      {
        type: "text",
        text: "The next hearing is on Tuesday.",
        citations: [
          {
            type: "web_search_result_location",
            url: "https://waysandmeans.house.gov/hearings",
            title: "Hearings",
            cited_text: "Full Committee hearing, Tuesday 10:00 AM",
            encrypted_index: "x",
          },
        ],
      },
    ], "end_turn", {
      usage: { input_tokens: 9000, output_tokens: 80, inference_geo: "us", server_tool_use: { web_search_requests: 1 } },
    }),
    message([text(WEB_ANSWER)]),
  ];
  const result = await ask("When does Ways and Means meet next?");
  expect(result.webSources).toEqual([
    {
      handle: "web:1",
      url: "https://waysandmeans.house.gov/hearings",
      title: "Hearings",
      excerpt: "Full Committee hearing, Tuesday 10:00 AM",
    },
  ]);
  expect(result.webReason).toBe("We don't track committee hearing schedules.");
  expect(result.webEngine).toBe("anthropic");
  const search = sent.find((s) => isWebSearch(s.body))!.body;
  expect(search.model).toBe("claude-sonnet-5-5");
  expect(search.inference_geo).toBe("us");
  expect(search.tools).toEqual([
    {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 2,
      user_location: { type: "approximate", country: "US" },
    },
  ]);
  // The search sees the model's neutral phrase, never the reader's question.
  expect(search.messages).toEqual([{ role: "user", content: "House Ways and Means Committee hearing schedule 2026" }]);
  expect(sent.some((s) => s.url === OPENROUTER)).toBe(false);
});

test("a failed Claude web search falls back to Exa on OpenRouter, and the reader sees the same shape", async () => {
  claudeReplies = [message([SEARCH_CALL], "tool_use"), badRequest, message([text(WEB_ANSWER)])];
  openRouterReplies = [
    () =>
      Response.json({
        model: "openai/gpt-oss-120b",
        choices: [
          {
            message: {
              role: "assistant",
              content: "x",
              annotations: [
                {
                  type: "url_citation",
                  url_citation: { url: "https://waysandmeans.house.gov/hearings", title: "Hearings", content: "Tuesday 10:00 AM" },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 },
      }),
  ];
  const result = await ask("When does Ways and Means meet next?");
  expect(result.webSources).toEqual([
    { handle: "web:1", url: "https://waysandmeans.house.gov/hearings", title: "Hearings", excerpt: "Tuesday 10:00 AM" },
  ]);
  expect(result.webEngine).toBe("exa");
  const exa = sent.find((s) => s.url === OPENROUTER)!.body;
  expect(exa.plugins).toEqual([{ id: "web", engine: "exa", max_results: 5 }]);
  // The answer itself stayed on Haiku: a failed search is not a failed answer model.
  expect(answerCalls().map((s) => s.body.model)).toEqual(["claude-haiku-5-5", "claude-haiku-5-5"]);
});

test("a Claude web search that never searched falls back to Exa", async () => {
  claudeReplies = [
    message([SEARCH_CALL], "tool_use"),
    message([text("I think hearings are usually on Tuesdays.")]),
    message([text(WEB_ANSWER)]),
  ];
  openRouterReplies = [openRouterAnswer("")];
  await ask("When does Ways and Means meet next?");
  expect(sent.filter((s) => s.url === OPENROUTER).map((s) => s.body.plugins?.[0]?.engine)).toEqual(["exa"]);
});
