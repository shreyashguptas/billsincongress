import type { Metadata } from 'next';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import { SHARE_CARD_SIZE, SITE_NAME, homeShareImagePath } from '@/lib/seo';
import { homeCongress } from '@/lib/congress';
import DashboardClient, {
  type InitialDashboardData,
} from '@/components/dashboard/dashboard-client';

const HOME_TITLE = 'Bills in Congress — Congressional Bill Tracker for Every Bill';
// "Congressional Bill Tracker" was this site's name, and the phrase its home
// page ranked on in Bing. Renaming the site to "Bills in Congress" on 25 Sep
// 2026 (#121) took it out of the title, and Bing visitors landing here fell
// from ~55 a day to ~20 the same morning, while bill pages held steady. The
// phrase stays in the title, the description and the hero's opening line.
const HOME_DESCRIPTION =
  'A congressional bill tracker for every bill in the U.S. Congress: live status, plain-language summaries, sponsors, and progress. Independent, from Congress.gov.';

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
  // Read first: it names the newest Congress we hold, which is the default.
  const allCongress = await loadOverview();
  const congress = Number(params.congress) || homeCongress(allCongress);
  const data = await loadDashboardData(congress, allCongress);
  return <DashboardClient initialCongress={congress} initialData={data} />;
}

// Fetches all dashboard data for a given Congress directly from Convex and is
// rendered server-side on each request. The bills dataset syncs roughly once a
// day, so per-request freshness is fine; we prefer plain dynamic rendering over
// the previous experimental Cache Components streaming, which did not render
// reliably on the Cloudflare Workers runtime.
async function loadOverview(): Promise<InitialDashboardData['allCongress'] | null> {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return null;
  try {
    return await fetchQuery(api.bills.getAllCongressOverview);
  } catch (error) {
    console.error('loadOverview failed:', error);
    return null;
  }
}

async function loadDashboardData(
  congress: number,
  allCongress: InitialDashboardData['allCongress'] | null,
): Promise<InitialDashboardData | null> {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL || !allCongress) return null;

  try {
    const [dashboard, house, senate] = await Promise.all([
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
