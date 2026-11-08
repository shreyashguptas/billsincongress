/**
 * Members' official social media accounts, from the congress-legislators
 * project (https://github.com/unitedstates/congress-legislators), plus our own
 * reviewed fixes (convex/memberAccountOverrides.ts).
 *
 * The rule the whole feature rests on: an account is shown only when that
 * project lists it (its policy is official, taxpayer-funded accounts only,
 * checked against the member's own website) or when an override cites the
 * member's own .gov page linking it. Nothing is ever guessed, so every value is
 * checked against a strict pattern and dropped when it does not fit.
 *
 * Pure module (no Convex imports) so it carries unit tests
 * (convex/memberAccountsParse.test.ts).
 */

export const PLATFORMS = ["x", "facebook", "instagram", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type AccountSource = "congress-legislators" | "override";

export interface MemberAccount {
  platform: Platform;
  /** What the reader sees beside the platform's name: "@SenSchumer", "senschumer". */
  label: string;
  url: string;
  source: AccountSource;
  /** For an override: the member's own .gov page that links the account. */
  proofUrl?: string;
}

export interface MemberRecord {
  bioguideId: string;
  name: string;
  chamber: "house" | "senate";
  state: string;
  /** "D", "R", "I" or another one-letter code, from the member's latest term. */
  party?: string;
  /** House only; 0 for an at-large seat. */
  district?: number;
  officialWebsiteUrl?: string;
  accounts: MemberAccount[];
  /**
   * Overrides for this member that the source has moved past (see
   * `overrideStatus`). A report for a person only: the overrides still apply.
   */
  overrideFindings?: OverrideFinding[];
}

/**
 * What today's source file says about a reviewed fix:
 * - "redundant": the source now carries the same account, so the override can go;
 * - "stale": the source now carries a different account from both ours and the
 *   one ours replaced, so the member's account changed again (or the project
 *   fixed it differently) and our override is hiding that.
 */
export type OverrideStatus = "redundant" | "stale";

export interface OverrideFinding {
  platform: Platform;
  status: OverrideStatus;
  /** The account the source carries on that platform today, or "" for none. */
  sourceUrl: string;
}

const PARTY_CODES: Record<string, string> = { Democrat: "D", Republican: "R", Independent: "I", Libertarian: "L" };

/** The one-letter code the rest of the site uses for a party name. */
export function partyCode(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  return PARTY_CODES[raw.trim()] ?? raw.trim().charAt(0).toUpperCase();
}

/** A reviewed fix: add or replace one account, or hide one the source lists. */
export type AccountOverride =
  | {
      bioguideId: string;
      platform: Platform;
      action: "set";
      /**
       * The handle. For YouTube: the @handle, the channel id (UC…), or the
       * exact form the member's site links ("c/Name", "user/Name", "/Name").
       */
      value: string;
      /** The member's own .house.gov / .senate.gov page that links it. */
      proofUrl: string;
      /** When a person checked it, YYYY-MM-DD. */
      checked: string;
      /**
       * The source's value this replaces, as the source file had it when
       * checked (for YouTube, its `youtube_id` when it has one), or null when
       * the source had nothing. It tells "the project has not taken our fix
       * yet" (the source still says this) from "the account changed again".
       */
      replaces: string | null;
    }
  | {
      bioguideId: string;
      platform: Platform;
      action: "hide";
      proofUrl: string;
      checked: string;
      /** The source's value that is hidden, as for a "set" override. */
      replaces: string;
      /** Why it is hidden, for the next reader of the file. */
      reason: string;
    };

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
// Facebook usernames are letters, digits and dots; older pages and profiles
// are a long number instead. Both work at facebook.com/<value>.
const FACEBOOK_NAME = /^[A-Za-z0-9.-]{3,80}$/;
const INSTAGRAM_HANDLE = /^[A-Za-z0-9_.]{1,30}$/;
const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const YOUTUBE_HANDLE = /^[A-Za-z0-9_.-]{3,40}$/;

/**
 * One account from a raw value, or null when the value does not look like that
 * platform's handle. Leading "@" is tolerated (the source has carried it
 * before) and removed.
 */
export function accountFrom(
  platform: Platform,
  raw: unknown,
  source: AccountSource,
  proofUrl?: string,
): MemberAccount | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const value = String(raw).trim().replace(/^@/, "");
  const base = { platform, source, ...(proofUrl ? { proofUrl } : {}) };
  switch (platform) {
    case "x":
      return X_HANDLE.test(value) ? { ...base, label: `@${value}`, url: `https://x.com/${value}` } : null;
    case "facebook":
      if (!FACEBOOK_NAME.test(value)) return null;
      // A bare number is a page id, not something a reader recognises.
      return { ...base, label: /^\d+$/.test(value) ? "Page" : value, url: `https://www.facebook.com/${value}` };
    case "instagram":
      return INSTAGRAM_HANDLE.test(value)
        ? { ...base, label: `@${value}`, url: `https://www.instagram.com/${value}/` }
        : null;
    case "youtube":
      // A channel id survives every rename, so it wins when both are known.
      if (YOUTUBE_CHANNEL_ID.test(value)) {
        return { ...base, label: "Channel", url: `https://www.youtube.com/channel/${value}` };
      }
      // An override can keep the exact form a member's site links:
      // "c/RepJimHimes", "user/repgregorymeeks", or "/RepBeatty" for an old
      // custom address. RepBeatty is a 404 at /@ and at /c/, so the form matters.
      {
        const path = /^(c\/|user\/|\/)([A-Za-z0-9_.-]{3,40})$/.exec(String(raw).trim());
        if (path) {
          const prefix = path[1] === "/" ? "" : path[1];
          return { ...base, label: path[2], url: `https://www.youtube.com/${prefix}${path[2]}` };
        }
      }
      // The source's README says youtube.com/user/<name>, but its names are now
      // @handles: /user/repemiliasykes is a 404 and /@repemiliasykes is her
      // channel (checked 2026-11-01).
      return YOUTUBE_HANDLE.test(value)
        ? { ...base, label: `@${value}`, url: `https://www.youtube.com/@${value}` }
        : null;
  }
}

