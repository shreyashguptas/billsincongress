/**
 * The answer model's instructions, served from PostHog prompt management.
 *
 * Why PostHog: the wording can be versioned, released with a `production`
 * label and A/B tested against another version without a deploy, and every
 * generation is tagged with the version that produced it, so PostHog compares
 * versions on cost, speed, evaluation pass rate and readers' ratings.
 *
 * Why a copy here: an answer must never wait on PostHog. `refresh` (a cron,
 * every five minutes) copies the `production` version into `answerPrompts`;
 * an answer reads that row, which is a single indexed lookup. A version an
 * experiment assigns that is not copied yet is fetched in the background and
 * served from the next answer on; until then the reader gets production.
 *
 * Why it cannot break answers: a version that fails validTemplate is never
 * stored, and with no usable row the answer uses DEFAULT_TEMPLATE from code
 * (convex/catalog/promptTemplate.ts). No POSTHOG_PERSONAL_API_KEY = no fetch.
 */
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ANSWER_PROMPT_NAME, validTemplate } from "./catalog/promptTemplate";

/** PostHog's app API (not the capture host). Override for EU: https://eu.posthog.com */
const DEFAULT_APP_HOST = "https://us.posthog.com";
/** This site's PostHog project. Override with POSTHOG_PROJECT_ID. */
const DEFAULT_PROJECT_ID = "451900";
/** Versions kept besides production; older experiment versions are dropped. */
const KEEP_VERSIONS = 10;
/** A version that failed to copy is not tried again for this long. */
const RETRY_AFTER_MS = 60 * 60 * 1000;
/** At most this many version fetches start per minute, whatever clients send. */
const FETCHES_PER_MINUTE = 3;

export interface ServedPrompt {
  name: string;
  /** null when DEFAULT_TEMPLATE from code is serving (nothing usable copied). */
  version: number | null;
  template: string | null;
}

/**
 * What an answer should use: the version an experiment assigned this reader if
 * it is copied, else production, else nothing (the caller then uses code).
 * `missing` is the assigned version when it is not copied yet, so the caller
 * can schedule fetching it.
 */
