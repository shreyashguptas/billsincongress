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
 * once it is merged there, delete the entry here. See "Members' social media
 * accounts" in documentation/overview.md.
 */
export const ACCOUNT_OVERRIDES: readonly AccountOverride[] = [
  // Members with nothing in the source file, filled from their own sites on
  // 2026-11-01. The five senators who also had nothing (Sheehy, Husted, Moody,
  // Armstrong, Graham) are not here yet: senate.gov refuses automated visits,
  // so a person checks them in a browser. Rep. Wahab's site links only the
  // House Democrats' accounts, so she has none here.
  ...missingFromSource("R000619", "https://rulli.house.gov", { x: "repmichaelrulli", facebook: "RepMikeRulli", instagram: "repmikerulli" }),
  ...missingFromSource("H001098", "https://hamadeh.house.gov", { x: "RepAbeHamadeh", facebook: "RepAbeHamadeh", instagram: "repabehamadeh" }),
  ...missingFromSource("T000491", "https://tran.house.gov", { x: "RepDerekTranCA", facebook: "CongressmanTran", instagram: "repderektran" }),
  ...missingFromSource("M001241", "https://min.house.gov", { x: "CongressMin", facebook: "thecongressmin", instagram: "repdavemin" }),
  ...missingFromSource("R000621", "https://randall.house.gov", { facebook: "RepEmilyRandall", instagram: "repemilyrandall", youtube: "CongresswomanEmilyRandall" }),
  ...missingFromSource("P000622", "https://patronis.house.gov", { x: "PatronisFL", facebook: "61577293801543", instagram: "patronisfl" }),
  ...missingFromSource("F000484", "https://fine.house.gov", { x: "RepFine", facebook: "CongressmanRandyFine", instagram: "repfine", youtube: "RepFine" }),
  ...missingFromSource("W000831", "https://walkinshaw.house.gov", { x: "Rep_Walkinshaw", facebook: "RepJamesWalkinshaw", instagram: "rep_walkinshaw", youtube: "repwalkinshaw" }),
  ...missingFromSource("G000606", "https://grijalva.house.gov", { x: "rep_grijalva", facebook: "repadelitasgrijalva", instagram: "repgrijalva", youtube: "RepGrijalva" }),
  ...missingFromSource("V000139", "https://vanepps.house.gov", { x: "repvanepps", facebook: "RepVanEpps", instagram: "repvaneppstn", youtube: "UChI1UwZkFRh_Fctl9Ah5z8A" }),
  ...missingFromSource("M001245", "https://menefee.house.gov", { x: "RepCDMenefee", facebook: "repcdmenefee", instagram: "repcdmenefee" }),
  ...missingFromSource("F000485", "https://fuller.house.gov", { x: "RepClayFuller", facebook: "61570681866170", instagram: "repclayfuller" }),
  ...missingFromSource("M001246", "https://mejia.house.gov", { x: "RepAnalilia", facebook: "repanalilia", instagram: "repanalilia" }),
  ...missingFromSource("G000607", "https://gallagher.house.gov", { x: "RepGallagherCA1", facebook: "RepJamesGallagher", instagram: "repgallagherca1", youtube: "JamesGallagher_CA01" }),
  // His site's Facebook link is a share link, not the page itself, so it is left out.
  ...missingFromSource("B001328", "https://blair.house.gov", { x: "repevertonblair", instagram: "congressmanblair" }),

  // Accounts where the member's own site links a DIFFERENT account from the
  // source file: a renamed account, a typo, or (Rep. Pou) the House's own
  // accounts listed as hers. Each value is the account exactly as the
  // member's home page linked it on 2026-11-01. Left out on purpose: Rep.
  // Wittman's site links Rep. Amata's X account, and Rep. Simpson's links two
  // Facebook pages, so neither says which is his.
  ...fromSite("C000059", "https://calvert.house.gov", { facebook: "repkencalvert" }, { facebook: "70063393423" }),
  // Yvette D. Clarke: the source has a typo, repyvettedclarke.
  ...fromSite("C001067", "https://clarke.house.gov", { facebook: "repyvetteclarke", instagram: "repyvetteclarke", youtube: "RepYvetteDClarke" }, { facebook: "repyvettedclarke", instagram: "repyvettedclarke", youtube: "UC8SuQiuL2P9fUHAxuRoTdUQ" }),
  ...fromSite("C000537", "https://clyburn.house.gov", { facebook: "repjamesclyburn" }, { facebook: "jameseclyburn" }),
  ...fromSite("C001053", "https://cole.house.gov", { youtube: "/TomColeOK04" }, { youtube: "UCvqzPm_YnNkfEHpm3SEMJMQ" }),
  ...fromSite("C001069", "https://courtney.house.gov", { facebook: "repjoecourtney", youtube: "RepCourtneyCT2" }, { facebook: "joecourtney", youtube: "UCGVIfe1T2hO1Lx7ap5Wkv1w" }),
  ...fromSite("C001063", "https://cuellar.house.gov", { facebook: "repcuellar" }, { facebook: "152569121550" }),
  ...fromSite("D000096", "https://davis.house.gov", { facebook: "officialrepdannydavis", youtube: "UCj7w8NnoxbCuB1VYKjjod_g" }, { facebook: "CongressmanDKDavis", youtube: "UCdhrT09_XMr31tuI8OcKsjQ" }),
  ...fromSite("D000197", "https://degette.house.gov", { facebook: "repdianadegette" }, { facebook: "DianaDeGette" }),
  ...fromSite("D000399", "https://doggett.house.gov", { facebook: "replloyddoggett" }, { facebook: "lloyddoggett" }),
  ...fromSite("G000546", "https://graves.house.gov", { facebook: "repsamgraves" }, { facebook: "118514606128" }),
  ...fromSite("H001047", "https://himes.house.gov", { facebook: "repjimhimes", youtube: "c/RepJimHimes" }, { facebook: "CongressmanJimHimes", youtube: "UCCeB6czh6nhCHxOMCk_V4yA" }),
  ...fromSite("J000288", "https://hankjohnson.house.gov", { facebook: "rephankjohnson" }, { facebook: "115356957005" }),
  ...fromSite("K000009", "https://kaptur.house.gov", { facebook: "repmarcykaptur" }, { facebook: "RepresentativeMarcyKaptur" }),
  // William R. Keating: his site also links facebook.com/gop, a party page, not his.
  ...fromSite("K000375", "https://keating.house.gov", { facebook: "usrepkeating" }, { facebook: "Congressman.Keating" }),
  ...fromSite("K000376", "https://kelly.house.gov", { facebook: "mikekellypa" }, { facebook: "191056827594903" }),
  ...fromSite("L000562", "https://lynch.house.gov", { youtube: "CongressmanStephenLynch" }, { youtube: "UCxL4zG0YWqC5XTO4af_FOgw" }),
  ...fromSite("M001137", "https://meeks.house.gov", { facebook: "repgregorymeeks", youtube: "user/repgregorymeeks" }, { facebook: "gregorymeeksny05", youtube: "UCljJnwgQS6Z6-NypDyqKJZQ" }),
  ...fromSite("P000597", "https://pingree.house.gov", { facebook: "91529332807" }, { facebook: "ChelliePingree" }),
  ...fromSite("S000344", "https://sherman.house.gov", { facebook: "congressmanbradsherman", youtube: "CongressmanBradShermanCA" }, { facebook: "63158229861", youtube: "UCPisrz6-SLwVy2l9Mcy8kug" }),
  ...fromSite("S000510", "https://adamsmith.house.gov", { youtube: "/repadamsmith" }, { youtube: "UCcrHso483LOfC6WwDnzAh-g" }),
  ...fromSite("S000522", "https://chrissmith.house.gov", { facebook: "371621772908416" }, { facebook: "RepChrisSmith" }),
  ...fromSite("S001156", "https://lindasanchez.house.gov", { facebook: "replindasanchez", youtube: "/RepLindaSanchez" }, { facebook: "CongresswomanLindaSanchez", youtube: "UCu1K6uHxjMgj2mvzM7O9-ow" }),
  ...fromSite("T000193", "https://benniethompson.house.gov", { youtube: "RepBennieG.ThompsonMS02" }, { youtube: "UCzt2pBxh0dI24kYrWretXRw" }),
  ...fromSite("T000463", "https://turner.house.gov", { youtube: "UCxbpjLbEoYvOIfuRmfR7CWQ" }, { youtube: "UC-6Ss-aZ3OPisf9GdVGtN8g" }),
  ...fromSite("V000081", "https://velazquez.house.gov", { facebook: "repnydiavelazquez" }, { facebook: "8037068318" }),
  ...fromSite("W000797", "https://wassermanschultz.house.gov", { instagram: "repdws" }, { instagram: "RepDWSTweets" }),
  ...fromSite("B001285", "https://juliabrownley.house.gov", { facebook: "repbrownley", youtube: "/RepBrownley" }, { facebook: "RepJuliaBrownley", youtube: "UCFrC4Ouk5R6xQztS9PZin_A" }),
  ...fromSite("R000599", "https://ruiz.house.gov", { facebook: "repraulruizmd" }, { facebook: "CongressmanRaulRuizMD" }),
  ...fromSite("P000608", "https://scottpeters.house.gov", { youtube: "/repscottpeters" }, { youtube: "UCQK77QJxW7Xr-S3zqeMd-0g" }),
  ...fromSite("J000294", "https://jeffries.house.gov", { facebook: "repjeffries" }, { facebook: "RepHakeemJeffries" }),
  ...fromSite("B001281", "https://beatty.house.gov", { facebook: "656884781042633", youtube: "/RepBeatty" }, { facebook: "RepJoyceBeatty", youtube: "UCtVl3kb7Xvt3pY7l6x-M6LA" }),
  ...fromSite("C001091", "https://castro.house.gov", { facebook: "joaquincastrotx" }, { facebook: "326420614138023" }),
  // Katherine M. Clark: her Democratic Whip office account.
  ...fromSite("C001101", "https://katherineclark.house.gov", { x: "WhipKClark", facebook: "repkclark" }, { x: "RepKClark", facebook: "CongresswomanClark" }),
  ...fromSite("N000188", "https://norcross.house.gov", { instagram: "donaldnorcross", youtube: "c/donaldnorcross" }, { instagram: "donald_norcross", youtube: "UC7kXK_PyDiOT8YrdP0jYZHw" }),
  ...fromSite("L000583", "https://loudermilk.house.gov", { youtube: "rep.barryloudermilk2718" }, { youtube: "UC2Kfw8fjca8k3w3KpzL5tNg" }),
  ...fromSite("B001295", "https://bost.house.gov", { youtube: "UCxgLCZzKuY7g_8-Iu1PSlPQ" }, { youtube: "UCYA1psY06vSf3QadHuCrmjQ" }),
  ...fromSite("M001196", "https://moulton.house.gov", { facebook: "repmoulton" }, { facebook: "CongressmanSethMoulton" }),
  // Tom Emmer: his Majority Whip office account.
  ...fromSite("E000294", "https://emmer.house.gov", { x: "GOPMajorityWhip" }, { x: "RepTomEmmer" }),
  ...fromSite("S001196", "https://stefanik.house.gov", { youtube: "c/repelisestefanik" }, { youtube: "UCHvf42C8Vw6QnjwO2L2ukKA" }),
  ...fromSite("B001296", "https://boyle.house.gov", { youtube: "congressmanboyle" }, { youtube: "UCMP_Anj7lz4eZuSh8GwFqQQ" }),
  ...fromSite("B001292", "https://beyer.house.gov", { youtube: "c/RepDonBeyer" }, { youtube: "UCPJGVbOVcAVGiBwq8qr_T9w" }),
  ...fromSite("R000600", "https://radewagen.house.gov", { youtube: "congresswomanaumuaamata2861" }, { youtube: "UCGdrLQbt1PYDTPsampx4t1A" }),
  ...fromSite("D000626", "https://davidson.house.gov", { x: "Rep_Davidson", instagram: "repwarrendavidson" }, { x: "WarrenDavidson", instagram: "instawarrendavidson" }),
  // Mike Johnson: his Speaker's office accounts.
  ...fromSite("J000299", "https://mikejohnson.house.gov", { x: "SpeakerJohnson", facebook: "speakerjohnson", instagram: "speakermjohnson", youtube: "SpeakerJohnson" }, { x: "RepMikeJohnson", facebook: "RepMikeJohnson", instagram: "RepMikeJohnson", youtube: "UCzqBEpeIaDEfvAtsA53Fx2Q" }),
  ...fromSite("R000606", "https://raskin.house.gov", { youtube: "/RepRaskin" }, { youtube: "UChxDE6vho5BfBTOqiBsDmKg" }),
  ...fromSite("B001301", "https://bergman.house.gov", { youtube: "RepBergman" }, { youtube: "RepJackBergman" }),
  ...fromSite("E000297", "https://espaillat.house.gov", { instagram: "repespaillat" }, { instagram: "repadrianoespaillat" }),
  ...fromSite("F000466", "https://fitzpatrick.house.gov", { facebook: "repbrianfitz" }, { facebook: "repbrianfitzpatrick" }),
  ...fromSite("G000581", "https://gonzalez.house.gov", { facebook: "repvicentegonzalez", instagram: "repvicentegonzalez" }, { facebook: "USCongressmanVicenteGonzalez", instagram: "repvicentegonzaleztx" }),
  ...fromSite("A000375", "https://arrington.house.gov", { facebook: "repjodeyarrington" }, { facebook: "JodeyArrington" }),
  ...fromSite("J000298", "https://jayapal.house.gov", { youtube: "/repjayapal" }, { youtube: "UCmyD0_-2Oowkfwc_Raghclw" }),
  // Michael Cloud: all three moved from repcloudtx.
  ...fromSite("C001115", "https://cloud.house.gov", { x: "RepMichaelCloud", facebook: "repmichaelcloud", instagram: "repmichaelcloud" }, { x: "RepCloudTX", facebook: "RepCloudTX", instagram: "repcloudtx" }),
  ...fromSite("F000469", "https://fulcher.house.gov", { youtube: "RepRussFulcher" }, { youtube: "UCx2AS0O5frzPB8D6TqJ3Mqg" }),
  ...fromSite("D000032", "https://donalds.house.gov", { instagram: "repdonaldspress" }, { instagram: "byrondonalds" }),
  ...fromSite("M000317", "https://malliotakis.house.gov", { x: "RepNicole" }, { x: "RepMalliotakis" }),
  ...fromSite("S001220", "https://strong.house.gov", { facebook: "dalestrongal" }, { facebook: "repdalestrong" }),
  ...fromSite("A000379", "https://alford.house.gov", { facebook: "repmarkalford" }, { facebook: "100089595940547" }),
  ...fromSite("E000246", "https://edwards.house.gov", { x: "RepChuckEdwards" }, { x: "RepEdwards" }),
  ...fromSite("H001095", "https://hunt.house.gov", { x: "RepWPH" }, { x: "RepWesleyHunt" }),
  // Becca Balint: the source's value is the placeholder text "YouTubeChannelID".
  ...fromSite("B001318", "https://balint.house.gov", { youtube: "repbeccab" }, { youtube: "YouTubeChannelID" }),
  ...fromSite("F000110", "https://fields.house.gov", { facebook: "61569937980769" }, { facebook: "Congressman-Cleo-Fields" }),
  ...fromSite("F000481", "https://figures.house.gov", { facebook: "61571773900898" }, { facebook: "congressman.shomari.figures" }),
  ...fromSite("M001234", "https://morrison.house.gov", { instagram: "repkellymorrison" }, { instagram: "kellymorrisonmn" }),
  ...fromSite("G000604", "https://goodlander.house.gov", { facebook: "repgoodlander" }, { facebook: "61571606604866" }),
  // Nellie Pou: the source lists the House's own accounts (@caohouse, House Creative Services) as hers.
  ...fromSite("P000621", "https://pou.house.gov", { x: "RepNellie", facebook: "congresswomannelliepou", instagram: "RepNellie" }, { x: "caohouse", facebook: "CAOHouseofReps", instagram: "housecreativeservices" }),

  // Dead links on the members' own sites (checked 2026-11-01): Rep. Hurd's
  // links @RepJeffHurd03, which YouTube answers with a 404, and also
  // @RepJeffHurd, which works. Rep. Schweikert's links
  // youtube.com/RepDavidSchweikert, which redirects to a 404.
  ...fromSite("H001100", "https://hurd.house.gov", { youtube: "RepJeffHurd" }, { youtube: "@RepJeffHurd03" }),
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

/** As `fromSite`, for a member the source file had nothing for on any of these platforms. */
function missingFromSource(bioguideId: string, proofUrl: string, accounts: Accounts): AccountOverride[] {
  return fromSite(bioguideId, proofUrl, accounts, Object.fromEntries(Object.keys(accounts).map((p) => [p, null])));
}
