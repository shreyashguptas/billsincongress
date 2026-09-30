/// <reference types="vite/client" />
/**
 * The answer path's PostHog log line, run through the real HTTP action against
 * an in-memory Convex (convex-test). OpenRouter and PostHog are both stubbed
 * `fetch` targets: nothing leaves the machine.
 *
 * What each case protects: the line that lets us open a reader's replay from a
 * failed answer has to arrive, has to carry their ids, must never carry their
 * question, and must never cost them the answer.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const QUESTION = "What happened to my private question about H.R. 1234?";
const SESSION = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const DISTINCT = "0199a1b2-0000-7e5f-8a9b-0c1d2e3f4a5b";

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * Stub the network. OpenRouter answers with `openRouter`; PostHog's log
 * endpoint records what it was sent. Anything else is a test bug.
 */
function stubNetwork(openRouter: () => Response, posthog: () => Response = () => new Response("{}")) {
  const toPosthog: Sent[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://openrouter.ai/")) return openRouter();
    if (url.endsWith("/i/v1/logs")) {
      toPosthog.push({
        url,
        headers: init?.headers as Record<string, string>,
        body: String(init?.body),
      });
      return posthog();
    }
    throw new Error(`unexpected fetch in a test: ${url}`);
  });
  return toPosthog;
}

const answerOk = () =>
  new Response(
    JSON.stringify({
      model: "deepseek/deepseek-v4-flash-0731",
      choices: [{ message: { role: "assistant", content: "It was referred to committee." }, finish_reason: "stop" }],
    }),
  );
const answerDown = () => new Response("upstream overloaded", { status: 503 });
const answerEmpty = () =>
  new Response(
    JSON.stringify({
      model: "deepseek/deepseek-v4-flash-0731",
      choices: [{ message: { role: "assistant", content: "" }, finish_reason: "stop" }],
    }),
  );

async function ask(t: T, ids: { session?: unknown; distinct?: unknown } = { session: SESSION, distinct: DISTINCT }) {
  const response = await t.fetch("/answer/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: QUESTION,
      context: { route: "bill", billId: "1234hr119" },
      anonymousSessionId: "anon-session-1",
      posthogSessionId: ids.session,
      posthogDistinctId: ids.distinct,
    }),
  });
  const stream = await response.text();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return stream;
}

function attributesOf(sent: Sent) {
  const record = JSON.parse(sent.body).resourceLogs[0].scopeLogs[0].logRecords[0];
  const attrs = Object.fromEntries(
    record.attributes.map((a: { key: string; value: Record<string, unknown> }) => [
      a.key,
      Object.values(a.value)[0],
    ]),
  );
  return { record, attrs };
}

beforeEach(() => {
  vi.useFakeTimers();
  process.env.OPENROUTER_API_KEY = "sk-or-test-not-real";
  process.env.POSTHOG_PROJECT_TOKEN = "phc_test_not_real";
  delete process.env.POSTHOG_HOST;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.POSTHOG_PROJECT_TOKEN;
});

describe("the answer's PostHog log line", () => {
  test("a failed answer sends one ERROR line tagged with the reader's replay", async () => {
    const toPosthog = stubNetwork(answerDown);
    const t = setup();

    const stream = await ask(t);

    expect(stream).toContain("event: error");
    expect(toPosthog).toHaveLength(1);
    expect(toPosthog[0].url).toBe("https://us.i.posthog.com/i/v1/logs");
    expect(toPosthog[0].headers.Authorization).toBe("Bearer phc_test_not_real");
    const { record, attrs } = attributesOf(toPosthog[0]);
    expect(record.severityText).toBe("ERROR");
    expect(record.body.stringValue).toBe("answer failed");
    expect(attrs.sessionId).toBe(SESSION);
    expect(attrs.posthogDistinctId).toBe(DISTINCT);
    expect(attrs.bill_id).toBe("1234hr119");
    expect(attrs.page).toBe("bill");
    expect(attrs.signed_in).toBe(false);
    expect(attrs.error_kind).toBe("openrouter_503");
  });

  test("an answer that comes back empty every time is an ERROR line too, with the reason", async () => {
    const toPosthog = stubNetwork(answerEmpty);
    const stream = await ask(setup());

    expect(stream).toContain("empty_model_output");
    expect(toPosthog).toHaveLength(1);
    const { record, attrs } = attributesOf(toPosthog[0]);
    expect(record.severityText).toBe("ERROR");
    expect(record.body.stringValue).toBe("answer failed");
    expect(attrs.reason).toBe("empty_model_output");
    expect(attrs.sessionId).toBe(SESSION);
  });

  test("a good answer sends one INFO line with how it went", async () => {
    const toPosthog = stubNetwork(answerOk);
    const t = setup();

    const stream = await ask(t);

    expect(stream).toContain("event: done");
    expect(toPosthog).toHaveLength(1);
    const { record, attrs } = attributesOf(toPosthog[0]);
    expect(record.severityText).toBe("INFO");
    expect(record.body.stringValue).toBe("answer served");
    expect(attrs.partial).toBe(false);
    expect(attrs.dropped_citations).toBe("0");
    expect(typeof attrs.duration_ms).toBe("string");
  });

  test("the reader's question is never on the line", async () => {
    const toPosthog = stubNetwork(answerDown);
    await ask(setup());
    expect(toPosthog[0].body).not.toContain("private question");
  });

  test("an upstream error that quotes the question does not carry it onto the line", async () => {
    // OpenRouter's moderation error echoes the flagged part of the prompt.
    const flagged = () =>
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: "Input was flagged",
            metadata: { reasons: ["x"], flagged_input: QUESTION, provider_name: "p", model_slug: "m" },
          },
        }),
        { status: 403, statusText: "Forbidden" },
      );
    const toPosthog = stubNetwork(flagged);
    await ask(setup());
    expect(toPosthog).toHaveLength(1);
    expect(toPosthog[0].body).not.toContain("private question");
    expect(attributesOf(toPosthog[0]).attrs.error_kind).toBe("openrouter_403");
  });

  test("a 200 that carries an error payload is labelled, not quoted", async () => {
    const payload = () =>
      new Response(JSON.stringify({ error: { message: `No provider for: ${QUESTION}` } }));
    const toPosthog = stubNetwork(payload);
    await ask(setup());
    expect(toPosthog[0].body).not.toContain("private question");
    expect(attributesOf(toPosthog[0]).attrs.error_kind).toBe("openrouter_error_payload");
  });

  test("with analytics blocked there are no ids, and the line still arrives", async () => {
    const toPosthog = stubNetwork(answerDown);
    await ask(setup(), { session: undefined, distinct: "<img src=x>" });
    const { attrs } = attributesOf(toPosthog[0]);
    expect(attrs).not.toHaveProperty("sessionId");
    expect(attrs).not.toHaveProperty("posthogDistinctId");
  });

  test("PostHog being down does not cost the reader their answer", async () => {
    stubNetwork(answerOk, () => new Response("down", { status: 500 }));
    const stream = await ask(setup());
    expect(stream).toContain("event: done");
    expect(stream).toContain("It was referred to committee.");
  });

  test("with no PostHog token nothing is scheduled or sent", async () => {
    delete process.env.POSTHOG_PROJECT_TOKEN;
    const toPosthog = stubNetwork(answerOk);
    const stream = await ask(setup());
    expect(stream).toContain("event: done");
    expect(toPosthog).toHaveLength(0);
  });
});
