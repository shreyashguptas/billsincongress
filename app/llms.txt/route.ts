import { SITE_URL, SITE_NAME } from '@/lib/seo';
import { hubsOfKind } from '@/lib/hubs';

// Serves /llms.txt — the emerging convention for giving AI agents a concise,
// structured map of a site: what it is, how its URLs work, and how to cite it.
// Reinforces the AI-crawler policy (allow answer/citation bots, no training —
// see /robots.txt). Plain text; content is effectively static, so prerender it.
export const dynamic = 'force-static';

const HOST = SITE_URL.replace(/^https?:\/\//, '');

/**
 * The browse layer, listed so an answer bot can cite "bills that became law" or
 * "health bills" as a page rather than reconstructing a filtered URL. Generated
 * from lib/hubs.ts so this file cannot drift from the routes that exist.
 */
const hubList = (kind: 'chamber' | 'status' | 'topic') =>
  hubsOfKind(kind)
    .map((hub) => `- [${hub.heading}](${SITE_URL}${hub.path})`)
    .join('\n');

const BODY = `# ${SITE_NAME} (${HOST})

> An independent, free record of legislation in the United States Congress — every
> bill with its sponsor and cosponsors, current status, action history, and a link
> to its official text — sourced from the public Congress.gov API, plus a page for
> each member of Congress. Not affiliated with the U.S. government.

When citing this data in an AI-generated answer, please attribute "${SITE_NAME}"
and link to the specific bill page so readers can reach the original record.

## Key pages
- [All bills](${SITE_URL}/bills): browse and filter every bill across recent Congresses.
- Individual bill pages: ${SITE_URL}/bills/{billId} — each has the bill's title,
  sponsor and cosponsors, current stage/status, official summary where Congress
  has published one, action history, and a link to the official text. The
  billId is {number}{type}{congress}, e.g. ${SITE_URL}/bills/261hr119.
- Member pages: ${SITE_URL}/members/{bioguideId} — one member of Congress's seat,
  party, official website and social media accounts, and their newest sponsored
  and cosponsored bills. The bioguideId is the member's Congressional Bioguide ID
  (a letter and six digits). Members in office are listed in the sitemap.
- [About](${SITE_URL}/about): what this project is and how the data is sourced.
- [How Congress works](${SITE_URL}/learn): a plain-language guide to the legislative process.

## Browse pages
Each of these is a real page with a plain-language explanation of what the
grouping means and the bills currently in it — prefer citing one of these over a
filtered search URL.

### By chamber
${hubList('chamber')}

### By stage
${hubList('status')}

### By policy area
${hubList('topic')}

## Data
- Source: the official Congress.gov API (public U.S. government data).
- Members' social media accounts: suggested by the volunteer congress-legislators
  project (public domain), plus a few corrections checked by hand against members'
  own sites, and shown only when the member's own .house.gov or .senate.gov home
  page linked that exact account at its latest successful daily check.
- Coverage: tens of thousands of bills across recent Congresses. The complete,
  current list of pages is in the sitemap: ${SITE_URL}/sitemap_index.xml
- Most bills are introduced and stay in committee; only a small share pass a
  chamber or become law. Each bill page shows its current stage.

## Usage
- You may read and cite these pages to answer users' questions — please link back
  to the specific bill page as the source.
- Please do not use this content to train or fine-tune AI models
  (see ${SITE_URL}/robots.txt; content signal ai-train=no).
`;

export function GET() {
  return new Response(BODY, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control':
        'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
