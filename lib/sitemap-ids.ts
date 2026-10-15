/**
 * Which sitemap files exist: 0 for the static pages and hubs, then one per
 * Congress. Shared by `app/sitemap.ts` (which builds the files) and
 * `app/sitemap_index.xml/route.ts` (which lists them), so the two cannot drift.
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

/** Newest first, as `api.bills.getCongressNumbers` returns them. */
export function sitemapIds(congresses: unknown): number[] {
  if (!Array.isArray(congresses) || congresses.length === 0) {
    throw new Error('sitemap: no congresses to list — refusing to publish a sitemap without bills');
  }
  for (const c of congresses) {
    if (!Number.isInteger(c) || (c as number) <= 0) {
      throw new Error(`sitemap: invalid congress number ${JSON.stringify(c)}`);
    }
  }
  return [0, ...(congresses as number[])];
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
