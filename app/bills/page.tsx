import { BillsOverview } from '@/components/bills/bills-overview';
import { BillsHeader } from '@/components/bills/bills-header';
import { createClient } from '@/utils/supabase/server';
import { BillInfo, BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { sharedViewport } from '../shared-metadata';
import type { Viewport } from 'next';
import { Database } from '@/lib/database.types';

export const viewport: Viewport = sharedViewport;

async function getInitialBills(): Promise<BillInfo[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(BILL_INFO_TABLE_NAME)
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(9);

  if (error) {
    console.error('Error fetching initial bills:', error);
    return [];
  }

  return (data as unknown as BillInfo[]) || [];
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BillsPage() {
  const initialBills = await getInitialBills();

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