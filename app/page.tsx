import type { Metadata } from 'next';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import { SHARE_CARD_SIZE, SITE_NAME, homeShareImagePath } from '@/lib/seo';
import { HOME_CONGRESS } from '@/lib/congress';
import DashboardClient, {
  type InitialDashboardData,
} from '@/components/dashboard/DashboardClient';

const HOME_TITLE = 'Bills in Congress — Track Every Bill in the U.S. Congress';
const HOME_DESCRIPTION =
  'Track every bill in the United States Congress: live status, plain-language summaries, sponsors, and progress. Independent, sourced from Congress.gov.';

// A function rather than a constant only so the share card's URL carries
// today's date (`homeShareImagePath`); nothing here is fetched.
export function generateMetadata(): Metadata {
  // The home page's own card (app/share-image/home). A page-level openGraph
  // replaces the root one wholesale, so everything it held is restated.
  const shareImage = {
    url: homeShareImagePath(),
    ...SHARE_CARD_SIZE,
    type: 'image/png',
    alt: 'Bills in Congress: every bill and resolution in the current Congress, and where each one stands',
  };
  return {
    title: {
      // Bypass the layout template — the homepage title should carry the full
      // positioning rather than "Home · Bills in Congress".
      absolute: HOME_TITLE,
    },
    description: HOME_DESCRIPTION,
    alternates: {
      // `?congress=` views are variations of the same dashboard.
      canonical: '/',
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_US',
      url: '/',
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      images: [shareImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      images: [shareImage],
    },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ congress?: string }>;
}) {
  const params = await searchParams;
  const congress = Number(params.congress) || HOME_CONGRESS;
  const data = await loadDashboardData(congress);
  return <DashboardClient initialCongress={congress} initialData={data} />;
}

// Fetches all dashboard data for a given Congress directly from Convex and is
// rendered server-side on each request. The bills dataset syncs roughly once a
// day, so per-request freshness is fine; we prefer plain dynamic rendering over
// the previous experimental Cache Components streaming, which did not render
// reliably on the Cloudflare Workers runtime.
async function loadDashboardData(
  congress: number,
): Promise<InitialDashboardData | null> {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return null;

  try {
    const [allCongress, dashboard, house, senate] = await Promise.all([
      fetchQuery(api.bills.getAllCongressOverview),
      fetchQuery(api.bills.getCongressDashboard, { congress }),
      fetchQuery(api.bills.getChamberDeepBreakdown, {
        congress,
        chamber: 'house',
      }),
      fetchQuery(api.bills.getChamberDeepBreakdown, {
        congress,
        chamber: 'senate',
      }),
    ]);
    return { allCongress, dashboard, house, senate };
  } catch (error) {
    console.error('loadDashboardData failed:', error);
    return null;
  }
}
