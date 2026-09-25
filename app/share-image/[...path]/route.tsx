import { ImageResponse } from 'next/og';
import { hubByPath } from '@/lib/hubs';
import { DEFAULT_OG_IMAGE, SHARE_CARD_SIZE } from '@/lib/seo';
import { shareCardFonts } from '@/lib/og/card-parts';
import { HubShareCard } from '@/lib/og/hub-share-card';
import { loadHubCardData } from '@/lib/og/hub-share-data';

/**
 * The share card for a status, chamber or topic page
 * (lib/og/hub-share-card.tsx): `/share-image/bills/topic/health` draws the card
 * for `/bills/topic/health`. Each hub page names it as its og:image, with its
 * headline count in the query string (`hubShareImagePath` in lib/seo.ts); the
 * query only busts caches, and the card is always drawn from current figures.
 *
 * Outside `/bills`, so the middleware's page cache policy never touches it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const hub = hubByPath(`/${path.join('/')}`);
  if (!hub) return new Response('Not found', { status: 404 });

  const data = await loadHubCardData(hub).catch((error) => {
    console.error(`loadHubCardData(${hub.path}) failed:`, error);
    return null;
  });
  if (!data) {
    // A figure could not be read in full. Send the site's own card for now,
    // uncached, rather than a card with a number we cannot stand behind.
    return new Response(null, {
      status: 307,
      headers: {
        location: new URL(DEFAULT_OG_IMAGE.url, request.url).toString(),
        'cache-control': 'no-store',
      },
    });
  }

  return new ImageResponse(<HubShareCard data={data} />, {
    ...SHARE_CARD_SIZE,
    fonts: shareCardFonts(),
    headers: {
      // As the bill card: a day, not next/og's year-and-immutable default.
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
