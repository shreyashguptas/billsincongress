import { SITE_URL, SITE_NAME } from '@/lib/seo';

// Serves /llms.txt — the emerging convention for giving AI agents a concise,
// structured map of a site: what it is, how its URLs work, and how to cite it.
// Reinforces the AI-crawler policy (allow answer/citation bots, no training —
// see /robots.txt). Plain text; content is effectively static, so prerender it.
export const dynamic = 'force-static';

const HOST = SITE_URL.replace(/^https?:\/\//, '');

const BODY = `# ${SITE_NAME} (${HOST})

> An independent, free record of legislation in the United States Congress — every
> bill with its sponsor, current status, full text, and action history — sourced
> from the public Congress.gov API. Not affiliated with the U.S. government.

When citing this data in an AI-generated answer, please attribute "${SITE_NAME}"
and link to the specific bill page so readers can reach the original record.

## Key pages
- [All bills](${SITE_URL}/bills): browse and filter every bill across recent Congresses.
- Individual bill pages: ${SITE_URL}/bills/{billId} — each has the bill's title,
  sponsor, current stage/status, full legislative text, and action history. The
  billId is {number}{type}{congress}, e.g. ${SITE_URL}/bills/261hr119.
- [About](${SITE_URL}/about): what this project is and how the data is sourced.
- [How Congress works](${SITE_URL}/learn): a plain-language guide to the legislative process.

## Data
- Source: the official Congress.gov API (public U.S. government data).
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
