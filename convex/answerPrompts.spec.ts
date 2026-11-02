/// <reference types="vite/client" />
/**
 * The answer prompt's minimum version. Each case is a reader told something
 * the site no longer says: on 2026-11-02 the `production` label in PostHog
 * pointed at version 8, which says "We do not hold co-sponsors", while bill
 * pages were about to list them. Merging the code has to release the matching
 * wording without anyone remembering to move the label.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { MIN_PROMPT_VERSION } from "./catalog/promptTemplate";

const modules = import.meta.glob("./**/*.ts");
const words = (w: string) => `${`${w} `.repeat(30)}\n{{datasets}}{{calendar}}{{context}}`;

/** What PostHog serves: the label's version, and every version by number. */
let labelVersion = 0;
const asked: string[] = [];

beforeEach(() => {
  process.env.POSTHOG_PERSONAL_API_KEY = "phx_test_not_a_real_key";
  asked.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    asked.push(url.search);
    const version = url.searchParams.has("label") ? labelVersion : Number(url.searchParams.get("version"));
    return new Response(JSON.stringify({ version, prompt: words(`Version ${version}.`) }), { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.POSTHOG_PERSONAL_API_KEY;
});

test("a production label older than the code's minimum is not what readers get", async () => {
  const t = convexTest(schema, modules);
  labelVersion = MIN_PROMPT_VERSION - 1;
  await t.action(internal.answerPrompts.refresh, {});
  const served = await t.query(internal.answerPrompts.forAnswer, {});
  expect(served.version).toBe(MIN_PROMPT_VERSION);
  expect(served.template?.startsWith(`Version ${MIN_PROMPT_VERSION}.`)).toBe(true);
  expect(asked).toEqual(["?label=production", `?version=${MIN_PROMPT_VERSION}`]);
});

test("a label at or past the minimum is followed as before", async () => {
  const t = convexTest(schema, modules);
  labelVersion = MIN_PROMPT_VERSION + 1;
  await t.action(internal.answerPrompts.refresh, {});
  const served = await t.query(internal.answerPrompts.forAnswer, {});
  expect(served.version).toBe(MIN_PROMPT_VERSION + 1);
  expect(asked).toEqual(["?label=production"]);
});

test("an old copy already stored is never served, even marked production", async () => {
  // Production holds version 8's copy at the moment the new code deploys.
  const t = convexTest(schema, modules);
  await t.mutation(internal.answerPrompts.store, { version: MIN_PROMPT_VERSION - 1, template: words("Old."), isProduction: true });
  const served = await t.query(internal.answerPrompts.forAnswer, {});
  // The in-code default, which matches the code, until the next refresh.
  expect(served.template).toBeNull();
  expect(served.version).toBeNull();
});

test("an experiment arm below the minimum is refused, not served or fetched", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.answerPrompts.store, { version: MIN_PROMPT_VERSION, template: words("Current."), isProduction: true });
  await t.mutation(internal.answerPrompts.store, { version: MIN_PROMPT_VERSION - 2, template: words("Old."), isProduction: false });
  const served = await t.query(internal.answerPrompts.forAnswer, { version: MIN_PROMPT_VERSION - 2 });
  expect(served.template?.startsWith("Current.")).toBe(true);
  expect(await t.mutation(internal.answerPrompts.claimFetch, { version: MIN_PROMPT_VERSION - 3 })).toBe(false);
});
