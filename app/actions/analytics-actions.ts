import { ConvexHttpClient } from 'convex/browser';

// Type definitions for the analytics data
export interface BillsByCongressData {
  congress: number;
  bill_count: number;
  house_bill_count: number;
  senate_bill_count: number;
}

export interface LatestCongressStatusData {
  progress_stage: number;
  progress_description: string;
  bill_count: number;
}

function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

/**
 * Fetches the number of bills introduced by the last 5 Congresses.
 * Uses Convex backend.
 */
export async function getBillsByCongressData(): Promise<BillsByCongressData[]> {
  const client = getConvexClient();
  if (!client) return [];

  try {
    const { api } = await import('../../convex/_generated/api');
    const data = await client.query(api.bills.billsByCongress);
    return data as BillsByCongressData[];
  } catch (error) {
    console.error('Error fetching bills by congress data:', error);
    return [];
  }
}

/**
 * Fetches the status breakdown of bills in the latest Congress.
 * Uses Convex backend.
 */
export async function getLatestCongressStatusData(): Promise<LatestCongressStatusData[]> {
  const client = getConvexClient();
  if (!client) return [];

  try {
    const { api } = await import('../../convex/_generated/api');
    const data = await client.query(api.bills.latestCongressStatus);
    return data as LatestCongressStatusData[];
  } catch (error) {
    console.error('Error fetching latest Congress status data:', error);
    return [];
  }
}
