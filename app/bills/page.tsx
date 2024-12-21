import { BillsOverview } from '@/components/bills/bills-overview';
import { BillsHeader } from '@/components/bills/bills-header';
import { createClient } from '@/utils/supabase/server';
import { BillInfo, BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { sharedViewport } from '../shared-metadata';
import type { Viewport } from 'next';

export const viewport: Viewport = sharedViewport;

async function getInitialBills(): Promise<BillInfo[]> {
  console.log('Starting to fetch initial bills...');
  const supabase = createClient();
  
  try {
    // First, let's count how many bills we have
    const { count, error: countError } = await supabase
      .from(BILL_INFO_TABLE_NAME)
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error counting bills:', countError);
    } else {
      console.log('Total bills in database:', count);
    }

    // Now fetch the actual bills
    const { data, error } = await supabase
      .from(BILL_INFO_TABLE_NAME)
      .select(`
        id,
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
      .limit(9);

    if (error) {
      console.error('Error fetching initial bills:', error);
      return [];
    }

    console.log('Fetched bills:', data);
    return data || [];
  } catch (error) {
    console.error('Unexpected error in getInitialBills:', error);
    return [];
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BillsPage() {
  const initialBills = await getInitialBills();
  console.log('Initial bills:', initialBills); // Debug log

  return (
    <div className="w-full bg-background">
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="mx-auto max-w-[1200px] space-y-8">
          <BillsHeader />
          <BillsOverview initialBills={initialBills} />
        </div>
      </div>
    </div>
  );
}