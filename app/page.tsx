import type { Metadata } from 'next';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import DashboardClient, {
  type InitialDashboardData,
} from '@/components/dashboard/DashboardClient';
import WavingFlag from '@/components/waving-flag';

export const metadata: Metadata = {
  title: {
    // Bypass the layout template — the homepage title should carry the full
    // positioning rather than "Home · Congressional Bill Tracker".
    absolute: 'Congressional Bill Tracker — Every Bill in the U.S. Congress',
  },
  description:
    'Track every bill in the United States Congress: live status, plain-language summaries, sponsors, and progress. Independent, sourced from Congress.gov.',
  alternates: {
    // `?congress=` views are variations of the same dashboard.
    canonical: '/',
  },
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ congress?: string }>;
}) {
  const params = await searchParams;
  const congress = Number(params.congress) || 119;
  const data = await loadDashboardData(congress);
  return (
    <>
      <DashboardClient initialCongress={congress} initialData={data} />
      {/* Closing note before the footer. Rendered here rather than inside the
          dashboard so it stays server-only and costs no client JavaScript. */}
      <section className="border-t border-border bg-background">
        <div className="container-editorial py-16 sm:py-24">
          <WavingFlag className="mx-auto max-w-4xl" />
        </div>
      </section>
    </>
  );
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
