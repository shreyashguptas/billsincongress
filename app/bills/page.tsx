import { createClient } from '@supabase/supabase-js';
import { BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { BillCard } from '@/components/bills/bill-card';

async function getInitialBills() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    }
  );

  const { data, error } = await supabaseAdmin
    .from(BILL_INFO_TABLE_NAME)
    .select('*')
    .order('introduced_date', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching bills:', error);
    return [];
  }

  console.log('Found bills:', data?.length || 0);
  return data || [];
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