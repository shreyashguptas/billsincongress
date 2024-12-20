import { create } from 'zustand';
import { createClient } from '@/utils/supabase/client';
import { BillInfo, BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';

interface BillsState {
  bills: BillInfo[];
  featuredBills: BillInfo[];
  isLoading: boolean;
  error: string | null;
  fetchBills: () => Promise<void>;
  fetchFeaturedBills: () => Promise<void>;
  getProgressColor: (stage: number) => string;
  getProgressLabel: (stage: number) => string;
}

const supabase = createClient();

export const useBillsStore = create<BillsState>((set) => ({
  bills: [],
  featuredBills: [],
  isLoading: false,
  error: null,

  fetchBills: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from(BILL_INFO_TABLE_NAME)
        .select('*')
        .order('introduced_date', { ascending: false });

      if (error) throw error;
      set({ bills: data || [], isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
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

      if (error) throw error;
      set({ featuredBills: data || [], isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
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