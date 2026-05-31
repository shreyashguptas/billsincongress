import { fetchQuery } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import DashboardClient, {
  type InitialDashboardData,
} from './components/dashboard/DashboardClient';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ congress?: string }>;
}) {
  const params = await searchParams;
  const congress = Number(params.congress) || 119;
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
