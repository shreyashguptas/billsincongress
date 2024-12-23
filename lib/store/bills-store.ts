import { create } from 'zustand';
import type { Bill } from '@/lib/types/bill';
import { billsService } from '@/lib/services/bills-service';

interface BillFilters {
  sortOrder: string;
  status: string;
  category: string;
  searchQuery: string;
}

interface BillsState extends BillFilters {
  // Data
  bills: Bill[];
  featuredBills: Bill[];
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

  // Actions
  setFilter: (key, value) => {
    set({ [key]: value });
    get().fetchBills(true);
  },

  clearFilters: () => {
    set({ ...DEFAULT_FILTERS });
    get().fetchBills(true);
  },

  fetchBills: async (force = true) => {
    const state = get();
    if (state.isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const response = await billsService.fetchBills({
        page: force ? 1 : Math.floor(state.offset / 10) + 1,
        itemsPerPage: 10,
        status: state.status === 'all' ? undefined : state.status,
        sponsorFilter: state.searchQuery,
        stateFilter: 'all',
        introducedDateFilter: 'all',
        lastActionDateFilter: 'all'
      });

      set({
        bills: force ? response.data : [...state.bills, ...response.data],
        totalCount: response.count,
        offset: force ? 0 : state.offset + response.data.length,
        isLoading: false,
      });
    } catch (error) {
      set({ error: error as Error, isLoading: false });
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
      const bills = await billsService.fetchFeaturedBills();
      set({ 
        featuredBills: bills,
        isLoading: false 
      });
    } catch (error) {
      set({ 
        error: error as Error, 
        isLoading: false,
        featuredBills: []
      });
    }
  }
})); 