import { createClient as createBrowserClient } from '@/utils/supabase/client';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { BillInfo, BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';

export interface BillQueryParams {
  sortOrder?: string;
  status?: string;
  category?: string;
  searchQuery?: string;
  offset?: number;
  limit?: number;
  cookies?: { [key: string]: string };
}

export interface BillsResponse {
  data: BillInfo[];
  error: Error | null;
  count: number;
}

class BillsService {
  private isServer = typeof window === 'undefined';

  private getClient(cookies?: { [key: string]: string }) {
    return this.isServer ? createServerClient(cookies) : createBrowserClient();
  }

  async fetchBills({
    sortOrder = 'introduced_date:desc',
    status = 'all',
    category = 'all',
    searchQuery = '',
    offset = 0,
    limit = 10,
    cookies
  }: BillQueryParams): Promise<BillsResponse> {
    try {
      const supabase = this.getClient(cookies);
      const [field, direction] = sortOrder.split(':');
      
      let query = supabase
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
        `, { count: 'exact' })
        .order(field, { ascending: direction === 'asc' })
        .range(offset, offset + limit - 1);

      // Apply filters
      if (status !== 'all') {
        query = query.eq('progress_description', status);
      }

      if (category !== 'all') {
        query = query.eq('bill_subjects.policy_area_name', category);
      }

      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,id.ilike.%${searchQuery}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // Transform the data
      const transformedData = (data || []).map(bill => ({
        ...bill,
        bill_subjects: bill.bill_subjects && bill.bill_subjects.length > 0
          ? { policy_area_name: bill.bill_subjects[0].policy_area_name }
          : null
      }));

      return {
        data: transformedData,
        error: null,
        count: count || 0
      };
    } catch (error) {
      console.error('Error fetching bills:', error);
      return {
        data: [],
        error: error as Error,
        count: 0
      };
    }
  }

  async fetchFeaturedBills(cookies?: { [key: string]: string }): Promise<BillsResponse> {
    try {
      const supabase = this.getClient(cookies);
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
        .order('latest_action_date', { ascending: false })
        .limit(3);

      if (error) throw error;

      const transformedData = (data || []).map(bill => ({
        ...bill,
        bill_subjects: bill.bill_subjects && bill.bill_subjects.length > 0
          ? { policy_area_name: bill.bill_subjects[0].policy_area_name }
          : null
      }));

      return {
        data: transformedData,
        error: null,
        count: transformedData.length
      };
    } catch (error) {
      console.error('Error fetching featured bills:', error);
      return {
        data: [],
        error: error as Error,
        count: 0
      };
    }
  }

  async fetchUniqueValues(cookies?: { [key: string]: string }): Promise<{
    statuses: string[];
    categories: string[];
    error: Error | null;
  }> {
    try {
      const supabase = this.getClient(cookies);
      
      // Fetch unique progress stages
      const { data: progressData, error: progressError } = await supabase
        .from(BILL_INFO_TABLE_NAME)
        .select('progress_description')
        .not('progress_description', 'is', null);

      if (progressError) throw progressError;

      // Fetch unique policy areas
      const { data: policyData, error: policyError } = await supabase
        .from(BILL_INFO_TABLE_NAME)
        .select('bill_subjects(policy_area_name)')
        .not('bill_subjects', 'is', null);

      if (policyError) throw policyError;

      const uniqueStatuses = ['all', ...Array.from(new Set(progressData.map(bill => bill.progress_description)))];
      const uniqueCategories = ['all', ...Array.from(new Set(policyData
        .map(bill => bill.bill_subjects?.[0]?.policy_area_name)
        .filter(Boolean)
      ))];

      return {
        statuses: uniqueStatuses,
        categories: uniqueCategories,
        error: null
      };
    } catch (error) {
      console.error('Error fetching unique values:', error);
      return {
        statuses: ['all'],
        categories: ['all'],
        error: error as Error
      };
    }
  }
}

export const billsService = new BillsService(); 