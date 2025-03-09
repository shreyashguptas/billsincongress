import { createClient } from '@supabase/supabase-js';
import { Bill } from '@/lib/types/bill';
import { BillStages } from '@/lib/utils/bill-stages';

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
  billNumber?: string;
  congress?: string | null;
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

  async getCongressInfo(): Promise<{ congress: number; startYear: number; endYear: number }> {
    const supabase = this.getClient();
    
    // Get the unique congress numbers
    const { data, error } = await supabase
      .from(BILL_INFO_TABLE_NAME)
      .select('congress')
      .order('congress', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching congress info:', error);
      throw new Error(error.message || 'Failed to fetch congress info');
    }

    const congress = data.congress;
    
    // Calculate years based on Congress number
    // Each Congress starts on January 3rd of odd-numbered years and lasts for 2 years
    const startYear = 2023 + (congress - 118) * 2; // 118th Congress started in 2023
    const endYear = startYear + 2;

    return {
      congress,
      startYear,
      endYear
    };
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

    // Fetch latest PDF URL
    const { data: textData, error: textError } = await supabase
      .from('bill_text')
      .select('formats_url_pdf')
      .eq('id', id)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (textError && textError.code !== 'PGRST116') {
      console.error('Error fetching bill text:', textError);
    }

    // Ensure progress_stage is a number
    const progress_stage = typeof billData.progress_stage === 'string'
      ? parseInt(billData.progress_stage, 10)
      : billData.progress_stage;

    return {
      ...billData,
      progress_stage,  // Use the converted number
      bill_subjects: billData.bill_subjects?.[0] || { policy_area_name: '' },
      latest_summary: summaryData?.text || '',
      pdf_url: textData?.formats_url_pdf || ''
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
      billType = 'all',
      billNumber = '',
      congress = 'all'
    } = params;

    console.log('Fetching bills with filters:', { congress, status, policyArea });

    const supabase = this.getClient();
    
    // First, get the total count without the join
    let countQuery = supabase
      .from(BILL_INFO_TABLE_NAME)
      .select('*', { count: 'exact', head: true });

    // Apply filters to count query
    if (status && status !== 'all') {
      countQuery = countQuery.eq('progress_stage', parseInt(status, 10));
    }
    if (stateFilter && stateFilter !== 'all') {
      countQuery = countQuery.eq('sponsor_state', stateFilter);
    }
    if (billType && billType !== 'all') {
      countQuery = countQuery.eq('bill_type', billType);
    }
    if (billNumber) {
      countQuery = countQuery.eq('bill_number', billNumber);
    }
    if (congress && congress !== 'all') {
      // Convert congress to number and apply filter
      const congressNum = parseInt(congress, 10);
      if (!isNaN(congressNum)) {
        console.log('Filtering by congress:', congressNum);
        countQuery = countQuery.eq('congress', congressNum);
      }
    }

    // Apply date filters to count query too
    if (introducedDateFilter && introducedDateFilter !== 'all') {
      const startDate = getStartDate(introducedDateFilter);
      countQuery = countQuery.gte('introduced_date', startDate.toISOString());
    }

    if (lastActionDateFilter && lastActionDateFilter !== 'all') {
      const startDate = getStartDate(lastActionDateFilter);
      countQuery = countQuery.gte('updated_at', startDate.toISOString());
    }

    // Add title filter to count query
    if (titleFilter) {
      const cleanedTitle = titleFilter.trim().toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ');
      
      if (cleanedTitle) {
        const words = cleanedTitle.split(' ').filter(word => word.length > 0);
        if (words.length > 0) {
          words.forEach(word => {
            countQuery = countQuery.ilike('title', `%${word}%`);
          });
        }
      }
    }

    // Add sponsor filter to count query
    if (sponsorFilter) {
      const cleanedFilter = sponsorFilter.trim().toLowerCase().replace(/\s+/g, ' ');
      
      if (cleanedFilter) {
        const names = cleanedFilter.split(' ').filter(part => part.length > 0);
        
        if (names.length > 1) {
          const conditions = names.map(name => 
            `sponsor_first_name.ilike.%${name}%,sponsor_last_name.ilike.%${name}%`
          ).join(',');
          
          countQuery = countQuery.or(conditions);
        } else if (names.length === 1) {
          countQuery = countQuery.or(
            `sponsor_first_name.ilike.%${names[0]}%,sponsor_last_name.ilike.%${names[0]}%`
          );
        }
      }
    }

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.error('Error getting total count:', countError);
      throw new Error(countError.message || 'Failed to get total count');
    }

    // Now get the actual data with the join
    let query = supabase
      .from(BILL_INFO_TABLE_NAME)
      .select(`
        *,
        bill_subjects!inner (
          policy_area_name
        )
      `);

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('progress_stage', parseInt(status, 10));
    }

    if (introducedDateFilter && introducedDateFilter !== 'all') {
      const startDate = getStartDate(introducedDateFilter);
      query = query.gte('introduced_date', startDate.toISOString());
    }

    if (lastActionDateFilter && lastActionDateFilter !== 'all') {
      const startDate = getStartDate(lastActionDateFilter);
      query = query.gte('updated_at', startDate.toISOString());
    }

    if (titleFilter) {
      const cleanedTitle = titleFilter.trim().toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ');
      
      if (cleanedTitle) {
        const words = cleanedTitle.split(' ').filter(word => word.length > 0);
        if (words.length > 0) {
          words.forEach(word => {
            query = query.ilike('title', `%${word}%`);
          });
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
      query = query.eq('bill_subjects.policy_area_name', policyArea);
    }

    if (billType && billType !== 'all') {
      query = query.eq('bill_type', billType);
    }

    if (billNumber) {
      query = query.eq('bill_number', billNumber);
    }

    if (congress && congress !== 'all') {
      // Convert congress to number and apply filter
      const congressNum = parseInt(congress, 10);
      if (!isNaN(congressNum)) {
        console.log('Filtering by congress:', congressNum);
        query = query.eq('congress', congressNum);
      }
    }

    // Calculate proper pagination values
    const start = (page - 1) * itemsPerPage;
    
    // Always order by updated_at to ensure consistent pagination results
    query = query
      .order('updated_at', { ascending: false })
      .range(start, start + itemsPerPage - 1);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching bills:', error);
      throw new Error(error.message || 'Failed to fetch bills');
    }

    // Transform the data and ensure we don't have duplicates
    const transformedData = (data || []).map(bill => {
      const policyArea = Array.isArray(bill.bill_subjects) 
        ? bill.bill_subjects[0]?.policy_area_name 
        : bill.bill_subjects?.policy_area_name || '';
      
      // Ensure progress_stage is a number
      const progress_stage = typeof bill.progress_stage === 'string'
        ? parseInt(bill.progress_stage, 10)
        : bill.progress_stage;

      return {
        ...bill,
        progress_stage,  // Use the converted number
        bill_subjects: { policy_area_name: policyArea }
      };
    });

    // For policy area, we need a special query since it has a join
    let finalCount = totalCount || 0;
    if (policyArea && policyArea !== 'all') {
      // Create a new query that mimics all the other filters but adds the policy area
      let policyAreaQuery = supabase
        .from(BILL_INFO_TABLE_NAME)
        .select('id', { count: 'exact', head: true });
        
      // Apply the same filters as the main query
      if (status && status !== 'all') {
        policyAreaQuery = policyAreaQuery.eq('progress_stage', parseInt(status, 10));
      }
      if (stateFilter && stateFilter !== 'all') {
        policyAreaQuery = policyAreaQuery.eq('sponsor_state', stateFilter);
      }
      if (billType && billType !== 'all') {
        policyAreaQuery = policyAreaQuery.eq('bill_type', billType);
      }
      if (billNumber) {
        policyAreaQuery = policyAreaQuery.eq('bill_number', billNumber);
      }
      if (congress && congress !== 'all') {
        const congressNum = parseInt(congress, 10);
        if (!isNaN(congressNum)) {
          policyAreaQuery = policyAreaQuery.eq('congress', congressNum);
        }
      }
      
      // Apply date filters
      if (introducedDateFilter && introducedDateFilter !== 'all') {
        const startDate = getStartDate(introducedDateFilter);
        policyAreaQuery = policyAreaQuery.gte('introduced_date', startDate.toISOString());
      }
      if (lastActionDateFilter && lastActionDateFilter !== 'all') {
        const startDate = getStartDate(lastActionDateFilter);
        policyAreaQuery = policyAreaQuery.gte('updated_at', startDate.toISOString());
      }
      
      // Apply text filters
      if (titleFilter) {
        const cleanedTitle = titleFilter.trim().toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, ' ');
        
        if (cleanedTitle) {
          const words = cleanedTitle.split(' ').filter(word => word.length > 0);
          if (words.length > 0) {
            words.forEach(word => {
              policyAreaQuery = policyAreaQuery.ilike('title', `%${word}%`);
            });
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
            
            policyAreaQuery = policyAreaQuery.or(conditions);
          } else if (names.length === 1) {
            policyAreaQuery = policyAreaQuery.or(
              `sponsor_first_name.ilike.%${names[0]}%,sponsor_last_name.ilike.%${names[0]}%`
            );
          }
        }
      }
      
      // Now add the policy area filter
      try {
        policyAreaQuery = policyAreaQuery
          .eq('bill_subjects.policy_area_name', policyArea)
          .not('bill_subjects', 'is', null);
        
        const { count, error } = await policyAreaQuery;
        
        if (error) {
          console.error('Error getting policy area count:', error);
        } else if (count !== null) {
          console.log(`Policy area '${policyArea}' filtered count: ${count}`);
          finalCount = count;
        }
      } catch (error) {
        console.error('Error in policy area count query:', error);
      }
    }

    // Combined query to get accurate count with all filters
    console.log(`Final count for all filters: ${finalCount}`);

    return {
      data: transformedData as Bill[],
      count: finalCount,
    };
  },

  async getAvailableCongressNumbers(): Promise<number[]> {
    const supabase = this.getClient();
    
    console.log('Getting available congress numbers...');
    
    // Use a simple query to get distinct congress numbers
    const { data, error } = await supabase
      .from('bill_info')
      .select('congress')
      .not('congress', 'is', null)
      .order('congress', { ascending: false });

    if (error) {
      console.error('Error fetching congress numbers:', error);
      throw new Error(error.message || 'Failed to fetch congress numbers');
    }

    if (!data || !Array.isArray(data)) {
      console.error('Invalid data received:', data);
      return [];
    }

    // Filter for unique values and transform to array of numbers
    const uniqueCongressNumbers = [...new Set(data.map(item => item.congress))];
    
    console.log('Unique congress numbers:', uniqueCongressNumbers);
    return uniqueCongressNumbers;
  }
}; 