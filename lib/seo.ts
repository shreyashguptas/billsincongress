import type { Bill } from '@/lib/types/bill';
import { formatCongressOrdinal } from '@/lib/congress';

export const SITE_URL = 'https://billsincongress.com';
export const SITE_NAME = 'Congressional Bill Tracker';

/** Shared OG image descriptor — page-level `openGraph` overrides replace the
 * root object wholesale, so pages that customize OG must re-include this. */
export const DEFAULT_OG_IMAGE = {
  url: '/images/og-default.png',
  width: 1200,
  height: 630,
  alt: 'Congressional Bill Tracker — every bill in the U.S. Congress',
};

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

// ─── Bill page prose ──────────────────────────────────────────────────────
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
  60: 'Passed one chamber',
  80: 'Passed both chambers',
  85: 'Vetoed',
  90: 'Awaiting the President',
  95: 'Signed by the President',
  100: 'Became law',
};

export function billStatusPhrase(bill: Bill): string {
  const stage =
    typeof bill.progress_stage === 'string'
      ? parseInt(bill.progress_stage, 10)
      : bill.progress_stage;
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
 * Page <title>. The identifier and the status come first, because that is what
 * the queries ask for and because anything past ~60 characters is cut from a
 * search result.
 */
export function billSeoTitle(bill: Bill): string {
  const id = billIdentifier(bill);
  const status = billStatusPhrase(bill);
  const name = truncateAtWord(bill.title ?? '', 70);
  const ord = `${congressOrdinal(bill.congress)} Congress`;
  return name ? `${id} — ${status}: ${name} (${ord})` : `${id} — ${status} (${ord})`;
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
  const id = billIdentifier(bill);
  const status = billStatusPhrase(bill).toLowerCase();
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
export function billAnswerParagraph(bill: Bill): string {
  const id = billIdentifier(bill);
  const area = bill.bill_subjects?.policy_area_name;
  const sponsor = sponsorPhrase(bill);
  const when = introducedPhrase(bill);
  const status = billStatusPhrase(bill).toLowerCase();

  // "resolution" / "joint resolution" where that is what it is — an H.Res. is
  // not a bill, and saying so on 55,000 pages would be plainly wrong.
  const kind = legislationTypeLabel(bill.bill_type ?? '').toLowerCase();
  let text = `${id} is ${withArticle(area ? `${area} ${kind}` : kind)}`;
  text += ` in the ${congressOrdinal(bill.congress)} Congress`;
  if (when) text += `, introduced in the ${chamberName(bill)} on ${when}`;
  else text += ` in the ${chamberName(bill)}`;
  if (sponsor) text += ` by ${sponsor}`;
  text += `. Its current status is: ${status}.`;

  // Gated on the raw field, not on billSummaryText(). Those answer two
  // different questions and this sentence is a claim about the first one.
  // billSummaryText() returns '' both when Congress has published nothing and
  // when it has published a summary consisting only of the bill's own title —
  // a real pattern for freshly numbered bills — so gating on it stated
  // "Congress has not published…" about bills where Congress had.
  if (!bill.latest_summary) {
    text +=
      ' Congress has not published a plain-language summary of this bill yet;' +
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
  const type = billType.toLowerCase();
  if (type === 'hjres' || type === 'sjres') return 'Joint Resolution';
  if (type === 'hconres' || type === 'sconres') return 'Concurrent Resolution';
  if (type === 'hres' || type === 'sres') return 'Resolution';
  return 'Bill';
}
