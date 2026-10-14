import { getConvexHttpClient } from '@/lib/convex-client';
import { homeCongress } from '@/lib/congress';
import { homeCardFromDashboard, type DashboardStats, type HomeCardData } from './home-share-card';

/** Reads one Congress's dashboard row; injectable so tests can see what was asked for. */
export type DashboardReader = (congress: number) => Promise<DashboardStats | null>;
/** Reads the per-Congress totals, which name the newest Congress we hold. */
export type OverviewReader = () => Promise<Array<{ congress: number; totalCount: number }> | null>;

const readOverview: OverviewReader = async () => {
  const client = getConvexHttpClient();
  if (!client) return null;
  const { api } = await import('../../convex/_generated/api');
  return client.query(api.bills.getAllCongressOverview, {});
};

const readDashboard: DashboardReader = async (congress) => {
  const client = getConvexHttpClient();
  if (!client) return null;
  const { api } = await import('../../convex/_generated/api');
  return client.query(api.bills.getCongressDashboard, { congress });
};

/**
 * The home page card's figures: the home page's own dashboard row, for the
 * Congress the home page shows by default (`homeCongress`, which app/page.tsx
 * calls too). Null when it cannot be read, and the route then sends the
 * generic card.
 */
export async function loadHomeCardData(
  read: DashboardReader = readDashboard,
  overview: OverviewReader = readOverview,
): Promise<HomeCardData | null> {
  const dashboard = await read(homeCongress(await overview()));
  return dashboard ? homeCardFromDashboard(dashboard) : null;
}
