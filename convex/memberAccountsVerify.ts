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

/**
 * One key per account a page links: "x:senschumer", "youtube:handle:repfine",
 * "youtube:channel:UC-ABttxh8uQv_10qmwGaidw". Names are lower-cased because
 * those platforms ignore case; a YouTube channel id keeps its case because
 * YouTube does not. YouTube's @handles, /user/ names, /c/ names and bare
 * custom addresses are separate namespaces (the same word can be two
 * different channels), so each has its own key.
 */
export type LinkKey = string;

const HREF = /href\s*=\s*["']([^"'\s>]+)["']/gi;

/**
 * Every account a page's HTML links, as keys. Only links to an account itself
 * count: a link to a post, a tweet, a photo or a share box names someone, but
 * a page can embed or mention other people's posts.
 */
export function linkedAccounts(html: string): Set<LinkKey> {
  const keys = new Set<LinkKey>();
  for (const match of withoutEmbeds(html).matchAll(HREF)) {
    const key = linkKey(match[1].replace(/&amp;/g, "&"));
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * An embedded tweet, Instagram post or Facebook post quotes someone else's
 * words, and its markup links whoever it mentions
 * ("twitter.com/HouseAdmin?ref_src=twsrc%5Etfw"). Those links say nothing about
 * the member's own accounts, so the embeds are cut out before reading links.
 * The member's own timeline widget is an <a class="twitter-timeline">, not a
 * blockquote, and stays. An Instagram embed of a whole profile (its permalink
 * is the profile, not a post) is the member showing their own account, so it
 * is kept as one link to that profile; linkKey drops a post's permalink.
 */
const EMBEDS = [
  /<blockquote\b[^>]*class\s*=\s*["'][^"']*\b(?:twitter-tweet|twitter-video|instagram-media|tiktok-embed)\b[^"']*["'][^>]*>[\s\S]*?<\/blockquote>/gi,
  /<div\b[^>]*class\s*=\s*["'][^"']*\bfb-(?:post|video|comment-embed)\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
];
const INSTAGRAM_PERMALINK = /\bclass\s*=\s*["'][^"']*\binstagram-media\b[\s\S]*?data-instgrm-permalink\s*=\s*["']([^"']+)["']|data-instgrm-permalink\s*=\s*["']([^"']+)["'][^>]*\bclass\s*=\s*["'][^"']*\binstagram-media\b/i;

export function withoutEmbeds(html: string): string {
  return EMBEDS.reduce(
    (out, pattern) =>
      out.replace(pattern, (block) => {
        const permalink = INSTAGRAM_PERMALINK.exec(block.slice(0, block.indexOf(">") + 1));
        const href = permalink?.[1] ?? permalink?.[2];
        return href ? ` <a href="${href}"></a> ` : " ";
      }),
    html,
  );
}

const NOT_ACCOUNTS = new Set([
  "share", "sharer", "sharer.php", "intent", "home", "search", "hashtag", "i", "tr", "plugins",
  "dialog", "embed", "watch", "p", "reel", "reels", "explore", "privacy", "policies", "about", "login", "signup",
  "photo.php", "playlist", "results", "shorts", "events", "groups", "story.php", "permalink.php", "tv", "stories",
]);

/** Pages of a YouTube channel ("/videos") still point at that channel. */
const YOUTUBE_TABS = new Set(["videos", "featured", "streams", "shorts", "playlists", "community", "about", "live", "podcasts"]);

/** The key for one link, or null when it is not a link to an account. */
export function linkKey(href: string): LinkKey | null {
  let url: URL;
  try {
    url = new URL(href.startsWith("//") ? `https:${href}` : href);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  const ok = (name: string) => name !== "" && !NOT_ACCOUNTS.has(name.toLowerCase());

  if (host === "x.com" || host === "twitter.com") {
    // twitter.com/intent/follow?screen_name=Handle is a follow button: an account.
    if (first === "intent" && parts[1] === "follow") {
      const name = url.searchParams.get("screen_name") ?? "";
      return /^[A-Za-z0-9_]{1,15}$/.test(name) ? `x:${name.toLowerCase()}` : null;
    }
    // Old sites link "twitter.com/#!/Handle", which puts the handle in the hash.
    const path = parts.length > 0 ? parts : url.hash.startsWith("#!/") ? url.hash.slice(3).split("/").filter(Boolean) : [];
    // x.com/Someone/status/123 is a tweet, not an account.
    if (path.length !== 1) return null;
    const handle = path[0].replace(/^@/, "");
    return ok(handle) && /^[A-Za-z0-9_]{1,15}$/.test(handle) ? `x:${handle.toLowerCase()}` : null;
  }
  if (host === "facebook.com" || host === "fb.com") {
    if (first === "profile.php" && parts.length === 1) {
      const id = url.searchParams.get("id");
      return id && /^\d+$/.test(id) ? `facebook:${id}` : null;
    }
    // facebook.com/people/Rep-Clay-Fuller/61570681866170 and the older
    // facebook.com/pages/Tom-McClintock/81125319109: the number is the page.
    if (first === "people" || first === "pages") {
      return parts.length === 3 && /^\d+$/.test(parts[2]) ? `facebook:${parts[2]}` : null;
    }
    // facebook.com/pg/Page/posts is the page's own posts tab: still the page.
    const path = first === "pg" ? parts.slice(1, 2) : parts;
    // facebook.com/Page/posts/123 is a post on a page.
    if (path.length !== 1) return null;
    const name = path[0];
    // Facebook usernames cannot contain an underscore; post ids do.
    if (!ok(name) || name.includes("_")) return null;
    return `facebook:${name.toLowerCase()}`;
  }
  if (host === "instagram.com") {
    return parts.length === 1 && ok(first) ? `instagram:${first.toLowerCase()}` : null;
  }
  if (host === "youtube.com") {
    const tabOnly = (rest: string[]) => rest.every((p) => YOUTUBE_TABS.has(p.toLowerCase()));
    if (first === "channel" && parts[1] && tabOnly(parts.slice(2))) return `youtube:channel:${parts[1]}`;
    if (first.startsWith("@") && tabOnly(parts.slice(1))) return `youtube:handle:${first.slice(1).toLowerCase()}`;
    if ((first === "user" || first === "c") && parts[1] && tabOnly(parts.slice(2))) {
      return `youtube:${first}:${parts[1].toLowerCase()}`;
    }
    // youtube.com/housedems: an old-style custom address.
    if (parts.length >= 1 && ok(first) && tabOnly(parts.slice(1))) return `youtube:custom:${first.toLowerCase()}`;
    return null;
  }
  return null;
}

/** What a confirmed account shows the reader: where it goes, and what it says. */
export interface ShownAccount {
  url: string;
  label: string;
}

/** YouTube's name namespaces, in the order a name is looked for, and each one's address. */
const YOUTUBE_NAMES: Array<[string, (name: string) => string]> = [
  ["handle", (n) => `https://www.youtube.com/@${n}`],
  ["user", (n) => `https://www.youtube.com/user/${n}`],
  ["c", (n) => `https://www.youtube.com/c/${n}`],
  ["custom", (n) => `https://www.youtube.com/${n}`],
];

/**
 * Whether the member's own site links this account, and if so exactly what to
 * show. The reader is only ever sent to an address the site itself linked.
 *
 * YouTube needs care: the file can carry a channel id and a name, and a
 * member's site may link either, in any of YouTube's four address forms
 * (@handle, /user/, /c/, or a bare custom address), which are separate
 * namespaces. So the account is confirmed by whichever the site links, and
 * the reader goes to that exact form; a name is printed only when the site
 * linked that name, so a stale channel id can never ride on a confirmed name.
 */
export function confirmOnPage(
  page: Set<LinkKey>,
  account: { platform: Platform; url: string; label: string },
): ShownAccount | null {
  const own = linkKey(account.url);
  if (account.platform !== "youtube") {
    return own && page.has(own) ? { url: account.url, label: account.label } : null;
  }
  const name = account.label === "Channel" ? null : account.label.replace(/^@/, "");
  if (own && page.has(own)) {
    if (!own.startsWith("youtube:channel:")) return { url: account.url, label: account.label };
    return { url: account.url, label: name && page.has(`youtube:handle:${name.toLowerCase()}`) ? `@${name}` : "Channel" };
  }
  if (!name) return null;
  for (const [namespace, address] of YOUTUBE_NAMES) {
    if (page.has(`youtube:${namespace}:${name.toLowerCase()}`)) {
      return { url: address(name), label: namespace === "handle" ? `@${name}` : name };
    }
  }
  return null;
}

/** Whether the member's own site links this account. */
export function isLinkedFrom(page: Set<LinkKey>, platform: Platform, url: string, label: string): boolean {
  return confirmOnPage(page, { platform, url, label }) !== null;
}

export interface SiteCheck {
  status: "ok" | "blocked" | "failed";
  /** The account links on the page, sorted; empty unless `ok`. */
  links: LinkKey[];
}

const SITE_TIMEOUT_MS = 20_000;
/** Larger than any member's home page; a page past this is cut, not refused. */
const MAX_PAGE_CHARS = 3_000_000;
/**
 * Far more account links than any member's home page has once posts and
 * embeds are excluded; it only bounds what one mutation receives. Matching
 * uses all of them; a row stores fewer (`MAX_STORED_LINKS` in memberAccounts.ts).
 */
const MAX_LINKS = 2000;
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
    // A .gov address that redirects off .gov (to a campaign site, say) is not
    // the member's official page.
    if (response.url && !isOfficialHost(response.url)) return { status: "failed", links: [] };
    const html = (await response.text()).slice(0, MAX_PAGE_CHARS);
    if (looksBlocked(html)) return { status: "blocked", links: [] };
    return { status: "ok", links: [...linkedAccounts(html)].sort().slice(0, MAX_LINKS) };
  } catch {
    return { status: "failed", links: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** https on house.gov or senate.gov, the only hosts a member's official page lives on. */
export function isOfficialHost(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (host === "house.gov" || host.endsWith(".house.gov") || host === "senate.gov" || host.endsWith(".senate.gov"))
    );
  } catch {
    return false;
  }
}

/** A firewall's refusal page, served with a 200 ("Senate.gov - Unauthorized"). */
export function looksBlocked(html: string): boolean {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
  return /unauthori[sz]ed|access denied|request rejected|attention required|just a moment/i.test(title);
}
