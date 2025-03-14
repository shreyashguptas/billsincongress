import { createClient } from '@/lib/services/supabase/server';
import { unstable_cache } from 'next/cache';

// Type definition for the analytics data
export interface BillsByCongressData {
  congress: number;
  bill_count: number;
  house_bill_count: number;
  senate_bill_count: number;
}

/**
 * Fetches the number of bills introduced by the last 5 Congresses
 * Uses Next.js caching to improve performance
 */
export const getBillsByCongressData = unstable_cache(
  async () => {
    const supabase = createClient();
    
    // Query the materialized view and get the latest 5 congresses
    const { data, error } = await supabase
      .from('app_analytics_bills_by_congress')
      .select('*')
      .order('congress', { ascending: false })
      .limit(5);
      
    if (error) {
      console.error('Error fetching bills by congress data:', error);
      return [];
    }
    
    // Return data in reverse order so the chart shows earlier congresses on the left
    return data.reverse();
  },
  // Cache key
  ['analytics-bills-by-congress'],
  // Revalidate every 24 hours (in seconds)
  { revalidate: 86400 }
); 