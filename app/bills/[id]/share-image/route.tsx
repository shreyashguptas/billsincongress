import { ImageResponse } from 'next/og';
import { DEFAULT_OG_IMAGE, SHARE_CARD_SIZE } from '@/lib/seo';
import { BillShareCard, shareCardFonts } from '@/lib/og/bill-share-card';
import { lookupBill } from '../get-bill';

/**
 * The picture a bill's link unfurls into (lib/og/bill-share-card.tsx), drawn
 * on request from the live record. Every bill page names it as its og:image
 * and twitter:image, with the bill's stage in the query string
 * (`billShareImagePath` in lib/seo.ts); the query only busts caches, and the
 * card is always drawn from the bill as it stands now.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await lookupBill(id);

  if (result.status === 'missing') {
    return new Response('Not found', { status: 404 });
  }
  if (result.status === 'error') {
    // Could not reach the record. Send the site's own card for now, uncached,
    // so the next crawler to ask gets the real one.
    return new Response(null, {
      status: 307,
      headers: {
        location: new URL(DEFAULT_OG_IMAGE.url, request.url).toString(),
        'cache-control': 'no-store',
      },
    });
  }

  return new ImageResponse(<BillShareCard bill={result.bill} />, {
    ...SHARE_CARD_SIZE,
    fonts: shareCardFonts(),
    headers: {
      // next/og's default is a year and `immutable`, which is right for a
      // picture that cannot change and wrong for one that states a status. A
      // day here, and the stage in the URL does the rest when the bill moves.
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