export const forAnswer = internalQuery({
  args: { version: v.optional(v.number()) },
  returns: v.object({
    name: v.string(),
    version: v.union(v.number(), v.null()),
    template: v.union(v.string(), v.null()),
    missing: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args): Promise<ServedPrompt & { missing: number | null }> => {
    const rows = await ctx.db
      .query("answerPrompts")
      .withIndex("by_name_version", (q) => q.eq("name", ANSWER_PROMPT_NAME))
      .collect();
    // A row with an empty template is a fetch attempt, not a copy.
    const usable = rows.filter((r) => r.template !== "");
    const assigned =
      args.version === undefined ? undefined : usable.find((r) => r.version === args.version);
    const row = assigned ?? usable.find((r) => r.isProduction);
    return {
      name: ANSWER_PROMPT_NAME,
      version: row?.version ?? null,
      template: row?.template ?? null,
      missing: args.version !== undefined && !assigned ? args.version : null,
    };
  },
});

export const store = internalMutation({
  args: {
    version: v.number(),
    template: v.string(),
    isProduction: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("answerPrompts")
      .withIndex("by_name_version", (q) => q.eq("name", ANSWER_PROMPT_NAME))
      .collect();
    const now = Date.now();
    const same = rows.find((r) => r.version === args.version);
    if (same) {
      await ctx.db.patch(same._id, {
        template: args.template,
        isProduction: args.isProduction || same.isProduction,
        fetchedAt: now,
      });
    } else {
      await ctx.db.insert("answerPrompts", {
        name: ANSWER_PROMPT_NAME,
        version: args.version,
        template: args.template,
        isProduction: args.isProduction,
        fetchedAt: now,
      });
    }
    if (args.isProduction) {
      // One production version at a time: the label moved in PostHog.
      for (const r of rows) {
        if (r.version !== args.version && r.isProduction) {
          await ctx.db.patch(r._id, { isProduction: false });
        }
      }
    }
    // Keep the newest versions; production is always kept.
    const others = rows
      .filter((r) => r.version !== args.version && !(r.isProduction && !args.isProduction))
      .sort((a, b) => b.version - a.version);
    for (const r of others.slice(KEEP_VERSIONS)) await ctx.db.delete(r._id);
    return null;
  },
});

/**
 * Whether to start fetching an experiment version nobody has copied yet, and
 * if so, record the attempt. No for a version tried within the hour (it failed
 * or is in flight) and when three fetches already started this minute, so
 * neither a broken experiment arm nor a client sending made-up version numbers
 * turns question traffic into PostHog API calls (review on #171).
 */
export const claimFetch = internalMutation({
  args: { version: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("answerPrompts")
      .withIndex("by_name_version", (q) => q.eq("name", ANSWER_PROMPT_NAME))
      .collect();
    const now = Date.now();
    const existing = rows.find((r) => r.version === args.version);
    if (existing && existing.template !== "") return false;
    if (existing?.attemptedAt !== undefined && now - existing.attemptedAt < RETRY_AFTER_MS) {
      return false;
    }
    const recent = rows.filter((r) => r.attemptedAt !== undefined && now - r.attemptedAt < 60_000);
    if (recent.length >= FETCHES_PER_MINUTE) return false;
    // Attempts that never became a copy are kept a day, then dropped.
    for (const r of rows) {
      if (r.template === "" && r.attemptedAt !== undefined && now - r.attemptedAt > 24 * RETRY_AFTER_MS) {
        await ctx.db.delete(r._id);
      }
    }
    if (existing) {
      await ctx.db.patch(existing._id, { attemptedAt: now });
    } else {
      await ctx.db.insert("answerPrompts", {
        name: ANSWER_PROMPT_NAME,
        version: args.version,
        template: "",
        isProduction: false,
        fetchedAt: 0,
        attemptedAt: now,
      });
    }
    return true;
  },
});

/** Fetch one version (or the label's) from PostHog. null on any failure. */
async function fetchFromPostHog(
  query: { label: string } | { version: number },
): Promise<{ version: number; template: string } | null> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) return null;
  const host = (process.env.POSTHOG_APP_HOST || DEFAULT_APP_HOST).replace(/\/+$/, "");
  const project = process.env.POSTHOG_PROJECT_ID || DEFAULT_PROJECT_ID;
  const params = new URLSearchParams(
    "label" in query ? { label: query.label } : { version: String(query.version) },
  );
  const url = `${host}/api/projects/${project}/llm_prompts/name/${ANSWER_PROMPT_NAME}/?${params}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) {
      // The status only: never the key, and the body may echo request details.
      console.error(`answer prompt fetch failed: PostHog ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { prompt?: unknown; version?: unknown };
    if (typeof data.version !== "number" || !validTemplate(data.prompt)) {
      console.error(
        `answer prompt version ${String(data.version)} rejected: it must be text with ` +
          `{{datasets}} and no slot other than {{datasets}}, {{calendar}} and {{context}}`,
      );
      return null;
    }
    return { version: data.version, template: data.prompt };
  } catch (error) {
    console.error("answer prompt fetch failed:", String(error));
    return null;
  }
}

/** The cron: copy whatever `production` points at now. */
export const refresh = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const got = await fetchFromPostHog({ label: "production" });
    if (got) await ctx.runMutation(internal.answerPrompts.store, { ...got, isProduction: true });
    return null;
  },
});

/** Copy one experiment version, scheduled the first time a reader is assigned it. */
export const fetchVersion = internalAction({
  args: { version: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const got = await fetchFromPostHog({ version: args.version });
    if (got) await ctx.runMutation(internal.answerPrompts.store, { ...got, isProduction: false });
    return null;
  },
});
