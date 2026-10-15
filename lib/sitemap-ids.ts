/**
 * Which sitemap files exist: 0 for the static pages and hubs, then eight per
 * Congress, one for each quarter of its two years. Shared by `app/sitemap.ts`
 * (which builds the files) and `app/sitemap_index.xml/route.ts` (which lists
 * them), so the two cannot drift.
 *
 * Why quarters. Google read the small files (the index, and the 49 static
 * pages) within seconds, but on 14 and 15 Oct 2026 recorded "Sitemap could not
 * be read" for every one-file-per-Congress sitemap, 17,828 to 19,649 URLs and
 * 1.7 to 1.9 MB each, at both their old and new addresses, while its own live
 * test and Bing read the same files without trouble. A quarter holds at most
 * 4,315 bills (the first quarter of the 119th), about 430 KB. Quarters, not a
 * fixed count per file, because a bill never changes the day it was
 * introduced: each file's set is fixed by an indexed date range, read
 * directly, so building the eighth file does not mean paging through the
 * first seven.
 *
 * The rule this module exists for: a sitemap must never answer "OK" with less
 * than the whole site. Google read the index once, on 23 Jun 2026, recorded
 * "Success, 0 discovered pages", and did not read it again for three months,
 * so in all that time it knew 6 of the site's ~56,000 pages. Both callers used
 * to catch a failed Congress lookup and carry on with `[0]` alone: a successful
 * response listing only the static file, which the edge cache could then serve
 * for up to 30 days. A failure now throws instead. A route that throws returns
 * a 5xx, which Google retries, and the incremental cache keeps serving the last
 * good copy instead of replacing it with a short one.
 *
 * Pure module so it carries unit tests.
 */

/** A Congress runs two calendar years, so eight quarters. */
export const QUARTERS_PER_CONGRESS = 8;

/** Newest Congress first, as `api.bills.getCongressNumbers` returns them. */
function validCongresses(congresses: unknown): number[] {
  if (!Array.isArray(congresses) || congresses.length === 0) {
    throw new Error('sitemap: no congresses to list — refusing to publish a sitemap without bills');
  }
  for (const c of congresses) {
    if (!Number.isInteger(c) || (c as number) <= 0) {
      throw new Error(`sitemap: invalid congress number ${JSON.stringify(c)}`);
    }
  }
  return congresses as number[];
}

/**
 * Every file Next.js builds: 0, then all eight quarters of each Congress,
 * including quarters that have not begun. A quarter's file exists before its
 * first bill does, so a new quarter needs no deploy; the index lists it once it
 * starts (`listedSitemapIds`).
 */
export function sitemapIds(congresses: unknown): number[] {
  return [0, ...validCongresses(congresses).flatMap((c) => quarterIds(c))];
}

/** The files the index lists: every quarter that has begun by `today` (YYYY-MM-DD). */
export function listedSitemapIds(congresses: unknown, today: string): number[] {
  return [
    0,
    ...validCongresses(congresses).flatMap((c) =>
      quarterIds(c).filter((id) => sitemapChunk(id).from <= today),
    ),
  ];
}

function quarterIds(congress: number): number[] {
  return Array.from({ length: QUARTERS_PER_CONGRESS }, (_, i) => congress * 10 + i + 1);
}

export interface SitemapChunk {
  congress: number;
  quarter: number;
  /** First day of the quarter. The first quarter's range opens at '' instead. */
  from: string;
  /** Lower bound of the range as queried: '' for the first quarter, so nothing earlier is lost. */
  introducedFrom: string;
  /** First day after the quarter; null for the last, which stays open so nothing later is lost. */
  introducedBefore: string | null;
}

/**
 * The bills in file `id` (Congress × 10 + quarter, so 1191 is the 119th's
 * first quarter): those introduced in that quarter. The first quarter starts at
 * the beginning of time and the last runs on forever, so a bill dated after its
 * Congress's second year (six were, in Oct 2026: introduced on 1 or 2 January,
 * before the next Congress convened) still lands in exactly one file.
 */
export function sitemapChunk(id: number): SitemapChunk {
  const congress = Math.floor(id / 10);
  const quarter = id % 10;
  if (!Number.isInteger(id) || congress <= 0 || quarter < 1 || quarter > QUARTERS_PER_CONGRESS) {
    throw new Error(`sitemap: ${id} names no Congress quarter`);
  }
  // The 1st Congress began in 1789; each runs two years from January.
  const firstYear = 1789 + 2 * (congress - 1);
  const start = (q: number) => {
    const months = (q - 1) * 3;
    const year = firstYear + Math.floor(months / 12);
    return `${year}-${String((months % 12) + 1).padStart(2, '0')}-01`;
  };
  return {
    congress,
    quarter,
    from: start(quarter),
    introducedFrom: quarter === 1 ? '' : start(quarter),
    introducedBefore: quarter === QUARTERS_PER_CONGRESS ? null : start(quarter + 1),
  };
}

/**
 * A bill's `<lastmod>`: the day of its latest action, or of its introduction
 * when it has none. Both are days the page's content really changed.
 *
 * It used to be the row's `updatedAt`, which every bulk backfill re-stamps:
 * 14,547 of the 119th's 19,649 bills shared 2026-08-01, and every 118th bill but
 * one shared 2026-02-17. Google uses lastmod only when it is "consistently and
 * verifiably accurate", and Bing asks for the date the content changed, not the
 * date the file was built. A date we cannot read is left out, never guessed.
 */
export function billLastModified(bill: {
  latestActionDate?: string | null;
  introducedDate?: string | null;
}): string | undefined {
  for (const raw of [bill.latestActionDate, bill.introducedDate]) {
    const day = raw?.slice(0, 10);
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day))) return day;
  }
  return undefined;
}

/**
 * The public address of a sitemap file. At the site root, not under
 * `/sitemap/`: the sitemap protocol scopes a file to the folder it sits in, so
 * `/sitemap/119.xml` may only list `/sitemap/...` pages, and Google applies that
 * rule to any file not submitted by hand. Next.js builds the files at
 * `/sitemap/<id>.xml`; next.config.mjs rewrites this address onto that one.
 */
export function sitemapFileUrl(siteUrl: string, id: number): string {
  return `${siteUrl}/sitemap-${id}.xml`;
}
