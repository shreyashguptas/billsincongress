import { createClient } from '@/utils/supabase/server';
import { BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { BillCard } from '@/components/bills/bill-card';
import { unstable_cache } from 'next/cache';

// Cache the bills fetching function
const getCachedBills = unstable_cache(
  async () => {
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from(BILL_INFO_TABLE_NAME)
        .select(`
          id,
          congress,
          bill_type,
          bill_number,
          bill_type_label,
          introduced_date,
          title,
          sponsor_first_name,
          sponsor_last_name,
          sponsor_party,
          sponsor_state,
          latest_action_code,
          latest_action_date,
          latest_action_text,
          progress_stage,
          progress_description,
          bill_subjects (
            policy_area_name
          )
        `)
        .order('introduced_date', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching bills:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Unexpected error:', error);
      return [];
    }
  },
  ['bills-page'],
  {
    revalidate: 3600, // Cache for 1 hour
    tags: ['bills']
  }
);

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate the page every hour

export default async function BillsPage() {
  const bills = await getCachedBills();

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Latest Bills</h1>
      {bills.length === 0 ? (
        <p className="text-muted-foreground">No bills found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bills.map((bill) => (
            <BillCard key={bill.id} bill={bill} />
          ))}
        </div>
      )}
    </div>
  );
}