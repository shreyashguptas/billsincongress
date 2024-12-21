import { createClient } from '@/utils/supabase/client';
import { BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { BillCard } from '@/components/bills/bill-card';

async function getInitialBills() {
  console.log('Starting to fetch bills...');
  console.log('Table name:', BILL_INFO_TABLE_NAME);
  
  const supabase = createClient();

  try {
    // First, let's check if we can count the total rows
    const { count, error: countError } = await supabase
      .from(BILL_INFO_TABLE_NAME)
      .select('*', { count: 'exact', head: true });

    console.log('Total rows in table:', count);
    if (countError) {
      console.error('Error counting rows:', countError);
    }

    // Now try to fetch the actual data
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
        progress_description
      `)
      .order('introduced_date', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching bills:', error.message);
      console.error('Error details:', error);
      return [];
    }

    console.log('Found bills:', data?.length || 0);
    if (data?.length === 0) {
      console.log('No bills found in the database. Please check if:');
      console.log('1. The table exists and has the correct name');
      console.log('2. There is data in the table');
      console.log('3. The permissions are set correctly in Supabase');
      console.log('4. RLS policies are configured correctly');
    } else {
      console.log('First bill data:', data[0]);
    }
    return data || [];
  } catch (error) {
    console.error('Unexpected error:', error);
    return [];
  }
}

export default async function BillsPage() {
  const bills = await getInitialBills();

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