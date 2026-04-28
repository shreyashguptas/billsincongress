import { Suspense } from 'react';
import { cacheLife, cacheTag } from 'next/cache';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import DashboardClient, {
  type InitialDashboardData,
} from './components/dashboard/DashboardClient';

// PPR pattern: the page itself is fully static (just a shell + Suspense
// boundary). Dynamic searchParams are awaited inside the Suspense'd loader
// so they don't block the static shell from flushing to the browser.
export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ congress?: string }>;
}) {
  return (
    <Suspense fallback={<HomeShell />}>
      <DashboardServerLoader searchParams={searchParams} />
    </Suspense>
  );
}

function HomeShell() {
  return (
    <div className="container-editorial py-16 sm:py-24">
      <div className="space-y-3">
        <div className="h-3 w-32 bg-secondary rounded-sm animate-pulse" />
        <div className="h-12 w-3/4 bg-secondary rounded-sm animate-pulse" />
        <div className="h-4 w-1/2 bg-secondary rounded-sm animate-pulse" />
      </div>
    </div>
  );
}

async function DashboardServerLoader({
  searchParams,
}: {
  searchParams: Promise<{ congress?: string }>;
}) {
  const params = await searchParams;
  const congress = Number(params.congress) || 119;
  const data = await loadDashboardData(congress);
  return <DashboardClient initialCongress={congress} initialData={data} />;
}

// Cached at the edge — the function argument forms the cache key, so
// `?congress=119` and `?congress=118` get separate entries automatically.
// Bills sync once per day so a 10-minute revalidate window is generous;
// 1-hour hard expiry keeps the cache from going arbitrarily stale.
async function loadDashboardData(
  congress: number,
): Promise<InitialDashboardData | null> {
  'use cache';
  cacheLife({ stale: 60, revalidate: 600, expire: 3600 });
  cacheTag('bills-dashboard', `bills-dashboard-${congress}`);

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
