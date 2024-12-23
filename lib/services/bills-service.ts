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
  status?: string | null;
  introducedDateFilter?: string | null;
  lastActionDateFilter?: string | null;
  sponsorFilter?: string;
  titleFilter?: string;
  stateFilter?: string | null;
  policyArea?: string | null;
  billType?: string | null;
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

  async fetchBillById(id: string): Promise<Bill> {
    const supabase = this.getClient();
    
    // Fetch bill info
    const { data: billData, error: billError } = await supabase
      .from('bill_info')
      .select(`
        *,
        bill_subjects (
          policy_area_name
        )
      `)
      .eq('id', id)
      .single();

    if (billError) {
      console.error('Error fetching bill:', billError);
      throw new Error(billError.message || 'Failed to fetch bill');
    }

    // Fetch latest summary
    const { data: summaryData, error: summaryError } = await supabase
      .from('bill_summaries')
      .select('text')
      .eq('id', id)
      .order('update_date', { ascending: false })
      .limit(1)
      .single();

    if (summaryError && summaryError.code !== 'PGRST116') {
      console.error('Error fetching summary:', summaryError);
    }

    return {
      ...billData,
      bill_subjects: billData.bill_subjects?.[0] || { policy_area_name: '' },
      latest_summary: summaryData?.text || ''
    } as Bill;
  },

  async fetchBills(params: BillQueryParams): Promise<BillsResponse> {
    const {
      page = 1,
      itemsPerPage = 10,
      status = 'all',
      introducedDateFilter = 'all',
      lastActionDateFilter = 'all',
      sponsorFilter = '',
      titleFilter = '',
      stateFilter = 'all',
      policyArea = 'all',
      billType = 'all'
    } = params;

    console.log('Fetching bills with policy area:', policyArea);

    const supabase = this.getClient();
    let query = supabase
      .from(BILL_INFO_TABLE_NAME)
      .select(`
        *,
        bill_subjects!inner (
          policy_area_name
        )
      `, { count: 'exact' });

    // Add filters
    if (status && status !== 'all') {
      query = query.eq('progress_description', status);
    }

    if (introducedDateFilter && introducedDateFilter !== 'all') {
      const startDate = getStartDate(introducedDateFilter);
      query = query.gte('introduced_date', startDate.toISOString());
    }

    if (lastActionDateFilter && lastActionDateFilter !== 'all') {
      const startDate = getStartDate(lastActionDateFilter);
      query = query.gte('last_action_date', startDate.toISOString());
    }

    if (titleFilter) {
      const cleanedTitle = titleFilter.trim().toLowerCase().replace(/\s+/g, ' ');
      
      if (cleanedTitle) {
        const words = cleanedTitle.split(' ').filter(word => word.length > 0);
        if (words.length > 0) {
          const conditions = words.map(word => 
            `title.ilike.%${word}%`
          ).join(',');
          
          query = query.or(conditions);
        }
      }
    }

    if (sponsorFilter) {
      const cleanedFilter = sponsorFilter.trim().toLowerCase().replace(/\s+/g, ' ');
      
      if (cleanedFilter) {
        const names = cleanedFilter.split(' ').filter(part => part.length > 0);
        
        if (names.length > 1) {
          const conditions = names.map(name => 
            `sponsor_first_name.ilike.%${name}%,sponsor_last_name.ilike.%${name}%`
          ).join(',');
          
          query = query.or(conditions);
        } else if (names.length === 1) {
          query = query.or(
            `sponsor_first_name.ilike.%${names[0]}%,sponsor_last_name.ilike.%${names[0]}%`
          );
        }
      }
    }

    if (stateFilter && stateFilter !== 'all') {
      query = query.eq('sponsor_state', stateFilter);
    }

    if (policyArea && policyArea !== 'all') {
      console.log('Applying policy area filter:', policyArea);
      query = query
        .eq('bill_subjects.policy_area_name', policyArea)
        .not('bill_subjects.policy_area_name', 'is', null);
    }

    if (billType && billType !== 'all') {
      query = query.eq('bill_type', billType);
    }

    const start = (page - 1) * itemsPerPage;
    query = query
      .order('introduced_date', { ascending: false })
      .range(start, start + itemsPerPage - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching bills:', error);
      throw new Error(error.message || 'Failed to fetch bills');
    }

    // Log the raw data for debugging
    console.log('Raw bill data example:', {
      firstBill: data?.[0] ? {
        id: data[0].id,
        subjects: data[0].bill_subjects
      } : null,
      totalBills: data?.length || 0
    });

    const transformedData = (data || []).map(bill => {
      // Log each bill's subjects
      console.log(`Bill ${bill.id} subjects:`, bill.bill_subjects);
      
      // Handle both array and single object cases
      const policyArea = Array.isArray(bill.bill_subjects) 
        ? bill.bill_subjects[0]?.policy_area_name 
        : bill.bill_subjects?.policy_area_name || '';
      
      return {
        ...bill,
        bill_subjects: { policy_area_name: policyArea }
      };
    });

    return {
      data: transformedData as Bill[],
      count: count || 0,
    };
  },

  async fetchFeaturedBills(): Promise<Bill[]> {
    const supabase = this.getClient();

    // First, try to get bills signed by the president
    const { data: signedBills, error: signedError } = await supabase
      .from(BILL_INFO_TABLE_NAME)
      .select(`
        *,
        bill_subjects!inner (
          policy_area_name
        )
      `)
      .eq('progress_description', 'Signed by President')
      .not('title', 'ilike', 'Reserved for the Speaker%')
      .order('introduced_date', { ascending: false })
      .limit(3);

    if (signedError) {
      console.error('Error fetching signed bills:', signedError);
      throw signedError;
    }

    // If we don't have 3 signed bills, get bills that are to president
    let featuredBills = signedBills || [];
    if (featuredBills.length < 3) {
      const remainingCount = 3 - featuredBills.length;
      const { data: toPresidentBills, error: toPresidentError } = await supabase
        .from(BILL_INFO_TABLE_NAME)
        .select(`
          *,
          bill_subjects!inner (
            policy_area_name
          )
        `)
        .eq('progress_description', 'To President')
        .not('title', 'ilike', 'Reserved for the Speaker%')
        .order('introduced_date', { ascending: false })
        .limit(remainingCount);

      if (toPresidentError) {
        console.error('Error fetching to-president bills:', toPresidentError);
        throw toPresidentError;
      }

      featuredBills = [...featuredBills, ...(toPresidentBills || [])];
    }

    // Log the raw data for debugging
    console.log('Featured bills data:', featuredBills.map(bill => ({
      id: bill.id,
      subjects: bill.bill_subjects
    })));

    // Transform the data using the same logic as fetchBills
    const transformedData = featuredBills.map(bill => {
      // Handle both array and single object cases
      const policyArea = Array.isArray(bill.bill_subjects) 
        ? bill.bill_subjects[0]?.policy_area_name 
        : bill.bill_subjects?.policy_area_name || '';
      
      return {
        ...bill,
        bill_subjects: { policy_area_name: policyArea }
      };
    });

    return transformedData as Bill[];
  }
}; 