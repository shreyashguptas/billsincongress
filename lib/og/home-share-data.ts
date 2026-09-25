import { getConvexHttpClient } from '@/lib/convex-client';
import { HOME_CONGRESS } from '@/lib/congress';
import { homeCardFromDashboard, type DashboardStats, type HomeCardData } from './home-share-card';

/** Reads one Congress's dashboard row; injectable so tests can see what was asked for. */
export type DashboardReader = (congress: number) => Promise<DashboardStats | null>;

const readDashboard: DashboardReader = async (congress) => {
  const client = getConvexHttpClient();
  if (!client) return null;
  const { api } = await import('../../convex/_generated/api');
  return client.query(api.bills.getCongressDashboard, { congress });
};

/**
 * The home page card's figures: the home page's own dashboard row, for the
 * Congress the home page shows by default (`HOME_CONGRESS`, which app/page.tsx
 * reads too). Null when it cannot be read, and the route then sends the
 * generic card.
 */
export async function loadHomeCardData(
  read: DashboardReader = readDashboard,
): Promise<HomeCardData | null> {
  const dashboard = await read(HOME_CONGRESS);
  return dashboard ? homeCardFromDashboard(dashboard) : null;
}
