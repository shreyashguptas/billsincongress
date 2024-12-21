import { create } from 'zustand';
import { createClient } from '@/utils/supabase/client';
import { BillInfo, BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { PostgrestFilterBuilder } from '@supabase/postgrest-js';

interface BillsState {
  bills: BillInfo[];
  featuredBills: BillInfo[];
  isLoading: boolean;
  error: string | null;
  sortOrder: string;
  status: string;
  category: string;
  searchQuery: string;
  offset: number;
  uniqueStatuses: string[];
  uniqueTags: string[];
  setSortOrder: (order: string) => void;
  setStatus: (status: string) => void;
  setCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;
  fetchBills: (force?: boolean) => Promise<void>;
  fetchFeaturedBills: () => Promise<void>;
  fetchUniqueValues: () => Promise<void>;
  getProgressColor: (stage: number) => string;
  getProgressLabel: (stage: number) => string;
}

// Type for the raw bill data from Supabase
interface RawBill {
  id: string;
  congress: number;
  bill_type: string;
  bill_number: string;
  bill_type_label: string;
  introduced_date: string;
  sponsor_first_name: string;
  sponsor_last_name: string;
  sponsor_party: string;
  sponsor_state: string;
  latest_action_code?: string;
  latest_action_date?: string;
  latest_action_text?: string;
  progress_stage?: number;
  progress_description?: string;
  bill_titles?: Array<{
    title: string;
    title_type: string;
    update_date: string;
  }>;
  bill_subjects?: Array<{
    policy_area_name: string;
  }>;
}

const supabase = createClient();

const DEFAULT_STATE = {
  sortOrder: 'introduced_date:desc',
  status: 'all',
  category: 'all',
  searchQuery: '',
  offset: 0,
};

export const useBillsStore = create<BillsState>((set, get) => ({
  bills: [],
  featuredBills: [],
  isLoading: false,
  error: null,
  sortOrder: DEFAULT_STATE.sortOrder,
  status: DEFAULT_STATE.status,
  category: DEFAULT_STATE.category,
  searchQuery: DEFAULT_STATE.searchQuery,
  offset: DEFAULT_STATE.offset,
  uniqueStatuses: ['all'],
  uniqueTags: ['all'],

  setSortOrder: (order: string) => {
    set({ sortOrder: order });
    get().fetchBills(true);
  },

  setStatus: (status: string) => {
    set({ status });
  },

  setCategory: (category: string) => {
    set({ category });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  clearFilters: () => {
    set({
      sortOrder: DEFAULT_STATE.sortOrder,
      status: DEFAULT_STATE.status,
      category: DEFAULT_STATE.category,
      searchQuery: DEFAULT_STATE.searchQuery,
      offset: DEFAULT_STATE.offset,
    });
    get().fetchBills(true);
  },

  fetchUniqueValues: async () => {
    try {
      // Fetch unique progress stages
      const { data: progressData, error: progressError } = await supabase
        .from(BILL_INFO_TABLE_NAME)
        .select('progress_stage')
        .order('progress_stage');

      if (progressError) throw progressError;

      const uniqueStages = ['all', ...new Set(progressData.map(bill => get().getProgressLabel(bill.progress_stage || 0)))];
      set({ uniqueStatuses: uniqueStages });

      // Fetch unique policy areas
      const { data: policyData, error: policyError } = await supabase
        .from('bill_subjects')
        .select('policy_area_name')
        .order('policy_area_name');

      if (policyError) throw policyError;

      const uniquePolicyAreas = ['all', ...new Set(policyData.map(subject => subject.policy_area_name))];
      set({ uniqueTags: uniquePolicyAreas });
    } catch (error) {
      console.error('Error fetching unique values:', error);
    }
  },

  fetchBills: async (force = false) => {
    set({ isLoading: true, error: null });
    try {
      const [field, direction] = get().sortOrder.split(':');
      let query = supabase
        .from(BILL_INFO_TABLE_NAME)
        .select(`
          id,
          congress,
          bill_type,
          bill_number,
          bill_type_label,
          introduced_date,
          sponsor_first_name,
          sponsor_last_name,
          sponsor_party,
          sponsor_state,
          latest_action_code,
          latest_action_date,
          latest_action_text,
          progress_stage,
          progress_description,
          bill_titles (
            title,
            title_type,
            update_date
          ),
          bill_subjects (
            policy_area_name
          )
        `)
        .order(field, { ascending: direction === 'asc' });

      // Filter by status if not 'all'
      const status = get().status;
      if (status !== 'all') {
        const progressStage = Object.entries(get().getProgressLabel)
          .find(([_, label]) => label === status)?.[0];
        if (progressStage) {
          query = query.eq('progress_stage', parseInt(progressStage));
        }
      }

      // Filter by category if not 'all'
      const category = get().category;
      if (category !== 'all') {
        query = query.eq('bill_subjects.policy_area_name', category);
      }

      // Apply search query if present
      const searchQuery = get().searchQuery.trim();
      if (searchQuery) {
        query = query.or(`bill_titles.title.ilike.%${searchQuery}%,id.ilike.%${searchQuery}%`);
      }

      // Apply pagination
      if (!force) {
        query = query.range(get().offset, get().offset + 8);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const processedBills = (data || []).map((bill: RawBill) => {
        const latestTitle = bill.bill_titles?.reduce((latest, current) => {
          if (!latest || new Date(current.update_date) > new Date(latest.update_date)) {
            return current;
          }
          return latest;
        }, bill.bill_titles[0]);

        const policyArea = Array.isArray(bill.bill_subjects) && bill.bill_subjects.length > 0
          ? { policy_area_name: bill.bill_subjects[0].policy_area_name }
          : undefined;

        return {
          ...bill,
          congress: bill.congress,
          bill_type: bill.bill_type,
          bill_number: bill.bill_number,
          bill_type_label: bill.bill_type_label,
          title: latestTitle?.title || 'Untitled',
          bill_titles: undefined,
          bill_subjects: policyArea
        };
      });
      
      if (force) {
        set({ bills: processedBills, offset: processedBills.length, isLoading: false });
      } else {
        set({ 
          bills: [...get().bills, ...processedBills], 
          offset: get().offset + processedBills.length,
          isLoading: false 
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch bills';
      console.error('Error in fetchBills:', errorMessage);
      set({ error: errorMessage, isLoading: false, bills: [] });
    }
  },

  fetchFeaturedBills: async () => {
    set({ isLoading: true, error: null });
    try {
      // Debug logging
      console.log('Fetching featured bills...');
      
      const { data, error } = await supabase
        .from(BILL_INFO_TABLE_NAME)
        .select(`
          id,
          congress,
          bill_type,
          bill_number,
          bill_type_label,
          introduced_date,
          sponsor_first_name,
          sponsor_last_name,
          sponsor_party,
          sponsor_state,
          latest_action_code,
          latest_action_date,
          latest_action_text,
          progress_stage,
          progress_description,
          bill_titles (
            title,
            title_type,
            update_date
          ),
          bill_subjects (
            policy_area_name
          )
        `)
        .order('latest_action_date', { ascending: false })
        .limit(3);

      if (error) {
        throw error;
      }

      // Debug logging
      console.log('Raw featured bills data:', data);

      const processedBills = (data || []).map((bill: RawBill) => {
        const latestTitle = bill.bill_titles?.reduce((latest, current) => {
          if (!latest || new Date(current.update_date) > new Date(latest.update_date)) {
            return current;
          }
          return latest;
        }, bill.bill_titles?.[0]);

        // Extract the policy area from bill_subjects array
        const policyArea = Array.isArray(bill.bill_subjects) && bill.bill_subjects.length > 0
          ? { policy_area_name: bill.bill_subjects[0].policy_area_name }
          : null;

        // Debug logging
        console.log('Processing bill:', {
          id: bill.id,
          title: latestTitle?.title,
          policyArea,
          rawSubjects: bill.bill_subjects
        });

        const processedBill = {
          ...bill,
          congress: bill.congress,
          bill_type: bill.bill_type,
          bill_number: bill.bill_number,
          bill_type_label: bill.bill_type_label,
          title: latestTitle?.title || 'Untitled',
          bill_titles: undefined,
          bill_subjects: policyArea
        };

        // Debug logging
        console.log('Processed bill:', {
          id: processedBill.id,
          title: processedBill.title,
          policyArea: processedBill.bill_subjects?.policy_area_name,
          rawSubjects: processedBill.bill_subjects
        });

        return processedBill;
      });

      set({ featuredBills: processedBills, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch featured bills';
      console.error('Error in fetchFeaturedBills:', errorMessage);
      set({ error: errorMessage, isLoading: false, featuredBills: [] });
    }
  },

  getProgressColor: (stage: number) => {
    switch (stage) {
      case -1:
        return 'bg-red-500';
      case 100:
        return 'bg-green-500';
      default:
        return 'bg-blue-500';
    }
  },

  getProgressLabel: (stage: number) => {
    switch (stage) {
      case -1:
        return 'Failed';
      case 20:
        return 'Introduced';
      case 40:
        return 'In Committee';
      case 60:
        return 'Passed First Chamber';
      case 80:
        return 'Passed Both Chambers';
      case 90:
        return 'To President';
      case 100:
        return 'Became Law';
      default:
        return 'In Progress';
    }
  }
})); 