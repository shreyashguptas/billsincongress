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

/** Meta description for a bill: plain-language summary, else official title. */
export function billSeoDescription(bill: Bill): string {
  const summary = bill.latest_summary ? stripHtml(bill.latest_summary) : '';
  const source = summary || bill.title;
  return truncateAtWord(source, 155);
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
