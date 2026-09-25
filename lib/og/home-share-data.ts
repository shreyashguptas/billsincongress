import { billsService } from '@/lib/services/bills-service';
import { getConvexHttpClient } from '@/lib/convex-client';
import { homeCardFromDashboard, type HomeCardData } from './home-share-card';

/**
 * The home page card's figures, for the current Congress: the home page's own
 * dashboard row. Null when it cannot be read, and the route then sends the
 * generic card.
 */
export async function loadHomeCardData(): Promise<HomeCardData | null> {
  const congress = (await billsService.getAvailableCongressNumbers())[0];
  const client = getConvexHttpClient();
  if (!congress || !client) return null;
  const { api } = await import('../../convex/_generated/api');
  const dashboard = await client.query(api.bills.getCongressDashboard, { congress });
  return dashboard ? homeCardFromDashboard(dashboard) : null;
}
