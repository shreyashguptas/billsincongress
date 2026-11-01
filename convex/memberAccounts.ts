/**
 * Members' official social media accounts: suggested by a volunteer file,
 * confirmed by the member's own government website.
 *
 * No government source lists members' social media. So two steps, daily:
 *
 * 1. `sync` (07:40 UTC) copies the congress-legislators project's two JSON
 *    files (current members, and their social media) from its GitHub Pages
 *    mirror, joins them in convex/memberAccountsParse.ts, applies our
 *    reviewed fixes (convex/memberAccountOverrides.ts), and writes the
 *    SUGGESTED accounts to `memberAccounts`, only the rows that changed.
 * 2. `checkSites` (08:10 UTC) fetches each member's official .house.gov or
 *    .senate.gov home page and marks an account confirmed only when that page
 *    links that exact account (convex/memberAccountsVerify.ts).
 *
 * A page shows an account only once it is confirmed (`officialAccounts`).
 * senate.gov refuses automated visits from some networks; a blocked or failed
 * check leaves the last result alone, and a confirmation not renewed by a
 * successful check for 30 days lapses.
 *
 * A download that looks broken is not written at all (`safetyProblem`), so a
 * truncated or reshaped file can never wipe the table; the run logs a warning
 * and yesterday's copy stays. When a person has looked and the change is
 * real, run it once with `force`:
 *
 *   pnpm exec convex run --prod memberAccounts:sync '{"force":true}'
 *
 * Accounts the member's site does not confirm, and the accounts it links
 * instead, are listed by `reviewList` for a person to check:
 *
 *   pnpm exec convex run --prod memberAccounts:reviewList '{}'
 *
 * One PostHog log line per run of each step, counts only
 * (documentation/analytics.md, "PostHog Logs").
 */
import { v, type Infer } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { scheduleLog } from "./posthogLogs";
import { ACCOUNT_OVERRIDES } from "./memberAccountOverrides";
import {
  buildMemberRecords,
  recordFingerprint,
  safetyProblem,
  type MemberAccount,
} from "./memberAccountsParse";
import { checkOfficialSite, isLinkedFrom, type SiteCheck } from "./memberAccountsVerify";

const SOURCE_BASE = "https://unitedstates.github.io/congress-legislators";
const FETCH_TIMEOUT_MS = 30_000;
/** Far above every member who has ever served since this table began. */
const MAX_ROWS = 5000;
/** Official sites fetched at once by `checkSites`. */
const SITE_CONCURRENCY = 8;
/** Results written per mutation by `checkSites`. */
const RESULTS_PER_WRITE = 60;
/** A confirmation lapses when no check has succeeded for this long. */
export const CONFIRMATION_LAPSES_MS = 30 * 24 * 60 * 60 * 1000;

const platformValidator = v.union(v.literal("x"), v.literal("facebook"), v.literal("instagram"), v.literal("youtube"));

const accountValidator = v.object({
  platform: platformValidator,
  label: v.string(),
  url: v.string(),
  source: v.union(v.literal("congress-legislators"), v.literal("override")),
  proofUrl: v.optional(v.string()),
});

const recordValidator = v.object({
  bioguideId: v.string(),
  name: v.string(),
  chamber: v.union(v.literal("house"), v.literal("senate")),
  state: v.string(),
  officialWebsiteUrl: v.optional(v.string()),
  accounts: v.array(accountValidator),
});

const applyResult = v.object({
  written: v.boolean(),
  problem: v.optional(v.string()),
  members: v.number(),
  accounts: v.number(),
  added: v.number(),
  changed: v.number(),
  left: v.number(),
});