function youtubeAccount(social: Record<string, unknown>): MemberAccount | null {
  const byId = accountFrom("youtube", social.youtube_id, "congress-legislators");
  const byName = accountFrom("youtube", social.youtube, "congress-legislators");
  if (byId && byName) return { ...byId, label: byName.label };
  return byId ?? byName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An official site, only when it is https on a house.gov or senate.gov host. */
export function officialWebsite(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const official =
      host === "house.gov" ||
      host.endsWith(".house.gov") ||
      host === "senate.gov" ||
      host.endsWith(".senate.gov");
    if (!official || url.protocol !== "https:") return undefined;
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export interface BuildResult {
  records: MemberRecord[];
  /** Values in the source that failed their platform's pattern and were dropped. */
  rejected: number;
}

/**
 * Join `legislators-current.json` and `legislators-social-media.json` on the
 * bioguide id, then apply the overrides. Throws when either file is not the
 * shape we expect, so a broken download can never be read as "nobody has
 * accounts".
 */
export function buildMemberRecords(
  current: unknown,
  social: unknown,
  overrides: readonly AccountOverride[],
): BuildResult {
  if (!Array.isArray(current)) throw new Error("legislators-current is not a list");
  if (!Array.isArray(social)) throw new Error("legislators-social-media is not a list");

  const socialById = new Map<string, Record<string, unknown>>();
  for (const entry of social) {
    if (!isRecord(entry) || !isRecord(entry.id) || !isRecord(entry.social)) continue;
    const id = entry.id.bioguide;
    if (typeof id === "string") socialById.set(id, entry.social);
  }

  let rejected = 0;
  const records: MemberRecord[] = [];
  for (const member of current) {
    if (!isRecord(member) || !isRecord(member.id) || !isRecord(member.name)) continue;
    const bioguideId = member.id.bioguide;
    const terms = member.terms;
    if (typeof bioguideId !== "string" || !Array.isArray(terms) || terms.length === 0) continue;
    const term = terms[terms.length - 1];
    if (!isRecord(term) || (term.type !== "rep" && term.type !== "sen")) continue;

    const name =
      typeof member.name.official_full === "string"
        ? member.name.official_full
        : [member.name.first, member.name.last].filter((s) => typeof s === "string").join(" ");

    const accounts: MemberAccount[] = [];
    const s = socialById.get(bioguideId) ?? {};
    const candidates: Array<[Platform, unknown, MemberAccount | null]> = [
      ["x", s.twitter, accountFrom("x", s.twitter, "congress-legislators")],
      ["facebook", s.facebook, accountFrom("facebook", s.facebook, "congress-legislators")],
      ["instagram", s.instagram, accountFrom("instagram", s.instagram, "congress-legislators")],
      ["youtube", s.youtube_id ?? s.youtube, youtubeAccount(s)],
    ];
    for (const [, raw, account] of candidates) {
      if (account) accounts.push(account);
      else if (raw !== undefined && raw !== null && raw !== "") rejected++;
    }

    const party = partyCode(term.party);
    const district = term.type === "rep" && typeof term.district === "number" && term.district >= 0 ? term.district : undefined;
    records.push({
      bioguideId,
      name,
      chamber: term.type === "sen" ? "senate" : "house",
      state: typeof term.state === "string" ? term.state : "",
      ...(party ? { party } : {}),
      ...(district !== undefined ? { district } : {}),
      ...(officialWebsite(term.url) ? { officialWebsiteUrl: officialWebsite(term.url) } : {}),
      accounts,
    });
  }

  return { records: applyOverrides(records, overrides), rejected };
}

/**
 * Apply reviewed fixes. An override for someone not in office does nothing.
 * Each record also gets `overrideFindings`: the overrides the source has moved
 * past, judged against the source's own accounts before any override applied.
 */
export function applyOverrides(
  records: MemberRecord[],
  overrides: readonly AccountOverride[],
): MemberRecord[] {
  const byId = new Map(records.map((r) => [r.bioguideId, r]));
  const fromSource = new Map(records.map((r) => [r.bioguideId, [...r.accounts]]));
  for (const o of overrides) {
    const record = byId.get(o.bioguideId);
    if (!record) continue;
    const source = fromSource.get(o.bioguideId)?.find((a) => a.platform === o.platform);
    const status = overrideStatus(o, source);
    if (status) {
      const finding = { platform: o.platform, status, sourceUrl: source?.url ?? "" };
      record.overrideFindings = [...(record.overrideFindings ?? []), finding];
    }
    const others = record.accounts.filter((a) => a.platform !== o.platform);
    if (o.action === "hide") {
      record.accounts = others;
      continue;
    }
    const account = accountFrom(o.platform, o.value, "override", o.proofUrl);
    if (!account) throw new Error(`override for ${o.bioguideId} ${o.platform} is not a valid handle`);
    record.accounts = [...others, account];
  }
  for (const record of records) {
    record.accounts = sortAccounts(record.accounts);
    if (record.overrideFindings) record.overrideFindings = sortAccounts(record.overrideFindings);
  }
  return records;
}

/**
 * Whether the source has caught up with a reviewed fix ("redundant"), moved
 * past it ("stale"), or still says what the fix replaced (null: the override
 * is still needed). `source` is the source's own account on that platform,
 * before overrides.
 *
 * Accounts are compared ignoring case (handles on all four platforms are).
 * A YouTube account is its channel id and its name, either of which the
 * member's site may link (`confirmOnPage` confirms by either, the name in any
 * of YouTube's address forms), so a YouTube override is the same as the
 * source when they share the channel id or the name: "c/RepJimHimes" and a
 * source carrying the name RepJimHimes beside its channel id. A source that
 * keeps the channel id our fix replaced is not "stale", whatever name sits
 * beside it, and is "redundant" once that name is ours, even when that id is
 * another channel (Rep. Clarke's): deleting the override then changes nothing
 * a reader sees, since `confirmOnPage` sends the reader to the form the
 * member's site links, never to a channel id it does not. So an upstream YouTube
 * fix must write the name the member's site links in `youtube` as well as
 * the channel id (step 2 of "Sending corrections upstream"): one with only a
 * channel id reads "stale" here, since a name and an id cannot be compared
 * without visiting YouTube.
 */
export function overrideStatus(o: AccountOverride, source: MemberAccount | undefined): OverrideStatus | null {
  const now = accountKeys(source);
  const ours = o.action === "hide" ? [] : accountKeys(accountFrom(o.platform, o.value, "override"));
  const replaced = o.replaces === null ? [] : accountKeys(accountFrom(o.platform, o.replaces, "congress-legislators"));
  // A hide is done once the source has nothing there.
  if (ours.length === 0 ? now.length === 0 : ours.some((k) => now.includes(k))) return "redundant";
  // What the fix replaced (or nothing, if it replaced nothing) is still there.
  if (replaced.length === 0 ? now.length === 0 : replaced.some((k) => now.includes(k))) return null;
  return "stale";
}

/** The ways an account can match another; none for no account. */
function accountKeys(account: MemberAccount | null | undefined): string[] {
  if (!account) return [];
  if (account.platform !== "youtube") return [account.url.toLowerCase()];
  const keys: string[] = [];
  const channel = /\/channel\/([^/]+)$/.exec(account.url);
  if (channel) keys.push(`channel:${channel[1].toLowerCase()}`);
  if (account.label !== "Channel") keys.push(`name:${account.label.replace(/^@/, "").toLowerCase()}`);
  return keys;
}

export interface OverrideReport {
  /** Override entries (one per member and platform) with this status. */
  redundant: number;
  stale: number;
  /** The members they belong to, each once, sorted. */
  redundantIds: string[];
  staleIds: string[];
}

/** Totals of `overrideFindings` across a sync, for its log line. */
export function overrideReport(records: readonly MemberRecord[]): OverrideReport {
  const report: OverrideReport = { redundant: 0, stale: 0, redundantIds: [], staleIds: [] };
  for (const record of records) {
    for (const status of ["redundant", "stale"] as const) {
      const n = (record.overrideFindings ?? []).filter((f) => f.status === status).length;
      if (n === 0) continue;
      report[status] += n;
      report[status === "redundant" ? "redundantIds" : "staleIds"].push(record.bioguideId);
    }
  }
  report.redundantIds.sort();
  report.staleIds.sort();
  return report;
}

/** Always the same order on the page: X, Facebook, Instagram, YouTube. */
export function sortAccounts<T extends { platform: Platform }>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform));
}

