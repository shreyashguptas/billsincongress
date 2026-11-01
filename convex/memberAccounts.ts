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
import { checkOfficialSite, confirmOnPage, type SiteCheck } from "./memberAccountsVerify";

const SOURCE_BASE = "https://unitedstates.github.io/congress-legislators";
const FETCH_TIMEOUT_MS = 30_000;
/** Far above every member who has ever served since this table began. */
const MAX_ROWS = 5000;
/** Official sites fetched at once by `checkSites`. */
const SITE_CONCURRENCY = 8;
/**
 * Sites per `checkSites` run, written before the next run is scheduled. At 8
 * at a time and a 20-second timeout, 120 sites take at most 5 minutes, well
 * inside an action's 10, even if every site hangs.
 */
const SITES_PER_RUN = 120;
/** Links kept on a row for the review list; matching always uses every link. */
const MAX_STORED_LINKS = 200;
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
 * link and label are unchanged, on an unchanged official website, confirmed
 * within the last 30 days. Anything else waits for the next site check.
 */
function carryConfirmations(
  next: MemberAccount[],
  previous: StoredAccount[],
  sameWebsite: boolean,
  nowMs: number,
): StoredAccount[] {
  if (!sameWebsite) return next;
  return next.map((a) => {
    const old = previous.find((p) => p.url === a.url && p.label === a.label);
    if (!old?.confirmedAt || !old.shown || nowMs - Date.parse(old.confirmedAt) > CONFIRMATION_LAPSES_MS) return a;
    return { ...a, confirmedAt: old.confirmedAt, shown: old.shown };
  });
}

/** An account with its confirmation removed. */
function unconfirmed({ confirmedAt: _c, shown: _s, ...account }: StoredAccount): StoredAccount {
  return account;
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
          accounts: carryConfirmations(
            rest.accounts,
            row.accounts,
            row.inOffice && row.officialWebsiteUrl === rest.officialWebsiteUrl,
            Date.parse(args.now),
          ),
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

/** One page of in-office members' official websites, in a fixed order, for `checkSites`. */
export const sitesToCheck = internalQuery({
  args: { offset: v.number(), limit: v.number() },
  returns: v.object({
    sites: v.array(v.object({ bioguideId: v.string(), url: v.string() })),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("memberAccounts").withIndex("by_bioguideId").take(MAX_ROWS);
    const all = rows
      .filter((r) => r.inOffice && r.officialWebsiteUrl)
      .map((r) => ({ bioguideId: r.bioguideId, url: r.officialWebsiteUrl as string }));
    return { sites: all.slice(args.offset, args.offset + args.limit), total: all.length };
  },
});

/**
 * The start of each daily check: a member whose site has not been read
 * successfully for 30 days, or who has no official website, loses every
 * confirmation. Without this, a member the check no longer reaches would keep
 * old confirmations for ever.
 */
export const lapseStale = internalMutation({
  args: { now: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const nowMs = Date.parse(args.now);
    let lapsed = 0;
    const rows = await ctx.db.query("memberAccounts").take(MAX_ROWS);
    for (const row of rows) {
      if (!row.inOffice || !row.accounts.some((a) => a.confirmedAt)) continue;
      const lastOkAt = row.siteCheck?.lastOkAt;
      const stale = !row.officialWebsiteUrl || !lastOkAt || nowMs - Date.parse(lastOkAt) > CONFIRMATION_LAPSES_MS;
      if (!stale) continue;
      await ctx.db.patch("memberAccounts", row._id, { accounts: row.accounts.map(unconfirmed) });
      lapsed++;
    }
    return lapsed;
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

const totalsValidator = v.object({
  ok: v.number(),
  blocked: v.number(),
  failed: v.number(),
  confirmed: v.number(),
  unconfirmed: v.number(),
});

/**
 * Check every member's official site, a page of `SITES_PER_RUN` at a time:
 * each run fetches its page, writes the results, and schedules the next, so
 * a slow day can never run past an action's time limit with nothing written.
 */
export const checkSites = internalAction({
  args: { offset: v.optional(v.number()), now: v.optional(v.string()), totals: v.optional(totalsValidator) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const offset = args.offset ?? 0;
    const now = args.now ?? new Date().toISOString();
    const totals = args.totals ?? { ok: 0, blocked: 0, failed: 0, confirmed: 0, unconfirmed: 0 };
    if (offset === 0) await ctx.runMutation(internal.memberAccounts.lapseStale, { now });

    const { sites, total } = await ctx.runQuery(internal.memberAccounts.sitesToCheck, {
      offset,
      limit: SITES_PER_RUN,
    });
    const results = await mapLimit(sites, SITE_CONCURRENCY, async (site) => {
      const check: SiteCheck = await checkOfficialSite(site.url);
      return { bioguideId: site.bioguideId, ...check };
    });
    if (results.length > 0) {
      const written = await ctx.runMutation(internal.memberAccounts.recordSiteChecks, { results, now });
      totals.confirmed += written.confirmed;
      totals.unconfirmed += written.unconfirmed;
    }
    for (const r of results) totals[r.status]++;

    if (offset + SITES_PER_RUN < total) {
      await ctx.scheduler.runAfter(0, internal.memberAccounts.checkSites, { offset: offset + SITES_PER_RUN, now, totals });
      return null;
    }
    const sitesChecked = totals.ok + totals.blocked + totals.failed;
    await scheduleLog(ctx, {
      level: totals.failed > sitesChecked / 10 ? "warn" : "info",
      message: "member sites checked",
      timestampMs: Date.now(),
      attributes: {
        sites: sitesChecked,
        ok: totals.ok,
        blocked: totals.blocked,
        failed: totals.failed,
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
        accounts = row.accounts.map((stored) => {
          const a = unconfirmed(stored);
          const shown = confirmOnPage(page, a);
          return shown ? { ...a, confirmedAt: args.now, shown } : a;
        });
        lastOkAt = args.now;
      } else if (!lastOkAt || nowMs - Date.parse(lastOkAt) > CONFIRMATION_LAPSES_MS) {
        // No successful look at the site for a month: nothing stays confirmed.
        accounts = row.accounts.map(unconfirmed);
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
          links: result.status === "ok" ? result.links.slice(0, MAX_STORED_LINKS) : (row.siteCheck?.links ?? []),
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
  // Only what the latest successful look at the member's site confirmed: a
  // confirmation from any earlier look is not shown, whatever else happened.
  const lastOkAt = row.siteCheck?.lastOkAt;
  return {
    bioguideId: row.bioguideId,
    accounts: row.accounts
      .filter((a) => a.confirmedAt && a.shown && lastOkAt && a.confirmedAt === lastOkAt)
      .map(({ platform, shown, source }) => ({ platform, label: shown!.label, url: shown!.url, source })),
    officialWebsiteUrl: row.officialWebsiteUrl ?? null,
  };
}
