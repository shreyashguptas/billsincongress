/**
 * The pure half of the Claude route (convex/claude.ts), tested offline: the
 * transcript conversion, the price table, the effort mapping, the model chain
 * and the reading of web-search citations. The request/response loop itself is
 * exercised end to end in convex/answerClaude.spec.ts.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import {
  CLAUDE_PRICES,
  claudePrices,
  MAX_PRICE_PER_MTOK,
  claudeAnswerModels,
  claudeCostUsd,
  claudeEffort,
  claudeTools,
  claudeServiceDown,
  claudeWebModel,
  claudeWebModels,
  forOpenRouter,
  OPENING_USER_TURN,
  toClaudeRequest,
  webHitsFrom,
  markCutOff,
  sentencesAround,
  CUT_OFF,
  readable,
  clipExcerpt,
  type ChatMessage,
} from "./claude";
import { ANSWER_TOOLS } from "./catalog/tools";

let passed = 0;
const failures: string[] = [];
function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`);
  }
}

const close = (a: number | undefined, b: number) => assert.ok(a !== undefined && Math.abs(a - b) < 1e-12, `${a} != ${b}`);

/** A transcript shaped like runLoop's opening on a first question. */
function opening(): ChatMessage[] {
  return [
    { role: "system", content: "SYSTEM PROMPT" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "primed_describe_bills", type: "function", function: { name: "describe_dataset", arguments: '{"name":"bills"}' } },
        { id: "primed_describe_topics", type: "function", function: { name: "describe_dataset", arguments: '{"name":"topics"}' } },
      ],
    },
    { role: "tool", tool_call_id: "primed_describe_bills", content: "bills described" },
    { role: "tool", tool_call_id: "primed_describe_topics", content: "topics described" },
    { role: "user", content: "How many health bills?" },
  ];
}

// ---------------------------------------------------------------------------
// THE TRANSCRIPT
// ---------------------------------------------------------------------------

it("opens with a user turn when the transcript starts with our own lookup", () => {
  const { messages } = toClaudeRequest(opening());
  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].content, OPENING_USER_TURN);
  assert.equal(messages[1].role, "assistant");
});

it("does not add an opening turn when history already starts with the reader", () => {
  const { messages } = toClaudeRequest([
    { role: "system", content: "S" },
    { role: "user", content: "earlier question" },
    { role: "assistant", content: "earlier answer" },
    { role: "user", content: "now" },
  ]);
  assert.deepEqual(messages.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(messages[0].content, "earlier question");
});

it("caches the system prompt and puts a later system note after the cached block", () => {
  const transcript = opening();
  transcript.splice(4, 0, { role: "system", content: "FOLLOW-UP NOTE" });
  const { system, messages } = toClaudeRequest(transcript);
  assert.deepEqual(system, [
    { type: "text", text: "SYSTEM PROMPT", cache_control: { type: "ephemeral" } },
    { type: "text", text: "FOLLOW-UP NOTE" },
  ]);
  // A mid-conversation system message may not precede a user turn; none is sent.
  assert.ok(messages.every((m) => m.role !== "system"));
});

it("sends our own lookups as tool_use blocks, and their results as one user message", () => {
  const { messages } = toClaudeRequest(opening());
  const call = messages[1].content as Anthropic.ContentBlockParam[];
  assert.deepEqual(call, [
    { type: "tool_use", id: "primed_describe_bills", name: "describe_dataset", input: { name: "bills" } },
    { type: "tool_use", id: "primed_describe_topics", name: "describe_dataset", input: { name: "topics" } },
  ]);
  const results = messages[2].content as Anthropic.ToolResultBlockParam[];
  assert.equal(messages[2].role, "user");
  assert.deepEqual(results.map((r) => r.tool_use_id), ["primed_describe_bills", "primed_describe_topics"]);
  assert.equal(messages[3].content, "How many health bills?");
});

it("marks an ERROR result as an error, and only that one", () => {
  const { messages } = toClaudeRequest([
    ...opening().slice(0, 2),
    { role: "tool", tool_call_id: "primed_describe_bills", content: "ERROR (your call was invalid): bad filter" },
    { role: "tool", tool_call_id: "primed_describe_topics", content: "fine" },
    { role: "user", content: "q" },
  ]);
  const results = messages[2].content as Anthropic.ToolResultBlockParam[];
  assert.equal(results[0].is_error, true);
  assert.equal(results[1].is_error, undefined);
});

it("sends Claude's own reply back exactly as it came, thinking block and all", () => {
  const raw: Anthropic.ContentBlock[] = [
    { type: "thinking", thinking: "", signature: "sig-abc" } as Anthropic.ContentBlock,
    { type: "tool_use", id: "toolu_1", name: "fetch_dataset", input: { name: "bills", filters: {} }, caller: { type: "direct" } } as unknown as Anthropic.ContentBlock,
  ];
  const transcript: ChatMessage[] = [
    ...opening(),
    {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "toolu_1", type: "function", function: { name: "fetch_dataset", arguments: "{}" } }],
      claude: { model: "claude-haiku-5-5", content: raw },
    },
    { role: "tool", tool_call_id: "toolu_1", content: "rows" },
  ];
  const { messages } = toClaudeRequest(transcript);
  assert.equal(messages[4].content, raw);
});