/** Members and accounts a healthy download carries, in round numbers. */
export const MIN_MEMBERS = 480;
export const MAX_MEMBERS = 560;
/** Accounts that may vanish in one run from members who are still in office. */
export const MAX_ACCOUNTS_DROPPED = 40;

/**
 * Why a sync must not be written, or null when it looks healthy. A member
 * leaving takes their accounts with them, and a new Congress replaces dozens of
 * members at once, so only accounts dropped by members who STAY are counted:
 * that is what a broken or truncated file looks like.
 */
export function safetyProblem(input: { members: number; accountsDroppedFromStayingMembers: number }): string | null {
  if (input.members < MIN_MEMBERS) return `only ${input.members} members in the download`;
  if (input.members > MAX_MEMBERS) return `${input.members} members in the download`;
  if (input.accountsDroppedFromStayingMembers > MAX_ACCOUNTS_DROPPED) {
    return `${input.accountsDroppedFromStayingMembers} accounts would disappear from members still in office`;
  }
  return null;
}

/** Stable text for "did this member's row change", independent of key order. */
export function recordFingerprint(record: Omit<MemberRecord, "bioguideId">): string {
  return JSON.stringify([
    record.name,
    record.chamber,
    record.state,
    record.party ?? "",
    record.district ?? "",
    record.officialWebsiteUrl ?? "",
    record.accounts.map((a) => [a.platform, a.label, a.url, a.source, a.proofUrl ?? ""]),
    // Only when present, so rows with nothing to report keep their fingerprint.
    ...(record.overrideFindings?.length
      ? [record.overrideFindings.map((f) => [f.platform, f.status, f.sourceUrl])]
      : []),
  ]);
}
