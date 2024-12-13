import { BillsOverview } from '@/components/bills/bills-overview';
import { BillsHeader } from '@/components/bills/bills-header';
import { supabase } from '@/lib/supabase';
import { Bill } from '@/lib/types';

// Helper function to transform Supabase data to Bill type
const transformBillData = (data: any): Bill => ({
  id: data.id,
  title: data.title,
  congressNumber: data.congress_number,
  billType: data.bill_type,
  billNumber: data.bill_number,
  sponsorName: data.sponsor_name,
  sponsorState: data.sponsor_state,
  sponsorParty: data.sponsor_party,
  sponsorBioguideId: data.sponsor_bioguide_id,
  committeeCount: data.committee_count,
  latestActionText: data.latest_action_text,
  latestActionDate: data.latest_action_date,
  updateDate: data.update_date,
  status: data.status,
  progress: data.progress || 0,
  summary: data.summary,
  tags: Array.isArray(data.tags) ? data.tags : [],
  aiSummary: data.ai_summary,
  lastUpdated: data.last_updated,
  voteCount: data.vote_count || {
    yea: 0,
    nay: 0,
    present: 0,
    notVoting: 0
  }
});

async function getInitialBills() {
  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .order('update_date', { ascending: false })
    .range(0, 9);

  if (error) {
    console.error('Error fetching initial bills:', error);
    return [];
  }

  return data.map(transformBillData);
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