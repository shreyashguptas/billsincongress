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
        .select('*')
        .order(field, { ascending: direction === 'asc' });

      const status = get().status;
      if (status !== 'all') {
        const progressStage = Object.entries(get().getProgressLabel)
          .find(([_, label]) => label === status)?.[0];
        if (progressStage) {
          query = query.eq('progress_stage', parseInt(progressStage));
        }
      }

      const category = get().category;
      if (category !== 'all') {
        // In a real app, you'd have a proper category field in your database
        // For now, we'll just filter by title containing the category
        query = query.ilike('title', `%${category}%`);
      }

      const searchQuery = get().searchQuery.trim();
      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,bill_number.ilike.%${searchQuery}%`);
      }

      if (!force) {
        query = query.range(get().offset, get().offset + 9);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching bills:', error);
        throw error;
      }
      
      if (force) {
        set({ bills: data || [], offset: (data || []).length, isLoading: false });
      } else {
        set({ 
          bills: [...get().bills, ...(data || [])], 
          offset: get().offset + (data || []).length,
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
        .select('*')
        .order('introduced_date', { ascending: false })
        .limit(6);

      if (error) {
        console.error('Error fetching featured bills:', error);
        throw error;
      }

      set({ featuredBills: data || [], isLoading: false });
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