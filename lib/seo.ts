import type { Bill } from '@/lib/types/bill';
import { isStageOnPath, isValidStage, measureStageLabel, stagePath } from '@/lib/utils/bill-stages';
import { formatCongressOrdinal } from '@/lib/congress';

export const SITE_URL = 'https://billsincongress.com';
export const SITE_NAME = 'Bills in Congress';

/** Shared OG image descriptor — page-level `openGraph` overrides replace the
 * root object wholesale, so pages that customize OG must re-include this. */
export const DEFAULT_OG_IMAGE = {
  // Versioned like the live cards (SHARE_CARD_VERSION below): the file keeps
  // its name when it is redrawn, and platforms cache images by URL. Bump it
  // with every new og-default.png.
  url: '/images/og-default.png?v=2',
  width: 1200,
  height: 630,
  alt: 'Bills in Congress — every bill in the U.S. Congress',
};

/** The link a reader shares for a bill: canonical, absolute, no query string. */
export function billShareUrl(billId: string): string {
  return `${SITE_URL}/bills/${encodeURIComponent(billId)}`;
}

/**
 * Bump whenever a share card's design (lib/og/) changes. It rides in every
 * card's image URL, so a platform that caches images by URL — Facebook,
 * LinkedIn, WhatsApp — fetches the new drawing rather than keeping the old one.
 * 2: the stage-only redesign, and cards for the status, chamber and topic pages.
 * 3: resolutions drawn on their own road, ending at "Agreed to".
 * 4: proposed constitutional amendments drawn on their own road, ending at
 *    "To the states".
 */
export const SHARE_CARD_VERSION = 4;

/** The share card's canvas: Open Graph's 1.91:1 at the width every platform expects. */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 } as const;

/**
 * The bill's share card (app/bills/[id]/share-image/route.tsx), versioned by
 * stage. The card states the bill's status, and a status is exactly what goes
 * stale: when the bill moves, its pages start naming a new image URL, so no
 * platform keeps showing "In committee" under a law it cached a month ago.
 */
export function billShareImagePath(bill: Pick<Bill, 'id' | 'progress_stage'>): string {
  return `/bills/${encodeURIComponent(bill.id)}/share-image?v=${SHARE_CARD_VERSION}.${bill.progress_stage}`;
}

/**
 * A status, chamber or topic page's share card (app/share-image/[...path]),
 * versioned by the page's headline count so a card that states a number is
 * re-fetched when the number moves. `count` is null when the page's own count
 * was not exact; the URL then carries only the design version.
 */
export function hubShareImagePath(hubPath: string, count: number | null): string {
  const v = count === null ? `${SHARE_CARD_VERSION}` : `${SHARE_CARD_VERSION}.${count}`;
  return `/share-image${hubPath}?v=${v}`;
}

/**
 * The home page's share card (app/share-image/home), versioned by UTC day. Its
 * figures move with the daily sync, and the home page renders without fetching
 * them for its metadata, so the day stands in for the count: the URL changes at
 * most once a day, and a platform caching by URL is never more than a day
 * behind.
 */
export function homeShareImagePath(now: Date = new Date()): string {
  return `/share-image/home?v=${SHARE_CARD_VERSION}.${now.toISOString().slice(0, 10)}`;
}

