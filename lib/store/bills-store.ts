import { create } from 'zustand';
import { BillInfo } from '@/lib/types/BillInfo';
import { billsService } from '@/lib/services/bills-service';

interface BillFilters {
  sortOrder: string;
  status: string;
  category: string;
  searchQuery: string;
}

interface BillsState extends BillFilters {
  // Data
  bills: BillInfo[];
  featuredBills: BillInfo[];
  totalCount: number;
  
  // UI State
  isLoading: boolean;
  error: Error | null;
  offset: number;
  
  // Filter Options
  availableStatuses: string[];
  availableCategories: string[];
  
  // Actions
  setFilter: <K extends keyof BillFilters>(key: K, value: BillFilters[K]) => void;
  clearFilters: () => void;
  fetchBills: (force?: boolean) => Promise<void>;
  fetchMoreBills: () => Promise<void>;
  fetchFeaturedBills: () => Promise<void>;
  fetchFilterOptions: () => Promise<void>;
}

const DEFAULT_FILTERS: BillFilters = {
  sortOrder: 'introduced_date:desc',
  status: 'all',
  category: 'all',
  searchQuery: '',
};

export const useBillsStore = create<BillsState>((set, get) => ({
  // Initial State
  ...DEFAULT_FILTERS,
  bills: [],
  featuredBills: [],
  totalCount: 0,
  isLoading: false,
  error: null,
  offset: 0,
  availableStatuses: ['all'],
  availableCategories: ['all'],

  // Filter Actions
  setFilter: async (key, value) => {
    set({ [key]: value });
    // Reset offset and refetch when filters change
    set({ offset: 0 });
    await get().fetchBills(true);
  },

  clearFilters: async () => {
    set({ ...DEFAULT_FILTERS, offset: 0 });
    await get().fetchBills(true);
  },

  // Data Fetching Actions
  fetchBills: async (force = false) => {
    const state = get();
    set({ isLoading: true, error: null });

    try {
      const response = await billsService.fetchBills({
        sortOrder: state.sortOrder,
        status: state.status,
        category: state.category,
        searchQuery: state.searchQuery,
        offset: force ? 0 : state.offset,
        limit: 10
      });

      if (response.error) {
        throw response.error;
      }

      set({
        bills: force ? response.data : [...state.bills, ...response.data],
        totalCount: response.count,
        offset: force ? response.data.length : state.offset + response.data.length,
        isLoading: false
      });
    } catch (error) {
      set({ 
        error: error as Error, 
        isLoading: false,
        bills: force ? [] : state.bills // Only clear bills if force=true
      });
    }
  },

  fetchMoreBills: async () => {
    const state = get();
    if (state.isLoading || state.bills.length >= state.totalCount) {
      return;
    }
    await get().fetchBills(false);
  },

  fetchFeaturedBills: async () => {
    set({ isLoading: true, error: null });

    try {
      const response = await billsService.fetchFeaturedBills();
      
      if (response.error) {
        throw response.error;
      }

      set({ 
        featuredBills: response.data,
        isLoading: false 
      });
    } catch (error) {
      set({ 
        error: error as Error, 
        isLoading: false,
        featuredBills: []
      });
    }
  },

  fetchFilterOptions: async () => {
    try {
      const response = await billsService.fetchUniqueValues();
      
      if (response.error) {
        throw response.error;
      }

      set({ 
        availableStatuses: response.statuses,
        availableCategories: response.categories
      });
    } catch (error) {
      console.error('Error fetching filter options:', error);
      // Don't update state on error to keep default values
    }
  }
})); 