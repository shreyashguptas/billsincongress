import { create } from 'zustand';
import { createClient } from '@/utils/supabase/client';
import { BillInfo, BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';

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

      // For now, we'll use some predefined categories
      const predefinedCategories = ['all', 'healthcare', 'education', 'environment', 'economy', 'defense'];
      set({ uniqueTags: predefinedCategories });
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
        query = query.range(get().offset, get().offset + 8); // Fetch 9 bills (0-8)
      }

      console.log('Fetching bills with query:', query); // Debug log

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching bills:', error);
        throw error;
      }

      console.log('Fetched bills data:', data); // Debug log

      // Process the data to get the latest title for each bill
      const processedBills = (data || []).map(bill => {
        const latestTitle = bill.bill_titles?.reduce((latest: any, current: any) => {
          if (!latest || new Date(current.update_date) > new Date(latest.update_date)) {
            return current;
          }
          return latest;
        }, null);

        return {
          ...bill,
          congress: bill.congress,
          bill_type: bill.bill_type,
          bill_number: bill.bill_number,
          bill_type_label: bill.bill_type_label,
          title: latestTitle?.title || 'Untitled',
          bill_titles: undefined
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
          )
        `)
        .order('introduced_date', { ascending: false })
        .limit(6);

      if (error) {
        console.error('Error fetching featured bills:', error);
        throw error;
      }

      console.log('Fetched featured bills data:', data); // Debug log

      // Process the data to get the latest title for each bill
      const processedBills = (data || []).map(bill => {
        const latestTitle = bill.bill_titles?.reduce((latest: any, current: any) => {
          if (!latest || new Date(current.update_date) > new Date(latest.update_date)) {
            return current;
          }
          return latest;
        }, null);

        return {
          ...bill,
          congress: bill.congress,
          bill_type: bill.bill_type,
          bill_number: bill.bill_number,
          bill_type_label: bill.bill_type_label,
          title: latestTitle?.title || 'Untitled',
          bill_titles: undefined
        };
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