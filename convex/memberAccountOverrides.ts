import type { AccountOverride, Platform } from "./memberAccountsParse";

/**
 * Reviewed fixes to the congress-legislators social media file, applied on
 * every sync (convex/memberAccounts.ts). A fix is still only a suggestion:
 * like every account, it is shown only while the member's own site links it.
 *
 * Every entry must cite the member's own .house.gov or .senate.gov page that
 * links the account, and the date a person checked it. A link found anywhere
 * else (a search result, Wikidata, a campaign site) is never enough: those are
 * how campaign and impostor accounts get in. Party accounts a member's site
 * links in its footer ("House Democrats", "@HouseGOP") are not the member's.
 *
 * Each fix also records what the source carried when it was checked
 * (`replaces`), so the daily sync can report an override the source now
 * matches ("redundant": delete it) or has moved past ("stale": the account
 * changed again, and this entry is hiding the change). The report is on the
 * `member accounts synced` log line and in `memberAccounts:reviewList`.
 *
 * Each fix is also sent upstream as a pull request to congress-legislators;
 * once it is merged there, delete the entry here. The first batch (130
 * entries for 79 members) was merged as unitedstates/congress-legislators#1069
 * and deleted here on 2026-11-23. See "Members' social media
 * accounts" in documentation/overview.md.
 */
export const ACCOUNT_OVERRIDES: readonly AccountOverride[] = [
  // Leadership office accounts. The member's own .gov site links these, so
  // this site shows them; congress-legislators keeps each member's own
  // account instead (review on unitedstates/congress-legislators#1069), as an
  // office account passes to the next officeholder. These stay until a
  // member's site links their own account again or they leave the office.
  // Katherine M. Clark: her Democratic Whip office account.
  ...fromSite("C001101", "https://katherineclark.house.gov", { x: "WhipKClark" }, { x: "RepKClark" }),
  // Tom Emmer: his Majority Whip office account.
  ...fromSite("E000294", "https://emmer.house.gov", { x: "GOPMajorityWhip" }, { x: "RepTomEmmer" }),
  // Mike Johnson: his Speaker's office accounts.
  ...fromSite("J000299", "https://mikejohnson.house.gov", { x: "SpeakerJohnson", facebook: "speakerjohnson", instagram: "speakermjohnson", youtube: "SpeakerJohnson" }, { x: "RepMikeJohnson", facebook: "RepMikeJohnson", instagram: "RepMikeJohnson", youtube: "UCzqBEpeIaDEfvAtsA53Fx2Q" }),

  // A dead link on the member's own site (checked 2026-11-01): Rep.
  // Schweikert's links youtube.com/RepDavidSchweikert, which redirects to a
  // 404, so the channel id the source carries is not shown for him.
  {
    bioguideId: "S001183",
    platform: "youtube",
    action: "hide",
    proofUrl: "https://schweikert.house.gov",
    checked: "2026-11-01",
    replaces: "UCVvuNVzkOUp7p_Pzkc6Zuvw",
    reason: "the YouTube address his site links is a 404",
  },
];

type Accounts = Partial<Record<Platform, string>>;

/**
 * One "set" entry per account a member's own site links, all checked the same
 * day. `replaces` gives, for each of those platforms, what the source file
 * carried that day (its youtube_id for YouTube when it had one), so the daily
 * sync can tell a fix the project has not taken yet from an account that has
 * changed again (`overrideStatus` in convex/memberAccountsParse.ts).
 */
function fromSite<A extends Accounts>(
  bioguideId: string,
  proofUrl: string,
  accounts: A,
  replaces: { [P in keyof A]: string | null },
): AccountOverride[] {
  return (Object.entries(accounts) as Array<[Platform, string]>).map(([platform, value]) => ({
    bioguideId,
    platform,
    action: "set" as const,
    value,
    proofUrl,
    checked: "2026-11-01",
    replaces: (replaces as Accounts)[platform] ?? null,
  }));
}