/** Strip HTML tags/entities from CRS summary markup into plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Truncate at a word boundary, appending an ellipsis when cut. */
export function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength).trimEnd()}…`;
}

// Bill page prose
//
// Search data (Bing, Aug 2026) showed bill pages ranking in the top five for
// "<bill id> current status" queries and taking ZERO clicks across thousands of
// impressions — because the snippet was the bill's own title, repeated. Most
// bills have no CRS summary yet (Congress writes them weeks to months after
// introduction), so `latest_summary || title` collapsed to just the title on
// roughly four out of five pages. Everything below composes prose from fields
// we actually hold, and leads with the status the query is asking for.

/**
 * Status phrase for a bill's current stage. Mirrors BillStageDescriptions in
 * convex/billStage.ts, worded for prose rather than a chart label. Falls back
 * to whatever the backend sent if a new stage appears before this map does.
 */
const STAGE_PHRASES: Record<number, string> = {
  20: 'Introduced',
  40: 'In committee',
  50: 'Out of committee',
  60: 'Passed one chamber',
  80: 'Passed both chambers',
  85: 'Vetoed',
  90: 'Awaiting the President',
  95: 'Signed by the President',
  100: 'Became law',
};

/**
 * A status for the middle of a sentence: "agreed to by the House", not "agreed
 * to by the house". Only the first letter drops; proper nouns keep theirs.
 */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function billStatusPhrase(bill: Bill): string {
  const stage =
    typeof bill.progress_stage === 'string'
      ? parseInt(bill.progress_stage, 10)
      : bill.progress_stage;
  // A resolution is "agreed to", and finished there; "passed one chamber" in
  // the title and the share preview read as half-way to law. Same words as
  // its status panel (documentation/brand.md, "The road a measure travels").
  if (stagePath(bill.bill_type) !== 'law') {
    if (isStageOnPath(stage, bill.bill_type)) return measureStageLabel(stage, bill.bill_type);
    // A code we do not know yet falls back to the backend's own words, as a
    // bill's does: "Unknown" in a search title reads as a site that does not know.
    // A known code off the road (a resolution "to President") keeps "Unknown":
    // its stored description would name a step a resolution cannot reach.
    if (!isValidStage(stage)) return bill.progress_description ?? 'Introduced';
    return measureStageLabel(stage, bill.bill_type);
  }
  return STAGE_PHRASES[stage] ?? bill.progress_description ?? 'Introduced';
}

/** "S. 394", "H.R. 9237" — the identifier people actually search for. */
export function billIdentifier(bill: Bill): string {
  return `${bill.bill_type_label} ${bill.bill_number}`.trim();
}

/** "Senate" / "House" from the bill type. Senate types all start with "s". */
function chamberName(bill: Bill): string {
  return bill.bill_type?.toLowerCase().startsWith('s') ? 'Senate' : 'House';
}

const PARTY_ADJECTIVES: Record<string, string> = {
  R: 'R',
  D: 'D',
  I: 'I',
  ID: 'ID',
  IR: 'IR',
  L: 'L',
  G: 'G',
};

/** "Angus King (I-ME)", or null when we hold no sponsor name. */
function sponsorPhrase(bill: Bill): string | null {
  const name = `${bill.sponsor_first_name ?? ''} ${bill.sponsor_last_name ?? ''}`.trim();
  if (!name) return null;
  const party = PARTY_ADJECTIVES[bill.sponsor_party ?? ''] ?? '';
  const state = bill.sponsor_state ?? '';
  if (party && state) return `${name} (${party}-${state})`;
  if (state) return `${name} (${state})`;
  return name;
}

/**
 * "a Health bill" / "an Immigration bill". None of the 33 CRS policy areas
 * begins with a "you"-sounding vowel (no "Union"-style exceptions), so matching
 * the letter is enough here.
 */
function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

/** "August 3, 2026", or null when the date is missing or unparseable. */
function introducedPhrase(bill: Bill): string | null {
  if (!bill.introduced_date) return null;
  const d = new Date(bill.introduced_date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The CRS summary as plain text, with its opening echo of the bill's own title
 * removed. CRS summaries begin "<p><strong>Short Title Act</strong></p>", which
 * made every snippet start by repeating the <title> tag instead of saying
 * something. Returns '' when there is no summary.
 */
export function billSummaryText(bill: Bill): string {
  if (!bill.latest_summary) return '';
  let text = stripHtml(bill.latest_summary);
  const title = bill.title?.trim() ?? '';
  if (title && text.toLowerCase().startsWith(title.toLowerCase())) {
    text = text.slice(title.length).replace(/^[\s.:;,—–-]+/, '');
  }
  return text.trim();
}

/**
 * A period that does not end a sentence: a single capital ("U.S.", "H.R.",
 * "John Q."), or a short form CRS summaries use ("Sec.", "No.", "Dept.").
 */
const NOT_A_SENTENCE_END =
  /(?:\b[A-Za-z]|\b(?:Sec|Secs|No|Nos|Mr|Mrs|Ms|Dr|St|Jr|Sr|Inc|Co|Corp|Ltd|Dept|Gov|Gen|Rep|Sen|Res|Con|Stat|Pub|vs|etc|Jan|Feb|Mar|Apr|Aug|Sept|Sep|Oct|Nov|Dec|approx))$/;

/** The text's first sentence, never cut inside an abbreviation. */
export function firstSentence(text: string): string {
  const end = /[.?!]["”’)]?(?=\s+["“(]?[A-Z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = end.exec(text))) {
    const before = text.slice(0, m.index);
    if (m[0][0] === '.' && NOT_A_SENTENCE_END.test(before)) continue;
    return text.slice(0, m.index + m[0].length).trim();
  }
  return text.trim();
}

/** Title-opening gerunds and their plain verbs: "Supporting" → "support". */
const TITLE_GERUNDS: Record<string, string> = {
  Supporting: 'support',
  Expressing: 'express',
  Recognizing: 'recognize',
  Condemning: 'condemn',
  Designating: 'designate',
  Honoring: 'honor',
  Calling: 'call',
  Providing: 'provide',
  Commemorating: 'commemorate',
  Congratulating: 'congratulate',
  Celebrating: 'celebrate',
  Affirming: 'affirm',
  Reaffirming: 'reaffirm',
  Urging: 'urge',
  Encouraging: 'encourage',
  Acknowledging: 'acknowledge',
  Authorizing: 'authorize',
  Directing: 'direct',
  Requesting: 'request',
  Electing: 'elect',
  Amending: 'amend',
  Establishing: 'establish',
  Disapproving: 'disapprove',
  Mourning: 'mourn',
  Remembering: 'remember',
  Opposing: 'oppose',
  Requiring: 'require',
  Raising: 'raise',
  Declaring: 'declare',
  Permitting: 'permit',
  Approving: 'approve',
  Commending: 'commend',
  Demanding: 'demand',
  Denouncing: 'denounce',
  Impeaching: 'impeach',
  Censuring: 'censure',
};

/** Longer than this, the lead is cut at a word; the full summary follows it. */
const LEAD_MAX = 320;

/**
 * Where the measure stands, as the second half of a sentence that starts "It".
 * Same words as the status panel, on the measure's own road.
 */
function standsPhrase(bill: Bill): string {
  const stage =
    typeof bill.progress_stage === 'string' ? parseInt(bill.progress_stage, 10) : bill.progress_stage;
  if (stagePath(bill.bill_type) !== 'law' && isStageOnPath(stage, bill.bill_type)) {
    const label = measureStageLabel(stage, bill.bill_type);
    if (label.startsWith('Agreed to')) return `was ${lowerFirst(label)}`;
  }
  switch (stage) {
    case 20:
      return 'has been introduced';
    case 40:
      return 'is in committee';
    case 50:
      return 'is out of committee';
    case 60:
      return 'has passed one chamber';
    case 80:
      return 'has passed both chambers';
    case 85:
      return 'was vetoed';
    case 90:
      return 'is on the President’s desk';
    case 95:
      return 'was signed by the President';
    case 100:
      return 'became law';
    default:
      return `is ${lowerFirst(billStatusPhrase(bill))}`;
  }
}

/**
 * The bill page's "In short" lead: the answer to "what does it do?" in one
 * plain sentence, above the status.
 *
 * With a CRS summary it is that summary's first sentence, word for word (the
 * page says so under it): the government wrote it, so it is the one sentence on
 * the page that describes the bill's content with authority. Without one, the
 * sentence is built from fields the record holds and claims nothing more: a
 * title that states a purpose ("To remove restrictions from…") becomes "This
 * bill sets out to remove restrictions from…", and a name ("Social Security
 * Guarantee Act of 2025") says plainly that there is no summary yet, because a
 * name is not a description.
 */
export type BillLead = {
  /**
   * '' with a summary that does not open with a sentence (a part's heading, a
   * fragment): the page prints no In short, only a link down to the summary.
   */
  text: string;
  from: 'summary' | 'title' | 'status';
  /**
   * With a summary: what the page prints under it, so no sentence is read
   * twice. The summary after the lead sentence when the lead is that sentence
   * whole (`split`); the whole summary when the lead had to be cut short.
   * Empty when the lead is all the summary says. '' without a summary.
   */
  rest: string;
  split: boolean;
};

/**
 * A bold opening paragraph this short with no closing stop is a heading. Long
 * enough for a bill with two short titles: "Judicial Understaffing Delays
 * Getting Emergencies Solved Act of 2024 or the JUDGES Act of 2024" (S. 4199,
 * 118th) is 95 characters, and at the old 80 it led "In short" with no stop.
 */
const SUMMARY_HEADING_MAX = 240;

/**
 * A short title run into the first sentence with no stop between them:
 * "Lower Costs Act This bill creates…". A capital "This bill" after a space,
 * with no stop before it, starts the real sentence.
 */
const RUN_ON_TITLE = /^([^.?!]{1,240}?)\s+(?=This (?:bill|joint resolution|concurrent resolution|resolution)\b)/;

/**
 * A summary that opens with a part's heading, not a sentence: "DIVISION
 * A--INCREASING AMERICAN ENERGY PRODUCTION…" (H.R. 1, 118th), "TITLE I--…".
 */
const PART_HEADING = /^(?:DIVISION|TITLE|SUBTITLE|Subtitle)\s+[A-Z0-9]+\s*(?:--|—|–)/;

/** Ends as a sentence does: a stop, perhaps inside a closing quote or bracket. */
const SENTENCE_END = /[.?!]["”’)]?$/;

export function billLead(bill: Bill): BillLead {
  const summary = billSummaryText(bill);
  if (summary) {
    // CRS summaries can open with a short title in bold, in a paragraph of
    // its own ("<p><strong>Clergy Act</strong></p>"). billSummaryText drops it
    // when it is the bill's own title; any other one names the bill without
    // saying what it does, so the lead starts after it.
    let body = summary;
    const heading = /^\s*<p>\s*<(strong|b)>([^<]+)<\/\1>\s*<\/p>/i.exec(bill.latest_summary ?? '');
    const head = heading ? stripHtml(heading[2]) : '';
    if (
      head &&
      head.length <= SUMMARY_HEADING_MAX &&
      !/[.?!:;]["”’)]?$/.test(head) &&
      body.startsWith(head)
    ) {
      body = body.slice(head.length).trim() || summary;
    }
    const runOn = RUN_ON_TITLE.exec(body);
    if (runOn) body = body.slice(runOn[0].length);
    // No lead rather than a heading or a fragment printed as a sentence: the
    // page points to the whole summary instead.
    if (PART_HEADING.test(body) || !SENTENCE_END.test(firstSentence(body))) {
      return { text: '', from: 'summary', rest: summary, split: false };
    }
    const sentence = firstSentence(body).replace(/\s+/g, ' ');
    const text = truncateAtWord(sentence, LEAD_MAX);
    if (text !== sentence) return { text, from: 'summary', rest: summary, split: false };
    const end = firstSentence(body).length;
    return { text, from: 'summary', rest: body.slice(end).trim(), split: true };
  }
  const noun = billNoun(bill.bill_type);
  const title = (bill.title ?? '').trim().replace(/,? and for other purposes\.?$/i, '.');
  const stands = standsPhrase(bill);
  const purpose = /^(?:an? (?:bill|joint resolution|concurrent resolution|resolution) )?to (.+)$/i.exec(title);
  // A resolution's title is a gerund ("Supporting the designation of…"),
  // which names its purpose as plainly as "To…" does. Only verbs listed here.
  const gerund = /^([A-Z][a-z]+ing) (.+)$/.exec(title);
  const aim = purpose
    ? purpose[1]
    : gerund && TITLE_GERUNDS[gerund[1]]
      ? `${TITLE_GERUNDS[gerund[1]]} ${gerund[2]}`
      : null;
  if (aim) {
    return {
      text: `This ${noun} sets out to ${aim.replace(/[.;:\s]+$/, '')}. It ${stands}.`,
      from: 'title',
      rest: '',
      split: false,
    };
  }
  return {
    text: `This ${noun} ${stands}. Congress has not published a summary of what it would do yet.`,
    from: 'status',
    rest: '',
    split: false,
  };
}

/**
 * The longest <title> we publish. Bing Webmaster Tools flagged 357 of our pages
 * "Title too long" (Oct 2026): bill titles ran 90–140 characters, topic pages
 * up to 106. Bing's guidance is 65, and Google cuts a result's title at about
 * 60, so nothing past this is ever read.
 */
export const SEO_TITLE_MAX = 65;

/** The layout's title template (app/layout.tsx) adds this to every page title. */
const TITLE_SUFFIX = ` · ${SITE_NAME}`;

/**
 * A page's `metadata.title`: the site-name suffix when the whole thing still
 * fits, otherwise the page's own words alone. The page's words are the ones a
 * searcher matched; the suffix is the first thing to go.
 */
export function pageTitle(title: string): string | { absolute: string } {
  // A title that already names the site ("Health Bills in Congress") would
  // read "… Bills in Congress · Bills in Congress" with the suffix.
  const named = title.includes(SITE_NAME);
  if (!named && title.length + TITLE_SUFFIX.length <= SEO_TITLE_MAX) return title;
  return { absolute: title.length <= SEO_TITLE_MAX ? title : truncateAtWord(title, SEO_TITLE_MAX - 1) };
}

/**
 * Page <title>. The identifier and the status come first, because that is what
 * the queries ask for; the bill's name fills what is left of the 65 characters,
 * and the Congress closes it, because "H.R. 40" names a different bill in every
 * Congress.
 */
export function billSeoTitle(bill: Bill): string {
  const head = `${billIdentifier(bill)} — ${billStatusPhrase(bill)}`;
  const tail = ` (${congressOrdinal(bill.congress)})`;
  const room = SEO_TITLE_MAX - head.length - tail.length - ': '.length;
  const name = fitName(bill.title?.trim() ?? '', room);
  return name ? `${head}: ${name}${tail}` : `${head}${tail}`;
}

/**
 * As much of a bill's name as fits in `room` characters, cut between words
 * ("TRIA Program…", never "TRIA Program Reauthoriza…"), or '' when too little
 * of it would fit to say anything.
 */
function fitName(name: string, room: number): string {
  if (name.length <= room) return name;
  const cut = name.slice(0, room - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const words = (lastSpace > 0 ? cut.slice(0, lastSpace) : '').replace(/[\s,;:—–-]+$/, '');
  return words.length >= 10 ? `${words}…` : '';
}

const DESCRIPTION_LIMIT = 158;

/**
 * Whether a bill's official title already describes the bill, as opposed to
 * merely naming it. Congress's formal long titles open with "To …" ("To amend
 * title 38, United States Code, to improve…"); short titles are act names
 * ("SMASH 2.0 Act") that tell a searcher nothing they did not already read in
 * the <title> tag. Length catches the long titles that skip the "To" form.
 */
function isDescriptiveTitle(title: string | undefined): boolean {
  const t = title?.trim() ?? '';
  return /^to\s/i.test(t) || t.length >= 60;
}

/**
 * Meta description for a bill. Always leads with the identifier and status, so
 * the snippet answers "what happened to this bill?" whether or not Congress has
 * published a summary. Never falls back to the bare title.
 */
export function billSeoDescription(bill: Bill): string {
  return atLeastDescription(composeBillDescription(bill), bill);
}

/**
 * The shortest description we publish. Bing flagged 251 pages "Meta
 * description too short" (Oct 2026); the short ones were bills whose summary or
 * title said little, and a few hub pages. Under this, a snippet is mostly
 * white space beside a competitor's two full lines.
 */
export const DESCRIPTION_MIN = 120;

/** Tops a short bill description up with true facts we hold, never filler about the bill. */
function atLeastDescription(text: string, bill: Bill): string {
  if (text.length >= DESCRIPTION_MIN) return text;
  const additions = [
    ` Part of the ${congressOrdinal(bill.congress)} Congress.`,
    ' Follow its status, sponsors, actions and full text.',
    ' From Congress.gov, updated daily.',
    ' Updated daily.',
  ];
  let out = text;
  for (const add of additions) {
    if (out.length >= DESCRIPTION_MIN) break;
    if (out.length + add.length <= DESCRIPTION_LIMIT) out += add;
  }
  return out;
}

function composeBillDescription(bill: Bill): string {
  const id = billIdentifier(bill);
  const status = lowerFirst(billStatusPhrase(bill));
  const summary = billSummaryText(bill);

  if (summary) {
    return truncateAtWord(`${id} — ${status}. ${summary}`, DESCRIPTION_LIMIT);
  }

  // No CRS summary. Congress gives a bill either a short act name ("SMASH 2.0
  // Act") or a formal long title that already describes it ("To require the
  // disclosure of algorithmic price fixing…"). A long title is real content and
  // is kept — prefixed with the status, which is what it was missing. Only a
  // bare act name, which says nothing on its own, is replaced by composed facts.
  if (isDescriptiveTitle(bill.title)) {
    return truncateAtWord(`${id} — ${status}. ${bill.title.trim()}`, DESCRIPTION_LIMIT);
  }

  const area = bill.bill_subjects?.policy_area_name;
  const sponsor = sponsorPhrase(bill);
  const when = introducedPhrase(bill);

  // "resolution" / "joint resolution" where that is what it is — an H.Res. is
  // not a bill, and saying so on 55,000 pages would be plainly wrong.
  const kind = legislationTypeLabel(bill.bill_type ?? '').toLowerCase();
  let text = `${id} is ${withArticle(area ? `${area} ${kind}` : kind)}`;
  text += ` in the ${chamberName(bill)}`;
  if (when) text += `, introduced ${when}`;
  if (sponsor) text += ` by ${sponsor}`;
  text += `. Status: ${status}.`;

  const tail = ' Track its actions, sponsors, and full text.';
  if (text.length + tail.length <= DESCRIPTION_LIMIT) text += tail;
  return truncateAtWord(text, DESCRIPTION_LIMIT);
}

/**
 * The opening paragraph shown on the bill page. For the ~4 in 5 bills with no
 * CRS summary this is the page's only substantive prose, so it has to say
 * something true and specific — never filler, and never invented detail: every
 * clause below is a field we hold.
 */
export function billAnswerParagraph(
  bill: Bill,
  /** The Congress is over (lib/bill-journey.ts congressClock). An unfinished
   *  measure then expired: "Its current status is: in committee" and "not
   *  published … yet" read as if it were still alive (/bills/82sjres118). */
  opts: { congressEnded?: boolean; finished?: boolean } = {},
): string {
  const id = billIdentifier(bill);
  const area = bill.bill_subjects?.policy_area_name;
  const sponsor = sponsorPhrase(bill);
  const when = introducedPhrase(bill);
  const status = lowerFirst(billStatusPhrase(bill));

  const kind = legislationTypeLabel(bill.bill_type ?? '').toLowerCase();
  let text = `${id} is ${withArticle(area ? `${area} ${kind}` : kind)}`;
  text += ` in the ${congressOrdinal(bill.congress)} Congress`;
  if (when) text += `, introduced in the ${chamberName(bill)} on ${when}`;
  else text += ` in the ${chamberName(bill)}`;
  if (sponsor) text += ` by ${sponsor}`;
  const expired = !!opts.congressEnded && !opts.finished;
  text += expired
    ? `. It was ${status} when the ${congressOrdinal(bill.congress)} Congress ended, and it expired then.`
    : `. Its current status is: ${status}.`;

  // Gated on the raw field, not on billSummaryText(). Those answer two
  // different questions and this sentence is a claim about the first one.
  // billSummaryText() returns '' both when Congress has published nothing and
  // when it has published a summary consisting only of the bill's own title —
  // a real pattern for freshly numbered bills — so gating on it stated
  // "Congress has not published…" about bills where Congress had.
  if (!bill.latest_summary && expired) {
    text += ` Congress did not publish a plain-language summary of this ${kind}.`;
  } else if (!bill.latest_summary) {
    text +=
      ` Congress has not published a plain-language summary of this ${kind} yet;` +
      ' summaries are usually written some time after introduction.';
  }
  return text;
}

/** "119th" — delegates to the shared formatter in lib/congress.ts. */
export const congressOrdinal = formatCongressOrdinal;

const CONGRESS_GOV_SLUGS: Record<string, string> = {
  hr: 'house-bill',
  s: 'senate-bill',
  hjres: 'house-joint-resolution',
  sjres: 'senate-joint-resolution',
  hconres: 'house-concurrent-resolution',
  sconres: 'senate-concurrent-resolution',
  hres: 'house-resolution',
  sres: 'senate-resolution',
};

/** Official congress.gov page for a bill, or null for unknown types. */
export function congressGovUrl(bill: Bill): string | null {
  const slug = CONGRESS_GOV_SLUGS[bill.bill_type?.toLowerCase() ?? ''];
  if (!slug) return null;
  return `https://www.congress.gov/bill/${congressOrdinal(bill.congress)}-congress/${slug}/${bill.bill_number}`;
}

/** schema.org Legislation `legislationType` for a Congress bill type. */
export function legislationTypeLabel(billType: string): string {
  // Dots and spaces dropped, so the printed type ("H.Con.Res.") reads as its
  // code ("hconres"): the in-answer card only has the printed number.
  const type = billType.toLowerCase().replace(/[.\s]/g, '');
  if (type === 'hjres' || type === 'sjres') return 'Joint Resolution';
  if (type === 'hconres' || type === 'sconres') return 'Concurrent Resolution';
  if (type === 'hres' || type === 'sres') return 'Resolution';
  return 'Bill';
}

/**
 * The same word, lowercased for running prose: "bill", "resolution", "joint
 * resolution", "concurrent resolution".
 *
 * Exported because the page chrome around the generated prose has to agree with
 * it. billAnswerParagraph() already says "H.Res. 1486 is a resolution", so a
 * heading beside it reading "Have a question about this bill?" contradicts the
 * page's own opening line.
 */
export function billNoun(billType: string | null | undefined): string {
  return legislationTypeLabel(billType ?? '').toLowerCase();
}
