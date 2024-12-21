import { createClient } from '@/utils/supabase/server';
import { BILL_INFO_TABLE_NAME, BillInfo } from '@/lib/types/BillInfo';
import { BillCard } from '@/components/bills/bill-card';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate the page every hour

export default async function BillsPage() {
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
      return (
        <div className="container mx-auto py-8">
          <h1 className="text-2xl font-bold mb-6">Latest Bills</h1>
          <p className="text-muted-foreground">Error loading bills.</p>
        </div>
      );
    }

    // Transform the data to match BillInfo type
    const bills: BillInfo[] = (data || []).map(bill => ({
      ...bill,
      bill_subjects: bill.bill_subjects && bill.bill_subjects.length > 0
        ? { policy_area_name: bill.bill_subjects[0].policy_area_name }
        : null
    }));

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
  } catch (error) {
    console.error('Unexpected error:', error);
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">Latest Bills</h1>
        <p className="text-muted-foreground">Error loading bills.</p>
      </div>
    );
  }
}