it("is prefix-stable: a longer transcript converts to the shorter one's output plus more", () => {
  // The property that keeps Claude's thinking blocks valid and the cache warm
  // from one round to the next (convex/claude.ts, rule 2).
  const short = opening();
  const long: ChatMessage[] = [
    ...short,
    { role: "assistant", content: "", tool_calls: [{ id: "toolu_9", type: "function", function: { name: "describe_dataset", arguments: '{"name":"stats"}' } }] },
    { role: "tool", tool_call_id: "toolu_9", content: "stats" },
    { role: "user", content: "That was not an answer and not a lookup." },
  ];
  const a = toClaudeRequest(short);
  const b = toClaudeRequest(long);
  assert.deepEqual(b.system, a.system);
  assert.deepEqual(b.messages.slice(0, a.messages.length), a.messages);
});

it("never sends Claude's raw blocks to OpenRouter", () => {
  const sent = forOpenRouter([
    { role: "assistant", content: "hi", claude: { model: "claude-haiku-5-5", content: [] } },
  ]);
  assert.deepEqual(sent, [{ role: "assistant", content: "hi" }]);
});

it("converts every answer tool, unchanged, and caches the list", () => {
  const tools = claudeTools();
  assert.deepEqual(tools.map((t) => t.name), ANSWER_TOOLS.map((t) => t.function.name));
  for (const [i, t] of tools.entries()) assert.deepEqual(t.input_schema, ANSWER_TOOLS[i].function.parameters);
  assert.deepEqual(tools[tools.length - 1].cache_control, { type: "ephemeral" });
  assert.ok(tools.slice(0, -1).every((t) => t.cache_control === undefined));
});

// ---------------------------------------------------------------------------
// PRICES
// ---------------------------------------------------------------------------

it("prices a Haiku call at the US rate, cache included", () => {
  // (10,000 x 0.10 + 500 x 0.50 + 2,000 x 0.125 + 30,000 x 0.01) / 1e6 x 1.1
  close(
    claudeCostUsd("claude-haiku-5-5", {
      input_tokens: 10_000,
      output_tokens: 500,
      cache_creation_input_tokens: 2_000,
      cache_read_input_tokens: 30_000,
      inference_geo: "us",
    }),
    ((10_000 * 0.1 + 500 * 0.5 + 2_000 * 0.125 + 30_000 * 0.01) / 1e6) * 1.1,
  );
});

it("prices a Haiku prompt over 100K tokens on the higher card, counting cached tokens", () => {
  close(
    claudeCostUsd("claude-haiku-5-5", {
      input_tokens: 1_000,
      output_tokens: 100,
      cache_read_input_tokens: 100_000,
      inference_geo: "us",
    }),
    ((1_000 * 0.5 + 100 * 2.5 + 100_000 * 0.05) / 1e6) * 1.1,
  );
});

it("prices Sonnet, and its web searches at a cent each", () => {
  close(
    claudeCostUsd("claude-sonnet-5-5", {
      input_tokens: 20_000,
      output_tokens: 300,
      inference_geo: "us",
      server_tool_use: { web_search_requests: 2 },
    }),
    ((20_000 * 2 + 300 * 10) / 1e6) * 1.1 + 0.02,
  );
});

