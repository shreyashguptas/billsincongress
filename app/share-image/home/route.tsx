import { ImageResponse } from 'next/og';
import { DEFAULT_OG_IMAGE, SHARE_CARD_SIZE } from '@/lib/seo';
import { shareCardFonts } from '@/lib/og/card-parts';
import { HomeShareCard } from '@/lib/og/home-share-card';
import { loadHomeCardData } from '@/lib/og/home-share-data';

/**
 * The home page's share card (lib/og/home-share-card.tsx), named by the home
 * page's metadata. A static segment, so it wins over the hub catch-all beside
 * it (`[...path]`), which would 404 "home" as an unknown hub.
 */
export async function GET(request: Request) {
  const data = await loadHomeCardData().catch((error) => {
    console.error('loadHomeCardData failed:', error);
    return null;
  });
  if (!data) {
    return new Response(null, {
      status: 307,
      headers: {
        location: new URL(DEFAULT_OG_IMAGE.url, request.url).toString(),
        'cache-control': 'no-store',
      },
    });
  }
  return new ImageResponse(<HomeShareCard data={data} />, {
    ...SHARE_CARD_SIZE,
    fonts: shareCardFonts(),
    headers: {
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
