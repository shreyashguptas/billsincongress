/**
 * Checking an account against the member's own official website.
 *
 * No government source lists members' social media. The most official one is
 * the member's own .house.gov or .senate.gov site, which links their official
 * accounts. So an account from the congress-legislators file is shown only
 * once that site links it: the file says what to look for, the member's own
 * site confirms it. These functions read the links out of a page's HTML and
 * match them to an account.
 *
 * Pure module (no Convex imports) so it carries unit tests
 * (convex/memberAccountsVerify.test.ts).
 */
import type { Platform } from "./memberAccountsParse";

/** "x:senschumer", "youtube:channel:uc…": one key per account a page links. */
export type LinkKey = string;

const HREF = /href\s*=\s*["']([^"'\s>]+)["']/gi;

/**
 * Every social link in a page's HTML, as keys. Share and intent links
 * ("x.com/intent/…", "facebook.com/sharer…") are not accounts and are skipped.
 */
export function linkedAccounts(html: string): Set<LinkKey> {
  const keys = new Set<LinkKey>();
  for (const match of html.matchAll(HREF)) {
    const key = linkKey(match[1].replace(/&amp;/g, "&"));
    if (key) keys.add(key);
  }
  return keys;
}

const NOT_ACCOUNTS = new Set([
  "share", "sharer", "sharer.php", "intent", "home", "search", "hashtag", "i", "tr", "plugins",
  "dialog", "embed", "watch", "p", "reel", "reels", "explore", "privacy", "policies", "about", "login", "signup",
  "photo.php", "playlist", "results", "shorts", "events", "groups", "story.php", "permalink.php",
]);

/** The key for one link, or null when it is not a link to an account. */
export function linkKey(href: string): LinkKey | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const first = (parts[0] ?? "").replace(/^@/, "");
  if (host === "x.com" || host === "twitter.com") {
    // Old sites link "twitter.com/#!/Handle", which puts the handle in the hash.
    const handle = first || (url.hash.startsWith("#!/") ? url.hash.slice(3).split("/")[0].replace(/^@/, "") : "");
    return handle && !NOT_ACCOUNTS.has(handle.toLowerCase()) ? `x:${handle.toLowerCase()}` : null;
  }
  if (host === "facebook.com" || host === "fb.com") {
    if (first === "profile.php") {
      const id = url.searchParams.get("id");
      return id && /^\d+$/.test(id) ? `facebook:${id}` : null;
    }
    // facebook.com/people/Rep-Clay-Fuller/61570681866170 and the older
    // facebook.com/pages/Tom-McClintock/81125319109: the number is the page.
    if (first === "people" || first === "pages") {
      return parts[2] && /^\d+$/.test(parts[2]) ? `facebook:${parts[2]}` : null;
    }
    const name = first === "pg" ? (parts[1] ?? "") : first;
    // A post ("1350313_16293265") or anything else with an underscore is not a
    // page: Facebook usernames cannot contain one.
    if (!name || name.includes("_") || NOT_ACCOUNTS.has(name.toLowerCase())) return null;
    return `facebook:${name.toLowerCase()}`;
  }
  if (host === "instagram.com") {
    return first && !NOT_ACCOUNTS.has(first.toLowerCase()) ? `instagram:${first.toLowerCase()}` : null;
  }
  if (host === "youtube.com") {
    if (parts[0] === "channel" && parts[1]) return `youtube:channel:${parts[1].toLowerCase()}`;
    if (parts[0]?.startsWith("@")) return `youtube:name:${first.toLowerCase()}`;
    if ((parts[0] === "user" || parts[0] === "c") && parts[1]) return `youtube:name:${parts[1].toLowerCase()}`;
    // youtube.com/housedems: an old-style custom address.
    if (parts.length === 1 && !NOT_ACCOUNTS.has(first.toLowerCase())) return `youtube:name:${first.toLowerCase()}`;
    return null;
  }
  return null;
}

/**
 * The keys that would show a given account is linked: its handle, and for
 * YouTube either its channel id or its name. Built from the account's own URL
 * and label, so it matches exactly what the reader would be sent to.
 */
export function accountKeys(platform: Platform, url: string, label: string): LinkKey[] {
  const keys: LinkKey[] = [];
  const own = linkKey(url);
  if (own) keys.push(own);
  if (platform === "youtube" && label.startsWith("@")) keys.push(`youtube:name:${label.slice(1).toLowerCase()}`);
  return keys;
}

/** Whether the member's own site links this account. */
export function isLinkedFrom(page: Set<LinkKey>, platform: Platform, url: string, label: string): boolean {
  return accountKeys(platform, url, label).some((key) => page.has(key));
}

export interface SiteCheck {
  status: "ok" | "blocked" | "failed";
  /** The social links on the page, sorted; empty unless `ok`. */
  links: LinkKey[];
}

const SITE_TIMEOUT_MS = 20_000;
/** Larger than any member's home page; a page past this is cut, not refused. */
const MAX_PAGE_CHARS = 3_000_000;
/** More than any real footer carries; bounds what a row stores. */
const MAX_LINKS = 60;
// Who we are, so a site's operators can see what fetched the page and why.
const USER_AGENT = "BillsInCongress/1.0 (+https://billsincongress.com/about; checks members' official social links once a day)";

/**
 * Fetch a member's official home page and read its social links. A refusal
 * (401, 403, 429, or a firewall's "Unauthorized" page) is `blocked`; any other
 * failure is `failed`. Neither confirms nor unconfirms anything. Never throws.
 */
export async function checkOfficialSite(url: string): Promise<SiteCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    if ([401, 403, 429].includes(response.status)) return { status: "blocked", links: [] };
    if (!response.ok) return { status: "failed", links: [] };
    const html = (await response.text()).slice(0, MAX_PAGE_CHARS);
    if (looksBlocked(html)) return { status: "blocked", links: [] };
    return { status: "ok", links: [...linkedAccounts(html)].sort().slice(0, MAX_LINKS) };
  } catch {
    return { status: "failed", links: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** A firewall's refusal page, served with a 200 ("Senate.gov - Unauthorized"). */
export function looksBlocked(html: string): boolean {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
  return /unauthori[sz]ed|access denied|request rejected|attention required|just a moment/i.test(title);
}