it("drops the US multiplier only when Anthropic says it ran elsewhere", () => {
  const usage = { input_tokens: 1_000_000, output_tokens: 0 };
  close(claudeCostUsd("claude-sonnet-5-5", usage), 2 * 1.1);
  close(claudeCostUsd("claude-sonnet-5-5", { ...usage, inference_geo: "global" }), 2);
});

it("has no price for a model that is not on file", () => {
  assert.equal(claudeCostUsd("claude-opus-5-5", { input_tokens: 1, output_tokens: 1 }), undefined);
  assert.ok(!("claude-opus-5-5" in CLAUDE_PRICES));
});

it("takes a new model's price from CLAUDE_PRICES_JSON, with the usual cache rates by default", () => {
  const prices = claudePrices({ CLAUDE_PRICES_JSON: '{"claude-haiku-6":{"input":0.2,"output":1}}' });
  assert.deepEqual(prices["claude-haiku-6"], { input: 0.2, output: 1, cacheWrite: 0.25, cacheRead: 0.02 });
  // The built-in prices are still there.
  assert.deepEqual(prices["claude-sonnet-5-5"], CLAUDE_PRICES["claude-sonnet-5-5"]);
});

it("lets CLAUDE_PRICES_JSON override a built-in price, long-context tier included", () => {
  const prices = claudePrices({
    CLAUDE_PRICES_JSON: JSON.stringify({
      "claude-haiku-5-5": {
        input: 0.2,
        output: 1,
        cacheWrite: 0.3,
        cacheRead: 0.02,
        long: { overPromptTokens: 200000, input: 1, output: 5 },
      },
    }),
  });
  assert.deepEqual(prices["claude-haiku-5-5"], {
    input: 0.2,
    output: 1,
    cacheWrite: 0.3,
    cacheRead: 0.02,
    long: { overPromptTokens: 200000, input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  });
});

it("ignores CLAUDE_PRICES_JSON that is not JSON, and keeps the built-in prices", () => {
  assert.deepEqual(claudePrices({ CLAUDE_PRICES_JSON: "{claude-haiku-6: 0.1}" }), CLAUDE_PRICES);
  assert.deepEqual(claudePrices({ CLAUDE_PRICES_JSON: "[1,2]" }), CLAUDE_PRICES);
});

it("drops a bad CLAUDE_PRICES_JSON entry and keeps the good ones", () => {
  const prices = claudePrices({
    CLAUDE_PRICES_JSON: JSON.stringify({
      "claude-ok-1": { input: 1, output: 5 },
      "claude-typo-1": { input: 2, output: 10_000 }, // over the ceiling: $10 written as 10000
      "claude-half-1": { input: 1 }, // no output price
      "claude-neg-1": { input: -1, output: 5 },
      "claude-null-1": { input: 3, output: null }, // null is not a price, never a default
      "claude-nulls-1": { input: null, output: null },
      "claude-nullcache-1": { input: 1, output: 5, cacheRead: null },
      "gpt-6": { input: 1, output: 5 }, // not a Claude model
      "claude-long-1": { input: 1, output: 5, long: { input: 2, output: 10 } }, // no threshold
      // A bad override leaves the built-in price alone.
      "claude-sonnet-5-5": { input: "2", output: 10 },
    }),
  });
  assert.ok("claude-ok-1" in prices);
  for (const model of [
    "claude-typo-1",
    "claude-half-1",
    "claude-neg-1",
    "claude-null-1",
    "claude-nulls-1",
    "claude-nullcache-1",
    "gpt-6",
    "claude-long-1",
  ]) {
    assert.ok(!(model in prices), `${model} should be ignored`);
  }
  assert.deepEqual(prices["claude-sonnet-5-5"], CLAUDE_PRICES["claude-sonnet-5-5"]);
  assert.ok(MAX_PRICE_PER_MTOK >= 50, "the ceiling must stay above the dearest real model");
});

it("has a price for every default model", () => {
  for (const model of [...claudeAnswerModels({}), ...claudeWebModels({})]) {
    assert.ok(model in CLAUDE_PRICES, `${model} has no price`);
  }
});

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------

it("maps the shared reasoning setting to a Claude effort, never thinking-off", () => {
  assert.equal(claudeEffort({ effort: "low" }), "low");
  assert.equal(claudeEffort({ effort: "medium" }), "medium");
  assert.equal(claudeEffort({ effort: "high" }), "high");
  assert.equal(claudeEffort({ effort: "minimal" }), "low");
  assert.equal(claudeEffort({ enabled: false }), "low");
});

it("chains Sonnet then Haiku by default, and a blank value drops a link", () => {
  assert.deepEqual(claudeAnswerModels({}), ["claude-sonnet-5-5", "claude-haiku-5-5"]);
  assert.deepEqual(claudeAnswerModels({ ANTHROPIC_ANSWER_MODEL: "" }), ["claude-haiku-5-5"]);
  assert.deepEqual(claudeAnswerModels({ ANTHROPIC_ANSWER_MODEL: "", ANTHROPIC_BACKUP_MODEL: " " }), []);
  assert.deepEqual(
    claudeAnswerModels({ ANTHROPIC_ANSWER_MODEL: "claude-haiku-5-5" }),
    ["claude-haiku-5-5"],
    "the same model twice is one link",
  );
  assert.equal(claudeWebModel({}), "claude-sonnet-5-5");
  assert.equal(claudeWebModel({ ANTHROPIC_WEB_MODEL: "" }), "");
  assert.deepEqual(claudeWebModels({}), ["claude-sonnet-5-5", "claude-haiku-5-5"]);
  assert.deepEqual(claudeWebModels({ ANTHROPIC_WEB_BACKUP_MODEL: "" }), ["claude-sonnet-5-5"]);
  assert.deepEqual(claudeWebModels({ ANTHROPIC_WEB_MODEL: "", ANTHROPIC_WEB_BACKUP_MODEL: "" }), []);
});

it("tells the Claude API being down from one model failing", () => {
  const status = (n: number) => new Anthropic.APIError(n, undefined, "x", new Headers());
  // The API as a whole: the other Claude model would fail the same way.
  assert.ok(claudeServiceDown(new Anthropic.APIConnectionError({ message: "ECONNREFUSED" })));
  for (const n of [502, 503, 504]) assert.ok(claudeServiceDown(status(n)), String(n));
  // One model or one request: the backup model is worth a try.
  assert.ok(!claudeServiceDown(new Anthropic.APIConnectionTimeoutError()));
  // A one-off 500 is one failed request: Haiku first, not the least accurate model.
  for (const n of [400, 404, 429, 500, 529]) assert.ok(!claudeServiceDown(status(n)), String(n));
  assert.ok(!claudeServiceDown(new Error("refused")));
});

// ---------------------------------------------------------------------------
// WEB SEARCH
// ---------------------------------------------------------------------------

const cite = (url: string, title: string, cited_text: string) => ({
  type: "web_search_result_location" as const,
  url,
  title,
  cited_text,
  encrypted_index: "x",
});

it("builds sources from Claude's citations, in the order it cited them, with its quotes", () => {
  const content = [
    { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "s1",
      content: [
        { type: "web_search_result", url: "https://a.gov", title: "A", encrypted_content: "e", page_age: null },
        { type: "web_search_result", url: "https://b.gov", title: "B", encrypted_content: "e", page_age: null },
      ],
    },
    { type: "text", text: "Hearings are on Tuesday.", citations: [cite("https://b.gov", "B", "Hearing Tuesday at 10")] },
    {
      type: "text",
      text: " They are public.",
      citations: [cite("https://a.gov", "A", "Open to the public"), cite("https://b.gov", "B", "Hearing Tuesday at 10")],
    },
  ] as unknown as Anthropic.ContentBlock[];
  assert.deepEqual(webHitsFrom(content, 5), [
    { url: "https://b.gov", title: "B", excerpt: "Hearing Tuesday at 10" },
    { url: "https://a.gov", title: "A", excerpt: "Open to the public" },
  ]);
  assert.equal(webHitsFrom(content, 1).length, 1);
});

it("leaves out a page Claude found but never quoted, so the lookup falls back to Exa", () => {
  const content = [
    {
      type: "web_search_tool_result",
      tool_use_id: "s1",
      content: [{ type: "web_search_result", url: "https://a.gov", title: "A page", encrypted_content: "e", page_age: null }],
    },
    { type: "text", text: "Nothing specific.", citations: null },
  ] as unknown as Anthropic.ContentBlock[];
  assert.deepEqual(webHitsFrom(content, 5), []);
});

it("reads no sources out of a search that errored", () => {
  const content = [
    { type: "web_search_tool_result", tool_use_id: "s1", content: { type: "web_search_tool_result_error", error_code: "unavailable" } },
  ] as unknown as Anthropic.ContentBlock[];
  assert.deepEqual(webHitsFrom(content, 5), []);
});

// The excerpts behind 5 of the 7 answers the fact-check judge failed between
// 2026-10-23 and 26: the search engine's quote stops mid-word, and the answer
// model finished the sentence itself.
const MODULE_PAGE =
  "SEC. 2. PROHIBITION. The Secretary of Defense may not procure a covered module. " +
  "A cellular module is a covered module if it is produced or provided by an entity subject to section 889, " +
  "or an entity owned by, controlled by, or under common control with such an entity. " +
  "SEC. 3. AUDIT. Not later than 180 days after enactment, the Secretary shall begin an audit.";
const MODULE_QUOTE =
  "A cellular module is a covered module if it is produced or provided by an entity subject to section 889, " +
  "or an entity owned by, contr...";

it("marks where a search quote was cut, without the half word", () => {
  assert.equal(
    markCutOff("including any program that was included in a report to Con..."),
    `including any program that was included in a report to ${CUT_OFF}`,
  );
  assert.equal(markCutOff("would create a task force to review: …"), `would create a task force to review: ${CUT_OFF}`);
  assert.equal(markCutOff("Meetings Video\n##..."), `Meetings Video ${CUT_OFF}`);
  // A whole quote is left alone.
  assert.equal(markCutOff("Open to the public."), "Open to the public.");
});

it("clips a long excerpt on a word, and says so", () => {
  assert.equal(clipExcerpt("Tuesday 10:00 AM", 500), "Tuesday 10:00 AM");
  assert.equal(clipExcerpt("an entity owned by, controlled by", 22), `an entity owned by, ${CUT_OFF}`);
});

it("widens a cut quote to the page's whole sentence", () => {
  assert.equal(
    sentencesAround(MODULE_PAGE, MODULE_QUOTE),
    "A cellular module is a covered module if it is produced or provided by an entity subject to section 889, " +
      "or an entity owned by, controlled by, or under common control with such an entity.",
  );
  // Not on the page, or too short to find safely: no widening.
  assert.equal(sentencesAround(MODULE_PAGE, "A sentence that this page never contains at all."), null);
  assert.equal(sentencesAround(MODULE_PAGE, "SEC. 2."), null);
});

it("marks a sentence that runs past the reach as cut off, on the page's own words", () => {
  const long = `Intro. The task force shall review ${"the use of automated tools ".repeat(30)}in federal courts.`;
  const out = sentencesAround(long, "The task force shall review the use of automated tools the use");
  assert.ok(out?.startsWith("The task force shall review"), out ?? "null");
  assert.ok(out?.endsWith(CUT_OFF), out ?? "null");
  assert.ok(!out?.includes("in federal courts"), out ?? "null");
});

const fetched = (url: string, title: string, data: string) => ({
  type: "web_fetch_tool_result",
  tool_use_id: "f1",
  content: {
    type: "web_fetch_result",
    url,
    retrieved_at: null,
    content: { type: "document", title, citations: { enabled: true }, source: { type: "text", media_type: "text/plain", data } },
  },
});

// Shapes of the pages fetched in the live check of 2026-10-26.
const GOVINFO_XML =
  '<action-desc><sponsor name-id="B001">Ms. Biggs of South Carolina</sponsor> introduced the following bill; ' +
  'which was referred to the <committee-name committee-id="HAS00">Committee on Armed Services</committee-name>' +
  '</action-desc></action><legis-type>A BILL</legis-type><official-title display="yes">To provide for an audit ' +
  "and mitigation of covered cellular modules in the Department of Defense systems and infrastructure." +
  '</official-title></form><legis-body><section><enum>1.</enum><header>Short title</header><text>This Act may ' +
  "be cited as the <quote>Blocking Foreign Cellular Modules in Defense Systems Act of 2026</quote>.</text>";
const HEARINGS_MD =
  "[![](https://waysandmeans.house.gov/img/calendar-icon.png)](https://waysandmeans.house.gov/calendar) " +
  "[Filters](#) Select Category Full Committee Health Oversight\n\n## Past Hearings\n\n" +
  "October 6 2026 [Full Committee Field Hearing: Delivering for Small Business](https://waysandmeans.house.gov/event/x/) " +
  "Collierville, Tennessee 09:00AM CT\n\nSeptember 2 2026 [Full Committee Hearing on Trade](https://waysandmeans.house.gov/event/y/)";

it("reads page markup as prose: link words kept, tags, images and escapes gone", () => {
  assert.equal(readable("See [the bill text](https://x.gov/t) &amp; **notes**."), "See the bill text & notes.");
  // Search quotes from the live check of 2026-10-26: a bare heading mark and escaped Markdown.
  assert.equal(readable("Meetings Video\n##"), "Meetings Video");
  assert.equal(readable("](https://waysandmeans.house.gov/calendar) [Filters](#)"), "Filters");
  assert.equal(readable("* * *\nIN THE SENATE"), "IN THE SENATE");
  assert.equal(readable("Sen. Wicker, Roger F. \\[R-MS\\] \\| Bill"), "Sen. Wicker, Roger F. [R-MS] | Bill");
  assert.ok(!readable(GOVINFO_XML).includes("<"), readable(GOVINFO_XML));
  assert.ok(!readable(HEARINGS_MD).includes("]("), readable(HEARINGS_MD));
});

it("does not end a sentence at an abbreviation", () => {
  const page =
    "Background. H.R. 2481, the Romance Scam Prevention Act, was introduced by Representative " +
    "Valadao on March 31, 2025. It was referred to the Committee on Energy and Commerce.";
  assert.equal(
    sentencesAround(page, "the Romance Scam Prevention Act, was introduced by Representative Valadao on Mar..."),
    "H.R. 2481, the Romance Scam Prevention Act, was introduced by Representative Valadao on March 31, 2025.",
  );
});

it("widens within an XML element, not across the tags around it", () => {
  assert.equal(
    sentencesAround(GOVINFO_XML, "To provide for an audit and mitigation of covered cellular modules in the Dep..."),
    "To provide for an audit and mitigation of covered cellular modules in the Department of Defense systems and infrastructure.",
  );
});

it("widens within one line of a Markdown page, not into its menus", () => {
  assert.equal(
    sentencesAround(HEARINGS_MD, "October 6 2026 Full Committee Field Hearing: Delivering for Small..."),
    "October 6 2026 Full Committee Field Hearing: Delivering for Small Business Collierville, Tennessee 09:00AM CT",
  );
});

it("reads a fetched page's citation as whole sentences from the page", () => {
  const start = MODULE_PAGE.indexOf("A cellular module");
  const cited = MODULE_PAGE.slice(start, start + 60);
  const content = [
    fetched("https://www.congress.gov/bill/119th-congress/house-bill/10861/text", "H.R.10861 text", MODULE_PAGE),
    {
      type: "text",
      text: "Modules from covered entities count.",
      citations: [{
        type: "char_location", cited_text: cited, document_index: 0, document_title: "H.R.10861 text",
        start_char_index: start, end_char_index: start + 60, file_id: null,
      }],
    },
  ] as unknown as Anthropic.ContentBlock[];
  assert.deepEqual(webHitsFrom(content, 5), [{
    url: "https://www.congress.gov/bill/119th-congress/house-bill/10861/text",
    title: "H.R.10861 text",
    excerpt:
      "A cellular module is a covered module if it is produced or provided by an entity subject to section 889, " +
      "or an entity owned by, controlled by, or under common control with such an entity.",
  }]);
});

it("widens a search quote from the page when Claude fetched it, and marks it when it did not", () => {
  const content = [
    fetched("https://www.congress.gov/bill/10861/", "H.R.10861", MODULE_PAGE),
    {
      type: "text",
      text: "Covered modules are defined.",
      citations: [
        cite("https://www.congress.gov/bill/10861", "H.R.10861", MODULE_QUOTE),
        cite("https://news.example.com/story", "Story", "The bill would create a task force to review: ..."),
      ],
    },
  ] as unknown as Anthropic.ContentBlock[];
  const [page, story] = webHitsFrom(content, 5);
  assert.ok(page.excerpt.endsWith("under common control with such an entity."), page.excerpt);
  assert.equal(story.excerpt, `The bill would create a task force to review: ${CUT_OFF}`);
});

console.log(`claude.test.ts — ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
