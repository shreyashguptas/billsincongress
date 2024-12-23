import { createClient } from '@supabase/supabase-js';
import { Bill } from '@/lib/types/bill';

const BILL_INFO_TABLE_NAME = 'bill_info';

function getStartDate(filter: string): Date {
  const now = new Date();
  const startDate = new Date();

  switch (filter) {
    case 'week':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(now.getMonth() - 1);
      break;
    case 'year':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      return now;
  }

  return startDate;
}

export interface BillQueryParams {
  page?: number;
  itemsPerPage?: number;
  status?: string;
  introducedDateFilter?: string;
  lastActionDateFilter?: string;
  sponsorFilter?: string;
  stateFilter?: string;
  policyArea?: string;
}

export interface BillsResponse {
  data: Bill[];
  count: number;
}

export const billsService = {
  getClient() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  },

  async fetchBills(params: BillQueryParams): Promise<BillsResponse> {
    const {
      page = 1,
      itemsPerPage = 10,
      status = 'all',
      introducedDateFilter = 'all',
      lastActionDateFilter = 'all',
      sponsorFilter = '',
      stateFilter = 'all',
      policyArea = 'all',
    } = params;

    const supabase = this.getClient();
    let query = supabase
      .from(BILL_INFO_TABLE_NAME)
      .select(`
        *,
        bill_subjects${policyArea !== 'all' ? '!inner' : ''} (
          policy_area_name
        )
      `, { count: 'exact' });

    if (status !== 'all') {
      query = query.eq('progress_description', status);
    }

    if (introducedDateFilter !== 'all') {
      const startDate = getStartDate(introducedDateFilter);
      query = query.gte('introduced_date', startDate.toISOString());
    }

    if (lastActionDateFilter !== 'all') {
      const startDate = getStartDate(lastActionDateFilter);
      query = query.gte('last_action_date', startDate.toISOString());
    }

    if (sponsorFilter) {
      const names = sponsorFilter.trim().split(/\s+/);
      if (names.length > 1) {
        const firstName = names[0];
        const lastNamePattern = names.slice(1).join(' ');
        query = query
          .eq('sponsor_first_name', firstName)
          .ilike('sponsor_last_name', `%${lastNamePattern}%`);
      } else {
        query = query.or(`sponsor_first_name.ilike.%${sponsorFilter}%,sponsor_last_name.ilike.%${sponsorFilter}%`);
      }
    }

    if (stateFilter !== 'all') {
      query = query.eq('sponsor_state', stateFilter);
    }

    if (policyArea !== 'all') {
      query = query.eq('bill_subjects.policy_area_name', policyArea);
    }

    const start = (page - 1) * itemsPerPage;
    query = query
      .order('introduced_date', { ascending: false })
      .range(start, start + itemsPerPage - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching bills:', error);
      throw new Error(`Failed to fetch bills: ${error.message || 'Unknown error'}`);
    }

    const transformedData = (data || []).map(bill => ({
      ...bill,
      bill_subjects: bill.bill_subjects?.[0] || { policy_area_name: '' }
    }));

    return {
      data: transformedData as Bill[],
      count: count || 0,
    };
  },

  async fetchFeaturedBills(): Promise<Bill[]> {
    const supabase = this.getClient();
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
        progress_stage,
        progress_description,
        bill_subjects (
          policy_area_name
        )
      `)
      .not('title', 'ilike', 'Reserved for the Speaker%')
      .order('introduced_date', { ascending: false })
      .limit(3);

    if (error) {
      console.error('Error fetching featured bills:', error);
      throw error;
    }

    const transformedData = (data || []).map(bill => ({
      ...bill,
      bill_subjects: bill.bill_subjects?.[0] || undefined
    }));

    return transformedData as Bill[];
  }
}; 