async function fetchJson(file: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${SOURCE_BASE}/${file}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export const sync = internalAction({
  args: { force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    let result: Infer<typeof applyResult>;
    let rejected = 0;
    try {
      const [current, social] = await Promise.all([
        fetchJson("legislators-current.json"),
        fetchJson("legislators-social-media.json"),
      ]);
      const built = buildMemberRecords(current, social, ACCOUNT_OVERRIDES);
      rejected = built.rejected;
      result = await ctx.runMutation(internal.memberAccounts.apply, {
        records: built.records,
        force: args.force ?? false,
        now: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[member accounts] sync failed:", error);
      await scheduleLog(ctx, {
        level: "error",
        message: "member accounts sync failed",
        timestampMs: Date.now(),
        attributes: { error_kind: errorKind(error) },
      });
      return null;
    }

    if (!result.written) console.warn(`[member accounts] not written: ${result.problem}`);
    await scheduleLog(ctx, {
      level: result.written ? "info" : "warn",
      message: result.written ? "member accounts synced" : "member accounts sync refused",
      timestampMs: Date.now(),
      attributes: {
        members: result.members,
        accounts: result.accounts,
        added: result.added,
        changed: result.changed,
        left: result.left,
        rejected,
        overrides: ACCOUNT_OVERRIDES.length,
        forced: args.force ?? false,
        ...(result.problem ? { problem: result.problem } : {}),
      },
    });
    return null;
  },
});

/** A fixed label, never the message: a fetch error can carry a long body. */
function errorKind(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "timeout";
    if (/^legislators-[a-z-]+\.json: HTTP \d+$/.test(error.message)) return error.message;
    if (error instanceof SyntaxError) return "bad_json";
    if (/is not a list$/.test(error.message)) return "bad_shape";
    if (/^override for /.test(error.message)) return "bad_override";
  }
  return "other";
}

type StoredAccount = Doc<"memberAccounts">["accounts"][number];

/**
 * The suggested accounts, keeping a confirmation only for an account whose
 * link is unchanged: a new or changed account waits for the next site check.
 */
function carryConfirmations(next: MemberAccount[], previous: StoredAccount[]): StoredAccount[] {
  const confirmed = new Map(previous.filter((a) => a.confirmedAt).map((a) => [a.url, a.confirmedAt]));
  return next.map((a) => {
    const confirmedAt = confirmed.get(a.url);
    return confirmedAt ? { ...a, confirmedAt } : a;
  });
}

export const apply = internalMutation({
  args: { records: v.array(recordValidator), force: v.boolean(), now: v.string() },
  returns: applyResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("memberAccounts").take(MAX_ROWS);
    const byId = new Map(existing.map((row) => [row.bioguideId, row]));
    const incomingIds = new Set(args.records.map((r) => r.bioguideId));

    // What a staying member loses is the signal of a broken file.
    let dropped = 0;
    for (const record of args.records) {
      const row = byId.get(record.bioguideId);
      if (!row?.inOffice) continue;
      const kept = new Set(record.accounts.map((a) => a.platform));
      dropped += row.accounts.filter((a) => !kept.has(a.platform)).length;
    }
    const accounts = args.records.reduce((sum, r) => sum + r.accounts.length, 0);
    const problem = safetyProblem({ members: args.records.length, accountsDroppedFromStayingMembers: dropped });
    const counts = { members: args.records.length, accounts, added: 0, changed: 0, left: 0 };
    if (problem && !args.force) return { written: false, problem, ...counts };

    for (const record of args.records) {
      const { bioguideId, ...rest } = record;
      const fingerprint = recordFingerprint(rest);
      const row = byId.get(bioguideId);
      if (!row) {
        await ctx.db.insert("memberAccounts", { bioguideId, ...rest, inOffice: true, fingerprint, changedAt: args.now });
        counts.added++;
      } else if (row.fingerprint !== fingerprint || !row.inOffice) {
        await ctx.db.replace("memberAccounts", row._id, {
          bioguideId,
          ...rest,
          accounts: carryConfirmations(rest.accounts, row.accounts),
          inOffice: true,
          ...(row.siteCheck ? { siteCheck: row.siteCheck } : {}),
          fingerprint,
          changedAt: args.now,
        });
        counts.changed++;
      }
    }
    for (const row of existing) {
      if (row.inOffice && !incomingIds.has(row.bioguideId)) {
        await ctx.db.patch("memberAccounts", row._id, { inOffice: false, changedAt: args.now });
        counts.left++;
      }
    }
    return { written: true, ...(problem ? { problem } : {}), ...counts };
  },
});

/** Every in-office member's official website, for `checkSites`. */
export const sitesToCheck = internalQuery({
  args: {},
  returns: v.array(v.object({ bioguideId: v.string(), url: v.string() })),
  handler: async (ctx) => {
    const rows = await ctx.db.query("memberAccounts").take(MAX_ROWS);
    return rows
      .filter((r) => r.inOffice && r.officialWebsiteUrl)
      .map((r) => ({ bioguideId: r.bioguideId, url: r.officialWebsiteUrl as string }));
  },
});

const siteResultValidator = v.object({
  bioguideId: v.string(),
  status: v.union(v.literal("ok"), v.literal("blocked"), v.literal("failed")),
  links: v.array(v.string()),
});

/** Run `fn` over `items`, at most `limit` at a time. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const checkSites = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const sites = await ctx.runQuery(internal.memberAccounts.sitesToCheck, {});
    const results = await mapLimit(sites, SITE_CONCURRENCY, async (site) => {
      const check: SiteCheck = await checkOfficialSite(site.url);
      return { bioguideId: site.bioguideId, ...check };
    });
    const now = new Date().toISOString();
    const totals = { confirmed: 0, unconfirmed: 0 };
    for (let i = 0; i < results.length; i += RESULTS_PER_WRITE) {
      const written = await ctx.runMutation(internal.memberAccounts.recordSiteChecks, {
        results: results.slice(i, i + RESULTS_PER_WRITE),
        now,
      });
      totals.confirmed += written.confirmed;
      totals.unconfirmed += written.unconfirmed;
    }
    const count = (status: string) => results.filter((r) => r.status === status).length;
    await scheduleLog(ctx, {
      level: count("failed") > results.length / 10 ? "warn" : "info",
      message: "member sites checked",
      timestampMs: Date.now(),
      attributes: {
        sites: results.length,
        ok: count("ok"),
        blocked: count("blocked"),
        failed: count("failed"),
        accounts_confirmed: totals.confirmed,
        accounts_unconfirmed: totals.unconfirmed,
      },
    });
    return null;
  },
});

export const recordSiteChecks = internalMutation({
  args: { results: v.array(siteResultValidator), now: v.string() },
  returns: v.object({ confirmed: v.number(), unconfirmed: v.number() }),
  handler: async (ctx, args) => {
    const totals = { confirmed: 0, unconfirmed: 0 };
    const nowMs = Date.parse(args.now);
    for (const result of args.results) {
      const row = await ctx.db
        .query("memberAccounts")
        .withIndex("by_bioguideId", (q) => q.eq("bioguideId", result.bioguideId))
        .unique();
      if (!row) continue;
      let accounts: StoredAccount[];
      let lastOkAt = row.siteCheck?.lastOkAt;
      if (result.status === "ok") {
        const page = new Set(result.links);
        accounts = row.accounts.map(({ confirmedAt: _old, ...a }) =>
          isLinkedFrom(page, a.platform, a.url, a.label) ? { ...a, confirmedAt: args.now } : a,
        );
        lastOkAt = args.now;
      } else if (!lastOkAt || nowMs - Date.parse(lastOkAt) > CONFIRMATION_LAPSES_MS) {
        // No successful look at the site for a month: nothing stays confirmed.
        accounts = row.accounts.map(({ confirmedAt: _old, ...a }) => a);
      } else {
        accounts = row.accounts;
      }
      for (const a of accounts) {
        if (a.confirmedAt) totals.confirmed++;
        else totals.unconfirmed++;
      }
      await ctx.db.patch("memberAccounts", row._id, {
        accounts,
        siteCheck: {
          status: result.status,
          checkedAt: args.now,
          ...(lastOkAt ? { lastOkAt } : {}),
          links: result.status === "ok" ? result.links : (row.siteCheck?.links ?? []),
        },
      });
    }
    return totals;
  },
});

/**
 * For a person: every in-office member whose site check did not confirm an
 * account, with what their site links on that platform instead. A fix goes in
 * convex/memberAccountOverrides.ts, citing the member's site.
 */
export const reviewList = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      bioguideId: v.string(),
      name: v.string(),
      chamber: v.string(),
      site: v.string(),
      siteStatus: v.string(),
      unconfirmed: v.array(v.object({ platform: v.string(), url: v.string(), siteLinks: v.array(v.string()) })),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db.query("memberAccounts").take(MAX_ROWS);
    return rows
      .filter((r) => r.inOffice && r.accounts.some((a) => !a.confirmedAt))
      .map((r) => ({
        bioguideId: r.bioguideId,
        name: r.name,
        chamber: r.chamber,
        site: r.officialWebsiteUrl ?? "",
        siteStatus: r.siteCheck?.status ?? "never checked",
        unconfirmed: r.accounts
          .filter((a) => !a.confirmedAt)
          .map((a) => ({
            platform: a.platform,
            url: a.url,
            siteLinks: (r.siteCheck?.links ?? []).filter((key) => key.startsWith(`${a.platform}:`)),
          })),
      }));
  },
});

export interface OfficialAccounts {
  bioguideId: string;
  /** Only the accounts the member's own official website links. */
  accounts: MemberAccount[];
  officialWebsiteUrl: string | null;
}

/**
 * A member's confirmed accounts for a page, or null when we have no row or
 * they are no longer in office (their official accounts are archived or
 * handed on).
 */
export async function officialAccounts(
  ctx: QueryCtx,
  bioguideId: string | undefined,
): Promise<OfficialAccounts | null> {
  if (!bioguideId) return null;
  const row = await ctx.db
    .query("memberAccounts")
    .withIndex("by_bioguideId", (q) => q.eq("bioguideId", bioguideId))
    .unique();
  if (!row?.inOffice) return null;
  return {
    bioguideId: row.bioguideId,
    accounts: row.accounts
      .filter((a) => a.confirmedAt)
      .map(({ platform, label, url, source }) => ({ platform, label, url, source })),
    officialWebsiteUrl: row.officialWebsiteUrl ?? null,
  };
}
