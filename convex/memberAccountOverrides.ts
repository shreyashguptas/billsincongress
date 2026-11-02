import type { AccountOverride } from "./memberAccountsParse";

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
  ...fromSite("R000619", "https://rulli.house.gov", { x: "repmichaelrulli", facebook: "RepMikeRulli", instagram: "repmikerulli" }),
  ...fromSite("H001098", "https://hamadeh.house.gov", { x: "RepAbeHamadeh", facebook: "RepAbeHamadeh", instagram: "repabehamadeh" }),
  ...fromSite("T000491", "https://tran.house.gov", { x: "RepDerekTranCA", facebook: "CongressmanTran", instagram: "repderektran" }),
  ...fromSite("M001241", "https://min.house.gov", { x: "CongressMin", facebook: "thecongressmin", instagram: "repdavemin" }),
  ...fromSite("R000621", "https://randall.house.gov", { facebook: "RepEmilyRandall", instagram: "repemilyrandall", youtube: "CongresswomanEmilyRandall" }),
  ...fromSite("P000622", "https://patronis.house.gov", { x: "PatronisFL", facebook: "61577293801543", instagram: "patronisfl" }),
  ...fromSite("F000484", "https://fine.house.gov", { x: "RepFine", facebook: "CongressmanRandyFine", instagram: "repfine", youtube: "RepFine" }),
  ...fromSite("W000831", "https://walkinshaw.house.gov", { x: "Rep_Walkinshaw", facebook: "RepJamesWalkinshaw", instagram: "rep_walkinshaw", youtube: "repwalkinshaw" }),
  ...fromSite("G000606", "https://grijalva.house.gov", { x: "rep_grijalva", facebook: "repadelitasgrijalva", instagram: "repgrijalva", youtube: "RepGrijalva" }),
  ...fromSite("V000139", "https://vanepps.house.gov", { x: "repvanepps", facebook: "RepVanEpps", instagram: "repvaneppstn", youtube: "UChI1UwZkFRh_Fctl9Ah5z8A" }),
  ...fromSite("M001245", "https://menefee.house.gov", { x: "RepCDMenefee", facebook: "repcdmenefee", instagram: "repcdmenefee" }),
  ...fromSite("F000485", "https://fuller.house.gov", { x: "RepClayFuller", facebook: "61570681866170", instagram: "repclayfuller" }),
  ...fromSite("M001246", "https://mejia.house.gov", { x: "RepAnalilia", facebook: "repanalilia", instagram: "repanalilia" }),
  ...fromSite("G000607", "https://gallagher.house.gov", { x: "RepGallagherCA1", facebook: "RepJamesGallagher", instagram: "repgallagherca1", youtube: "JamesGallagher_CA01" }),
  // His site's Facebook link is a share link, not the page itself, so it is left out.
  ...fromSite("B001328", "https://blair.house.gov", { x: "repevertonblair", instagram: "congressmanblair" }),

  // Accounts where the member's own site links a DIFFERENT account from the
  // source file: a renamed account, a typo, or (Rep. Pou) the House's own
  // accounts listed as hers. Each value is the account exactly as the
  // member's home page linked it on 2026-11-01. Left out on purpose: Rep.
  // Wittman's site links Rep. Amata's X account, and Rep. Simpson's links two
  // Facebook pages, so neither says which is his.
  ...fromSite("C000059", "https://calvert.house.gov", { facebook: "repkencalvert" }),
  // Yvette D. Clarke: the source has a typo, repyvettedclarke.
  ...fromSite("C001067", "https://clarke.house.gov", { facebook: "repyvetteclarke", instagram: "repyvetteclarke", youtube: "RepYvetteDClarke" }),
  ...fromSite("C000537", "https://clyburn.house.gov", { facebook: "repjamesclyburn" }),
  ...fromSite("C001053", "https://cole.house.gov", { youtube: "/TomColeOK04" }),
  ...fromSite("C001069", "https://courtney.house.gov", { facebook: "repjoecourtney", youtube: "RepCourtneyCT2" }),
  ...fromSite("C001063", "https://cuellar.house.gov", { facebook: "repcuellar" }),
  ...fromSite("D000096", "https://davis.house.gov", { facebook: "officialrepdannydavis", youtube: "UCj7w8NnoxbCuB1VYKjjod_g" }),
  ...fromSite("D000197", "https://degette.house.gov", { facebook: "repdianadegette" }),
  ...fromSite("D000399", "https://doggett.house.gov", { facebook: "replloyddoggett" }),
  ...fromSite("G000546", "https://graves.house.gov", { facebook: "repsamgraves" }),
  ...fromSite("H001047", "https://himes.house.gov", { facebook: "repjimhimes", youtube: "c/RepJimHimes" }),
  ...fromSite("J000288", "https://hankjohnson.house.gov", { facebook: "rephankjohnson" }),
  ...fromSite("K000009", "https://kaptur.house.gov", { facebook: "repmarcykaptur" }),
  // William R. Keating: his site also links facebook.com/gop, a party page, not his.
  ...fromSite("K000375", "https://keating.house.gov", { facebook: "usrepkeating" }),
  ...fromSite("K000376", "https://kelly.house.gov", { facebook: "mikekellypa" }),
  ...fromSite("L000562", "https://lynch.house.gov", { youtube: "CongressmanStephenLynch" }),
  ...fromSite("M001137", "https://meeks.house.gov", { facebook: "repgregorymeeks", youtube: "user/repgregorymeeks" }),
  ...fromSite("P000597", "https://pingree.house.gov", { facebook: "91529332807" }),
  ...fromSite("S000344", "https://sherman.house.gov", { facebook: "congressmanbradsherman", youtube: "CongressmanBradShermanCA" }),
  ...fromSite("S000510", "https://adamsmith.house.gov", { youtube: "/repadamsmith" }),
  ...fromSite("S000522", "https://chrissmith.house.gov", { facebook: "371621772908416" }),
  ...fromSite("S001156", "https://lindasanchez.house.gov", { facebook: "replindasanchez", youtube: "/RepLindaSanchez" }),
  ...fromSite("T000193", "https://benniethompson.house.gov", { youtube: "RepBennieG.ThompsonMS02" }),
  ...fromSite("T000463", "https://turner.house.gov", { youtube: "UCxbpjLbEoYvOIfuRmfR7CWQ" }),
  ...fromSite("V000081", "https://velazquez.house.gov", { facebook: "repnydiavelazquez" }),
  ...fromSite("W000797", "https://wassermanschultz.house.gov", { instagram: "repdws" }),
  ...fromSite("B001285", "https://juliabrownley.house.gov", { facebook: "repbrownley", youtube: "/RepBrownley" }),
  ...fromSite("R000599", "https://ruiz.house.gov", { facebook: "repraulruizmd" }),
  ...fromSite("P000608", "https://scottpeters.house.gov", { youtube: "/repscottpeters" }),
  ...fromSite("J000294", "https://jeffries.house.gov", { facebook: "repjeffries" }),
  ...fromSite("B001281", "https://beatty.house.gov", { facebook: "656884781042633", youtube: "/RepBeatty" }),
  ...fromSite("C001091", "https://castro.house.gov", { facebook: "joaquincastrotx" }),
  // Katherine M. Clark: her Democratic Whip office account.
  ...fromSite("C001101", "https://katherineclark.house.gov", { x: "WhipKClark", facebook: "repkclark" }),
  ...fromSite("N000188", "https://norcross.house.gov", { instagram: "donaldnorcross", youtube: "c/donaldnorcross" }),
  ...fromSite("L000583", "https://loudermilk.house.gov", { youtube: "rep.barryloudermilk2718" }),
  ...fromSite("B001295", "https://bost.house.gov", { youtube: "UCxgLCZzKuY7g_8-Iu1PSlPQ" }),
  ...fromSite("M001196", "https://moulton.house.gov", { facebook: "repmoulton" }),
  // Tom Emmer: his Majority Whip office account.
  ...fromSite("E000294", "https://emmer.house.gov", { x: "GOPMajorityWhip" }),
  ...fromSite("S001196", "https://stefanik.house.gov", { youtube: "c/repelisestefanik" }),
  ...fromSite("B001296", "https://boyle.house.gov", { youtube: "congressmanboyle" }),
  ...fromSite("B001292", "https://beyer.house.gov", { youtube: "c/RepDonBeyer" }),
  ...fromSite("R000600", "https://radewagen.house.gov", { youtube: "congresswomanaumuaamata2861" }),
  ...fromSite("D000626", "https://davidson.house.gov", { x: "Rep_Davidson", instagram: "repwarrendavidson" }),
  // Mike Johnson: his Speaker's office accounts.
  ...fromSite("J000299", "https://mikejohnson.house.gov", { x: "SpeakerJohnson", facebook: "speakerjohnson", instagram: "speakermjohnson", youtube: "SpeakerJohnson" }),
  ...fromSite("R000606", "https://raskin.house.gov", { youtube: "/RepRaskin" }),
  ...fromSite("B001301", "https://bergman.house.gov", { youtube: "RepBergman" }),
  ...fromSite("E000297", "https://espaillat.house.gov", { instagram: "repespaillat" }),
  ...fromSite("F000466", "https://fitzpatrick.house.gov", { facebook: "repbrianfitz" }),
  ...fromSite("G000581", "https://gonzalez.house.gov", { facebook: "repvicentegonzalez", instagram: "repvicentegonzalez" }),
  ...fromSite("A000375", "https://arrington.house.gov", { facebook: "repjodeyarrington" }),
  ...fromSite("J000298", "https://jayapal.house.gov", { youtube: "/repjayapal" }),
  // Michael Cloud: all three moved from repcloudtx.
  ...fromSite("C001115", "https://cloud.house.gov", { x: "RepMichaelCloud", facebook: "repmichaelcloud", instagram: "repmichaelcloud" }),
  ...fromSite("F000469", "https://fulcher.house.gov", { youtube: "RepRussFulcher" }),
  ...fromSite("D000032", "https://donalds.house.gov", { instagram: "repdonaldspress" }),
  ...fromSite("M000317", "https://malliotakis.house.gov", { x: "RepNicole" }),
  ...fromSite("S001220", "https://strong.house.gov", { facebook: "dalestrongal" }),
  ...fromSite("A000379", "https://alford.house.gov", { facebook: "repmarkalford" }),
  ...fromSite("E000246", "https://edwards.house.gov", { x: "RepChuckEdwards" }),
  ...fromSite("H001095", "https://hunt.house.gov", { x: "RepWPH" }),
  // Becca Balint: the source's value is the placeholder text "YouTubeChannelID".
  ...fromSite("B001318", "https://balint.house.gov", { youtube: "repbeccab" }),
  ...fromSite("F000110", "https://fields.house.gov", { facebook: "61569937980769" }),
  ...fromSite("F000481", "https://figures.house.gov", { facebook: "61571773900898" }),
  ...fromSite("M001234", "https://morrison.house.gov", { instagram: "repkellymorrison" }),
  ...fromSite("G000604", "https://goodlander.house.gov", { facebook: "repgoodlander" }),
  // Nellie Pou: the source lists the House's own accounts (@caohouse, House Creative Services) as hers.
  ...fromSite("P000621", "https://pou.house.gov", { x: "RepNellie", facebook: "congresswomannelliepou", instagram: "RepNellie" }),

  // Dead links on the members' own sites (checked 2026-11-01): Rep. Hurd's
  // links @RepJeffHurd03, which YouTube answers with a 404, and also
  // @RepJeffHurd, which works. Rep. Schweikert's links
  // youtube.com/RepDavidSchweikert, which redirects to a 404.
  ...fromSite("H001100", "https://hurd.house.gov", { youtube: "RepJeffHurd" }),
  {
    bioguideId: "S001183",
    platform: "youtube",
    action: "hide",
    proofUrl: "https://schweikert.house.gov",
    checked: "2026-11-01",
    reason: "the YouTube address his site links is a 404",
  },
];

/** One "set" entry per account a member's own site links, all checked the same day. */
function fromSite(
  bioguideId: string,
  proofUrl: string,
  accounts: Partial<Record<AccountOverride["platform"], string>>,
): AccountOverride[] {
  return Object.entries(accounts).map(([platform, value]) => ({
    bioguideId,
    platform: platform as AccountOverride["platform"],
    action: "set" as const,
    value: value as string,
    proofUrl,
    checked: "2026-11-01",
  }));
}
